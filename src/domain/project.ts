import { createComponent, getDefinition, uid } from './catalog';
import type { ComponentInstance, ProjectFile, Vector3 } from './types';

export const STORAGE_KEY = 'arduino-constructor.project.v1';
export const MAX_COMPONENTS = 300;
export const MAX_FILE_BYTES = 2_000_000;
export function createProject(templateId: string | null = null): ProjectFile {
  const project: ProjectFile = { schemaVersion: 1, id: uid(), name: 'Новый проект', templateId, components: [] };
  const add = (definitionId: string, id: string, position: Vector3, parentId: string | null = null, angle = 0) => {
    project.components.push(createComponent(definitionId, { id, position, parentId, parameters: { angle } }));
  };
  if (templateId === 'robot-2wd') {
    project.name = 'Колёсный робот 2WD';
    add('chassis', 'chassis', [0, .065, 0]);
    add('wheel', 'wheel-left', [-.09, .033, -.035]);
    add('wheel', 'wheel-right', [.09, .033, -.035]);
    add('tt-motor', 'motor-left', [-.052, .037, -.035]);
    add('tt-motor', 'motor-right', [.052, .037, -.035]);
    add('caster', 'caster', [0, .0175, .075]);
    add('uno', 'uno', [0, .077, .035]);
    add('l298n', 'driver', [0, .083, -.048]);
  } else if (templateId === 'robot-arm') {
    project.name = 'Рука-манипулятор';
    add('base', 'base', [0, .009, 0]);
    add('platform', 'platform', [0, .0165, 0], 'base');
    add('joint', 'shoulder', [0, .026, 0], 'platform', -.25);
    add('servo', 'servo-shoulder', [.0335, 0, 0], 'shoulder');
    add('link', 'upper-arm', [0, .05, 0], 'shoulder');
    add('joint', 'elbow', [0, .1, 0], 'shoulder', -.7);
    add('servo', 'servo-elbow', [.0335, 0, 0], 'elbow');
    add('link', 'forearm', [0, .05, 0], 'elbow');
    add('joint', 'wrist', [0, .1, 0], 'elbow', -.4);
    add('gripper', 'gripper', [0, .039, 0], 'wrist');
    add('uno', 'uno', [.1, .009, 0]);
  }
  return project;
}
export function descendants(project: ProjectFile, id: string): Set<string> {
  const ids = new Set([id]);
  for (let changed = true; changed;) {
    changed = false;
    for (const part of project.components) if (part.parentId && ids.has(part.parentId) && !ids.has(part.id)) { ids.add(part.id); changed = true; }
  }
  return ids;
}
export function removeComponent(project: ProjectFile, id: string): ProjectFile {
  const ids = descendants(project, id);
  return { ...project, components: project.components.filter(part => !ids.has(part.id)) };
}
export function duplicateComponent(project: ProjectFile, id: string): ProjectFile {
  const ids = descendants(project, id);
  const source = project.components.filter(part => ids.has(part.id));
  if (project.components.length + source.length > MAX_COMPONENTS) throw new Error('Лимит: 300 деталей в проекте.');
  const mapping = new Map(source.map(part => [part.id, uid()]));
  return { ...project, components: [...project.components, ...source.map(part => ({
    ...structuredClone(part), id: mapping.get(part.id)!, name: `${part.name.slice(0, 152)} (копия)`,
    parentId: mapping.get(part.parentId ?? '') ?? part.parentId,
    position: part.id === id ? [part.position[0] + .05, part.position[1], part.position[2]] as Vector3 : [...part.position] as Vector3,
  }))] };
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 160;
const vector = (value: unknown, limit: number): value is Vector3 => Array.isArray(value) && value.length === 3 && value.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= limit);
/** Validate before use; reconstruct known fields so imported properties never enter editor state. */
export function parseProject(json: string): ProjectFile {
  if (new Blob([json]).size > MAX_FILE_BYTES) throw new Error('Файл больше 2 МБ.');
  let data: unknown;
  try { data = JSON.parse(json); } catch { throw new Error('Некорректный JSON.'); }
  if (!object(data) || data.schemaVersion !== 1) throw new Error('Неподдерживаемая версия проекта (ожидается schemaVersion: 1).');
  if (!string(data.id) || !string(data.name) || !(data.templateId === null || string(data.templateId)) || !Array.isArray(data.components) || data.components.length > MAX_COMPONENTS) throw new Error('Некорректные данные проекта или превышен лимит 300 деталей.');
  const parts: ComponentInstance[] = data.components.map(raw => {
    if (!object(raw) || !string(raw.id) || !string(raw.name) || !string(raw.definitionId)) throw new Error('Некорректный идентификатор или имя детали.');
    const definition = getDefinition(raw.definitionId);
    if (raw.type !== definition.type || !vector(raw.position, 10) || !vector(raw.rotation, Math.PI * 2) || !vector(raw.dimensions, 2) || raw.dimensions.some(n => n < .001) || !(raw.parentId === null || string(raw.parentId))) throw new Error('Некорректные размеры, тип или координаты детали.');
    if (!object(raw.parameters) || typeof raw.parameters.angle !== 'number' || !Number.isFinite(raw.parameters.angle)) throw new Error('Некорректные параметры детали.');
    const angle = raw.parameters.angle;
    if (definition.joint ? angle < definition.joint.min * Math.PI / 180 - 1e-9 || angle > definition.joint.max * Math.PI / 180 + 1e-9 : angle !== 0) throw new Error('Угол сустава вне допустимого диапазона.');
    if (!Array.isArray(raw.mounts) || raw.mounts.length > 32) throw new Error('Некорректные точки крепления.');
    const mounts = raw.mounts.map(mount => {
      if (!object(mount) || !string(mount.id) || !vector(mount.position, 2) || !vector(mount.axis, 1) || Math.abs(Math.hypot(...mount.axis) - 1) > .001) throw new Error('Некорректная точка крепления.');
      return { id: mount.id, position: [...mount.position] as Vector3, axis: [...mount.axis] as Vector3 };
    });
    if (new Set(mounts.map(mount => mount.id)).size !== mounts.length) throw new Error('Повторяются точки крепления.');
    return { id: raw.id, name: raw.name, definitionId: raw.definitionId, type: definition.type, position: [...raw.position], rotation: [...raw.rotation], dimensions: [...raw.dimensions], parentId: raw.parentId, parameters: { angle }, mounts };
  });
  const byId = new Map(parts.map(part => [part.id, part]));
  if (byId.size !== parts.length) throw new Error('Повторяются идентификаторы деталей.');
  for (const part of parts) {
    const visited = new Set([part.id]);
    let parentId = part.parentId;
    while (parentId !== null) {
      if (visited.has(parentId)) throw new Error('Циклическая иерархия деталей.');
      visited.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) throw new Error('Не найден родитель детали.');
      if (visited.size > 32) throw new Error('Глубина иерархии больше 32.');
      parentId = parent.parentId;
    }
  }
  return { schemaVersion: 1, id: data.id, name: data.name, templateId: data.templateId, components: parts };
}
export function saveProject(project: ProjectFile, storage: Pick<Storage, 'setItem'>): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(project));
}
export function restoreProject(storage: Pick<Storage, 'getItem'>): ProjectFile | null {
  const json = storage.getItem(STORAGE_KEY);
  return json === null ? null : parseProject(json);
}

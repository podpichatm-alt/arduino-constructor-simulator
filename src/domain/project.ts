import { getDefinition, uid } from './catalog';
import { createLegacyProject, parseLegacyProject } from './legacy';
import {
  createJoint,
  jointAtPose,
  matrixPose,
  parentOf,
  poseMatrix,
  validateHierarchy,
  worldMatrices,
} from './mechanics';
import type {
  AttachmentFrame,
  ComponentInstance,
  JointEndpoint,
  JointType,
  LegacyProjectFile,
  MechanicalJoint,
  MountPoint,
  ProjectFile,
  Vector3,
} from './types';

// Preserve V0.1's key. Before replacing v1 data, save an exact backup once.
export const STORAGE_KEY = 'arduino-constructor.project.v1';
export const LEGACY_BACKUP_KEY = `${STORAGE_KEY}.schema1-backup`;
export const MAX_COMPONENTS = 300;
export const MAX_FILE_BYTES = 2_000_000;
const axisOf = (axis: 'x' | 'y' | 'z'): Vector3 =>
  axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1];
export function migrateProject(old: LegacyProjectFile, upgradeTemplates = true): ProjectFile {
  const components: ComponentInstance[] = old.components.map((part) => ({
    ...structuredClone(part),
    parentId: null,
    grounded: false,
    parameters: { angle: 0 },
    mounts: part.mounts.map((mount) => ({
      ...structuredClone(mount),
      rotation: [0, 0, 0],
      socket:
        getDefinition(part.definitionId).mounts.find((item) => item.id === mount.id)?.socket ??
        'surface',
    })),
  }));
  const joints: MechanicalJoint[] = [];
  for (const part of old.components) {
    const definition = getDefinition(part.definitionId);
    const local = poseMatrix(part.position, part.rotation);
    if (part.parentId) {
      const joint = jointAtPose(
        part.parentId,
        part.id,
        local,
        definition.joint ? 'revolute' : 'fixed',
        definition.joint ? axisOf(definition.joint.axis) : [0, 1, 0],
        part.parameters.angle,
      );
      if (definition.joint) {
        joint.minAngle = (definition.joint.min * Math.PI) / 180;
        joint.maxAngle = (definition.joint.max * Math.PI) / 180;
      }
      joints.push(joint);
    } else if (definition.joint) {
      const a = axisOf(definition.joint.axis);
      // Bake a formerly root-level joint angle into its free pose, preserving its world appearance.
      const angleRotation = poseMatrix(
        [0, 0, 0],
        a.map((n) => n * part.parameters.angle) as Vector3,
      );
      Object.assign(
        components.find((item) => item.id === part.id)!,
        matrixPose(local.multiply(angleRotation)),
      );
    }
  }
  const project: ProjectFile = {
    schemaVersion: 2,
    id: old.id,
    name: old.name,
    templateId: old.templateId,
    components,
    joints,
  };
  validateHierarchy(project);
  if (upgradeTemplates && old.templateId === 'robot-2wd') {
    // Recognize only original template IDs/types, preserving any custom v1 hierarchy and all world poses.
    const links: [string, string, string, string, JointType][] = [
      ['chassis', 'chassis', 'motor-left', 'tt-motor', 'fixed'],
      ['chassis', 'chassis', 'motor-right', 'tt-motor', 'fixed'],
      ['motor-left', 'tt-motor', 'wheel-left', 'wheel', 'axle'],
      ['motor-right', 'tt-motor', 'wheel-right', 'wheel', 'axle'],
      ['chassis', 'chassis', 'caster', 'caster', 'fixed'],
      ['chassis', 'chassis', 'uno', 'uno', 'fixed'],
      ['chassis', 'chassis', 'driver', 'l298n', 'fixed'],
    ];
    const world = worldMatrices(project);
    for (const [parent, parentDefinition, child, childDefinition, type] of links) {
      if (
        !components.some((part) => part.id === parent && part.definitionId === parentDefinition) ||
        !components.some((part) => part.id === child && part.definitionId === childDefinition) ||
        joints.some((joint) => joint.child.componentId === child)
      )
        continue;
      const joint = jointAtPose(
        parent,
        child,
        world.get(parent)!.clone().invert().multiply(world.get(child)!),
        type,
        type === 'axle' ? [1, 0, 0] : [0, 1, 0],
      );
      joints.push(joint);
      try {
        validateHierarchy(project);
      } catch {
        joints.pop();
      }
    }
  }
  return project;
}
export function createProject(templateId: string | null = null): ProjectFile {
  let project = migrateProject(createLegacyProject(templateId), false);
  if (templateId === 'robot-2wd') {
    const relations: [string, string, JointType, Vector3][] = [
      ['chassis', 'motor-left', 'fixed', [0, 1, 0]],
      ['chassis', 'motor-right', 'fixed', [0, 1, 0]],
      ['chassis', 'caster', 'fixed', [0, 1, 0]],
      ['chassis', 'uno', 'fixed', [0, 1, 0]],
      ['chassis', 'driver', 'fixed', [0, 1, 0]],
    ];
    for (const part of project.components)
      if (part.definitionId === 'tt-motor') part.position[1] = 0.033;
    const world = worldMatrices(project);
    for (const [parent, child, type, axis] of relations) {
      const relative = world.get(parent)!.clone().invert().multiply(world.get(child)!);
      project.joints.push(jointAtPose(parent, child, relative, type, axis));
    }
    project = createJoint(project, 'motor-left', 'axle-left', 'wheel-left', 'axle-right', 'axle');
    project = createJoint(project, 'motor-right', 'axle-right', 'wheel-right', 'axle-left', 'axle');
  }
  if (templateId === 'robot-arm') {
    const base = project.components.find((part) => part.id === 'base')!;
    base.grounded = true;
    // Keep the board on the base as part of the same mechanism.
    const world = worldMatrices(project);
    project.joints.push(
      jointAtPose(
        'base',
        'uno',
        world.get('base')!.clone().invert().multiply(world.get('uno')!),
        'fixed',
      ),
    );
  }
  return project;
}
export function descendants(project: ProjectFile, id: string): Set<string> {
  const ids = new Set([id]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const part of project.components) {
      const parent = parentOf(project, part.id);
      if (parent && ids.has(parent) && !ids.has(part.id)) {
        ids.add(part.id);
        changed = true;
      }
    }
  }
  return ids;
}
export function removeComponent(project: ProjectFile, id: string): ProjectFile {
  const ids = descendants(project, id);
  return {
    ...project,
    components: project.components.filter((part) => !ids.has(part.id)),
    joints: project.joints.filter(
      (joint) => !ids.has(joint.parent.componentId) && !ids.has(joint.child.componentId),
    ),
  };
}
export function duplicateComponent(project: ProjectFile, id: string): ProjectFile {
  const ids = descendants(project, id),
    source = project.components.filter((part) => ids.has(part.id));
  if (project.components.length + source.length > MAX_COMPONENTS)
    throw new Error('Лимит: 300 деталей в проекте.');
  const mapping = new Map(source.map((part) => [part.id, uid()]));
  const rootPose = matrixPose(worldMatrices(project).get(id)!);
  rootPose.position[0] += 0.05;
  const copies = source.map((part) => ({
    ...structuredClone(part),
    id: mapping.get(part.id)!,
    name: `${part.name.slice(0, 152)} (копия)`,
    grounded: false,
    parentId: mapping.get(part.parentId ?? '') ?? null,
    ...(part.id === id ? { ...rootPose, parentId: null } : {}),
  }));
  const joints = project.joints
    .filter((joint) => ids.has(joint.parent.componentId) && ids.has(joint.child.componentId))
    .map((joint) => ({
      ...structuredClone(joint),
      id: uid(),
      parent: {
        ...structuredClone(joint.parent),
        componentId: mapping.get(joint.parent.componentId)!,
      },
      child: {
        ...structuredClone(joint.child),
        componentId: mapping.get(joint.child.componentId)!,
      },
    }));
  return {
    ...project,
    components: [...project.components, ...copies],
    joints: [...project.joints, ...joints],
  };
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 160;
const finite = (value: unknown, limit: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
const vector = (value: unknown, limit: number): value is Vector3 =>
  Array.isArray(value) && value.length === 3 && value.every((n) => finite(n, limit));
function readFrame(raw: unknown): AttachmentFrame {
  if (
    !object(raw) ||
    !vector(raw.position, 10) ||
    !vector(raw.rotation, Math.PI * 2) ||
    !vector(raw.axis, 1) ||
    Math.abs(Math.hypot(...raw.axis) - 1) > 0.001
  )
    throw new Error('Некорректная крепёжная рамка или ось.');
  return { position: [...raw.position], rotation: [...raw.rotation], axis: [...raw.axis] };
}
function readMount(raw: unknown): MountPoint {
  if (!object(raw) || !string(raw.id) || !['surface', 'axle'].includes(String(raw.socket)))
    throw new Error('Некорректная точка крепления.');
  return { id: raw.id, ...readFrame(raw), socket: raw.socket as MountPoint['socket'] };
}
function readEndpoint(raw: unknown): JointEndpoint {
  if (!object(raw) || !string(raw.componentId) || !(raw.mountId === null || string(raw.mountId)))
    throw new Error('Некорректная сторона соединения.');
  return { componentId: raw.componentId, mountId: raw.mountId, frame: readFrame(raw.frame) };
}
export function parseProject(json: string): ProjectFile {
  if (new Blob([json]).size > MAX_FILE_BYTES) throw new Error('Файл больше 2 МБ.');
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Некорректный JSON.');
  }
  if (object(data) && data.schemaVersion === 1) return migrateProject(parseLegacyProject(json));
  if (!object(data) || data.schemaVersion !== 2)
    throw new Error('Неподдерживаемая версия проекта (ожидается schemaVersion 1 или 2).');
  if (
    !string(data.id) ||
    !string(data.name) ||
    !(data.templateId === null || string(data.templateId)) ||
    !Array.isArray(data.components) ||
    data.components.length > MAX_COMPONENTS
  )
    throw new Error('Некорректные данные проекта или превышен лимит 300 деталей.');
  const components: ComponentInstance[] = data.components.map((raw) => {
    if (!object(raw) || !string(raw.id) || !string(raw.name) || !string(raw.definitionId))
      throw new Error('Некорректный идентификатор или имя детали.');
    const definition = getDefinition(raw.definitionId);
    if (
      raw.type !== definition.type ||
      !vector(raw.position, 10) ||
      !vector(raw.rotation, Math.PI * 2) ||
      !vector(raw.dimensions, 2) ||
      raw.dimensions.some((n) => n < 0.001) ||
      !(raw.parentId === null || string(raw.parentId)) ||
      typeof raw.grounded !== 'boolean'
    )
      throw new Error('Некорректные размеры, тип или координаты детали.');
    if (!object(raw.parameters) || raw.parameters.angle !== 0)
      throw new Error('Углы в schemaVersion 2 задаются в соединениях.');
    if (!Array.isArray(raw.mounts) || raw.mounts.length > 32)
      throw new Error('Некорректные точки крепления.');
    const mounts = raw.mounts.map(readMount);
    if (new Set(mounts.map((mount) => mount.id)).size !== mounts.length)
      throw new Error('Повторяются точки крепления.');
    return {
      id: raw.id,
      name: raw.name,
      definitionId: raw.definitionId,
      type: definition.type,
      position: [...raw.position],
      rotation: [...raw.rotation],
      dimensions: [...raw.dimensions],
      parentId: raw.parentId,
      parameters: { angle: 0 },
      grounded: raw.grounded,
      mounts,
    };
  });
  if (!Array.isArray(data.joints) || data.joints.length > MAX_COMPONENTS - 1)
    throw new Error('Некорректный список соединений.');
  const joints: MechanicalJoint[] = data.joints.map((raw) => {
    if (
      !object(raw) ||
      !string(raw.id) ||
      !string(raw.name) ||
      !['fixed', 'revolute', 'axle'].includes(String(raw.type)) ||
      !finite(raw.angle, Math.PI * 2) ||
      !finite(raw.minAngle, Math.PI * 2) ||
      !finite(raw.maxAngle, Math.PI * 2) ||
      raw.minAngle > raw.maxAngle ||
      raw.angle < raw.minAngle - 1e-9 ||
      raw.angle > raw.maxAngle + 1e-9
    )
      throw new Error('Некорректный тип или ограничения соединения.');
    if (raw.type === 'fixed' && (raw.angle !== 0 || raw.minAngle !== 0 || raw.maxAngle !== 0))
      throw new Error('Fixed Joint не имеет угла вращения.');
    return {
      id: raw.id,
      name: raw.name,
      type: raw.type as JointType,
      parent: readEndpoint(raw.parent),
      child: readEndpoint(raw.child),
      angle: raw.angle,
      minAngle: raw.minAngle,
      maxAngle: raw.maxAngle,
    };
  });
  const project: ProjectFile = {
    schemaVersion: 2,
    id: data.id,
    name: data.name,
    templateId: data.templateId,
    components,
    joints,
  };
  validateHierarchy(project);
  return project;
}
export function saveProject(
  project: ProjectFile,
  storage: Pick<Storage, 'setItem'> & Partial<Pick<Storage, 'getItem'>>,
): void {
  const previous = storage.getItem?.(STORAGE_KEY);
  if (previous) {
    let version: unknown;
    try {
      version = JSON.parse(previous).schemaVersion;
    } catch {
      /* Corrupt data is replaced only by the explicit Save UI. */
    }
    if (version === 1 && !storage.getItem?.(LEGACY_BACKUP_KEY))
      storage.setItem(LEGACY_BACKUP_KEY, previous);
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(project));
}
export function restoreProject(storage: Pick<Storage, 'getItem'>): ProjectFile | null {
  const json = storage.getItem(STORAGE_KEY);
  return json === null ? null : parseProject(json);
}

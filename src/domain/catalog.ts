import type { ComponentDefinition, ComponentInstance, GeometryKind, PartType, Vector3 } from './types';

function define(id: string, name: string, type: PartType, geometry: GeometryKind, dimensions: Vector3, color: string, joint?: ComponentDefinition['joint']): ComponentDefinition {
  return { id, name, type, geometry, dimensions, color, joint, mounts: [
    { id: 'bottom', position: [0, -dimensions[1] / 2, 0], axis: [0, -1, 0] },
    { id: 'top', position: [0, dimensions[1] / 2, 0], axis: [0, 1, 0] },
  ] };
}
export const CATALOG: readonly ComponentDefinition[] = [
  define('chassis', 'Шасси 2WD', 'structure', 'box', [.14, .006, .2], '#2aa4ad'),
  define('wheel', 'Ведущее колесо', 'structure', 'wheel', [.025, .066, .066], '#e5b941'),
  define('tt-motor', 'TT-мотор', 'actuator', 'motor', [.036, .025, .055], '#edbe3b'),
  define('caster', 'Задняя опора', 'structure', 'caster', [.028, .035, .028], '#a7b7c6'),
  define('uno', 'Arduino UNO R3', 'electronics', 'uno', [.053, .018, .069], '#168ca0'),
  define('l298n', 'Драйвер L298N', 'electronics', 'driver', [.043, .03, .043], '#c94e4e'),
  define('base', 'Основание', 'structure', 'base', [.13, .018, .13], '#3f657f'),
  define('platform', 'Поворотная платформа', 'joint', 'base', [.08, .015, .08], '#2aabb5', { axis: 'y', min: -180, max: 180 }),
  define('link', 'Звено 100 мм', 'structure', 'link', [.025, .1, .025], '#55aabb'),
  define('joint', 'Шарнир', 'joint', 'joint', [.044, .035, .035], '#dca744', { axis: 'z', min: -100, max: 100 }),
  define('servo', 'Сервопривод', 'actuator', 'servo', [.023, .028, .012], '#4269c6'),
  define('gripper', 'Захват', 'tool', 'gripper', [.065, .045, .025], '#c1ced6'),
  define('beam', 'Балка 150 мм', 'structure', 'box', [.02, .02, .15], '#7e94ad'),
];
export function getDefinition(id: string): ComponentDefinition {
  const definition = CATALOG.find(item => item.id === id);
  if (!definition) throw new Error(`Неизвестный компонент: ${id}`);
  return definition;
}
export const uid = () => crypto.randomUUID();
export function createComponent(definitionId: string, overrides: Partial<ComponentInstance> = {}): ComponentInstance {
  const definition = getDefinition(definitionId);
  return {
    id: uid(), definitionId, name: definition.name, type: definition.type,
    dimensions: [...definition.dimensions], position: [0, definition.dimensions[1] / 2, 0], rotation: [0, 0, 0],
    parentId: null, parameters: { angle: 0 }, mounts: structuredClone(definition.mounts), ...overrides,
  };
}

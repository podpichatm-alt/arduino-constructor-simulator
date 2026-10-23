import type {
  ComponentDefinition,
  ComponentInstance,
  GeometryKind,
  PartType,
  Vector3,
} from './types';

function define(
  id: string,
  name: string,
  type: PartType,
  geometry: GeometryKind,
  dimensions: Vector3,
  color: string,
  joint?: ComponentDefinition['joint'],
): ComponentDefinition {
  return {
    id,
    name,
    type,
    geometry,
    dimensions,
    color,
    joint,
    dimensionNote:
      id === 'uno'
        ? 'Контур платы 53.4 × 68.6 мм — Arduino UNO Rev3. Высота и навесные детали показаны схематически.'
        : 'Параметрическая геометрия: габариты задаются проектом, а не паспортом конкретного изделия. Для реальной сборки введите свои измерения до соединения.',
    mounts: [
      {
        id: 'bottom',
        position: [0, -dimensions[1] / 2, 0],
        axis: [0, -1, 0],
        rotation: [0, 0, 0],
        socket: 'surface',
      },
      {
        id: 'top',
        position: [0, dimensions[1] / 2, 0],
        axis: [0, 1, 0],
        rotation: [0, 0, 0],
        socket: 'surface',
      },
    ],
  };
}
export const CATALOG: readonly ComponentDefinition[] = [
  define('chassis', 'Шасси 2WD', 'structure', 'box', [0.14, 0.006, 0.2], '#2aa4ad'),
  define('wheel', 'Ведущее колесо', 'structure', 'wheel', [0.025, 0.066, 0.066], '#e5b941'),
  define('tt-motor', 'TT-мотор', 'actuator', 'motor', [0.036, 0.025, 0.055], '#edbe3b'),
  define('caster', 'Задняя опора', 'structure', 'caster', [0.028, 0.035, 0.028], '#a7b7c6'),
  define('uno', 'Arduino UNO R3', 'electronics', 'uno', [0.0534, 0.018, 0.0686], '#168ca0'),
  define('l298n', 'Драйвер L298N', 'electronics', 'driver', [0.043, 0.03, 0.043], '#c94e4e'),
  define('base', 'Основание', 'structure', 'base', [0.13, 0.018, 0.13], '#3f657f'),
  define('platform', 'Поворотная платформа', 'joint', 'base', [0.08, 0.015, 0.08], '#2aabb5', {
    axis: 'y',
    min: -180,
    max: 180,
  }),
  define('link', 'Звено 100 мм', 'structure', 'link', [0.025, 0.1, 0.025], '#55aabb'),
  define('joint', 'Шарнир', 'joint', 'joint', [0.044, 0.035, 0.035], '#dca744', {
    axis: 'z',
    min: -100,
    max: 100,
  }),
  define('servo', 'Сервопривод', 'actuator', 'servo', [0.023, 0.028, 0.012], '#4269c6'),
  define('gripper', 'Захват', 'tool', 'gripper', [0.065, 0.045, 0.025], '#c1ced6'),
  define('beam', 'Балка 150 мм', 'structure', 'box', [0.02, 0.02, 0.15], '#7e94ad'),
];
// Axle sockets have a different compatibility class from mounting surfaces.
for (const definition of CATALOG) {
  if (definition.id === 'wheel' || definition.id === 'tt-motor') {
    definition.mounts.push(
      ...([-1, 1] as const).map((sign) => ({
        id: sign === -1 ? 'axle-left' : 'axle-right',
        position: [(sign * definition.dimensions[0]) / 2, 0, 0] as Vector3,
        rotation: [0, 0, 0] as Vector3,
        axis: [sign, 0, 0] as Vector3,
        socket: 'axle' as const,
      })),
    );
  }
}
export function getDefinition(id: string): ComponentDefinition {
  const definition = CATALOG.find((item) => item.id === id);
  if (!definition) throw new Error(`Неизвестный компонент: ${id}`);
  return definition;
}
export const uid = () => crypto.randomUUID();
export function createComponent(
  definitionId: string,
  overrides: Partial<ComponentInstance> = {},
): ComponentInstance {
  const definition = getDefinition(definitionId);
  return {
    id: uid(),
    definitionId,
    name: definition.name,
    type: definition.type,
    dimensions: [...definition.dimensions],
    position: [0, definition.dimensions[1] / 2, 0],
    rotation: [0, 0, 0],
    parentId: null,
    grounded: false,
    parameters: { angle: 0 },
    mounts: structuredClone(definition.mounts),
    ...overrides,
  };
}

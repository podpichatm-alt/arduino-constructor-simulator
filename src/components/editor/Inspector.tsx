import { NumberField } from './NumberField';
import { getDefinition } from '../../domain/catalog';
import { descendants } from '../../domain/project';
import { incomingJoint, localMatrices, matrixPose, parentOf } from '../../domain/mechanics';
import { JointInspector } from './JointInspector';
import type { ComponentInstance, MechanicalJoint, ProjectFile, Vector3 } from '../../domain/types';

export function Inspector({
  project,
  part,
  onUpdate,
  onDelete,
  onDuplicate,
  onJointUpdate,
  onRetarget,
  onDetach,
}: {
  project: ProjectFile;
  part: ComponentInstance | undefined;
  onUpdate: (update: Partial<ComponentInstance>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onJointUpdate: (id: string, update: Partial<MechanicalJoint>) => void;
  onRetarget: (id: string, parentId: string) => void;
  onDetach: (id: string) => void;
}) {
  if (!part)
    return (
      <div className="inspector-empty">
        <span className="large-symbol">⌖</span>
        <h3>Выберите деталь</h3>
        <p>Нажмите на модель в сцене или на название в списке сборки.</p>
        <p>Здесь появятся координаты, размеры и настройки шарнира.</p>
      </div>
    );
  const joint = incomingJoint(project, part.id);
  const locked = !!joint || part.grounded;
  const connected = project.joints.some(
    (item) => item.parent.componentId === part.id || item.child.componentId === part.id,
  );
  const actualPose = matrixPose(localMatrices(project).get(part.id)!);
  const shownPart = joint ? { ...part, ...actualPose } : part;
  const forbidden = descendants(project, part.id);
  function vectorField(
    field: 'position' | 'rotation' | 'dimensions',
    index: number,
    value: number,
  ) {
    const vector: Vector3 = [...part![field]];
    vector[index] = value / (field === 'rotation' ? 180 / Math.PI : 1000);
    onUpdate({ [field]: vector });
  }
  return (
    <div className="inspector-fields">
      <p className="eyebrow">
        {part.type} · {part.definitionId}
      </p>
      <p className="small muted">{getDefinition(part.definitionId).dimensionNote}</p>
      <label>
        Название
        <input
          aria-label="Название детали"
          value={part.name}
          maxLength={160}
          onChange={(event) => {
            if (event.target.value.trim()) onUpdate({ name: event.target.value });
          }}
        />
      </label>
      {locked && (
        <p className="constraint-status">
          {part.grounded
            ? '🔒 Основание закреплено в мире'
            : `🔗 ${joint!.type.toUpperCase()} · свободное перемещение заблокировано`}
        </p>
      )}
      {joint && (
        <JointInspector
          project={project}
          joint={joint}
          onUpdate={(update) => onJointUpdate(joint.id, update)}
          onRetarget={(parentId) => onRetarget(joint.id, parentId)}
          onDetach={() => onDetach(joint.id)}
        />
      )}
      <label className="snap">
        <input
          aria-label="Закрепить в мире"
          type="checkbox"
          checked={part.grounded}
          disabled={!!joint || part.parentId !== null}
          onChange={(event) => onUpdate({ grounded: event.target.checked })}
        />
        Закрепить основание в мире
      </label>
      {(['position', 'rotation', 'dimensions'] as const).map((field) => (
        <fieldset key={field}>
          <legend>
            {
              { position: 'Координаты · мм', rotation: 'Поворот · °', dimensions: 'Размеры · мм' }[
                field
              ]
            }
          </legend>
          <div className="vector-fields">
            {['X', 'Y', 'Z'].map((axis, index) => (
              <NumberField
                key={`${part.id}-${field}-${axis}`}
                label={`${field === 'position' ? 'Положение' : field === 'rotation' ? 'Поворот' : 'Размер'} ${axis}`}
                disabled={field === 'dimensions' ? connected : locked}
                value={shownPart[field][index] * (field === 'rotation' ? 180 / Math.PI : 1000)}
                min={field === 'dimensions' ? 1 : field === 'rotation' ? -360 : -10000}
                max={field === 'dimensions' ? 2000 : field === 'rotation' ? 360 : 10000}
                onChange={(value) => vectorField(field, index, value)}
              />
            ))}
          </div>
        </fieldset>
      ))}
      <label>
        Родитель
        <select
          aria-label="Родитель детали"
          disabled={locked}
          value={parentOf(project, part.id) ?? ''}
          onChange={(event) => onUpdate({ parentId: event.target.value || null })}
        >
          <option value="">Мировая система координат</option>
          {project.components
            .filter((item) => !forbidden.has(item.id))
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.id.slice(0, 8)}
              </option>
            ))}
        </select>
      </label>
      <p className="muted small">
        Координаты и поворот заданы относительно родителя. При смене родителя сохраняется мировое
        положение. Удаление и копирование включают дочерние детали.
      </p>
      <div className="action-pair">
        <button onClick={onDuplicate}>Дублировать</button>
        <button className="danger" onClick={onDelete}>
          Удалить
        </button>
      </div>
      <details>
        <summary>Точки крепления ({part.mounts.length})</summary>
        {part.mounts.map((mount) => (
          <p className="small muted" key={mount.id}>
            {mount.id}: {mount.position.map((n) => Math.round(n * 1000)).join(', ')} мм · ось{' '}
            {mount.axis.join(', ')}
          </p>
        ))}
        <p className="small muted">
          Выберите эти точки в режиме «Соединить». Для изменения габаритов сначала отсоедините
          крепления детали.
        </p>
      </details>
    </div>
  );
}

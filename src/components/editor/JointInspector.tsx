import type { AttachmentFrame, MechanicalJoint, ProjectFile, Vector3 } from '../../domain/types';
import { NumberField } from './NumberField';
import { descendants } from '../../domain/project';
const DEGREES = 180 / Math.PI;
const AXES: { name: string; value: Vector3 }[] = [
  { name: '+X', value: [1, 0, 0] },
  { name: '−X', value: [-1, 0, 0] },
  { name: '+Y', value: [0, 1, 0] },
  { name: '−Y', value: [0, -1, 0] },
  { name: '+Z', value: [0, 0, 1] },
  { name: '−Z', value: [0, 0, -1] },
];
export function JointInspector({
  project,
  joint,
  onUpdate,
  onRetarget,
  onDetach,
}: {
  project: ProjectFile;
  joint: MechanicalJoint;
  onUpdate: (update: Partial<MechanicalJoint>) => void;
  onRetarget: (parentId: string) => void;
  onDetach: () => void;
}) {
  const forbidden = descendants(project, joint.child.componentId);
  function frameEditor(side: 'parent' | 'child', title: string) {
    const frame = joint[side].frame;
    const update = (change: Partial<AttachmentFrame>) =>
      onUpdate({ [side]: { ...joint[side], mountId: null, frame: { ...frame, ...change } } });
    return (
      <fieldset>
        <legend>{title}</legend>
        <label>
          Ось рамки
          <select
            aria-label={`Ось ${title}`}
            value={
              AXES.find((axis) =>
                axis.value.every((value, i) => Math.abs(value - frame.axis[i]) < 0.001),
              )?.name ?? 'custom'
            }
            onChange={(event) => {
              const axis = AXES.find((item) => item.name === event.target.value);
              if (axis) update({ axis: axis.value });
            }}
          >
            <option value="custom" disabled>
              Произвольная нормированная ось
            </option>
            {AXES.map((axis) => (
              <option key={axis.name}>{axis.name}</option>
            ))}
          </select>
        </label>
        {(['position', 'rotation'] as const).map((field) => (
          <div key={field}>
            <p className="small muted">
              {field === 'position' ? 'Локальная точка · мм' : 'Ориентация рамки · °'}
            </p>
            <div className="vector-fields">
              {['X', 'Y', 'Z'].map((axis, i) => (
                <NumberField
                  key={axis}
                  label={`${title} ${field} ${axis}`}
                  value={frame[field][i] * (field === 'position' ? 1000 : DEGREES)}
                  min={field === 'position' ? -10000 : -360}
                  max={field === 'position' ? 10000 : 360}
                  onChange={(value) => {
                    const vector: Vector3 = [...frame[field]];
                    vector[i] = value / (field === 'position' ? 1000 : DEGREES);
                    update({ [field]: vector });
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </fieldset>
    );
  }
  return (
    <section className="joint-inspector" aria-label="Редактор соединения">
      <h3>Механическое соединение</h3>
      <label>
        Имя связи
        <input
          aria-label="Название соединения"
          value={joint.name}
          maxLength={160}
          onChange={(event) => event.target.value.trim() && onUpdate({ name: event.target.value })}
        />
      </label>
      <label>
        Тип
        <select
          aria-label="Тип соединения"
          value={joint.type}
          onChange={(event) => onUpdate({ type: event.target.value as MechanicalJoint['type'] })}
        >
          <option value="fixed">Fixed Joint</option>
          <option value="revolute">Revolute Joint</option>
          <option value="axle">Axle Joint</option>
        </select>
      </label>
      {joint.type !== 'fixed' && (
        <fieldset className="joint-control">
          <legend>Управление суставом</legend>
          <output>{(joint.angle * DEGREES).toFixed(1)}°</output>
          <input
            aria-label="Угол сустава"
            type="range"
            min={joint.minAngle * DEGREES}
            max={joint.maxAngle * DEGREES}
            step="1"
            value={joint.angle * DEGREES}
            onChange={(event) => onUpdate({ angle: Number(event.target.value) / DEGREES })}
          />
          <div className="range-labels">
            <span>{(joint.minAngle * DEGREES).toFixed(0)}°</span>
            <span>{(joint.maxAngle * DEGREES).toFixed(0)}°</span>
          </div>
          <button onClick={() => onUpdate({ angle: 0 })}>Сбросить угол</button>
          <div className="action-pair">
            <NumberField
              label="Минимальный угол"
              value={joint.minAngle * DEGREES}
              min={-360}
              max={360}
              onChange={(value) => onUpdate({ minAngle: value / DEGREES })}
            />
            <NumberField
              label="Максимальный угол"
              value={joint.maxAngle * DEGREES}
              min={-360}
              max={360}
              onChange={(value) => onUpdate({ maxAngle: value / DEGREES })}
            />
          </div>
        </fieldset>
      )}
      <label>
        Ведущая деталь
        <select
          aria-label="Родитель соединения"
          value={joint.parent.componentId}
          onChange={(event) => onRetarget(event.target.value)}
        >
          {project.components
            .filter((part) => !forbidden.has(part.id))
            .map((part) => (
              <option key={part.id} value={part.id}>
                {part.name} · {part.id.slice(0, 8)}
              </option>
            ))}
        </select>
      </label>
      <p className="small muted">
        Смена ведущей детали сохраняет мировую позу сборки. Оси и крепления ниже меняют геометрию
        соединения с немедленным совмещением точек.
      </p>
      <details>
        <summary>Локальные крепёжные рамки</summary>
        <div className="frame-editors">
          {frameEditor('parent', 'Ведущее крепление')}
          {frameEditor('child', 'Ведомое крепление')}
        </div>
      </details>
      <button className="danger" onClick={onDetach}>
        Отсоединить деталь
      </button>
    </section>
  );
}

import { compatibleMounts, incomingJoint } from '../../domain/mechanics';
import type { JointType, ProjectFile } from '../../domain/types';
import { useState } from 'react';
export type MountChoice = { componentId: string; mountId: string };
export function Connections({
  project,
  source,
  target,
  onSource,
  onTarget,
  onConnect,
  onCancel,
}: {
  project: ProjectFile;
  source: MountChoice | null;
  target: MountChoice | null;
  onSource: (choice: MountChoice | null) => void;
  onTarget: (choice: MountChoice | null) => void;
  onConnect: (type: JointType) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<JointType>('fixed');
  const first = project.components.find((part) => part.id === source?.componentId);
  const second = project.components.find((part) => part.id === target?.componentId);
  const compatible =
    !!first &&
    !!second &&
    !!source &&
    !!target &&
    compatibleMounts(first, source.mountId, second, target.mountId, type);
  function side(
    label: string,
    choice: MountChoice | null,
    set: (value: MountChoice | null) => void,
    child: boolean,
  ) {
    const part = project.components.find((item) => item.id === choice?.componentId);
    return (
      <fieldset>
        <legend>{label}</legend>
        <label>
          Деталь
          <select
            aria-label={child ? 'Вторая деталь' : 'Первая деталь'}
            value={choice?.componentId ?? ''}
            onChange={(event) => {
              const part = project.components.find((item) => item.id === event.target.value);
              set(
                part && part.mounts.length
                  ? { componentId: part.id, mountId: part.mounts[0].id }
                  : null,
              );
            }}
          >
            <option value="">Выберите деталь…</option>
            {project.components.map((item) => (
              <option
                key={item.id}
                value={item.id}
                disabled={
                  child &&
                  (item.id === source?.componentId ||
                    item.grounded ||
                    !!incomingJoint(project, item.id))
                }
              >
                {item.name} · {item.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Крепление
          <select
            aria-label={child ? 'Вторая точка крепления' : 'Первая точка крепления'}
            disabled={!part}
            value={choice?.mountId ?? ''}
            onChange={(event) => choice && set({ ...choice, mountId: event.target.value })}
          >
            {!part && <option value="">Сначала выберите деталь</option>}
            {part?.mounts.map((mount) => (
              <option key={mount.id} value={mount.id}>
                {mount.id} · {mount.socket === 'axle' ? 'ось' : 'поверхность'}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
    );
  }
  return (
    <section className="connection-builder" aria-label="Соединить детали">
      <div className="connection-heading">
        <h2>Соединить детали</h2>
        <button onClick={onCancel}>Закрыть режим</button>
      </div>
      <p className="muted small">
        Первая деталь остаётся на месте. Вторая сборка совместится с её креплением. Выбирайте детали
        и точки в сцене или в полях ниже.
      </p>
      <div className="connection-grid">
        {side('1 · Ведущая деталь', source, onSource, false)}
        {side('2 · Ведомая деталь', target, onTarget, true)}
        <fieldset>
          <legend>3 · Тип соединения</legend>
          <label>
            Механическая связь
            <select
              aria-label="Тип нового соединения"
              value={type}
              onChange={(event) => setType(event.target.value as JointType)}
            >
              <option value="fixed">Fixed Joint · жёсткое</option>
              <option value="revolute">Revolute Joint · шарнир</option>
              <option value="axle">Axle Joint · колесная ось</option>
            </select>
          </label>
          <button className="primary" disabled={!compatible} onClick={() => onConnect(type)}>
            Совместить и соединить
          </button>
        </fieldset>
      </div>
      {source && target && !compatible && (
        <p role="status" className="notice">
          Выберите совместимые точки одного класса; для Axle обе точки должны быть осевыми.
        </p>
      )}
    </section>
  );
}

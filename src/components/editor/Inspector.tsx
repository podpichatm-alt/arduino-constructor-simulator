import { useEffect, useState } from 'react';
import { descendants } from '../../domain/project';
import { getDefinition } from '../../domain/catalog';
import type { ComponentInstance, ProjectFile, Vector3 } from '../../domain/types';

export function NumberField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(3))));
  useEffect(() => setDraft(String(Number(value.toFixed(3)))), [value]);
  return <label className="number-field"><span>{label}</span><input type="number" value={draft} min={min} max={max} step={step}
    onChange={event => { setDraft(event.target.value); const n = Number(event.target.value); if (event.target.value.trim() && Number.isFinite(n) && n >= min && n <= max) onChange(n); }}
    onBlur={() => setDraft(String(Number(value.toFixed(3))))} /></label>;
}
export function Inspector({ project, part, onUpdate, onDelete, onDuplicate }: { project: ProjectFile; part: ComponentInstance | undefined; onUpdate: (update: Partial<ComponentInstance>) => void; onDelete: () => void; onDuplicate: () => void }) {
  if (!part) return <div className="inspector-empty"><span className="large-symbol">⌖</span><h3>Выберите деталь</h3><p>Нажмите на модель в сцене или на название в списке сборки.</p><p>Здесь появятся координаты, размеры и настройки шарнира.</p></div>;
  const definition = getDefinition(part.definitionId);
  const forbidden = descendants(project, part.id);
  function vectorField(field: 'position' | 'rotation' | 'dimensions', index: number, value: number) {
    const vector: Vector3 = [...part![field]];
    vector[index] = value / (field === 'rotation' ? 180 / Math.PI : 1000);
    onUpdate({ [field]: vector });
  }
  return <div className="inspector-fields">
    <p className="eyebrow">{part.type} · {part.definitionId}</p>
    <label>Название<input aria-label="Название детали" value={part.name} maxLength={160} onChange={event => { if (event.target.value.trim()) onUpdate({ name: event.target.value }); }} /></label>
    {definition.joint && <fieldset className="joint-control"><legend>Угол сустава · ось {definition.joint.axis.toUpperCase()}</legend>
      <output>{(part.parameters.angle * 180 / Math.PI).toFixed(1)}°</output>
      <input aria-label="Угол сустава" type="range" min={definition.joint.min} max={definition.joint.max} step="1" value={part.parameters.angle * 180 / Math.PI} onChange={event => onUpdate({ parameters: { angle: Number(event.target.value) * Math.PI / 180 } })} />
      <div className="range-labels"><span>{definition.joint.min}°</span><span>{definition.joint.max}°</span></div>
    </fieldset>}
    {(['position', 'rotation', 'dimensions'] as const).map(field => <fieldset key={field}><legend>{({ position: 'Координаты · мм', rotation: 'Поворот · °', dimensions: 'Размеры · мм' })[field]}</legend>
      <div className="vector-fields">{['X', 'Y', 'Z'].map((axis, index) => <NumberField key={`${part.id}-${field}-${axis}`} label={`${field === 'position' ? 'Положение' : field === 'rotation' ? 'Поворот' : 'Размер'} ${axis}`} value={part[field][index] * (field === 'rotation' ? 180 / Math.PI : 1000)} min={field === 'dimensions' ? 1 : field === 'rotation' ? -360 : -10000} max={field === 'dimensions' ? 2000 : field === 'rotation' ? 360 : 10000} onChange={value => vectorField(field, index, value)} />)}</div>
    </fieldset>)}
    <label>Родитель<select aria-label="Родитель детали" value={part.parentId ?? ''} onChange={event => onUpdate({ parentId: event.target.value || null })}>
      <option value="">Мировая система координат</option>
      {project.components.filter(item => !forbidden.has(item.id)).map(item => <option key={item.id} value={item.id}>{item.name} · {item.id.slice(0, 8)}</option>)}
    </select></label>
    <p className="muted small">Координаты и поворот заданы относительно родителя. При его смене локальные значения сохраняются. Удаление и копирование включают дочерние детали.</p>
    <div className="action-pair"><button onClick={onDuplicate}>Дублировать</button><button className="danger" onClick={onDelete}>Удалить</button></div>
    <details><summary>Точки будущих креплений ({part.mounts.length})</summary>{part.mounts.map(mount => <p className="small muted" key={mount.id}>{mount.id}: {mount.position.map(n => Math.round(n * 1000)).join(', ')} мм · ось {mount.axis.join(', ')}</p>)}<p className="small muted">Метаданные в исходном размере детали; автоматическая стыковка пока не реализована.</p></details>
  </div>;
}

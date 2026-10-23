import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { PROJECT_TEMPLATES } from './domain/templates';
import { CATALOG, createComponent } from './domain/catalog';
import {
  createProject,
  duplicateComponent,
  MAX_COMPONENTS,
  MAX_FILE_BYTES,
  parseProject,
  removeComponent,
  restoreProject,
  saveProject,
} from './domain/project';
import {
  createJoint,
  detachJoint,
  parentOf,
  retargetJoint,
  updateComponent,
  updateJoint,
} from './domain/mechanics';
import { Connections, type MountChoice } from './components/editor/Connections';
import type { ComponentInstance, ProjectFile, WorkspaceMode } from './domain/types';
import { Inspector } from './components/editor/Inspector';
import type { CameraView } from './components/editor/Scene';
const Scene = lazy(() => import('./components/editor/Scene'));
const MODES: { id: WorkspaceMode; label: string; explanation: string }[] = [
  { id: 'assembly', label: '3D-сборка', explanation: '' },
  {
    id: 'wiring',
    label: 'Электросхема',
    explanation: 'Редактор проводов и проверка контактов появятся в V0.2.',
  },
  {
    id: 'code',
    label: 'Программирование',
    explanation: 'Импорт, компиляция и исполнение настоящих .ino скетчей запланированы на V0.3.',
  },
  {
    id: 'simulation',
    label: 'Испытания',
    explanation: 'Физическая симуляция и виртуальные датчики запланированы на V0.4.',
  },
];
function loadInitial(): { project: ProjectFile; error: string } {
  try {
    return { project: restoreProject(localStorage) ?? createProject('robot-2wd'), error: '' };
  } catch (error) {
    return {
      project: createProject('robot-2wd'),
      error: `Восстановление не удалось: ${error instanceof Error ? error.message : 'хранилище недоступно'}. Исходное сохранение не перезаписано. Экспортируйте текущий проект или нажмите «Сохранить», чтобы заменить его.`,
    };
  }
}
export function App() {
  const [initial] = useState(loadInitial);
  const [project, setProject] = useState(initial.project);
  const [mode, setMode] = useState<WorkspaceMode>('assembly');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(
    () => window.matchMedia('(min-width: 1100px)').matches,
  );
  const [inspectorOpen, setInspectorOpen] = useState(
    () => window.matchMedia('(min-width: 1100px)').matches,
  );
  const [query, setQuery] = useState('');
  const [tool, setTool] = useState<'translate' | 'rotate' | 'connect'>('translate');
  const [sourceMount, setSourceMount] = useState<MountChoice | null>(null);
  const [targetMount, setTargetMount] = useState<MountChoice | null>(null);
  const [space, setSpace] = useState<'world' | 'local'>('world');
  const [snap, setSnap] = useState(true);
  const [cameraCommand, setCameraCommand] = useState({ view: 'iso' as CameraView, revision: 0 });
  const [error, setError] = useState(initial.error);
  const [autoSave, setAutoSave] = useState(!initial.error);
  const [saveStatus, setSaveStatus] = useState('');
  const [pendingTemplate, setPendingTemplate] = useState<string | null | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  const selected = project.components.find((part) => part.id === selectedId);
  const activeMode = MODES.find((item) => item.id === mode)!;
  const dirtyProject = useRef(project);
  dirtyProject.current = project;
  useEffect(() => {
    if (!autoSave) return;
    try {
      saveProject(project, localStorage);
      setSaveStatus('Сохранено на устройстве');
    } catch {
      setSaveStatus('Не сохранено');
      setError(
        'Не удалось сохранить проект: проверьте доступ к localStorage и свободное место. Используйте экспорт JSON.',
      );
    }
  }, [project, autoSave]);
  function transact(operation: (current: ProjectFile) => ProjectFile) {
    try {
      const next = parseProject(JSON.stringify(operation(project)));
      setProject(next);
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Ошибка изменения проекта.');
    }
  }
  function updatePart(id: string, update: Partial<ComponentInstance>) {
    transact((current) => updateComponent(current, id, update));
  }
  function pickMount(componentId: string, mountId: string) {
    setSelectedId(componentId);
    const choice = { componentId, mountId };
    if (!sourceMount || sourceMount.componentId === componentId) setSourceMount(choice);
    else setTargetMount(choice);
  }
  function select(id: string | null) {
    setSelectedId(id);
    const part = project.components.find((item) => item.id === id);
    if (tool === 'connect' && part?.mounts.length) pickMount(part.id, part.mounts[0].id);
  }
  function replaceProject(next: ProjectFile) {
    setProject(next);
    setSelectedId(null);
    setSourceMount(null);
    setTargetMount(null);
    setTool('translate');
    setMode('assembly');
    setAutoSave(true);
    setError('');
  }
  function exportProject() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80) || 'project'}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importFile(file: File) {
    const currentAtStart = dirtyProject.current;
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('Файл больше 2 МБ.');
      const imported = parseProject(await file.text());
      if (dirtyProject.current !== currentAtStart)
        throw new Error('Проект изменился во время чтения файла. Повторите импорт.');
      // Keep import reviewable; existing data remains until the dialog is accepted.
      setPendingImport(imported);
    } catch (failure) {
      setError(
        `Импорт отклонён: ${failure instanceof Error ? failure.message : 'ошибка чтения файла'}`,
      );
    }
  }
  const [pendingImport, setPendingImport] = useState<ProjectFile | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (pendingTemplate === undefined && !pendingImport) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPendingTemplate(undefined);
        setPendingImport(null);
      }
      if (event.key !== 'Tab') return;
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button');
      if (!buttons?.length) return;
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [pendingTemplate, pendingImport]);
  return (
    <div className="page">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          AC
        </div>
        <div>
          <div className="brand-title">
            Arduino Constructor <span>& Simulator</span>
          </div>
          <div className="brand-subtitle">УНИВЕРСАЛЬНАЯ ИНЖЕНЕРНАЯ ПЛАТФОРМА</div>
        </div>
        <span className="version">V0.1.1 · Механика</span>
      </header>
      <main>
        <section className="project-bar" aria-label="Проект">
          <div className="project-name">
            <span className="eyebrow">ПРОЕКТ /</span>
            <input
              aria-label="Название проекта"
              value={project.name}
              maxLength={160}
              onChange={(event) => {
                if (event.target.value.trim()) setProject({ ...project, name: event.target.value });
              }}
            />
            <span className="save-status" role="status">
              {saveStatus}
            </span>
          </div>
          <div className="project-actions">
            <button onClick={() => setPendingTemplate(null)}>＋ Новый</button>
            <button
              onClick={() => {
                try {
                  saveProject(project, localStorage);
                  setAutoSave(true);
                  setError('');
                  setSaveStatus('Сохранено на устройстве');
                } catch {
                  setError('Хранилище недоступно. Экспортируйте проект в JSON.');
                }
              }}
            >
              Сохранить
            </button>
            <button onClick={exportProject}>Экспорт JSON</button>
            <button onClick={() => fileInput.current?.click()}>Импорт JSON</button>
            <input
              ref={fileInput}
              hidden
              type="file"
              accept=".json,application/json"
              aria-label="Файл проекта"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void importFile(file);
              }}
            />
          </div>
        </section>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button aria-label="Закрыть сообщение" onClick={() => setError('')}>
              ×
            </button>
          </div>
        )}
        <nav className="tabs" aria-label="Режимы проекта">
          {MODES.map((item) => (
            <button
              key={item.id}
              className={mode === item.id ? 'tab selected' : 'tab'}
              aria-pressed={mode === item.id}
              onClick={() => setMode(item.id)}
            >
              {item.label}
            </button>
          ))}
          <span className="mode-note">МЕХАНИЧЕСКИЙ КОНСТРУКТОР</span>
        </nav>
        <div className="workspace-tools">
          <div className="tool-group">
            <button aria-expanded={catalogOpen} onClick={() => setCatalogOpen(!catalogOpen)}>
              ☰ Каталог / сборка
            </button>
            <button aria-pressed={tool === 'translate'} onClick={() => setTool('translate')}>
              ↔ Перемещение
            </button>
            <button aria-pressed={tool === 'rotate'} onClick={() => setTool('rotate')}>
              ↻ Поворот
            </button>
            <button
              aria-pressed={tool === 'connect'}
              onClick={() => {
                setTool('connect');
                setSourceMount(null);
                setTargetMount(null);
              }}
            >
              ⛓ Соединить
            </button>
          </div>
          <button aria-expanded={inspectorOpen} onClick={() => setInspectorOpen(!inspectorOpen)}>
            ⌖ Свойства{selected ? ` · ${selected.name}` : ''}
          </button>
        </div>
        {tool === 'connect' && (
          <Connections
            project={project}
            source={sourceMount}
            target={targetMount}
            onSource={setSourceMount}
            onTarget={setTargetMount}
            onCancel={() => setTool('translate')}
            onConnect={(type) => {
              if (!sourceMount || !targetMount) return;
              try {
                const next = createJoint(
                  project,
                  sourceMount.componentId,
                  sourceMount.mountId,
                  targetMount.componentId,
                  targetMount.mountId,
                  type,
                );
                setProject(parseProject(JSON.stringify(next)));
                setSelectedId(targetMount.componentId);
                setInspectorOpen(true);
                setTool('translate');
                setSourceMount(null);
                setTargetMount(null);
                setError('');
              } catch (failure) {
                setError((failure as Error).message);
              }
            }}
          />
        )}
        <section
          className={`workspace ${catalogOpen ? 'show-catalog' : ''} ${inspectorOpen ? 'show-inspector' : ''}`}
          aria-label="Рабочее пространство"
        >
          <aside className="catalog-panel" aria-label="Каталог и сборка" hidden={!catalogOpen}>
            <div className="panel-title">
              <h2>Библиотека</h2>
              <button aria-label="Скрыть каталог" onClick={() => setCatalogOpen(false)}>
                ×
              </button>
            </div>
            <h3>Стартовые проекты</h3>
            <div className="templates">
              {PROJECT_TEMPLATES.map((template) => (
                <button
                  className="template"
                  key={template.id}
                  onClick={() => setPendingTemplate(template.id)}
                >
                  <strong>{template.title}</strong>
                  <span>{template.description}</span>
                </button>
              ))}
            </div>
            <h3>Добавить компонент</h3>
            <p className="small muted">
              Собственные составные модели. Габариты и точки креплений параметрические; проверяйте
              размеры реальных деталей.
            </p>
            <input
              aria-label="Поиск деталей"
              placeholder="Найти деталь…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="catalog-list">
              {CATALOG.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())).map(
                (definition) => (
                  <button
                    key={definition.id}
                    disabled={project.components.length >= MAX_COMPONENTS}
                    onClick={() => {
                      const part = createComponent(definition.id);
                      setProject((current) => ({
                        ...current,
                        components: [...current.components, part],
                      }));
                      select(part.id);
                    }}
                  >
                    <span className="part-swatch" style={{ background: definition.color }} />
                    <span>
                      {definition.name}
                      <small>
                        {definition.dimensions.map((n) => Math.round(n * 1000)).join(' × ')} мм
                      </small>
                    </span>
                    <span className="add-symbol">＋</span>
                  </button>
                ),
              )}
            </div>
            <h3>
              Сборка{' '}
              <span className="count">
                {project.components.length} / {MAX_COMPONENTS}
              </span>
            </h3>
            <div className="assembly-list">
              {project.components.length === 0 && (
                <p className="muted small">Добавьте первую деталь из каталога.</p>
              )}
              {project.components.map((part) => {
                let depth = 0;
                let parent = parentOf(project, part.id);
                while (parent && depth < 32) {
                  depth++;
                  parent = parentOf(project, parent);
                }
                return (
                  <button
                    key={part.id}
                    aria-pressed={selectedId === part.id}
                    style={{ paddingLeft: 10 + depth * 12 }}
                    onClick={() => select(part.id)}
                  >
                    <span className="tree-dot">
                      {parentOf(project, part.id) ? '🔗' : part.grounded ? '🔒' : '◇'}
                    </span>
                    {part.name}
                  </button>
                );
              })}
            </div>
            <h3>Соединения · {project.joints.length}</h3>
            <div className="joint-list">
              {project.joints.map((joint) => (
                <button
                  key={joint.id}
                  onClick={() => {
                    setSelectedId(joint.child.componentId);
                    setInspectorOpen(true);
                    setTool('translate');
                  }}
                >
                  <strong>{joint.type.toUpperCase()}</strong>
                  <span>{joint.name}</span>
                </button>
              ))}
            </div>
          </aside>
          <div className="viewport-column">
            <div className="scene-toolbar">
              <div className="tool-group">
                <select
                  aria-label="Система координат"
                  value={space}
                  onChange={(event) => setSpace(event.target.value as typeof space)}
                >
                  <option value="world">Мировые оси</option>
                  <option value="local">Локальные оси</option>
                </select>
                <label className="snap">
                  <input
                    type="checkbox"
                    checked={snap}
                    onChange={(event) => setSnap(event.target.checked)}
                  />
                  Шаг 5 мм / 15°
                </label>
              </div>
              <span className="scene-unit">СЕТКА 10 ММ</span>
            </div>
            <div className="viewport" data-testid="viewport">
              <Suspense fallback={<div className="scene-error">Загрузка 3D-редактора…</div>}>
                <Scene
                  project={project}
                  selectedId={selectedId}
                  onSelect={select}
                  tool={tool}
                  space={space}
                  snap={snap}
                  sourceMount={sourceMount}
                  onPickMount={pickMount}
                  cameraCommand={cameraCommand}
                  onTransform={(id, position, rotation) => updatePart(id, { position, rotation })}
                />
              </Suspense>
              <div className="viewport-label">
                <span className="live-dot" />
                {project.templateId === 'robot-arm'
                  ? 'Манипулятор'
                  : project.templateId === 'robot-2wd'
                    ? 'Робот 2WD'
                    : 'Свободная сборка'}
                <small>{project.components.length} деталей · перспектива</small>
              </div>
              {mode !== 'assembly' && (
                <div className="mode-placeholder">
                  <span className="eyebrow">СЛЕДУЮЩИЕ ЭТАПЫ</span>
                  <h2>{activeMode.label}</h2>
                  <p>{activeMode.explanation}</p>
                  <p className="notice">
                    Электрическая симуляция, исполнение Arduino C++ и физика ещё не реализованы.
                  </p>
                  <button onClick={() => setMode('assembly')}>Вернуться в 3D-сборку</button>
                </div>
              )}
            </div>
            <div className="camera-bar">
              <div className="tool-group">
                {(
                  [
                    { view: 'iso', label: 'Сброс камеры' },
                    { view: 'front', label: 'Спереди' },
                    { view: 'top', label: 'Сверху' },
                    { view: 'right', label: 'Справа' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.view}
                    onClick={() =>
                      setCameraCommand((current) => ({
                        view: item.view,
                        revision: current.revision + 1,
                      }))
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <span className="axis-key">
                <b>X</b>
                <b>Y</b>
                <b>Z</b> · мм
              </span>
            </div>
            <p className="camera-help">
              Мышь: левая — вращать, правая — сдвиг, колесо — масштаб. Касания: один палец —
              вращать, два — масштаб и сдвиг. Деталь: нажмите, затем тяните ось инструмента.
            </p>
          </div>
          <aside className="inspector-panel" aria-label="Свойства детали" hidden={!inspectorOpen}>
            <div className="panel-title">
              <h2>Свойства</h2>
              <button aria-label="Скрыть свойства" onClick={() => setInspectorOpen(false)}>
                ×
              </button>
            </div>
            <Inspector
              project={project}
              part={selected}
              onUpdate={(update) => selected && updatePart(selected.id, update)}
              onDelete={() => {
                if (selected) {
                  setProject((current) => removeComponent(current, selected.id));
                  setSelectedId(null);
                }
              }}
              onJointUpdate={(id, update) =>
                transact((current) => updateJoint(current, id, update))
              }
              onRetarget={(id, parentId) =>
                transact((current) => retargetJoint(current, id, parentId))
              }
              onDetach={(id) => transact((current) => detachJoint(current, id))}
              onDuplicate={() => {
                if (selected) {
                  try {
                    const next = duplicateComponent(project, selected.id);
                    setProject(next);
                    setSelectedId(next.components[project.components.length].id);
                  } catch (failure) {
                    setError((failure as Error).message);
                  }
                }
              }}
            />
          </aside>
        </section>
        <footer>
          <span>V0.1.1 · Механические соединения и кинематика</span>
          <span>Без эмуляции MCU и физической симуляции</span>
        </footer>
      </main>
      {(pendingTemplate !== undefined || pendingImport) && (
        <div className="dialog-backdrop">
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="replace-title"
            className="dialog"
          >
            <h2 id="replace-title">
              {pendingImport
                ? 'Импортировать проект?'
                : pendingTemplate === null
                  ? 'Создать пустой проект?'
                  : 'Открыть стартовый проект?'}
            </h2>
            <p>
              {pendingImport
                ? `${pendingImport.name} · ${pendingImport.components.length} деталей.`
                : 'Текущая сборка будет заменена.'}{' '}
              Экспортируйте текущий проект, если хотите сохранить отдельную копию.
            </p>
            <div className="dialog-actions">
              <button
                autoFocus
                onClick={() => {
                  setPendingTemplate(undefined);
                  setPendingImport(null);
                }}
              >
                Отмена
              </button>
              <button onClick={exportProject}>Экспорт текущего</button>
              <button
                className="primary"
                onClick={() => {
                  replaceProject(pendingImport ?? createProject(pendingTemplate ?? null));
                  setPendingTemplate(undefined);
                  setPendingImport(null);
                }}
              >
                Продолжить
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

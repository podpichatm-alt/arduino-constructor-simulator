import { useState } from 'react';
import { PROJECT_TEMPLATES } from './domain/templates';
import type { WorkspaceMode } from './domain/types';

const MODES: ReadonlyArray<{ id: WorkspaceMode; label: string; explanation: string }> = [
  { id: 'assembly', label: '3D-сборка', explanation: 'Редактор деталей и шарниров будет добавлен в V0.1.' },
  { id: 'wiring', label: 'Электросхема', explanation: 'Редактор проводов и проверка контактов появятся в V0.2.' },
  { id: 'code', label: 'Программирование', explanation: 'Импорт и исполнение настоящих .ino скетчей запланированы на V0.3.' },
  { id: 'simulation', label: 'Испытания', explanation: 'Физическая симуляция и виртуальные датчики запланированы на V0.4.' },
];

export function App() {
  const [mode, setMode] = useState<WorkspaceMode>('assembly');
  const [templateId, setTemplateId] = useState(PROJECT_TEMPLATES[0].id);
  const template = PROJECT_TEMPLATES.find((item) => item.id === templateId) ?? PROJECT_TEMPLATES[0];
  const activeMode = MODES.find((item) => item.id === mode) ?? MODES[0];

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">AC</div>
        <div>
          <div className="brand-title">Arduino Constructor &amp; Simulator</div>
          <div className="brand-subtitle">Универсальная инженерная платформа</div>
        </div>
        <span className="version">V0.0 · Каркас</span>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow">ИНЖЕНЕРНЫЙ КОНСТРУКТОР</p>
          <h1>От идеи робота до работающего устройства</h1>
          <p className="intro">
            Собирайте мобильные платформы, манипуляторы и другие Arduino-проекты.
            Это стартовая версия интерфейса: симуляция, 3D-редактор и исполнение кода ещё не подключены.
          </p>
        </section>

        <section className="workspace" aria-label="Рабочее пространство">
          <div className="workspace-head">
            <h2>Рабочее пространство</h2>
            <span className="status">Подготовка V0.1</span>
          </div>
          <div className="workspace-body">
            <aside className="sidebar">
              <h3>Шаблоны</h3>
              <div className="templates">
                {PROJECT_TEMPLATES.map((item) => (
                  <button
                    type="button"
                    className={item.id === templateId ? 'template active' : 'template'}
                    key={item.id}
                    onClick={() => setTemplateId(item.id)}
                    aria-pressed={item.id === templateId}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                  </button>
                ))}
              </div>
            </aside>
            <div className="editor">
              <nav className="tabs" aria-label="Режимы проекта">
                {MODES.map((item) => (
                  <button
                    type="button"
                    className={item.id === mode ? 'tab selected' : 'tab'}
                    key={item.id}
                    onClick={() => setMode(item.id)}
                    aria-pressed={item.id === mode}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
              <div className="empty-state">
                <div className="placeholder-symbol" aria-hidden="true">◇</div>
                <span className="eyebrow">ВЫБРАННЫЙ ПРОЕКТ</span>
                <h2>{template.title}</h2>
                <p>{activeMode.explanation}</p>
                <p className="notice">Не является запущенной симуляцией.</p>
              </div>
              <div className="component-list">
                <strong>Планируемые компоненты</strong>
                <div className="chips">
                  {template.components.map((part) => <span className="chip" key={part}>{part}</span>)}
                </div>
              </div>
            </div>
          </div>
        </section>
        <p className="footer-note">Статус V0.0: документация и демонстрационная оболочка интерфейса.</p>
      </main>
    </div>
  );
}

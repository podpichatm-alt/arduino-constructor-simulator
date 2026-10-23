import { describe, expect, it } from 'vitest';
import { createComponent, CATALOG } from './catalog';
import {
  createProject,
  descendants,
  duplicateComponent,
  parseProject,
  removeComponent,
  restoreProject,
  saveProject,
  STORAGE_KEY,
} from './project';
import type { ProjectFile } from './types';

const roundtrip = (project: ProjectFile) => parseProject(JSON.stringify(project));
describe('проекты V0.1', () => {
  it('создаёт независимые проекты и компоненты каталога', () => {
    expect(createProject().components).toEqual([]);
    expect(createProject().id).not.toBe(createProject().id);
    const part = createComponent('uno');
    part.dimensions[0] = 1;
    expect(CATALOG.find((def) => def.id === 'uno')!.dimensions[0]).toBe(0.0534);
  });
  it('содержит полноценный 2WD и иерархический манипулятор', () => {
    const robot = createProject('robot-2wd');
    expect(robot.components).toHaveLength(8);
    expect(robot.components.filter((part) => part.definitionId === 'wheel')).toHaveLength(2);
    expect(robot.components.filter((part) => part.definitionId === 'tt-motor')).toHaveLength(2);
    const arm = createProject('robot-arm');
    expect(descendants(arm, 'shoulder').has('gripper')).toBe(true);
    expect(descendants(arm, 'elbow').has('upper-arm')).toBe(false);
    expect(roundtrip(robot)).toEqual(robot);
    expect(roundtrip(arm)).toEqual(arm);
  });
  it('дублирует поддерево с новыми связями и удаляет только выбранное поддерево', () => {
    const arm = createProject('robot-arm');
    const result = duplicateComponent(arm, 'elbow');
    const copies = result.components.slice(arm.components.length);
    expect(copies).toHaveLength(descendants(arm, 'elbow').size);
    expect(copies[0].parentId).toBeNull();
    expect(result.joints.some((joint) => joint.child.componentId === copies[0].id)).toBe(false);
    expect(copies.find((part) => part.definitionId === 'gripper')!.parentId).not.toBe('wrist');
    expect(roundtrip(result)).toEqual(result);
    const removed = removeComponent(arm, 'elbow');
    expect(removed.components.some((part) => part.id === 'gripper')).toBe(false);
    expect(removed.components.some((part) => part.id === 'upper-arm')).toBe(true);
    expect(arm.components).toHaveLength(11);
  });
  it('копирование сохраняет допустимую длину имён и соблюдает лимит деталей', () => {
    const project = createProject();
    const part = createComponent('beam', { name: 'Я'.repeat(160) });
    project.components.push(part);
    expect(
      roundtrip(duplicateComponent(project, part.id)).components[1].name.length,
    ).toBeLessThanOrEqual(160);
    project.components = Array.from({ length: 300 }, () => createComponent('beam'));
    expect(() => duplicateComponent(project, project.components[0].id)).toThrow('300');
  });
  it('сохраняет и восстанавливает все параметры, координаты и связи', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
    expect(restoreProject(storage)).toBeNull();
    const arm = createProject('robot-arm');
    arm.joints.find((joint) => joint.child.componentId === 'shoulder')!.angle = 0.5;
    arm.components[2].rotation = [0.1, 0.2, 0.3];
    saveProject(arm, storage);
    expect(data.has(STORAGE_KEY)).toBe(true);
    expect(restoreProject(storage)).toEqual(arm);
  });
  it('не скрывает ошибки хранилища', () => {
    expect(() =>
      saveProject(createProject(), {
        setItem: () => {
          throw new Error('quota');
        },
      }),
    ).toThrow('quota');
    expect(() => restoreProject({ getItem: () => 'bad json' })).toThrow('JSON');
  });
});
describe('валидация импорта', () => {
  it.each([
    [
      'версия',
      (p: Record<string, unknown>) => {
        p.schemaVersion = 99;
      },
    ],
    [
      'пустое имя',
      (p: Record<string, unknown>) => {
        p.name = '';
      },
    ],
    [
      'лишние детали',
      (p: Record<string, unknown>) => {
        p.components = Array(301).fill({});
      },
    ],
  ])('отклоняет: %s', (_, mutate) => {
    const project = createProject('robot-arm');
    mutate(project as unknown as Record<string, unknown>);
    expect(() => roundtrip(project)).toThrow();
  });
  it.each([
    [
      'неизвестный тип',
      (p: ProjectFile) => {
        p.components[0].definitionId = 'unknown';
      },
    ],
    [
      'повтор ID',
      (p: ProjectFile) => {
        p.components[1].id = p.components[0].id;
      },
    ],
    [
      'отсутствующий родитель',
      (p: ProjectFile) => {
        p.components[0].parentId = 'missing';
      },
    ],
    [
      'цикл',
      (p: ProjectFile) => {
        p.components[0].parentId = 'gripper';
      },
    ],
    [
      'нулевой размер',
      (p: ProjectFile) => {
        p.components[0].dimensions[0] = 0;
      },
    ],
    [
      'NaN',
      (p: ProjectFile) => {
        p.components[0].position[0] = NaN;
      },
    ],
    [
      'большие координаты',
      (p: ProjectFile) => {
        p.components[0].position[0] = 20;
      },
    ],
    [
      'неверный угол',
      (p: ProjectFile) => {
        p.components[2].parameters.angle = 10;
      },
    ],
    [
      'неверный тип',
      (p: ProjectFile) => {
        p.components[0].type = 'tool';
      },
    ],
    [
      'неверная ось крепления',
      (p: ProjectFile) => {
        p.components[0].mounts[0].axis = [0, 0, 0];
      },
    ],
  ])('отклоняет: %s', (_, mutate) => {
    const project = createProject('robot-arm');
    mutate(project);
    expect(() => roundtrip(project)).toThrow();
  });
  it('отклоняет повреждённый JSON и файлы больше лимита', () => {
    expect(() => parseProject('{')).toThrow('JSON');
    expect(() => parseProject(' '.repeat(2_000_001))).toThrow('2 МБ');
  });
  it('не переносит произвольные поля из JSON', () => {
    const data = JSON.parse(JSON.stringify(createProject('robot-arm')));
    data.untrusted = true;
    data.components[0].untrusted = true;
    const parsed = parseProject(JSON.stringify(data));
    expect(parsed).not.toHaveProperty('untrusted');
    expect(parsed.components[0]).not.toHaveProperty('untrusted');
  });
});

import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 as Vec } from 'three';
import { createComponent } from './catalog';
import {
  compatibleMounts,
  createJoint,
  detachJoint,
  frameMatrix,
  incomingJoint,
  jointAtPose,
  poseMatrix,
  reparentComponent,
  retargetJoint,
  updateComponent,
  updateJoint,
  worldMatrices,
} from './mechanics';
import {
  createProject,
  LEGACY_BACKUP_KEY,
  migrateProject,
  parseProject,
  restoreProject,
  saveProject,
  STORAGE_KEY,
} from './project';
import { parseLegacyProject } from './legacy';
import oldArm from '../../tests/fixtures/v0.1-arm.json';
import oldRobot from '../../tests/fixtures/v0.1-2wd.json';
import type { ProjectFile } from './types';
function closeMatrix(actual: Matrix4, expected: Matrix4) {
  actual.elements.forEach((value, i) => expect(value).toBeCloseTo(expected.elements[i], 10));
}
function assertAnchors(project: ProjectFile) {
  const world = worldMatrices(project);
  for (const joint of project.joints) {
    const a = new Vec().setFromMatrixPosition(
      world.get(joint.parent.componentId)!.clone().multiply(frameMatrix(joint.parent.frame)),
    );
    const b = new Vec().setFromMatrixPosition(
      world.get(joint.child.componentId)!.clone().multiply(frameMatrix(joint.child.frame)),
    );
    expect(a.distanceTo(b)).toBeLessThan(1e-10);
  }
}
function loosePair() {
  const project = createProject();
  project.components = [
    createComponent('beam', {
      id: 'a',
      position: [0.2, 0.1, -0.3],
      rotation: [0.3, -0.4, 0.6],
      dimensions: [0.04, 0.03, 0.2],
    }),
    createComponent('beam', { id: 'b', position: [-0.3, 0.4, 0.5], rotation: [0.7, 0.2, -0.4] }),
  ];
  return project;
}
describe('механические рамки и кинематика', () => {
  it.each(['fixed', 'revolute', 'axle'] as const)(
    '%s: крепёжные точки остаются совмещены после всех преобразований',
    (type) => {
      let project = loosePair();
      if (type === 'axle')
        project.components.forEach((part) =>
          part.mounts.forEach((mount) => {
            mount.socket = 'axle';
            mount.axis = [1, 0, 0];
            mount.rotation = [0.2, -0.1, 0.3];
          }),
        );
      project = createJoint(project, 'a', 'top', 'b', 'bottom', type);
      for (const angle of [-Math.PI, -0.7, 0, 0.8, Math.PI]) {
        project = updateJoint(project, project.joints[0].id, { angle });
        assertAnchors(project);
        project = updateComponent(project, 'a', {
          position: [0.7, -0.2, 0.4],
          rotation: [-0.6, 0.8, 0.1],
        });
        assertAnchors(project);
      }
    },
  );
  it('учитывает обе родительские цепочки и переносит ведомое поддерево при совмещении', () => {
    let project = loosePair();
    project.components.push(
      createComponent('base', { id: 'c', position: [0.7, 0.2, -0.4], rotation: [0.5, 0.9, -0.3] }),
    );
    project.components.push(
      createComponent('base', { id: 'd', position: [-0.6, -0.2, 0.8], rotation: [-0.4, 0.1, 0.7] }),
    );
    project.components.push(
      createComponent('link', { id: 'tip', position: [0, 0.2, 0], parentId: 'b' }),
    );
    project = reparentComponent(project, 'a', 'c');
    project = reparentComponent(project, 'b', 'd');
    project = updateComponent(project, 'c', { rotation: [-0.8, 0.6, 0.2] });
    const before = worldMatrices(project);
    const tipRelative = before.get('b')!.clone().invert().multiply(before.get('tip')!);
    project = createJoint(project, 'a', 'top', 'b', 'bottom', 'revolute');
    assertAnchors(project);
    const after = worldMatrices(project);
    closeMatrix(after.get('b')!.clone().invert().multiply(after.get('tip')!), tipRelative);
  });
  it('вращает вокруг смещённой крепёжной точки и заданной оси, а не центра модели', () => {
    const project = createProject();
    project.components = [
      createComponent('base', { id: 'base', position: [0, 0, 0] }),
      createComponent('link', { id: 'link' }),
    ];
    const joint = jointAtPose('base', 'link', new Matrix4(), 'revolute', [0, 1, 0]);
    joint.parent.frame.position = [1, 0, 0];
    // Child's pivot is 100 mm below its origin. With angle 0 its center is 100 mm along +X.
    joint.child.frame.position = [-0.1, 0, 0];
    joint.angle = Math.PI / 2;
    project.joints = [joint];
    const center = new Vec().setFromMatrixPosition(worldMatrices(project).get('link')!);
    expect(center.x).toBeCloseTo(1, 10);
    expect(center.y).toBeCloseTo(0, 10);
    expect(center.z).toBeCloseTo(-0.1, 10);
    assertAnchors(project);
  });
  it('перемещение шасси переносит ВСЕ части 2WD и не позволяет оторвать колесо', () => {
    const project = createProject('robot-2wd'),
      before = worldMatrices(project);
    expect(project.joints).toHaveLength(7);
    expect(incomingJoint(project, 'wheel-left')!.type).toBe('axle');
    const after = updateComponent(project, 'chassis', { position: [0.4, 0.065, -0.2] });
    const world = worldMatrices(after);
    for (const part of project.components) {
      const delta = new Vec()
        .setFromMatrixPosition(world.get(part.id)!)
        .sub(new Vec().setFromMatrixPosition(before.get(part.id)!));
      expect(delta.distanceTo(new Vec(0.4, 0, -0.2))).toBeLessThan(1e-10);
    }
    expect(() => updateComponent(project, 'wheel-left', { position: [3, 3, 3] })).toThrow(
      'закреплена',
    );
    expect(() => updateComponent(project, 'wheel-left', { rotation: [0, 0, 1] })).toThrow(
      'закреплена',
    );
    expect(() => updateComponent(project, 'wheel-left', { dimensions: [1, 1, 1] })).toThrow(
      'размеров',
    );
    const rotated = updateJoint(project, incomingJoint(project, 'wheel-left')!.id, { angle: 1.3 });
    assertAnchors(rotated);
    expect(
      new Vec()
        .setFromMatrixPosition(worldMatrices(rotated).get('wheel-left')!)
        .distanceTo(new Vec().setFromMatrixPosition(before.get('wheel-left')!)),
    ).toBeLessThan(1e-10);
  });
  it('фиксирует основание руки, а каждый сустав перемещает свою ветку', () => {
    const project = createProject('robot-arm');
    expect(() => updateComponent(project, 'base', { position: [1, 0, 0] })).toThrow('закреплена');
    for (const id of ['platform', 'shoulder', 'elbow', 'wrist']) {
      const before = worldMatrices(project),
        joint = incomingJoint(project, id)!;
      const changed = updateJoint(project, joint.id, { angle: joint.angle + 0.3 });
      closeMatrix(worldMatrices(changed).get('base')!, before.get('base')!);
      expect(worldMatrices(changed).get('gripper')!.equals(before.get('gripper')!)).toBe(false);
      assertAnchors(changed);
    }
    const unlocked = updateComponent(project, 'base', { grounded: false });
    assertAnchors(updateComponent(unlocked, 'base', { position: [0.5, 0.009, 0.2] }));
  });
  it('сохраняет мировые позы после смены свободного родителя и ведущей детали соединения', () => {
    let project = loosePair();
    project.components.push(
      createComponent('base', { id: 'c', position: [1, 0.2, -0.4], rotation: [0.7, 0.8, 0.9] }),
    );
    const before = worldMatrices(project).get('b')!;
    project = reparentComponent(project, 'b', 'a');
    closeMatrix(worldMatrices(project).get('b')!, before);
    project = reparentComponent(project, 'b', 'c');
    closeMatrix(worldMatrices(project).get('b')!, before);
    project = reparentComponent(project, 'b', null);
    closeMatrix(worldMatrices(project).get('b')!, before);
    project = createJoint(project, 'a', 'top', 'b', 'bottom', 'revolute');
    project = updateJoint(project, project.joints[0].id, { angle: 0.6 });
    const connected = worldMatrices(project).get('b')!;
    project = retargetJoint(project, project.joints[0].id, 'c');
    closeMatrix(worldMatrices(project).get('b')!, connected);
    project = detachJoint(project, project.joints[0].id);
    closeMatrix(worldMatrices(project).get('b')!, connected);
  });
  it('запрещает циклы, несколько ведущих связей, неверные оси и несовместимые крепления', () => {
    const project = createJoint(loosePair(), 'a', 'top', 'b', 'bottom', 'fixed');
    expect(() => createJoint(project, 'b', 'top', 'a', 'bottom', 'fixed')).toThrow('Циклическая');
    expect(() => createJoint(project, 'a', 'top', 'b', 'bottom', 'fixed')).toThrow('отсоедините');
    expect(() => reparentComponent(project, 'a', 'b')).toThrow('Циклическая');
    expect(() => retargetJoint(project, project.joints[0].id, 'b')).toThrow('Циклическая');
    expect(
      compatibleMounts(project.components[0], 'top', project.components[1], 'bottom', 'axle'),
    ).toBe(false);
    expect(() => createJoint(loosePair(), 'a', 'top', 'b', 'bottom', 'axle')).toThrow(
      'Несовместимые',
    );
    const invalid = structuredClone(project);
    invalid.joints[0].parent.frame.axis = [0, 0, 0];
    expect(() => parseProject(JSON.stringify(invalid))).toThrow('ось');
    const duplicate = structuredClone(project);
    duplicate.joints.push({ ...duplicate.joints[0], id: 'second' });
    expect(() => parseProject(JSON.stringify(duplicate))).toThrow('несколько');
  });
  it('ограничивает углы и сохраняет рамки в JSON без дрейфа после многократного вращения', () => {
    let project = createProject('robot-arm');
    const id = incomingJoint(project, 'elbow')!.id;
    project = updateJoint(project, id, { minAngle: -0.2, maxAngle: 0.4, angle: 99 });
    expect(incomingJoint(project, 'elbow')!.angle).toBe(0.4);
    for (let i = 0; i < 100; i++) project = updateJoint(project, id, { angle: Math.sin(i) });
    assertAnchors(project);
    const restored = parseProject(JSON.stringify(project));
    expect(restored).toEqual(project);
    for (const [part, matrix] of worldMatrices(project))
      closeMatrix(worldMatrices(restored).get(part)!, matrix);
    expect(() => updateJoint(project, id, { minAngle: 1, maxAngle: -1 })).toThrow('ограничения');
  });
});
describe('миграция V0.1 без потери позы и сохранения', () => {
  it.each([oldArm, oldRobot])(
    'сохраняет все мировые матрицы из реального schemaVersion 1',
    (fixture) => {
      const old = parseLegacyProject(JSON.stringify(fixture));
      const migrated = parseProject(JSON.stringify(fixture));
      expect(migrated.schemaVersion).toBe(2);
      expect(migrated.components.map((part) => part.id)).toEqual(
        old.components.map((part) => part.id),
      );
      const oldWorld = new Map<string, Matrix4>();
      function resolve(id: string): Matrix4 {
        if (oldWorld.has(id)) return oldWorld.get(id)!;
        const part = old.components.find((item) => item.id === id)!;
        const axis =
          part.definitionId === 'platform'
            ? [0, part.parameters.angle, 0]
            : [0, 0, part.parameters.angle];
        const local = poseMatrix(part.position, part.rotation).multiply(
          poseMatrix([0, 0, 0], axis as [number, number, number]),
        );
        const matrix = part.parentId ? resolve(part.parentId).clone().multiply(local) : local;
        oldWorld.set(id, matrix);
        return matrix;
      }
      for (const part of old.components)
        closeMatrix(worldMatrices(migrated).get(part.id)!, resolve(part.id));
      assertAnchors(migrated);
      expect(parseProject(JSON.stringify(migrated))).toEqual(migrated);
    },
  );
  it('сохраняет оригинальный JSON отдельной резервной копией, включая повторные загрузки', () => {
    const data = new Map([[STORAGE_KEY, JSON.stringify(oldArm)]]);
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
    const migrated = restoreProject(storage)!;
    saveProject(migrated, storage);
    expect(data.get(LEGACY_BACKUP_KEY)).toBe(JSON.stringify(oldArm));
    expect(restoreProject(storage)).toEqual(migrated);
    saveProject(migrated, storage);
    expect(data.get(LEGACY_BACKUP_KEY)).toBe(JSON.stringify(oldArm));
  });
  it('ошибка создания backup не перезаписывает исходный v1', () => {
    let saved = JSON.stringify(oldArm);
    const storage = {
      getItem: (key: string) => (key === STORAGE_KEY ? saved : null),
      setItem: (key: string, value: string) => {
        if (key === LEGACY_BACKUP_KEY) throw new Error('quota');
        saved = value;
      },
    };
    expect(() => saveProject(migrateProject(parseLegacyProject(saved)), storage)).toThrow('quota');
    expect(JSON.parse(saved).schemaVersion).toBe(1);
  });
});

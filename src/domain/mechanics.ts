import { Euler, Matrix4, Quaternion, Vector3 as Vec } from 'three';
import { getDefinition, uid } from './catalog';
import type {
  AttachmentFrame,
  ComponentInstance,
  JointEndpoint,
  JointType,
  MechanicalJoint,
  ProjectFile,
  Vector3,
} from './types';

const Y = new Vec(0, 1, 0);
export const MATE = new Matrix4().makeRotationX(Math.PI);
export const poseMatrix = (position: Vector3, rotation: Vector3) =>
  new Matrix4().compose(
    new Vec(...position),
    new Quaternion().setFromEuler(new Euler(...rotation)),
    new Vec(1, 1, 1),
  );
/** The local frame's Y axis is aligned to axis, then oriented by its Euler rotation. */
export function frameMatrix(frame: AttachmentFrame): Matrix4 {
  return poseMatrix(frame.position, frame.rotation).multiply(
    new Matrix4().makeRotationFromQuaternion(
      new Quaternion().setFromUnitVectors(Y, new Vec(...frame.axis).normalize()),
    ),
  );
}
export function matrixPose(matrix: Matrix4): { position: Vector3; rotation: Vector3 } {
  const p = new Vec(),
    q = new Quaternion();
  matrix.decompose(p, q, new Vec());
  const e = new Euler().setFromQuaternion(q, 'XYZ');
  const clean = (value: number) => (value === 0 ? 0 : value);
  return {
    position: p.toArray().map(clean) as Vector3,
    rotation: [e.x, e.y, e.z].map(clean) as Vector3,
  };
}
export const matrixFrame = (matrix: Matrix4): AttachmentFrame => ({
  ...matrixPose(matrix),
  axis: [0, 1, 0],
});
export function incomingJoint(project: ProjectFile, id: string): MechanicalJoint | undefined {
  return project.joints.find((joint) => joint.child.componentId === id);
}
export function parentOf(project: ProjectFile, id: string): string | null {
  return (
    incomingJoint(project, id)?.parent.componentId ??
    project.components.find((part) => part.id === id)?.parentId ??
    null
  );
}
export function validateHierarchy(project: ProjectFile): void {
  const ids = new Set(project.components.map((part) => part.id));
  if (ids.size !== project.components.length)
    throw new Error('Повторяются идентификаторы деталей.');
  const childIds = new Set<string>(),
    jointIds = new Set<string>();
  for (const joint of project.joints) {
    if (
      !['fixed', 'revolute', 'axle'].includes(joint.type) ||
      ![joint.angle, joint.minAngle, joint.maxAngle].every(Number.isFinite) ||
      joint.minAngle > joint.maxAngle ||
      joint.angle < joint.minAngle - 1e-9 ||
      joint.angle > joint.maxAngle + 1e-9 ||
      Math.abs(joint.minAngle) > Math.PI * 2 ||
      Math.abs(joint.maxAngle) > Math.PI * 2 ||
      (joint.type === 'fixed' &&
        (joint.angle !== 0 || joint.minAngle !== 0 || joint.maxAngle !== 0))
    )
      throw new Error('Некорректные ограничения соединения.');
    if (jointIds.has(joint.id) || childIds.has(joint.child.componentId))
      throw new Error('Повтор соединения или несколько ведущих соединений у детали.');
    jointIds.add(joint.id);
    childIds.add(joint.child.componentId);
    for (const endpoint of [joint.parent, joint.child]) {
      if (
        ![...endpoint.frame.position, ...endpoint.frame.rotation, ...endpoint.frame.axis].every(
          Number.isFinite,
        ) ||
        Math.abs(Math.hypot(...endpoint.frame.axis) - 1) > 0.001
      )
        throw new Error('Некорректная ось или рамка крепления.');
      const part = project.components.find((item) => item.id === endpoint.componentId);
      if (
        !part ||
        (endpoint.mountId !== null && !part.mounts.some((mount) => mount.id === endpoint.mountId))
      )
        throw new Error('Не найдена деталь или точка крепления соединения.');
    }
    const child = project.components.find((part) => part.id === joint.child.componentId)!;
    if (child.parentId !== null || child.grounded)
      throw new Error('Соединённая деталь не может иметь второго родителя или фиксацию в мире.');
  }
  for (const part of project.components) {
    if (part.grounded && parentOf(project, part.id) !== null)
      throw new Error('Фиксировать в мире можно только основание сборки.');
    const visited = new Set([part.id]);
    let parent = parentOf(project, part.id);
    while (parent !== null) {
      if (!ids.has(parent)) throw new Error('Не найден родитель детали.');
      if (visited.has(parent)) throw new Error('Циклическая иерархия деталей.');
      visited.add(parent);
      if (visited.size > 32) throw new Error('Глубина иерархии больше 32.');
      parent = parentOf(project, parent);
    }
  }
}
export function jointLocalMatrix(joint: MechanicalJoint): Matrix4 {
  return frameMatrix(joint.parent.frame)
    .multiply(new Matrix4().makeRotationY(joint.type === 'fixed' ? 0 : joint.angle))
    .multiply(MATE)
    .multiply(frameMatrix(joint.child.frame).invert());
}
export function localMatrices(project: ProjectFile): Map<string, Matrix4> {
  return new Map(
    project.components.map((part) => [
      part.id,
      incomingJoint(project, part.id)
        ? jointLocalMatrix(incomingJoint(project, part.id)!)
        : poseMatrix(part.position, part.rotation),
    ]),
  );
}
export function worldMatrices(project: ProjectFile): Map<string, Matrix4> {
  validateHierarchy(project);
  const locals = localMatrices(project),
    result = new Map<string, Matrix4>();
  const resolve = (id: string): Matrix4 => {
    if (result.has(id)) return result.get(id)!;
    const parent = parentOf(project, id);
    const matrix = parent
      ? resolve(parent).clone().multiply(locals.get(id)!)
      : locals.get(id)!.clone();
    result.set(id, matrix);
    return matrix;
  };
  for (const part of project.components) resolve(part.id);
  return result;
}
export function getMountFrame(part: ComponentInstance, mountId: string): AttachmentFrame {
  const mount = part.mounts.find((item) => item.id === mountId);
  if (!mount) throw new Error('Точка крепления не найдена.');
  const nominal = getDefinition(part.definitionId).dimensions;
  return {
    position: mount.position.map(
      (value, i) => (value * part.dimensions[i]) / nominal[i],
    ) as Vector3,
    rotation: [...mount.rotation],
    axis: [...mount.axis],
  };
}
export function compatibleMounts(
  parent: ComponentInstance,
  parentMountId: string,
  child: ComponentInstance,
  childMountId: string,
  type: JointType,
): boolean {
  const a = parent.mounts.find((mount) => mount.id === parentMountId),
    b = child.mounts.find((mount) => mount.id === childMountId);
  return !!a && !!b && a.socket === b.socket && (type === 'axle' ? a.socket === 'axle' : true);
}
export function createJoint(
  project: ProjectFile,
  parentId: string,
  parentMountId: string,
  childId: string,
  childMountId: string,
  type: JointType,
): ProjectFile {
  const a = project.components.find((part) => part.id === parentId),
    b = project.components.find((part) => part.id === childId);
  if (!a || !b || a.id === b.id) throw new Error('Выберите две разные детали.');
  if (incomingJoint(project, childId) || b.grounded)
    throw new Error('Сначала отсоедините деталь или снимите фиксацию основания.');
  if (!compatibleMounts(a, parentMountId, b, childMountId, type))
    throw new Error('Несовместимые точки крепления. Для Axle нужны две осевые точки.');
  const joint: MechanicalJoint = {
    id: uid(),
    name: `${a.name} → ${b.name}`.slice(0, 160),
    type,
    parent: { componentId: a.id, mountId: parentMountId, frame: getMountFrame(a, parentMountId) },
    child: { componentId: b.id, mountId: childMountId, frame: getMountFrame(b, childMountId) },
    angle: 0,
    minAngle: type === 'fixed' ? 0 : -Math.PI,
    maxAngle: type === 'fixed' ? 0 : Math.PI,
  };
  const next = {
    ...project,
    components: project.components.map((part) =>
      part.id === childId ? { ...part, parentId: null } : part,
    ),
    joints: [...project.joints, joint],
  };
  validateHierarchy(next);
  return next;
}
export function detachJoint(project: ProjectFile, jointId: string): ProjectFile {
  const joint = project.joints.find((item) => item.id === jointId);
  if (!joint) return project;
  const pose = matrixPose(worldMatrices(project).get(joint.child.componentId)!);
  return {
    ...project,
    joints: project.joints.filter((item) => item.id !== jointId),
    components: project.components.map((part) =>
      part.id === joint.child.componentId ? { ...part, ...pose, parentId: null } : part,
    ),
  };
}
export function reparentComponent(
  project: ProjectFile,
  id: string,
  parentId: string | null,
): ProjectFile {
  const part = project.components.find((item) => item.id === id);
  if (!part || part.grounded || incomingJoint(project, id))
    throw new Error('Сначала отсоедините деталь или снимите фиксацию.');
  const world = worldMatrices(project);
  if (parentId !== null && !world.has(parentId)) throw new Error('Не найден родитель детали.');
  const pose = matrixPose(
    parentId ? world.get(parentId)!.clone().invert().multiply(world.get(id)!) : world.get(id)!,
  );
  const next = {
    ...project,
    components: project.components.map((item) =>
      item.id === id ? { ...item, ...pose, parentId } : item,
    ),
  };
  validateHierarchy(next);
  return next;
}
export function updateComponent(
  project: ProjectFile,
  id: string,
  update: Partial<ComponentInstance>,
): ProjectFile {
  const part = project.components.find((item) => item.id === id);
  if (!part) throw new Error('Деталь не найдена.');
  if (
    ('position' in update || 'rotation' in update || 'parentId' in update) &&
    (incomingJoint(project, id) || part.grounded)
  )
    throw new Error('Деталь закреплена: управляйте суставом или сначала отсоедините её.');
  if (
    'dimensions' in update &&
    project.joints.some(
      (joint) => joint.parent.componentId === id || joint.child.componentId === id,
    )
  )
    throw new Error('Перед изменением размеров отсоедините крепления детали.');
  const next = 'parentId' in update ? reparentComponent(project, id, update.parentId!) : project;
  const { parentId: _parentId, ...rest } = update;
  const result = {
    ...next,
    components: next.components.map((item) => (item.id === id ? { ...item, ...rest } : item)),
  };
  validateHierarchy(result);
  return result;
}
export function updateJoint(
  project: ProjectFile,
  id: string,
  update: Partial<MechanicalJoint>,
): ProjectFile {
  const joint = project.joints.find((item) => item.id === id);
  if (!joint) throw new Error('Соединение не найдено.');
  const next = { ...joint, ...update, id: joint.id };
  if (
    !Number.isFinite(next.minAngle) ||
    !Number.isFinite(next.maxAngle) ||
    next.minAngle > next.maxAngle ||
    Math.abs(next.minAngle) > Math.PI * 2 ||
    Math.abs(next.maxAngle) > Math.PI * 2
  )
    throw new Error('Некорректные ограничения угла.');
  if (next.type === 'fixed') {
    next.angle = 0;
    next.minAngle = 0;
    next.maxAngle = 0;
  }
  if (!Number.isFinite(next.angle)) throw new Error('Некорректный угол.');
  next.angle = Math.max(next.minAngle, Math.min(next.maxAngle, next.angle));
  const result = {
    ...project,
    joints: project.joints.map((item) => (item.id === id ? next : item)),
  };
  validateHierarchy(result);
  return result;
}
/** Migration/template helper: define real frames while preserving a given zero-angle relative pose. */
export function jointAtPose(
  parentId: string,
  childId: string,
  pose: Matrix4,
  type: JointType,
  axis: Vector3 = [0, 1, 0],
  angle = 0,
): MechanicalJoint {
  const align = new Matrix4().makeRotationFromQuaternion(
    new Quaternion().setFromUnitVectors(Y, new Vec(...axis)),
  );
  const endpoint = (componentId: string, frame: AttachmentFrame): JointEndpoint => ({
    componentId,
    mountId: null,
    frame,
  });
  return {
    id: uid(),
    name: `${parentId} → ${childId}`,
    type,
    parent: endpoint(parentId, matrixFrame(pose.clone().multiply(align))),
    child: endpoint(childId, matrixFrame(align.clone().multiply(MATE))),
    angle,
    minAngle: type === 'fixed' ? 0 : -Math.PI,
    maxAngle: type === 'fixed' ? 0 : Math.PI,
  };
}
/** Change the driving component without teleporting any body in the dependent assembly. */
export function retargetJoint(
  project: ProjectFile,
  jointId: string,
  parentId: string,
): ProjectFile {
  const joint = project.joints.find((item) => item.id === jointId);
  if (!joint) throw new Error('Соединение не найдено.');
  const world = worldMatrices(project);
  if (!world.has(parentId)) throw new Error('Не найден родитель детали.');
  const frame = world
    .get(parentId)!
    .clone()
    .invert()
    .multiply(world.get(joint.child.componentId)!)
    .multiply(frameMatrix(joint.child.frame))
    .multiply(MATE.clone().invert())
    .multiply(new Matrix4().makeRotationY(joint.type === 'fixed' ? 0 : -joint.angle));
  return updateJoint(project, jointId, {
    parent: { componentId: parentId, mountId: null, frame: matrixFrame(frame) },
  });
}

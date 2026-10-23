export type ProjectKind = 'mobile' | 'manipulator';
export type WorkspaceMode = 'assembly' | 'wiring' | 'code' | 'simulation';
export type Vector3 = [number, number, number];
export type PartType = 'structure' | 'actuator' | 'electronics' | 'joint' | 'tool';
export type GeometryKind =
  | 'box'
  | 'wheel'
  | 'motor'
  | 'caster'
  | 'uno'
  | 'driver'
  | 'base'
  | 'servo'
  | 'link'
  | 'joint'
  | 'gripper';
export interface ProjectTemplate {
  id: string;
  title: string;
  kind: ProjectKind;
  description: string;
  components: readonly string[];
}
export interface AttachmentFrame {
  position: Vector3;
  rotation: Vector3;
  axis: Vector3;
}
export interface MountPoint extends AttachmentFrame {
  id: string;
  socket: 'surface' | 'axle';
}
export type JointType = 'fixed' | 'revolute' | 'axle';
export interface JointEndpoint {
  componentId: string;
  mountId: string | null;
  frame: AttachmentFrame;
}
export interface MechanicalJoint {
  id: string;
  name: string;
  type: JointType;
  parent: JointEndpoint;
  child: JointEndpoint;
  angle: number;
  minAngle: number;
  maxAngle: number;
}
export interface ComponentDefinition {
  id: string;
  name: string;
  type: PartType;
  geometry: GeometryKind;
  dimensions: Vector3;
  color: string;
  mounts: MountPoint[];
  dimensionNote: string;
  joint?: { axis: 'x' | 'y' | 'z'; min: number; max: number };
}
/** SI units. Transforms are relative to parent; rotations and joint angles are radians. */
export interface ComponentInstance {
  id: string;
  definitionId: string;
  name: string;
  type: PartType;
  dimensions: Vector3;
  position: Vector3;
  rotation: Vector3;
  parentId: string | null;
  parameters: { angle: number };
  mounts: MountPoint[];
  grounded: boolean;
}
export interface ProjectFile {
  schemaVersion: 2;
  id: string;
  name: string;
  templateId: string | null;
  components: ComponentInstance[];
  joints: MechanicalJoint[];
}

export interface LegacyComponentInstance extends Omit<ComponentInstance, 'grounded' | 'mounts'> {
  mounts: Array<{ id: string; position: Vector3; axis: Vector3 }>;
}
export interface LegacyProjectFile
  extends Omit<ProjectFile, 'schemaVersion' | 'components' | 'joints'> {
  schemaVersion: 1;
  components: LegacyComponentInstance[];
}

export type ProjectKind = 'mobile' | 'manipulator';
export type WorkspaceMode = 'assembly' | 'wiring' | 'code' | 'simulation';
export type Vector3 = [number, number, number];
export type PartType = 'structure' | 'actuator' | 'electronics' | 'joint' | 'tool';
export type GeometryKind = 'box' | 'wheel' | 'motor' | 'caster' | 'uno' | 'driver' | 'base' | 'servo' | 'link' | 'joint' | 'gripper';
export interface ProjectTemplate {
  id: string; title: string; kind: ProjectKind; description: string; components: readonly string[];
}
export interface MountPoint { id: string; position: Vector3; axis: Vector3 }
export interface ComponentDefinition {
  id: string; name: string; type: PartType; geometry: GeometryKind;
  dimensions: Vector3; color: string; mounts: MountPoint[];
  joint?: { axis: 'x' | 'y' | 'z'; min: number; max: number };
}
/** SI units. Transforms are relative to parent; rotations and joint angles are radians. */
export interface ComponentInstance {
  id: string; definitionId: string; name: string; type: PartType;
  dimensions: Vector3; position: Vector3; rotation: Vector3; parentId: string | null;
  parameters: { angle: number };
  mounts: MountPoint[];
}
export interface ProjectFile {
  schemaVersion: 1; id: string; name: string; templateId: string | null;
  components: ComponentInstance[];
}

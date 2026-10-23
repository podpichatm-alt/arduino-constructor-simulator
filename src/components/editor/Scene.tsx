import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import { Box3, Group, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { ComponentInstance, ProjectFile, Vector3 as Tuple } from '../../domain/types';
import { getDefinition } from '../../domain/catalog';
import { PartGeometry } from './PartGeometry';
import { TransformGizmo } from './TransformGizmo';

export type CameraView = 'iso' | 'front' | 'top' | 'right';
export interface SceneProps {
  project: ProjectFile; selectedId: string | null; onSelect: (id: string | null) => void;
  tool: 'translate' | 'rotate'; space: 'world' | 'local'; snap: boolean;
  onTransform: (id: string, position: Tuple, rotation: Tuple) => void;
  cameraCommand: { view: CameraView; revision: number };
}
class SceneBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    return this.state.error ? <div className="scene-error" role="alert">Не удалось запустить WebGL. Включите аппаратное ускорение или обновите браузер. Проект доступен через список деталей и инспектор.</div> : this.props.children;
  }
}
function Part({ part, props, childrenOf, onDragging }: { part: ComponentInstance; props: SceneProps; childrenOf: Map<string | null, ComponentInstance[]>; onDragging: (dragging: boolean) => void }) {
  const [group, setGroup] = useState<Group | null>(null);
  const [controlRevision, setControlRevision] = useState(0);
  const { gl, invalidate } = useThree();
  const definition = getDefinition(part.definitionId);
  const selected = props.selectedId === part.id;
  useEffect(() => {
    if (!selected || !group) return;
    const cancel = () => {
      group.position.fromArray(part.position); group.rotation.set(...part.rotation);
      setControlRevision(value => value + 1); onDragging(false); invalidate();
    };
    gl.domElement.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      gl.domElement.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel); onDragging(false);
    };
  }, [selected, group, part.position, part.rotation, gl, onDragging, invalidate]);
  const jointRotation: Tuple = [0, 0, 0];
  if (definition.joint) jointRotation[{ x: 0, y: 1, z: 2 }[definition.joint.axis]] = part.parameters.angle;
  return <>
    <group ref={setGroup} position={part.position} rotation={part.rotation}>
      <group rotation={jointRotation}>
        <group userData={{ partVisual: true }} scale={part.dimensions} onClick={event => { event.stopPropagation(); if (event.delta <= 4) props.onSelect(part.id); }}>
          <PartGeometry kind={definition.geometry} color={definition.color} />
          {selected && <mesh raycast={() => undefined}><boxGeometry args={[1.06, 1.06, 1.06]} /><meshBasicMaterial color="#7de4ee" wireframe transparent opacity={.85} depthTest={false} /></mesh>}
        </group>
        {(childrenOf.get(part.id) ?? []).map(child => <Part key={child.id} part={child} props={props} childrenOf={childrenOf} onDragging={onDragging} />)}
      </group>
    </group>
    {selected && group && <TransformGizmo revision={controlRevision} object={group} mode={props.tool} space={props.space} snap={props.snap}
      onStart={() => onDragging(true)}
      onEnd={() => {
        onDragging(false);
        const position = group.position.toArray().map(n => Math.max(-10, Math.min(10, n))) as Tuple;
        const rotation = [group.rotation.x, group.rotation.y, group.rotation.z].map(n => Math.atan2(Math.sin(n), Math.cos(n))) as Tuple;
        group.position.fromArray(position); group.rotation.set(...rotation);
        props.onTransform(part.id, position, rotation);
      }} />}
  </>;
}
function World(props: SceneProps) {
  const root = useRef<Group>(null);
  const controls = useRef<OrbitControlsImpl>(null);
  const [dragging, setDragging] = useState(false);
  const { camera, gl, invalidate } = useThree();
  const childrenOf = new Map<string | null, ComponentInstance[]>();
  props.project.components.forEach(part => childrenOf.set(part.parentId, [...(childrenOf.get(part.parentId) ?? []), part]));
  useEffect(() => {
    if (!root.current || !controls.current) return;
    root.current.updateWorldMatrix(true, true);
    const bounds = new Box3();
    root.current.traverse(object => { if (object.userData.partVisual) bounds.expandByObject(object); });
    const center = bounds.isEmpty() ? new Vector3(0, .05, 0) : bounds.getCenter(new Vector3());
    const radius = bounds.isEmpty() ? .2 : Math.max(.12, bounds.getSize(new Vector3()).length() / 2);
    const distance = radius * 1.25 / Math.sin(Math.atan(Math.tan(Math.PI / 8) * Math.min(1, gl.domElement.clientWidth / gl.domElement.clientHeight))); 
    const directions = { iso: [1, .8, 1], front: [0, 0, 1], top: [0, 1, .0001], right: [1, 0, 0] };
    const direction = new Vector3(...directions[props.cameraCommand.view]).normalize();
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.near = .001; camera.far = 100; camera.updateProjectionMatrix();
    controls.current.target.copy(center); controls.current.update(); invalidate();
  // Camera moves only on an explicit command or project switch.
  }, [props.cameraCommand, props.project.id, camera, invalidate]);
  useEffect(() => {
    const end = () => setDragging(false);
    gl.domElement.addEventListener('pointercancel', end);
    window.addEventListener('pointerup', end);
    return () => { gl.domElement.removeEventListener('pointercancel', end); window.removeEventListener('pointerup', end); };
  }, [gl]);
  return <>
    <color attach="background" args={['#101e2b']} />
    <ambientLight intensity={1.1} /><hemisphereLight args={['#e5f6ff', '#344655', 1.5]} />
    <directionalLight position={[1, 2, 1]} intensity={2.5} />
    <Grid args={[2, 2]} cellSize={.01} sectionSize={.1} cellColor="#273e4d" sectionColor="#466779" fadeDistance={3} infiniteGrid position={[0, -.001, 0]} />
    <axesHelper args={[.12]} />
    <group ref={root}>{(childrenOf.get(null) ?? []).map(part => <Part key={part.id} part={part} props={props} childrenOf={childrenOf} onDragging={setDragging} />)}</group>
    <OrbitControls ref={controls} makeDefault enabled={!dragging} minDistance={.03} maxDistance={20} enableDamping dampingFactor={.12} />
  </>;
}
export default function Scene(props: SceneProps) {
  return <SceneBoundary><Canvas camera={{ position: [.4, .35, .4], fov: 45, near: .001, far: 100 }} dpr={[1, 1.75]} frameloop="demand"
    onPointerMissed={event => { if (event.type === 'click') props.onSelect(null); }}
    gl={{ antialias: true, powerPreference: 'high-performance' }}
    onCreated={({ gl }) => { gl.domElement.setAttribute('aria-label', 'Интерактивная 3D-сцена'); }}>
    <World {...props} />
  </Canvas></SceneBoundary>;
}

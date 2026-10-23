import { useLayoutEffect, useMemo, useRef } from 'react';
import { CanvasTexture, InstancedMesh, Matrix4 } from 'three';
import type { GeometryKind } from '../../domain/types';

function Box({
  at = [0, 0, 0],
  size = [1, 1, 1],
  color,
}: {
  at?: [number, number, number];
  size?: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={at} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.22} />
    </mesh>
  );
}
function Cylinder({
  color,
  radius = 0.5,
  height = 1,
}: {
  color: string;
  radius?: number;
  height?: number;
}) {
  return (
    <mesh castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, height, 32]} />
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.25} />
    </mesh>
  );
}
const labelTextures = new Map<string, CanvasTexture>();
function Label({ text, at }: { text: string; at: [number, number, number] }) {
  const texture = useMemo(() => {
    if (labelTextures.has(text)) return labelTextures.get(text)!;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#e1f3ed';
    context.font = 'bold 58px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 256, 64);
    const map = new CanvasTexture(canvas);
    labelTextures.set(text, map);
    return map;
  }, [text]);
  return (
    <mesh position={at} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.65, 0.16]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}
function PinRow({
  x,
  y,
  z,
  count,
  length,
  color = '#c4cbd0',
}: {
  x: number;
  y: number;
  z: number;
  count: number;
  length: number;
  color?: string;
}) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    for (let i = 0; i < count; i++)
      mesh.current!.setMatrixAt(
        i,
        new Matrix4().makeTranslation(x, y, z - length / 2 + (i * length) / Math.max(1, count - 1)),
      );
    mesh.current!.instanceMatrix.needsUpdate = true;
  }, [x, y, z, count, length]);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <boxGeometry args={[0.035, 0.04, 0.02]} />
      <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
    </instancedMesh>
  );
}
/** All models fit a unit bounding box. Dimensions come from the catalog/instance. */
export function PartGeometry({ kind, color }: { kind: GeometryKind; color: string }) {
  switch (kind) {
    case 'wheel':
      return (
        <group rotation={[0, 0, Math.PI / 2]}>
          <Cylinder color="#222c37" height={1} />
          <Cylinder color={color} height={1.02} radius={0.33} />
          <Cylinder color="#8395a7" height={1.04} radius={0.09} />
        </group>
      );
    case 'motor':
      return (
        <>
          <group rotation={[0, 0, Math.PI / 2]}>
            <Cylinder color="#dfd6bc" height={1} radius={0.12} />
          </group>
          <Box size={[0.7, 0.8, 0.65]} at={[0, 0, 0.175]} color={color} />
          <Box size={[0.75, 1, 0.35]} at={[0, 0, -0.325]} color="#9aa6af" />
          <Box size={[0.5, 0.2, 0.08]} at={[0, 0.25, -0.46]} color="#303941" />
          <Box size={[0.55, 0.08, 0.06]} at={[0, 0.4, -0.46]} color="#c4ac73" />
        </>
      );
    case 'caster':
      return (
        <>
          <Box size={[1, 0.14, 1]} at={[0, 0.43, 0]} color={color} />
          <mesh position={[0, -0.12, 0]} castShadow>
            <sphereGeometry args={[0.38, 20, 16]} />
            <meshStandardMaterial color="#bac7ce" metalness={0.8} roughness={0.2} />
          </mesh>
        </>
      );
    case 'uno':
      return (
        <>
          <Label text="UNO R3" at={[0, -0.371, 0.35]} />
          {[-1, 1].map((side) => (
            <group key={side}>
              <PinRow x={side * 0.42} y={-0.04} z={0.04} count={14} length={0.68} color="#d7b777" />
              <PinRow x={side * 0.13} y={-0.23} z={0.09} count={14} length={0.52} />
            </group>
          ))}
          <Box size={[1, 0.12, 1]} at={[0, -0.44, 0]} color={color} />
          <Box size={[0.33, 0.6, 0.22]} at={[-0.3, -0.08, -0.37]} color="#b0bac3" />
          <Box size={[0.18, 0.3, 0.6]} at={[0, -0.2, 0.09]} color="#1c2630" />
          {[-1, 1].map((side) => (
            <Box
              key={side}
              size={[0.12, 0.33, 0.78]}
              at={[side * 0.42, -0.22, 0.04]}
              color="#202733"
            />
          ))}
          <Box size={[0.23, 1, 0.2]} at={[0.29, 0, -0.36]} color="#27323e" />
          <Box size={[0.09, 0.12, 0.09]} at={[-0.28, -0.3, 0.25]} color="#ddd6bc" />
          <Box size={[0.09, 0.05, 0.08]} at={[-0.28, -0.22, 0.25]} color="#be524d" />
        </>
      );
    case 'driver':
      return (
        <>
          <Box size={[1, 0.1, 1]} at={[0, -0.45, 0]} color={color} />
          {[-0.32, -0.19, -0.06, 0.07, 0.2, 0.33].map((x) => (
            <Box key={x} size={[0.08, 0.9, 0.53]} at={[x, 0.05, -0.03]} color="#26303a" />
          ))}
          {[-1, 1].map((side) => (
            <Box key={side} size={[0.85, 0.25, 0.18]} at={[0, -0.28, side * 0.4]} color="#4b9bc2" />
          ))}
          <Label text="L298N" at={[0, -0.38, 0.28]} />
          {[-1, 1].map((side) => (
            <PinRow key={side} x={side * 0.4} y={-0.28} z={0} count={4} length={0.5} />
          ))}
        </>
      );
    case 'base':
      return <Cylinder color={color} />;
    case 'joint':
      return (
        <group rotation={[0, 0, Math.PI / 2]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.5, 0.5, 1, 24]} />
            <meshStandardMaterial color={color} metalness={0.5} roughness={0.3} />
          </mesh>
          <Cylinder color="#e7d7a4" height={1.02} radius={0.17} />
        </group>
      );
    case 'servo':
      return (
        <>
          <Box size={[0.8, 0.76, 0.85]} at={[0, -0.12, 0]} color={color} />
          <Box size={[1, 0.1, 1]} at={[0, 0.15, 0]} color={color} />
          <group position={[0, 0.31, 0]}>
            <Cylinder color="#d9e2e9" radius={0.24} height={0.16} />
          </group>
          <Box size={[0.18, 0.12, 0.94]} at={[0, 0.44, 0]} color="#e2e6e9" />
          <Box size={[0.78, 0.12, 0.17]} at={[0, 0.44, 0]} color="#e2e6e9" />
        </>
      );
    case 'link':
      return (
        <>
          <Box size={[1, 1, 0.25]} at={[0, 0, -0.375]} color={color} />
          <Box size={[1, 1, 0.25]} at={[0, 0, 0.375]} color={color} />
          {[-0.4, 0.4].map((y) => (
            <Box key={y} size={[1, 0.12, 1]} at={[0, y, 0]} color="#9fb9c6" />
          ))}
        </>
      );
    case 'gripper':
      return (
        <>
          <Box size={[1, 0.24, 1]} at={[0, -0.38, 0]} color={color} />
          {[-1, 1].map((side) => (
            <group key={side}>
              <Box size={[0.15, 0.76, 0.6]} at={[side * 0.42, 0.12, 0]} color={color} />
              <Box size={[0.28, 0.14, 0.6]} at={[side * 0.25, 0.43, 0]} color="#3c4857" />
            </group>
          ))}
        </>
      );
    default:
      return <Box color={color} />;
  }
}

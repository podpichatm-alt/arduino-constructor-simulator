import type { GeometryKind } from '../../domain/types';

function Box({ at = [0, 0, 0], size = [1, 1, 1], color }: { at?: [number, number, number]; size?: [number, number, number]; color: string }) {
  return <mesh position={at} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={.55} metalness={.22} /></mesh>;
}
function Cylinder({ color, radius = .5, height = 1 }: { color: string; radius?: number; height?: number }) {
  return <mesh castShadow receiveShadow><cylinderGeometry args={[radius, radius, height, 32]} /><meshStandardMaterial color={color} roughness={.55} metalness={.25} /></mesh>;
}
/** All models fit a unit bounding box. Dimensions come from the catalog/instance. */
export function PartGeometry({ kind, color }: { kind: GeometryKind; color: string }) {
  switch (kind) {
    case 'wheel': return <group rotation={[0, 0, Math.PI / 2]}><Cylinder color="#222c37" height={1} /><Cylinder color={color} height={1.02} radius={.33} /><Cylinder color="#8395a7" height={1.04} radius={.09} /></group>;
    case 'motor': return <><Box size={[1, .8, .65]} at={[0, 0, .175]} color={color} /><Box size={[.75, 1, .35]} at={[0, 0, -.325]} color="#9aa6af" /></>;
    case 'caster': return <><Box size={[1, .14, 1]} at={[0, .43, 0]} color={color} /><mesh position={[0, -.12, 0]} castShadow><sphereGeometry args={[.38, 20, 16]} /><meshStandardMaterial color="#bac7ce" metalness={.8} roughness={.2} /></mesh></>;
    case 'uno': return <><Box size={[1, .12, 1]} at={[0, -.44, 0]} color={color} /><Box size={[.33, .6, .22]} at={[-.3, -.08, -.37]} color="#b0bac3" /><Box size={[.18, .3, .6]} at={[0, -.2, .09]} color="#1c2630" />{[-1, 1].map(side => <Box key={side} size={[.12, .33, .78]} at={[side * .42, -.22, .04]} color="#202733" />)}<Box size={[.23, 1, .2]} at={[.29, 0, -.36]} color="#27323e" /></>;
    case 'driver': return <><Box size={[1, .1, 1]} at={[0, -.45, 0]} color={color} />{[-.3, 0, .3].map(x => <Box key={x} size={[.08, .9, .53]} at={[x, .05, -.03]} color="#26303a" />)}{[-1, 1].map(side => <Box key={side} size={[.85, .25, .18]} at={[0, -.28, side * .4]} color="#4b9bc2" />)}</>;
    case 'base': return <Cylinder color={color} />;
    case 'joint': return <group rotation={[0, 0, Math.PI / 2]}><mesh castShadow><cylinderGeometry args={[.5, .5, 1, 24]} /><meshStandardMaterial color={color} metalness={.5} roughness={.3} /></mesh><Cylinder color="#e7d7a4" height={1.02} radius={.17} /></group>;
    case 'servo': return <><Box size={[1, .82, 1]} at={[0, -.09, 0]} color={color} /><Box size={[.25, .18, .9]} at={[0, .41, 0]} color="#d9e2e9" /></>;
    case 'link': return <><Box size={[1, 1, .25]} at={[0, 0, -.375]} color={color} /><Box size={[1, 1, .25]} at={[0, 0, .375]} color={color} />{[-.4, .4].map(y => <Box key={y} size={[1, .12, 1]} at={[0, y, 0]} color="#9fb9c6" />)}</>;
    case 'gripper': return <><Box size={[1, .24, 1]} at={[0, -.38, 0]} color={color} />{[-1, 1].map(side => <group key={side}><Box size={[.15, .76, .6]} at={[side * .42, .12, 0]} color={color} /><Box size={[.28, .14, .6]} at={[side * .25, .43, 0]} color="#3c4857" /></group>)}</>;
    default: return <Box color={color} />;
  }
}

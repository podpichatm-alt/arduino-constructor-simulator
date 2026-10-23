import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { TransformControls, type OrbitControls } from 'three-stdlib';
import type { EventDispatcher, Group } from 'three';

interface Props {
  object: Group; mode: 'translate' | 'rotate'; space: 'world' | 'local'; snap: boolean;
  revision: number; onStart: () => void; onEnd: () => void;
}
/** Own the control lifecycle: selection and cancelled gestures must release DOM listeners and GPU resources. */
export function TransformGizmo({ object, mode, space, snap, revision, onStart, onEnd }: Props) {
  const { camera, gl, invalidate } = useThree();
  const orbit = useThree(state => state.controls) as OrbitControls | null;
  const [control, setControl] = useState<TransformControls | null>(null);
  const callbacks = useRef({ onStart, onEnd });
  useLayoutEffect(() => { callbacks.current = { onStart, onEnd }; }, [onStart, onEnd]);
  useEffect(() => {
    // Construct in an effect so React StrictMode cannot leave abandoned controls connected.
    const instance = new TransformControls(camera, undefined);
    instance.connect(gl.domElement);
    instance.attach(object);
    const start = () => { if (orbit) orbit.enabled = false; callbacks.current.onStart(); };
    const end = () => { if (orbit) orbit.enabled = true; callbacks.current.onEnd(); };
    // three-stdlib emits these events, but its inherited Object3D type omits them.
    const events = instance as unknown as EventDispatcher<{ change: object; mouseDown: object; mouseUp: object }>;
    const change = () => invalidate();
    events.addEventListener('change', change);
    events.addEventListener('mouseDown', start);
    events.addEventListener('mouseUp', end);
    setControl(instance);
    invalidate();
    return () => {
      events.removeEventListener('change', change);
      events.removeEventListener('mouseDown', start);
      events.removeEventListener('mouseUp', end);
      instance.detach();
      instance.dispose();
      if (orbit) orbit.enabled = true;
    };
  }, [camera, gl, object, orbit, revision, invalidate]);
  useLayoutEffect(() => {
    if (!control) return;
    control.setMode(mode); control.setSpace(space); control.setSize(.8);
    control.setTranslationSnap(snap ? .005 : 0);
    control.setRotationSnap(snap ? Math.PI / 12 : 0);
    invalidate();
  }, [control, mode, space, snap, invalidate]);
  return control ? <primitive object={control} /> : null;
}

// Browser part of the press walkthrough: the component conv3d generated
// (aliased as "generated-model" by press-walkthrough.mjs) rendered as-is in a
// react-three-fiber canvas. The script steps frames with window.__frame(t).

import "./_press-r3f-setup.js";
import { ContactShadows } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
// @ts-expect-error resolved by the esbuild alias in press-walkthrough.mjs
import { Model } from "generated-model";
import { Suspense, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Box3,
  type Group,
  MathUtils,
  type PerspectiveCamera,
  PMREMGenerator,
  Vector3,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

declare global {
  interface Window {
    __frame?: (t: number) => void;
    __ready?: boolean;
  }
}

function Stage() {
  const turntable = useRef<Group>(null);
  const model = useRef<Group>(null);
  const { gl, scene, camera, advance } = useThree();

  useEffect(() => {
    scene.environment = new PMREMGenerator(gl).fromScene(new RoomEnvironment(), 0.04).texture;
    // Skinned vertices only have positions after one render, so render once,
    // then stand the model on the origin and frame it.
    advance(0);
    const box = new Box3().setFromObject(model.current as Group, true);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    model.current?.position.set(-center.x, -box.min.y, -center.z);
    const cam = camera as PerspectiveCamera;
    const dist = (size.y * 0.64) / Math.tan(MathUtils.degToRad(cam.fov / 2));
    cam.position.set(0, size.y * 0.7, dist);
    cam.lookAt(0, size.y * 0.5, 0);
    // t runs 0..1 over the clip: a little under one full turn.
    window.__frame = (t) => {
      if (turntable.current) turntable.current.rotation.y = -0.6 + t * Math.PI * 1.6;
      advance(t * 1000);
    };
    window.__ready = true;
  }, [gl, scene, camera, advance]);

  return (
    <>
      <directionalLight position={[2, 4, 3]} intensity={1.5} />
      <group ref={turntable}>
        <group ref={model}>
          <Model />
        </group>
      </group>
      <ContactShadows position={[0, 0, 0]} scale={4} blur={2.4} opacity={0.55} far={2} />
    </>
  );
}

function App() {
  return (
    <Canvas
      frameloop="never"
      dpr={1}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      camera={{ fov: 30 }}
    >
      <color attach="background" args={["#1e1e2e"]} />
      <Suspense fallback={null}>
        <Stage />
      </Suspense>
    </Canvas>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);

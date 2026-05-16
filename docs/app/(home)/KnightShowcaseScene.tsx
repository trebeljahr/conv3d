"use client";

import { Center, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useMemo } from "react";
import { Box3, Vector3 } from "three";

const MODEL_URL = "/models/conv3d-funnel/KnightHelmet.glb";
const TARGET_SIZE = 1.6;

function KnightModel() {
  const { scene } = useGLTF(MODEL_URL);
  // Normalize: source models from conv3d are real-world scale (a few mm across).
  // Scale to a uniform target size so the camera framing is stable across models.
  const scale = useMemo(() => {
    const box = new Box3().setFromObject(scene);
    const size = new Vector3();
    box.getSize(size);
    const max = Math.max(size.x, size.y, size.z) || 1;
    return TARGET_SIZE / max;
  }, [scene]);

  return <primitive object={scene} scale={scale} />;
}

useGLTF.preload(MODEL_URL);

export function KnightShowcaseScene() {
  // R3F's Canvas measures its parent via ResizeObserver. When mounted inside a
  // dynamic() lazy boundary, the initial measurement sometimes lands at the
  // canvas's intrinsic 300x150 default and never updates because the parent's
  // size never changes again. Fire a synthetic resize after mount so the GL
  // drawing buffer matches the CSS-sized parent.
  useEffect(() => {
    const t = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [1.8, 1.2, 2.4], fov: 38 }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#eaf6f2", "#1a1410", 0.65]} />
      <directionalLight position={[4, 6, 4]} intensity={1.55} />
      <directionalLight position={[-3, 2, -2]} intensity={0.45} />
      <Suspense fallback={null}>
        <Center>
          <KnightModel />
        </Center>
      </Suspense>
      <OrbitControls
        makeDefault
        autoRotate
        autoRotateSpeed={1.4}
        enableZoom={false}
        enablePan={false}
        minPolarAngle={Math.PI / 3.5}
        maxPolarAngle={Math.PI / 1.8}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}

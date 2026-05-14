"use client";

import { useEffect, useRef } from "react";
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  DoubleSide,
  FrontSide,
  Group,
  HemisphereLight,
  MathUtils,
  type Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  TorusGeometry,
  type Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import styles from "./page.module.css";

type ModelAsset = {
  file: string;
  start: [number, number, number];
  end: [number, number, number];
  finalRotation: [number, number, number];
  phase: number;
  scale: number;
};

type FunnelItem = {
  group: Group;
  start: Vector3;
  end: Vector3;
  phase: number;
  scale: number;
  speed: number;
  finalRotation: Vector3;
  materials: MaterialShape[];
  baseOpacity: number[];
};

type MaterialShape = Material & {
  alphaMap?: Texture | null;
  alphaTest?: number;
  color?: Color;
  isMeshPhysicalMaterial?: boolean;
  isMeshStandardMaterial?: boolean;
  map?: Texture | null;
  metalness?: number;
  opacity?: number;
  roughness?: number;
  transparent?: boolean;
  vertexColors?: boolean;
};

const MODEL_ROOT = "/models/conv3d-funnel/";
const STREAM_CENTER = new Vector3(3.55, 0.62, 0);
const GATE = new Vector3(3.55, 0.06, 0);

// Same optimized GLBs, now staged as a vertical "mess in, grid out" compression loop.
const MODEL_ASSETS: ModelAsset[] = [
  {
    file: "AnimatedChest.glb",
    start: [1.6, 3.35, -1.25],
    end: [2.68, -1.1, -0.38],
    finalRotation: [0.08, -0.35, 0],
    phase: 0.79,
    scale: 1.16,
  },
  {
    file: "Burger.glb",
    start: [4.8, 3.76, 1.05],
    end: [3.55, -1.1, -0.38],
    finalRotation: [0.18, 0.4, -0.08],
    phase: 0.44,
    scale: 1.18,
  },
  {
    file: "ChairCushioned.glb",
    start: [2.4, 4.05, 0.85],
    end: [4.42, -1.1, -0.38],
    finalRotation: [0.12, -0.78, 0.03],
    phase: 0.31,
    scale: 1.04,
  },
  {
    file: "Hotdog.glb",
    start: [5.7, 3.18, -0.72],
    end: [2.68, -1.58, 0],
    finalRotation: [-0.08, 0.2, 0.18],
    phase: 0.56,
    scale: 1.1,
  },
  {
    file: "KnightHelmet.glb",
    start: [3.45, 4.25, -1.08],
    end: [3.55, -1.58, 0],
    finalRotation: [0.16, 0.72, -0.08],
    phase: 0.9,
    scale: 1.12,
  },
  {
    file: "Lamp.glb",
    start: [6.1, 3.52, 0.36],
    end: [4.42, -1.58, 0],
    finalRotation: [0.04, -0.52, 0.12],
    phase: 0.18,
    scale: 1.08,
  },
  {
    file: "Milkshake.glb",
    start: [1.95, 3.78, 0.34],
    end: [2.68, -2.06, 0.38],
    finalRotation: [0.12, -0.12, -0.04],
    phase: 0.67,
    scale: 1.14,
  },
  {
    file: "Plant.glb",
    start: [4.2, 3.48, -1.48],
    end: [3.55, -2.06, 0.38],
    finalRotation: [0.06, 0.48, 0.08],
    phase: 0.68,
    scale: 1.16,
  },
  {
    file: "Sofa.glb",
    start: [5.35, 4.08, 1.42],
    end: [4.42, -2.06, 0.38],
    finalRotation: [0.02, -0.18, -0.06],
    phase: 0.04,
    scale: 1.12,
  },
];

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function modelFade(progress: number): number {
  return smoothstep(0.02, 0.1, progress) * (1 - smoothstep(0.92, 0.995, progress));
}

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

function materialSide(src: MaterialShape) {
  return src.transparent || src.alphaMap || (src.alphaTest ?? 0) > 0 ? DoubleSide : FrontSide;
}

function liftMaterial(src: Material): Material {
  const material = src as MaterialShape;

  if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
    material.side = materialSide(material);
    if (typeof material.roughness === "number") material.roughness = Math.max(material.roughness, 0.58);
    if (typeof material.metalness === "number") material.metalness = Math.min(material.metalness, 0.45);
    material.needsUpdate = true;
    return material;
  }

  return new MeshStandardMaterial({
    name: material.name,
    color: material.color?.clone() ?? new Color("#d7e1db"),
    map: material.map ?? null,
    transparent: Boolean(material.transparent),
    opacity: typeof material.opacity === "number" ? material.opacity : 1,
    side: materialSide(material),
    vertexColors: Boolean(material.vertexColors),
    alphaMap: material.alphaMap ?? null,
    alphaTest: material.alphaTest ?? 0,
    metalness: 0.1,
    roughness: 0.72,
  });
}

function normalizeModel(scene: Group, targetSize: number): Group {
  const wrapper = new Group();
  const clone = scene.clone(true);
  const materialCache = new Map<Material, Material>();

  clone.traverse((object) => {
    if (!isMesh(object)) return;

    const applyMaterial = (material: Material) => {
      const cached = materialCache.get(material);
      if (cached) return cached;
      const lifted = liftMaterial(material);
      materialCache.set(material, lifted);
      return lifted;
    };

    object.material = Array.isArray(object.material)
      ? object.material.map(applyMaterial)
      : applyMaterial(object.material);
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = false;
  });

  clone.updateMatrixWorld(true);
  const box = new Box3().setFromObject(clone);
  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxAxis = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / maxAxis;
  clone.scale.setScalar(scale);
  clone.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  wrapper.add(clone);

  return wrapper;
}

function collectFadeMaterials(root: Group) {
  const materials: MaterialShape[] = [];
  const baseOpacity: number[] = [];
  const seen = new Set<Material>();

  root.traverse((object) => {
    if (!isMesh(object)) return;

    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const source of meshMaterials) {
      if (seen.has(source)) continue;
      seen.add(source);

      const material = source as MaterialShape;
      materials.push(material);
      baseOpacity.push(typeof material.opacity === "number" ? material.opacity : 1);
      material.transparent = true;
      material.opacity = 0;
      material.depthWrite = false;
      material.needsUpdate = true;
    }
  });

  return { materials, baseOpacity };
}

function setMaterialsOpacity(materials: MaterialShape[], baseOpacity: number[], opacity: number) {
  materials.forEach((material, index) => {
    material.opacity = baseOpacity[index] * opacity;
  });
}

function setModelOpacity(item: FunnelItem, opacity: number) {
  item.group.visible = opacity > 0.015;
  setMaterialsOpacity(item.materials, item.baseOpacity, opacity);
}

function createProcessor() {
  const group = new Group();
  const rings: Mesh[] = [];
  const pads: Mesh[] = [];
  const ringMaterial = new MeshStandardMaterial({
    color: "#73f7df",
    emissive: "#0b4f4a",
    emissiveIntensity: 0.28,
    metalness: 0.25,
    roughness: 0.34,
    transparent: true,
    opacity: 0.42,
  });
  const amberMaterial = new MeshStandardMaterial({
    color: "#ffb25f",
    emissive: "#5f3209",
    emissiveIntensity: 0.22,
    metalness: 0.16,
    roughness: 0.45,
    transparent: true,
    opacity: 0.38,
  });

  for (let i = 0; i < 7; i += 1) {
    const progress = i / 6;
    const radius = MathUtils.lerp(1.48, 0.42, progress);
    const tube = MathUtils.lerp(0.024, 0.012, progress);
    const ring = new Mesh(new TorusGeometry(radius, tube, 10, 96), i < 3 ? amberMaterial.clone() : ringMaterial.clone());
    ring.rotation.x = Math.PI / 2;
    ring.position.x = STREAM_CENTER.x + Math.sin(i * 0.9) * 0.06;
    ring.position.y = MathUtils.lerp(1.72, -0.02, progress);
    ring.position.z = STREAM_CENTER.z + Math.cos(i * 0.75) * 0.06;
    group.add(ring);
    rings.push(ring);
  }

  const padMaterial = new MeshStandardMaterial({
    color: "#e5fff9",
    emissive: "#183f3b",
    emissiveIntensity: 0.12,
    metalness: 0.1,
    roughness: 0.76,
    transparent: true,
    opacity: 0.28,
  });

  for (const asset of MODEL_ASSETS) {
    const pad = new Mesh(new TorusGeometry(0.28, 0.008, 8, 48), padMaterial.clone());
    pad.rotation.x = Math.PI / 2;
    pad.position.set(asset.end[0], asset.end[1] - 0.28, asset.end[2]);
    group.add(pad);
    pads.push(pad);
  }

  return { group, rings, pads };
}

function updateItem(item: FunnelItem, time: number) {
  const u = (time * item.speed + item.phase) % 1;
  const dropLimit = 0.5;
  const settleLimit = 0.78;
  const chaosSeed = item.phase * 97;
  let stageScale: number;
  let rotationBlend = 0;

  if (u < dropLimit) {
    const dropProgress = u / dropLimit;
    const p = easeInOut(dropProgress);
    const startX = item.start.x - GATE.x;
    const startZ = item.start.z - GATE.z;
    const startRadius = Math.max(Math.hypot(startX, startZ), 0.72);
    const startAngle = Math.atan2(startZ, startX);
    const angularProgress = (dropProgress * 0.65 + dropProgress * dropProgress * 1.9) * Math.PI * 2;
    const angle = startAngle + angularProgress;
    const radius = MathUtils.lerp(startRadius, 0.16, p);
    const drift = (1 - p) * 0.14;

    item.group.position.set(
      GATE.x + Math.cos(angle) * radius + Math.sin(angle * 1.4 + chaosSeed) * drift,
      MathUtils.lerp(item.start.y, GATE.y, p) + Math.cos(angle * 0.72 + chaosSeed) * drift * 0.35,
      GATE.z + Math.sin(angle) * radius + Math.cos(angle * 1.3 + chaosSeed) * drift,
    );
    stageScale = MathUtils.lerp(2.24, 0.42, p);
    rotationBlend = smoothstep(0.41, dropLimit, u);
    item.group.rotation.set(
      MathUtils.lerp(Math.sin(angle * 0.34 + chaosSeed) * 0.16, item.finalRotation.x, rotationBlend),
      MathUtils.lerp(angle + Math.PI * 0.5, item.finalRotation.y, rotationBlend),
      MathUtils.lerp(Math.cos(angle * 0.38 + chaosSeed) * 0.14, item.finalRotation.z, rotationBlend),
    );
  } else if (u < settleLimit) {
    const p = easeOut((u - dropLimit) / (settleLimit - dropLimit));
    item.group.position.set(
      MathUtils.lerp(GATE.x, item.end.x, p),
      MathUtils.lerp(GATE.y, item.end.y, p),
      MathUtils.lerp(GATE.z, item.end.z, p),
    );
    stageScale = MathUtils.lerp(0.42, 0.34, p);
    rotationBlend = 1;
  } else {
    item.group.position.copy(item.end);
    stageScale = 0.34;
    rotationBlend = 1;
  }

  item.group.scale.setScalar(item.scale * stageScale);
  if (rotationBlend === 1) item.group.rotation.set(item.finalRotation.x, item.finalRotation.y, item.finalRotation.z);
  setModelOpacity(item, modelFade(u));
}

function disposeObject(object: Object3D) {
  object.traverse((child) => {
    if (!isMesh(child)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) material.dispose();
  });
}

export function HeroFunnelScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;
    const canvas: HTMLCanvasElement = canvasElement;

    let disposed = false;
    let frame = 0;
    const mobileSceneQuery = window.matchMedia("(max-width: 720px)");
    if (mobileSceneQuery.matches) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = new Scene();
    const camera = new PerspectiveCamera(42, 1, 0.1, 80);
    const renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = true;

    const modelRoot = new Group();
    scene.add(modelRoot);

    const processor = createProcessor();
    scene.add(processor.group);

    const ambient = new AmbientLight("#d8fff8", 0.88);
    const hemi = new HemisphereLight("#ccfff6", "#1a1610", 1.28);
    const key = new DirectionalLight("#ffffff", 2.85);
    key.position.set(3.4, 5.9, 5.2);
    key.castShadow = true;
    scene.add(ambient, hemi, key);

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("/draco/");
    dracoLoader.setDecoderConfig({ type: "wasm" });
    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);

    const items: FunnelItem[] = [];

    function resize() {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;

      const sceneOffsetX = 1.35;
      modelRoot.position.x = sceneOffsetX;
      processor.group.position.x = sceneOffsetX;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.set(0.75, 0.55, 8.4);
      camera.lookAt(2.85, 0.18, 0);
      camera.updateProjectionMatrix();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    async function loadModels() {
      await Promise.allSettled(
        MODEL_ASSETS.map(async (asset, index) => {
          const gltf = await gltfLoader.loadAsync(`${MODEL_ROOT}${asset.file}`);
          if (disposed) return;

          const group = normalizeModel(gltf.scene, 1);
          const fade = collectFadeMaterials(group);
          group.visible = false;
          setMaterialsOpacity(fade.materials, fade.baseOpacity, 0);
          modelRoot.add(group);
          items.push({
            group,
            start: new Vector3(...asset.start),
            end: new Vector3(...asset.end),
            phase: asset.phase,
            scale: asset.scale,
            speed: 0.082 + (index % 3) * 0.006,
            finalRotation: new Vector3(...asset.finalRotation),
            materials: fade.materials,
            baseOpacity: fade.baseOpacity,
          });
        }),
      );

      if (reduceMotion && !disposed) renderFrame(2400);
    }

    function renderFrame(now: number) {
      const time = now / 1000;
      processor.group.rotation.z = Math.sin(time * 0.35) * 0.02;

      processor.rings.forEach((ring, index) => {
        const pulse = 1 + Math.sin(time * 1.35 + index * 0.7) * 0.035;
        ring.scale.setScalar(pulse);
        ring.rotation.z = time * (index % 2 === 0 ? 0.12 : -0.1);
      });

      processor.pads.forEach((pad, index) => {
        pad.scale.setScalar(1 + Math.sin(time * 1.2 + index) * 0.025);
      });

      for (const item of items) updateItem(item, reduceMotion ? 2.4 : time);

      renderer.render(scene, camera);
    }

    function animate(now: number) {
      renderFrame(now);
      frame = window.requestAnimationFrame(animate);
    }

    void loadModels();
    if (reduceMotion) renderFrame(2400);
    else frame = window.requestAnimationFrame(animate);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      dracoLoader.dispose();
      disposeObject(scene);
      renderer.dispose();
    };
  }, []);

  return (
    <div className={styles.heroScene} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.heroCanvas} />
    </div>
  );
}

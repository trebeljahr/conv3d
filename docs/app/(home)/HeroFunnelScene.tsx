"use client";

import { useEffect, useRef } from "react";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  DoubleSide,
  FrontSide,
  Group,
  HalfFloatType,
  HemisphereLight,
  type Material,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  type Texture,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
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

const FUNNEL_TOP_Y = 1.72;
const FUNNEL_BOTTOM_Y = -0.02;
const FUNNEL_TOP_RADIUS = 1.48;
const FUNNEL_BOTTOM_RADIUS = 0.42;
const FUNNEL_WALL_PADDING = 0.86;

const CYCLE_SECONDS = 7.5;
const DROP_DURATION = 0.24;
const DROP_WINDOW_END = 0.6;
const HOLD_END = 0.74;
const CLEAR_END = 1.0;
const MAX_DROP_START = DROP_WINDOW_END - DROP_DURATION;

function funnelMaxRadius(y: number): number {
  if (y >= FUNNEL_TOP_Y) return Number.POSITIVE_INFINITY;
  const t = MathUtils.clamp((FUNNEL_TOP_Y - y) / (FUNNEL_TOP_Y - FUNNEL_BOTTOM_Y), 0, 1);
  return MathUtils.lerp(FUNNEL_TOP_RADIUS, FUNNEL_BOTTOM_RADIUS, t) * FUNNEL_WALL_PADDING;
}

// Same optimized GLBs, now staged as a vertical "mess in, grid out" compression loop.
const MODEL_ASSETS: ModelAsset[] = [
  {
    file: "AnimatedChest.glb",
    start: [1.6, 3.35, -1.25],
    end: [2.68, -0.85, -0.45],
    finalRotation: [0.08, -0.35, 0],
    phase: 0.0,
    scale: 1.16,
  },
  {
    file: "Burger.glb",
    start: [4.8, 3.76, 1.05],
    end: [3.55, -0.85, -0.45],
    finalRotation: [0.18, 0.4, -0.08],
    phase: 0.09,
    scale: 1.18,
  },
  {
    file: "Cake.glb",
    start: [3.0, 4.18, 1.55],
    end: [4.42, -0.85, -0.45],
    finalRotation: [0.0, 0.12, 0.0],
    phase: 0.18,
    scale: 1.12,
  },
  {
    file: "ChairCushioned.glb",
    start: [2.4, 4.05, 0.85],
    end: [2.68, -1.32, -0.15],
    finalRotation: [0.12, -0.78, 0.03],
    phase: 0.27,
    scale: 1.04,
  },
  {
    file: "Donut.glb",
    start: [5.4, 3.6, -1.0],
    end: [3.55, -1.32, -0.15],
    finalRotation: [0.0, 0.25, 0.0],
    phase: 0.36,
    scale: 1.0,
  },
  {
    file: "Hotdog.glb",
    start: [5.7, 3.18, -0.72],
    end: [4.42, -1.32, -0.15],
    finalRotation: [-0.08, 0.2, 0.18],
    phase: 0.45,
    scale: 1.1,
  },
  {
    file: "KnightHelmet.glb",
    start: [3.45, 4.25, -1.08],
    end: [2.68, -1.79, 0.15],
    finalRotation: [0.16, 0.72, -0.08],
    phase: 0.55,
    scale: 1.12,
  },
  {
    file: "Lamp.glb",
    start: [6.1, 3.52, 0.36],
    end: [3.55, -1.79, 0.15],
    finalRotation: [0.04, -0.52, 0.12],
    phase: 0.64,
    scale: 1.08,
  },
  {
    file: "Milkshake.glb",
    start: [1.95, 3.78, 0.34],
    end: [4.42, -1.79, 0.15],
    finalRotation: [0.12, -0.12, -0.04],
    phase: 0.73,
    scale: 1.14,
  },
  {
    file: "Pizza.glb",
    start: [4.0, 4.18, 1.4],
    end: [2.68, -2.26, 0.45],
    finalRotation: [0.0, 0.45, 0.0],
    phase: 0.82,
    scale: 1.1,
  },
  {
    file: "Plant.glb",
    start: [4.2, 3.48, -1.48],
    end: [3.55, -2.26, 0.45],
    finalRotation: [0.06, 0.48, 0.08],
    phase: 0.91,
    scale: 1.16,
  },
  {
    file: "Sofa.glb",
    start: [5.35, 4.08, 1.42],
    end: [4.42, -2.26, 0.45],
    finalRotation: [0.02, -0.18, -0.06],
    phase: 1.0,
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
    if (typeof material.roughness === "number")
      material.roughness = Math.max(material.roughness, 0.58);
    if (typeof material.metalness === "number")
      material.metalness = Math.min(material.metalness, 0.45);
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
    color: "#86fce6",
    emissive: "#3bf0d4",
    emissiveIntensity: 1.8,
    metalness: 0.25,
    roughness: 0.32,
    transparent: true,
    opacity: 0.6,
  });
  const amberMaterial = new MeshStandardMaterial({
    color: "#ffc382",
    emissive: "#ff9134",
    emissiveIntensity: 1.5,
    metalness: 0.16,
    roughness: 0.42,
    transparent: true,
    opacity: 0.56,
  });

  for (let i = 0; i < 7; i += 1) {
    const progress = i / 6;
    const radius = MathUtils.lerp(FUNNEL_TOP_RADIUS, FUNNEL_BOTTOM_RADIUS, progress);
    const tube = MathUtils.lerp(0.028, 0.014, progress);
    const ring = new Mesh(
      new TorusGeometry(radius, tube, 32, 192),
      i < 3 ? amberMaterial.clone() : ringMaterial.clone(),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.x = STREAM_CENTER.x + Math.sin(i * 0.9) * 0.06;
    ring.position.y = MathUtils.lerp(FUNNEL_TOP_Y, FUNNEL_BOTTOM_Y, progress);
    ring.position.z = STREAM_CENTER.z + Math.cos(i * 0.75) * 0.06;
    group.add(ring);
    rings.push(ring);
  }

  const padMaterial = new MeshStandardMaterial({
    color: "#eafff9",
    emissive: "#39d8c0",
    emissiveIntensity: 0.85,
    metalness: 0.1,
    roughness: 0.7,
    transparent: true,
    opacity: 0.42,
  });

  for (const asset of MODEL_ASSETS) {
    const pad = new Mesh(new TorusGeometry(0.28, 0.01, 20, 96), padMaterial.clone());
    pad.rotation.x = Math.PI / 2;
    pad.position.set(asset.end[0], asset.end[1] - 0.28, asset.end[2]);
    group.add(pad);
    pads.push(pad);
  }

  return { group, rings, pads };
}

function clampInsideFunnel(position: Vector3) {
  if (position.y >= FUNNEL_TOP_Y) return;
  const dx = position.x - GATE.x;
  const dz = position.z - GATE.z;
  const radius = Math.hypot(dx, dz);
  const maxR = funnelMaxRadius(position.y);
  if (radius <= maxR || radius === 0) return;
  const scale = maxR / radius;
  position.x = GATE.x + dx * scale;
  position.z = GATE.z + dz * scale;
}

function dropSpiralPosition(item: FunnelItem, p: number, target: Vector3) {
  const chaosSeed = item.phase * 97;
  const startX = item.start.x - GATE.x;
  const startZ = item.start.z - GATE.z;
  const startRadius = Math.max(Math.hypot(startX, startZ), 0.72);
  const startAngle = Math.atan2(startZ, startX);
  const angularProgress = (p * p * 0.65 + p * p * p * 1.35) * Math.PI * 2;
  const angle = startAngle + angularProgress;
  const descentP = p ** 1.35;
  const desiredRadius = MathUtils.lerp(startRadius, 0.16, descentP);
  const yPos = MathUtils.lerp(item.start.y, GATE.y, descentP);
  const drift = (1 - descentP) * 0.09;
  const maxR = funnelMaxRadius(yPos);
  const radius = Math.min(desiredRadius, maxR);

  target.set(
    GATE.x + Math.cos(angle) * radius + Math.sin(angle * 1.4 + chaosSeed) * drift,
    yPos + Math.cos(angle * 0.72 + chaosSeed) * drift * 0.35,
    GATE.z + Math.sin(angle) * radius + Math.cos(angle * 1.3 + chaosSeed) * drift,
  );
  clampInsideFunnel(target);
  return angle;
}

function updateItem(item: FunnelItem, time: number) {
  const cycle = (((time / CYCLE_SECONDS) % 1) + 1) % 1;
  const dropStart = item.phase * MAX_DROP_START;
  const local = (cycle - dropStart) / DROP_DURATION;
  const chaosSeed = item.phase * 97;
  const cycleFadeOut = cycle > HOLD_END ? 1 - smoothstep(HOLD_END, CLEAR_END, cycle) : 1;

  if (local < 0) {
    item.group.position.copy(item.start);
    item.group.scale.setScalar(item.scale * 2.24);
    item.group.rotation.set(0, 0, 0);
    setModelOpacity(item, 0);
    return;
  }

  if (local <= 1) {
    const spiralEnd = 0.62;
    if (local <= spiralEnd) {
      const p = easeInOut(local / spiralEnd);
      const angle = dropSpiralPosition(item, p, item.group.position);
      const stageScale = MathUtils.lerp(2.24, 0.42, p);
      const rotationBlend = smoothstep(0.45, 1.0, p);
      const spinFalloff = 1 - smoothstep(0.55, 1.0, p);
      const spinAngle = angle * spinFalloff;
      item.group.rotation.set(
        MathUtils.lerp(
          Math.sin(spinAngle * 0.34 + chaosSeed) * 0.16,
          item.finalRotation.x,
          rotationBlend,
        ),
        MathUtils.lerp(spinAngle + Math.PI * 0.5, item.finalRotation.y, rotationBlend),
        MathUtils.lerp(
          Math.cos(spinAngle * 0.38 + chaosSeed) * 0.14,
          item.finalRotation.z,
          rotationBlend,
        ),
      );
      item.group.scale.setScalar(item.scale * stageScale);
    } else {
      const p = easeOut((local - spiralEnd) / (1 - spiralEnd));
      item.group.position.set(
        MathUtils.lerp(GATE.x, item.end.x, p),
        MathUtils.lerp(GATE.y, item.end.y, p),
        MathUtils.lerp(GATE.z, item.end.z, p),
      );
      const stageScale = MathUtils.lerp(0.42, 0.34, p);
      item.group.scale.setScalar(item.scale * stageScale);
      item.group.rotation.set(item.finalRotation.x, item.finalRotation.y, item.finalRotation.z);
    }
    const fadeIn = smoothstep(0, 0.14, local);
    setModelOpacity(item, fadeIn * cycleFadeOut);
    return;
  }

  item.group.position.copy(item.end);
  item.group.scale.setScalar(item.scale * 0.34);
  item.group.rotation.set(item.finalRotation.x, item.finalRotation.y, item.finalRotation.z);
  setModelOpacity(item, cycleFadeOut);
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
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
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

    const msaaTarget = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      samples: 4,
    });
    const composer = new EffectComposer(renderer, msaaTarget);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new Vector2(1, 1), 0.4, 0.85, 0.95);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());

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
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      bloomPass.setSize(width, height);
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
        MODEL_ASSETS.map(async (asset) => {
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
        const pulse = 1 + Math.sin(time * 1.35 + index * 0.7) * 0.04;
        ring.scale.setScalar(pulse);
        ring.rotation.z = time * (index % 2 === 0 ? 0.12 : -0.1);
        const material = ring.material as MeshStandardMaterial;
        material.emissiveIntensity = 1.5 + Math.sin(time * 1.8 + index * 0.5) * 0.4;
      });

      processor.pads.forEach((pad, index) => {
        pad.scale.setScalar(1 + Math.sin(time * 1.2 + index) * 0.035);
        const material = pad.material as MeshStandardMaterial;
        material.emissiveIntensity = 0.65 + Math.sin(time * 1.5 + index * 0.9) * 0.22;
      });

      for (const item of items) updateItem(item, reduceMotion ? 2.4 : time);

      composer.render();
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
      bloomPass.dispose();
      composer.dispose();
      msaaTarget.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className={styles.heroScene} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.heroCanvas} />
    </div>
  );
}

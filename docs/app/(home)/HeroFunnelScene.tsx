"use client";

import { useEffect, useRef } from "react";
import {
  AmbientLight,
  Box3,
  BoxGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  FrontSide,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  MathUtils,
  type Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PointLight,
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
  phase: number;
  scale: number;
  spin: [number, number, number];
};

type FunnelItem = {
  group: Group;
  start: Vector3;
  end: Vector3;
  phase: number;
  scale: number;
  speed: number;
  spin: Vector3;
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
const CORE = new Vector3(2.35, 1.1, 0);
const SHARD_COUNT = 42;

// CC0 Quaternius models, compressed through the gamedev repo's optimized GLB
// pipeline. Chunkier silhouettes read better in a moving background.
const MODEL_ASSETS: ModelAsset[] = [
  {
    file: "AnimatedChest.glb",
    start: [-4.2, 1.75, -1.5],
    end: [6.0, -0.92, -0.75],
    phase: 0.02,
    scale: 1.34,
    spin: [0.28, 0.86, 0.12],
  },
  {
    file: "Burger.glb",
    start: [-3.8, -0.95, 0.9],
    end: [5.7, 0.55, 0.4],
    phase: 0.12,
    scale: 1.42,
    spin: [0.18, -0.72, 0.25],
  },
  {
    file: "Cake.glb",
    start: [-3.3, 0.95, 1.35],
    end: [6.25, -0.18, 0.82],
    phase: 0.2,
    scale: 1.34,
    spin: [0.46, 0.5, -0.22],
  },
  {
    file: "ChairCushioned.glb",
    start: [-4.55, 0.2, -0.25],
    end: [5.45, 1.12, -0.35],
    phase: 0.29,
    scale: 1.22,
    spin: [0.12, 1.2, 0.8],
  },
  {
    file: "Donut.glb",
    start: [-3.9, 2.15, 0.65],
    end: [6.35, 0.88, 0.05],
    phase: 0.36,
    scale: 1.32,
    spin: [-0.24, 0.96, 0.44],
  },
  {
    file: "Hotdog.glb",
    start: [-3.5, -0.55, -1.05],
    end: [5.85, -1.08, 0.58],
    phase: 0.43,
    scale: 1.3,
    spin: [0.7, -0.32, 0.34],
  },
  {
    file: "KnightHelmet.glb",
    start: [-4.45, 1.2, 0.05],
    end: [5.55, 0.14, -0.98],
    phase: 0.51,
    scale: 1.3,
    spin: [0.18, 0.78, -0.18],
  },
  {
    file: "Lamp.glb",
    start: [-3.8, -1.25, -0.5],
    end: [6.1, 1.4, 0.72],
    phase: 0.59,
    scale: 1.24,
    spin: [0.36, -0.46, 0.64],
  },
  {
    file: "Milkshake.glb",
    start: [-3.4, 1.55, 1.15],
    end: [5.85, -0.54, -0.16],
    phase: 0.66,
    scale: 1.3,
    spin: [-0.28, 0.84, 0.24],
  },
  {
    file: "Pizza.glb",
    start: [-4.35, -0.25, 1.25],
    end: [6.25, 0.35, 0.96],
    phase: 0.74,
    scale: 1.36,
    spin: [0.2, 0.55, 0.46],
  },
  {
    file: "Plant.glb",
    start: [-3.75, 0.38, -1.35],
    end: [5.6, -1.36, -0.55],
    phase: 0.82,
    scale: 1.26,
    spin: [0.64, 0.24, -0.36],
  },
  {
    file: "SodaCan.glb",
    start: [-4.65, 2.0, -0.75],
    end: [6.15, 0.9, -0.2],
    phase: 0.9,
    scale: 1.24,
    spin: [0.12, 1.08, 0.54],
  },
  {
    file: "Sofa.glb",
    start: [-3.25, -0.8, 0.2],
    end: [5.7, -0.86, 1.1],
    phase: 0.96,
    scale: 1.34,
    spin: [-0.42, 0.36, 0.7],
  },
];

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
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

function createProcessor() {
  const group = new Group();
  const rings: Mesh[] = [];
  const ringMaterial = new MeshStandardMaterial({
    color: "#73f7df",
    emissive: "#0b7f75",
    emissiveIntensity: 1.1,
    metalness: 0.25,
    roughness: 0.2,
    transparent: true,
    opacity: 0.74,
  });
  const amberMaterial = new MeshStandardMaterial({
    color: "#ffb25f",
    emissive: "#9b4a08",
    emissiveIntensity: 0.64,
    metalness: 0.16,
    roughness: 0.38,
    transparent: true,
    opacity: 0.56,
  });

  for (let i = 0; i < 7; i += 1) {
    const radius = MathUtils.lerp(1.36, 0.34, i / 6);
    const tube = MathUtils.lerp(0.026, 0.012, i / 6);
    const ring = new Mesh(new TorusGeometry(radius, tube, 10, 96), i < 3 ? amberMaterial.clone() : ringMaterial.clone());
    ring.rotation.y = Math.PI / 2;
    ring.position.x = CORE.x + MathUtils.lerp(-1.28, 0.62, i / 6);
    ring.position.y = CORE.y + Math.sin(i * 0.8) * 0.05;
    ring.position.z = CORE.z + Math.cos(i * 0.7) * 0.08;
    group.add(ring);
    rings.push(ring);
  }

  const core = new Mesh(
    new IcosahedronGeometry(0.32, 1),
    new MeshStandardMaterial({
      color: "#a7fff0",
      emissive: "#20dfc8",
      emissiveIntensity: 1.65,
      metalness: 0.5,
      roughness: 0.18,
    }),
  );
  core.position.copy(CORE);
  group.add(core);

  const light = new PointLight("#5eead4", 3.2, 7);
  light.position.set(CORE.x + 0.2, CORE.y + 0.15, CORE.z + 0.5);
  group.add(light);

  return { group, rings, core };
}

function createShards(color: string, emissive: string): InstancedMesh {
  const geometry = new BoxGeometry(0.34, 0.21, 0.036);
  const material = new MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 0.34,
    metalness: 0.18,
    roughness: 0.36,
    transparent: true,
    opacity: 0.62,
  });
  const mesh = new InstancedMesh(geometry, material, SHARD_COUNT);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  return mesh;
}

function setShardMatrix(mesh: InstancedMesh, index: number, time: number, outbound: boolean, dummy: Object3D) {
  const u = (time * (outbound ? 0.16 : 0.13) + index / SHARD_COUNT + (outbound ? 0.42 : 0)) % 1;
  const p = outbound ? easeOut(u) : easeInOut(u);
  const row = (index % 7) - 3;
  const layer = Math.floor(index / 7) % 6;
  const start = outbound
    ? CORE
    : new Vector3(-6.3, -1.4 + row * 0.42, -1.6 + layer * 0.55);
  const end = outbound
    ? new Vector3(6.45, -1.0 + row * 0.24, -0.95 + layer * 0.34)
    : CORE;

  dummy.position.set(
    MathUtils.lerp(start.x, end.x, p),
    MathUtils.lerp(start.y, end.y, p) + Math.sin(time * 1.7 + index) * 0.08,
    MathUtils.lerp(start.z, end.z, p) + Math.cos(time * 1.3 + index) * 0.08,
  );
  dummy.rotation.set(time * 0.55 + index, time * 0.34 - index * 0.1, time * 0.48 + index * 0.2);
  const s = outbound ? MathUtils.lerp(0.24, 0.48, p) : MathUtils.lerp(0.8, 0.2, p);
  dummy.scale.setScalar(s);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function updateItem(item: FunnelItem, time: number) {
  const u = (time * item.speed + item.phase) % 1;
  const inboundLimit = 0.6;
  const swirl = Math.sin((u + item.phase) * Math.PI * 6);
  let stageScale: number;

  if (u < inboundLimit) {
    const p = easeInOut(u / inboundLimit);
    item.group.position.set(
      MathUtils.lerp(item.start.x, CORE.x + swirl * 0.1, p),
      MathUtils.lerp(item.start.y, CORE.y + Math.cos(time + item.phase * 8) * 0.14, p) + Math.sin(p * Math.PI) * 0.38,
      MathUtils.lerp(item.start.z, CORE.z + Math.cos(time * 0.8 + item.phase * 10) * 0.12, p),
    );
    stageScale = MathUtils.lerp(1.12, 0.22, p);
  } else {
    const p = easeOut((u - inboundLimit) / (1 - inboundLimit));
    item.group.position.set(
      MathUtils.lerp(CORE.x, item.end.x, p),
      MathUtils.lerp(CORE.y, item.end.y, p) + Math.sin(p * Math.PI * 2 + item.phase * 9) * 0.12,
      MathUtils.lerp(CORE.z, item.end.z, p),
    );
    stageScale = MathUtils.lerp(0.2, 0.46, p) * MathUtils.lerp(1, 0.7, p);
  }

  item.group.scale.setScalar(item.scale * stageScale);
  item.group.rotation.set(
    time * item.spin.x + item.phase * 3,
    time * item.spin.y + item.phase * 5,
    time * item.spin.z + item.phase * 7,
  );
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

    const inboundShards = createShards("#ffb25f", "#8f3d00");
    const outboundShards = createShards("#68f7dd", "#087c72");
    scene.add(inboundShards, outboundShards);

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
    const dummy = new Object3D();

    function resize() {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.set(width < 720 ? 1.2 : 0.45, width < 720 ? 1.55 : 1.18, width < 720 ? 9.8 : 8.0);
      camera.lookAt(width < 720 ? 1.55 : 2.05, width < 720 ? 0.75 : 0.9, 0);
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
          group.visible = true;
          modelRoot.add(group);
          items.push({
            group,
            start: new Vector3(...asset.start),
            end: new Vector3(...asset.end),
            phase: asset.phase,
            scale: asset.scale,
            speed: 0.09 + (index % 4) * 0.012,
            spin: new Vector3(...asset.spin),
          });
        }),
      );

      if (reduceMotion && !disposed) renderFrame(2400);
    }

    function renderFrame(now: number) {
      const time = now / 1000;
      processor.group.rotation.z = Math.sin(time * 0.42) * 0.035;
      processor.core.rotation.set(time * 0.42, time * 0.6, -time * 0.36);
      const corePulse = 1 + Math.sin(time * 2.4) * 0.06;
      processor.core.scale.setScalar(corePulse);

      processor.rings.forEach((ring, index) => {
        const pulse = 1 + Math.sin(time * 1.5 + index * 0.7) * 0.04;
        ring.scale.setScalar(pulse);
        ring.rotation.x = time * (index % 2 === 0 ? 0.18 : -0.14);
      });

      for (const item of items) updateItem(item, reduceMotion ? 2.4 : time);

      for (let i = 0; i < SHARD_COUNT; i += 1) {
        setShardMatrix(inboundShards, i, reduceMotion ? 2.4 : time, false, dummy);
        setShardMatrix(outboundShards, i, reduceMotion ? 2.4 : time, true, dummy);
      }
      inboundShards.instanceMatrix.needsUpdate = true;
      outboundShards.instanceMatrix.needsUpdate = true;

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

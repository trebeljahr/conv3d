// Tile renderer for press-bulk-run.mjs: three.js GLTFLoader, the same neutral
// room environment and key light as _press-viewer.js, no material changes,
// transparent background. window.renderSheet() draws a list of GLBs into
// fixed cells of one image, so the FBX2glTF-alone sheet and the conv3d sheet
// line up model for model. A .fbx url loads the source file itself with
// FBXLoader, which finds the texture PNG next to it.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);
const environment = new THREE.PMREMGenerator(renderer).fromScene(
  new RoomEnvironment(),
  0.04,
).texture;
const gltfLoader = new GLTFLoader();

// Resolves once the model and every texture it references have loaded.
async function load(url) {
  if (!url.endsWith(".fbx")) return (await gltfLoader.loadAsync(url)).scene;
  const manager = new THREE.LoadingManager();
  const textures = new Promise((resolve) => {
    manager.onLoad = resolve;
  });
  const model = await new FBXLoader(manager).loadAsync(url);
  await textures;
  // FBXLoader makes Phong materials, which ignore the room environment that
  // lights the GLB renders. Draw the FBX's own texture and colour with the
  // same PBR model instead: metalness 0, roughness 0.5.
  model.traverse((o) => {
    if (!o.isMesh) return;
    const swap = (m) =>
      new THREE.MeshStandardMaterial({ map: m.map, color: m.color, metalness: 0, roughness: 0.5 });
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
  return model;
}

// World-space points that outline the model: every vertex of a static mesh,
// the 8 box corners of a skinned one (its bind-pose vertices can sit elsewhere).
function outline(model) {
  const pts = [];
  const v = new THREE.Vector3();
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (o.isSkinnedMesh) {
      const b = new THREE.Box3().setFromObject(o, true);
      for (let i = 0; i < 8; i++) {
        pts.push(
          new THREE.Vector3(
            i & 1 ? b.max.x : b.min.x,
            i & 2 ? b.max.y : b.min.y,
            i & 4 ? b.max.z : b.min.z,
          ),
        );
      }
      return;
    }
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++)
      pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).clone());
  });
  return pts;
}

// Renders one GLB into a w x h transparent image and returns the canvas. The
// orthographic camera looks from the front-right and slightly above; the
// frustum is fitted to the model's projected outline, so long thin props fill
// their cell as well as round ones.
async function renderModel(url, w, h, { yaw = 0.35, pitch = 0.12, fill = 0.82 } = {}) {
  renderer.setSize(w, h, false);
  const scene = new THREE.Scene();
  scene.environment = environment;
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(2, 4, 3);
  scene.add(key);

  const model = await load(url);
  model.rotation.y = yaw;
  scene.add(model);
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model, true);
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, radius * 10);
  camera.position
    .copy(center)
    .add(new THREE.Vector3(0.28, pitch, 1).normalize().multiplyScalar(radius * 3));
  camera.lookAt(center);
  camera.updateMatrixWorld(true);

  const view = camera.matrixWorldInverse;
  const min = new THREE.Vector2(Infinity, Infinity);
  const max = new THREE.Vector2(-Infinity, -Infinity);
  for (const p of outline(model)) {
    p.applyMatrix4(view);
    min.min(new THREE.Vector2(p.x, p.y));
    max.max(new THREE.Vector2(p.x, p.y));
  }
  const cx = (min.x + max.x) / 2;
  const cy = (min.y + max.y) / 2;
  const aspect = w / h;
  const halfH = Math.max((max.y - min.y) / 2, (max.x - min.x) / 2 / aspect) / fill;
  camera.left = cx - halfH * aspect;
  camera.right = cx + halfH * aspect;
  camera.top = cy + halfH;
  camera.bottom = cy - halfH;
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  return renderer.domElement;
}

// cells: [{ url, x, y, w, h, yaw?, pitch?, fill? }] in sheet pixels.
window.renderSheet = async (width, height, cells, type = "image/webp", quality = 0.9) => {
  const sheet = document.createElement("canvas");
  sheet.width = width;
  sheet.height = height;
  const ctx = sheet.getContext("2d");
  for (const c of cells) {
    const canvas = await renderModel(c.url, c.w, c.h, c);
    ctx.drawImage(canvas, c.x, c.y);
  }
  return sheet.toDataURL(type, quality);
};

// Re-encodes an image (the vhs PNG) as WebP. The cards show it at half size.
window.toWebp = async (url, quality = 0.92) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext("2d").drawImage(img, 0, 0);
  return c.toDataURL("image/webp", quality);
};

window.__ready = true;

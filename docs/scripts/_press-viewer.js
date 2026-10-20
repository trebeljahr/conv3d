// Plain GLB viewer for before-after.png: three.js GLTFLoader, a neutral room
// environment, one key light, no material changes. Every <canvas data-glb>
// on the page gets the same camera, lights and framing, so the only
// difference between panels is the file.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

async function render(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(canvas.dataset.bg ?? "#1e1e2e");
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(
    new RoomEnvironment(),
    0.04,
  ).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(2, 4, 3);
  scene.add(key);

  const gltf = await new GLTFLoader().loadAsync(canvas.dataset.glb);
  const model = gltf.scene;
  model.rotation.y = Number(canvas.dataset.yaw ?? 0);
  scene.add(model);
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model, true);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(
    30,
    canvas.clientWidth / canvas.clientHeight,
    0.01,
    1000,
  );
  const dist = (size.y * 0.62) / Math.tan(THREE.MathUtils.degToRad(15));
  camera.position.set(center.x + dist * 0.28, center.y + size.y * 0.12, center.z + dist);
  camera.lookAt(center);

  renderer.render(scene, camera);
}

window.__ready = Promise.all([...document.querySelectorAll("canvas[data-glb]")].map(render)).then(
  () => true,
);

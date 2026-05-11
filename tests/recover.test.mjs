import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { recoverFbxTextures } = await import(path.resolve(__dirname, "..", "dist", "converters.js"));

// 1×1 magenta PNG, base64-encoded — this is the exact byte sequence fbx2gltf
// emits when it can't resolve an external texture.
const PLACEHOLDER_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

// Minimal 8×8 PNG (uniform red). Distinguishable from the 1×1 magenta
// placeholder by both size and bytes.
const REAL_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX/AAD///9BHTQRAAAADElEQVQI12NgIAYAABkAAdF/EwsAAAAASUVORK5CYII=";

function buildPlaceholderGlb() {
  // Tiny gltf 2.0 JSON: one material with a baseColorTexture pointing to a
  // 1×1 magenta data-URI image. Mirrors what fbx2gltf produces.
  const gltf = {
    asset: { version: "2.0" },
    images: [{ name: "base_color_texture", uri: `data:image/png;base64,${PLACEHOLDER_B64}` }],
    samplers: [{}],
    textures: [{ sampler: 0, source: 0 }],
    materials: [
      {
        name: "test_material",
        pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
      },
    ],
    meshes: [{ primitives: [{ material: 0 }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };

  const jsonStr = JSON.stringify(gltf);
  let jsonBuf = Buffer.from(jsonStr, "utf8");
  const pad = (4 - (jsonBuf.length % 4)) % 4;
  if (pad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(pad, 0x20)]);

  const totalLength = 12 + 8 + jsonBuf.length;
  const glb = Buffer.alloc(totalLength);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totalLength, 8);
  glb.writeUInt32LE(jsonBuf.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  jsonBuf.copy(glb, 20);
  return glb;
}

function readPngDimsFromGlb(glbBytes) {
  // Walk the GLB chunks until we find an embedded PNG and read its IHDR.
  const total = glbBytes.readUInt32LE(8);
  let off = 12;
  let jsonObj;
  let bin = null;
  while (off < total) {
    const len = glbBytes.readUInt32LE(off);
    const type = glbBytes.readUInt32LE(off + 4);
    off += 8;
    const data = glbBytes.subarray(off, off + len);
    if (type === 0x4e4f534a) jsonObj = JSON.parse(data.toString("utf8"));
    else if (type === 0x004e4942) bin = data;
    off += len;
  }
  const img = jsonObj.images[0];
  let pngBytes;
  if (typeof img.uri === "string" && img.uri.startsWith("data:")) {
    pngBytes = Buffer.from(img.uri.split(";base64,")[1], "base64");
  } else if (img.bufferView !== undefined) {
    const bv = jsonObj.bufferViews[img.bufferView];
    pngBytes = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
  } else {
    throw new Error("image has neither uri nor bufferView");
  }
  return [pngBytes.readUInt32BE(16), pngBytes.readUInt32BE(20), pngBytes.length];
}

test("recoverFbxTextures replaces 1×1 placeholder with sibling texture file", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "conv3d-recover-"));
  try {
    const fbxPath = path.join(dir, "Hero.fbx");
    const glbPath = path.join(dir, "Hero.glb");
    const realPng = path.join(dir, "hero_texture.png");

    // Write a stub .fbx (contents don't matter — recovery only reads its
    // dirname and basename), a sibling real PNG, and a placeholder GLB.
    writeFileSync(fbxPath, "stub");
    writeFileSync(realPng, Buffer.from(REAL_PNG_B64, "base64"));
    writeFileSync(glbPath, buildPlaceholderGlb());

    // Sanity-check: before recovery the image is the 1×1 placeholder.
    const [w0, h0] = readPngDimsFromGlb(readFileSync(glbPath));
    assert.equal(w0, 1);
    assert.equal(h0, 1);

    const n = await recoverFbxTextures(glbPath, fbxPath);
    assert.equal(n, 1, "should report 1 recovered texture");

    // After recovery the image is the real 8×8 PNG.
    const [w1, h1] = readPngDimsFromGlb(readFileSync(glbPath));
    assert.equal(w1, 8, "image width should be from real PNG");
    assert.equal(h1, 8, "image height should be from real PNG");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("recoverFbxTextures is a no-op when no placeholder is present", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "conv3d-recover-noop-"));
  try {
    const fbxPath = path.join(dir, "Hero.fbx");
    const glbPath = path.join(dir, "Hero.glb");
    writeFileSync(fbxPath, "stub");

    // Build a GLB whose image is the 8×8 "real" PNG embedded directly. That's
    // not a placeholder, so recovery should leave it alone.
    const gltf = {
      asset: { version: "2.0" },
      images: [{ name: "base_color_texture", uri: `data:image/png;base64,${REAL_PNG_B64}` }],
      samplers: [{}],
      textures: [{ sampler: 0, source: 0 }],
      materials: [{ name: "test", pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      meshes: [{ primitives: [{ material: 0 }] }],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }],
      scene: 0,
    };
    let jsonBuf = Buffer.from(JSON.stringify(gltf), "utf8");
    const pad = (4 - (jsonBuf.length % 4)) % 4;
    if (pad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(pad, 0x20)]);
    const total = 12 + 8 + jsonBuf.length;
    const glb = Buffer.alloc(total);
    glb.writeUInt32LE(0x46546c67, 0);
    glb.writeUInt32LE(2, 4);
    glb.writeUInt32LE(total, 8);
    glb.writeUInt32LE(jsonBuf.length, 12);
    glb.writeUInt32LE(0x4e4f534a, 16);
    jsonBuf.copy(glb, 20);
    writeFileSync(glbPath, glb);

    const before = readFileSync(glbPath);
    const n = await recoverFbxTextures(glbPath, fbxPath);
    assert.equal(n, 0, "should report 0 recovered textures");

    // File must be byte-identical (no spurious round-trip rewrite).
    const after = readFileSync(glbPath);
    assert.ok(before.equals(after), "GLB should be untouched when no placeholders");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

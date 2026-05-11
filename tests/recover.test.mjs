import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { recoverFbxTextures } = await import(path.resolve(__dirname, "..", "dist", "converters.js"));
const { applyFoliageHints, applyMaterialColors, parseGlbMinimal, seedMissingTextures } =
  await import(path.resolve(__dirname, "..", "dist", "recovery.js"));

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

// Build a minimal GLB with `materials.length` named materials, each used by
// one mesh primitive that has TEXCOORD_0 (so seedMissingTextures considers
// them eligible). No images/textures present.
function buildMaterialOnlyGlb(materialNames) {
  const materials = materialNames.map((name) => ({
    name,
    pbrMetallicRoughness: { baseColorFactor: [0.8, 0.8, 0.8, 1.0] },
  }));
  // One bufferView for a tiny dummy TEXCOORD_0 + POSITION accessor each. We
  // don't need real geometry — just the attribute key on the primitive.
  const meshes = materials.map((_, i) => ({
    primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 0 }, material: i }],
  }));
  const gltf = {
    asset: { version: "2.0" },
    materials,
    meshes,
    nodes: meshes.map((_, i) => ({ mesh: i })),
    scenes: [{ nodes: meshes.map((_, i) => i) }],
    scene: 0,
  };
  let jsonBuf = Buffer.from(JSON.stringify(gltf), "utf8");
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

test("seedMissingTextures attaches sibling Textures/ images to materials by name", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "conv3d-seed-"));
  try {
    const glbPath = path.join(dir, "Banner.glb");
    writeFileSync(glbPath, buildMaterialOnlyGlb(["Banner", "Wood", "DarkRock"]));

    // Sibling Textures/ folder with two of the three names matching.
    mkdirSync(path.join(dir, "Textures"));
    writeFileSync(
      path.join(dir, "Textures", "Banner.png"),
      Buffer.from(REAL_PNG_B64, "base64"),
    );
    writeFileSync(
      path.join(dir, "Textures", "wood.png"), // case-insensitive match
      Buffer.from(REAL_PNG_B64, "base64"),
    );

    const attached = await seedMissingTextures(glbPath, dir);
    assert.equal(attached, 2, "should seed two textures (Banner + Wood); DarkRock has no match");

    const { json } = parseGlbMinimal(readFileSync(glbPath));
    const namesWithTexture = json.materials
      .filter((m) => m.pbrMetallicRoughness?.baseColorTexture)
      .map((m) => m.name)
      .sort();
    assert.deepEqual(namesWithTexture, ["Banner", "Wood"]);
    assert.equal(json.images.length, 2);
    // Buffer-byte length should be at least the size of two PNGs.
    assert.ok(json.buffers[0].byteLength > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("seedMissingTextures uses source-stem fallback to attach a per-file atlas", async () => {
  // Quaternius case: material is generically named ("Material"), but the FBX
  // is named after the model and the texture follows a "<Stem>Texture" naming
  // convention. The scored stem fallback should pick the right texture even
  // when several siblings contain the stem as a substring.
  const dir = mkdtempSync(path.join(tmpdir(), "conv3d-seed-stem-"));
  try {
    const glbPath = path.join(dir, "Soda.glb");
    writeFileSync(glbPath, buildMaterialOnlyGlb(["Material"]));

    // SodaTexture (stem == source + "texture", score 90) should beat
    // SodaCan (alpha suffix, score 80). Pizza2 (digit suffix, score 30) is
    // not relevant here but pollutes the search dir.
    mkdirSync(path.join(dir, "Textures"));
    writeFileSync(path.join(dir, "Textures", "SodaTexture.png"), Buffer.from(REAL_PNG_B64, "base64"));
    writeFileSync(path.join(dir, "Textures", "SodaCan.png"), Buffer.from(REAL_PNG_B64, "base64"));
    writeFileSync(path.join(dir, "Textures", "Pizza2.png"), Buffer.from(REAL_PNG_B64, "base64"));

    const attached = await seedMissingTextures(glbPath, dir, [], "Soda");
    assert.equal(attached, 1, "should pick the Texture-suffixed sibling");

    const { json } = parseGlbMinimal(readFileSync(glbPath));
    assert.equal(json.images.length, 1);
    assert.equal(json.images[0].name, "SodaTexture");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("seedMissingTextures source-stem fallback breaks ties deterministically", async () => {
  // Two textures tie at the alpha-suffix score band. With same-length
  // filenames the alphabetical first wins so reruns are stable.
  const dir = mkdtempSync(path.join(tmpdir(), "conv3d-seed-tied-"));
  try {
    const glbPath = path.join(dir, "Wolf.glb");
    writeFileSync(glbPath, buildMaterialOnlyGlb(["Material"]));
    mkdirSync(path.join(dir, "Textures"));
    writeFileSync(path.join(dir, "Textures", "WolfA.png"), Buffer.from(REAL_PNG_B64, "base64"));
    writeFileSync(path.join(dir, "Textures", "WolfB.png"), Buffer.from(REAL_PNG_B64, "base64"));

    const attached = await seedMissingTextures(glbPath, dir, [], "Wolf");
    assert.equal(attached, 1, "should pick a winner deterministically");

    const { json } = parseGlbMinimal(readFileSync(glbPath));
    assert.equal(json.images[0].name, "WolfA", "alphabetical tiebreak picks A");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("seedMissingTextures source-stem fallback handles BigTree → Tree", async () => {
  // Source "BigTree" with several Tree-prefixed siblings should pick the
  // canonical (shortest) Tree.png via the reverse-endsWith tier.
  const dir = mkdtempSync(path.join(tmpdir(), "conv3d-seed-bigtree-"));
  try {
    const glbPath = path.join(dir, "BigTree.glb");
    writeFileSync(glbPath, buildMaterialOnlyGlb(["Material"]));
    mkdirSync(path.join(dir, "Textures"));
    for (const name of ["Tree.png", "Tree2.png", "Tree3.png"]) {
      writeFileSync(path.join(dir, "Textures", name), Buffer.from(REAL_PNG_B64, "base64"));
    }

    const attached = await seedMissingTextures(glbPath, dir, [], "BigTree");
    assert.equal(attached, 1);

    const { json } = parseGlbMinimal(readFileSync(glbPath));
    assert.equal(json.images[0].name, "Tree", "shortest canonical name wins");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("seedMissingTextures uses single-image fallback as a shared atlas", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "conv3d-seed-atlas-"));
  try {
    const glbPath = path.join(dir, "Burger.glb");
    writeFileSync(glbPath, buildMaterialOnlyGlb(["Bun", "Patty", "Cheese"]));

    // Sibling Textures/ folder with exactly one image — the shared atlas.
    mkdirSync(path.join(dir, "Textures"));
    writeFileSync(
      path.join(dir, "Textures", "atlas.png"),
      Buffer.from(REAL_PNG_B64, "base64"),
    );

    const attached = await seedMissingTextures(glbPath, dir);
    assert.equal(attached, 3, "all three materials should get the lone atlas");

    const { json } = parseGlbMinimal(readFileSync(glbPath));
    // All three materials point to the same texture (deduped).
    const indices = json.materials.map((m) => m.pbrMetallicRoughness.baseColorTexture.index);
    assert.equal(new Set(indices).size, 1, "should be deduped to one texture");
    assert.equal(json.images.length, 1, "atlas embedded only once");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("seedMissingTextures is a no-op when material already has baseColorTexture", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "conv3d-seed-noop-"));
  try {
    // Build a GLB where the one material already has a baseColorTexture.
    const gltf = {
      asset: { version: "2.0" },
      images: [{ name: "existing", uri: `data:image/png;base64,${REAL_PNG_B64}` }],
      samplers: [{}],
      textures: [{ sampler: 0, source: 0 }],
      materials: [
        {
          name: "Banner",
          pbrMetallicRoughness: {
            baseColorTexture: { index: 0 },
            baseColorFactor: [1, 1, 1, 1],
          },
        },
      ],
      meshes: [{ primitives: [{ attributes: { TEXCOORD_0: 0 }, material: 0 }] }],
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

    const glbPath = path.join(dir, "Banner.glb");
    writeFileSync(glbPath, glb);

    mkdirSync(path.join(dir, "Textures"));
    writeFileSync(
      path.join(dir, "Textures", "Banner.png"),
      Buffer.from(REAL_PNG_B64, "base64"),
    );

    const before = readFileSync(glbPath);
    const attached = await seedMissingTextures(glbPath, dir);
    assert.equal(attached, 0, "no seeding when material already has a texture");
    const after = readFileSync(glbPath);
    assert.ok(before.equals(after), "GLB should be byte-identical");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("applyFoliageHints sets MASK + doubleSided on foliage materials with textures", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "conv3d-foliage-"));
  try {
    const glbPath = path.join(dir, "Tree.glb");
    // Two materials: Leaves (foliage, has texture) + Bark (not foliage).
    const gltf = {
      asset: { version: "2.0" },
      images: [{ name: "leaves", uri: `data:image/png;base64,${REAL_PNG_B64}` }],
      samplers: [{}],
      textures: [{ sampler: 0, source: 0 }],
      materials: [
        {
          name: "Leaves",
          pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
        },
        {
          name: "Bark",
          pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
        },
        {
          // Foliage name but no texture — should NOT get hints (nothing to mask).
          name: "BushOutline",
          pbrMetallicRoughness: { baseColorFactor: [0.5, 0.5, 0.5, 1] },
        },
      ],
      meshes: [
        {
          primitives: [
            { attributes: { TEXCOORD_0: 0 }, material: 0 },
            { attributes: { TEXCOORD_0: 0 }, material: 1 },
            { attributes: { POSITION: 0 }, material: 2 },
          ],
        },
      ],
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

    const changed = await applyFoliageHints(glbPath);
    assert.equal(changed, 1, "only Leaves should be patched");

    const { json } = parseGlbMinimal(readFileSync(glbPath));
    const leaves = json.materials[0];
    const bark = json.materials[1];
    const bushOutline = json.materials[2];
    assert.equal(leaves.alphaMode, "MASK");
    assert.equal(leaves.alphaCutoff, 0.5);
    assert.equal(leaves.doubleSided, true);
    assert.equal(bark.alphaMode, undefined, "non-foliage material untouched");
    assert.equal(bushOutline.alphaMode, undefined, "foliage without texture untouched");

    // Idempotent: running again is a no-op.
    const second = await applyFoliageHints(glbPath);
    assert.equal(second, 0, "second run should be a no-op");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("applyMaterialColors replaces default-grey baseColorFactor from manifest", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "conv3d-colors-"));
  try {
    const glbPath = path.join(dir, "Banner.glb");
    writeFileSync(glbPath, buildMaterialOnlyGlb(["Banner", "Wood", "AlreadyColored"]));

    // Pre-set a non-default color on AlreadyColored — manifest should not
    // clobber it. Read, mutate, write back.
    {
      const { json } = parseGlbMinimal(readFileSync(glbPath));
      json.materials[2].pbrMetallicRoughness.baseColorFactor = [0.1, 0.2, 0.3, 1.0];
      let jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
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
    }

    const manifest = {
      Banner: {
        Banner: { color: [0.8, 0.0, 0.0, 1.0], source: "principled" },
        Wood: { color: [0.4, 0.25, 0.1, 1.0], source: "principled" },
        AlreadyColored: { color: [0.99, 0.99, 0.99, 1.0], source: "principled" },
      },
    };
    const changed = await applyMaterialColors(glbPath, manifest);
    assert.equal(changed, 2, "Banner + Wood patched; AlreadyColored skipped");

    const { json } = parseGlbMinimal(readFileSync(glbPath));
    assert.deepEqual(json.materials[0].pbrMetallicRoughness.baseColorFactor, [0.8, 0.0, 0.0, 1.0]);
    assert.deepEqual(json.materials[1].pbrMetallicRoughness.baseColorFactor, [0.4, 0.25, 0.1, 1.0]);
    assert.deepEqual(
      json.materials[2].pbrMetallicRoughness.baseColorFactor,
      [0.1, 0.2, 0.3, 1.0],
      "non-grey material preserved",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("applyMaterialColors accepts flat (no-stem) manifest shape", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "conv3d-colors-flat-"));
  try {
    const glbPath = path.join(dir, "Anything.glb");
    writeFileSync(glbPath, buildMaterialOnlyGlb(["RoofTile"]));

    // Flat manifest: no per-stem nesting, just material -> color.
    const manifest = {
      RoofTile: { color: [0.65, 0.18, 0.12, 1.0] },
    };
    const changed = await applyMaterialColors(glbPath, manifest);
    assert.equal(changed, 1);

    const { json } = parseGlbMinimal(readFileSync(glbPath));
    assert.deepEqual(
      json.materials[0].pbrMetallicRoughness.baseColorFactor,
      [0.65, 0.18, 0.12, 1.0],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

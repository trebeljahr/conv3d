// ---------------------------------------------------------------------------
// GLB post-processing — texture and material recovery.
//
// Many free 3D model packs (Quaternius, Kenney, KAYKIT, etc.) ship FBX/OBJ
// files whose texture and per-material color bindings are broken or missing
// once they reach a glTF/GLB output:
//
//  - Some packs reference textures via absolute Windows paths the FBX SDK
//    can't resolve, so fbx2gltf bakes a 1×1 magenta placeholder.
//  - Some packs (Quaternius 2017-era) ship FBX files with no texture
//    bindings at all but a sibling Textures/ folder containing the assets.
//  - Some packs lost per-material diffuse colors entirely — the only
//    authoritative source is the original .blend's Diffuse/Principled BSDF.
//
// This module post-processes a freshly-converted GLB:
//
//   1. recoverFbxPlaceholders — swap 1×1 placeholders for real images.
//   2. seedMissingTextures    — attach textures from sibling dirs by name.
//   3. applyFoliageHints      — alphaMode=MASK + doubleSided for leaves.
//   4. applyMaterialColors    — apply baseColorFactor map from JSON.
//
// `postProcessGlb` orchestrates all four. Each step is idempotent and a
// no-op when there's nothing to do.
// ---------------------------------------------------------------------------

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import gltfPipeline from "gltf-pipeline";

const { gltfToGlb } = gltfPipeline;

// ---------------------------------------------------------------------------
// GLB binary helpers
// ---------------------------------------------------------------------------

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47] as const;
const GLB_MAGIC = 0x46546c67;
const GLB_JSON = 0x4e4f534a;
const GLB_BIN = 0x004e4942;

const PLACEHOLDER_BYTE_LIMIT = 256;
const PLACEHOLDER_DIM_LIMIT = 4;

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp"]);

const COMMON_TEXTURE_DIRS = ["Textures", "textures", "Texture", "texture", "tex", "Materials"];

const FOLIAGE_KEYWORDS = [
  "leaves",
  "leaf",
  "petals",
  "petal",
  "flowers",
  "flower",
  "bush",
  "foliage",
  "grass",
  "fern",
];

export type TextureSlot = "baseColor" | "normal" | "metallicRoughness" | "emissive" | "occlusion";

const SLOT_KEYWORDS: Record<TextureSlot, string[]> = {
  baseColor: ["basecolor", "base_color", "diffuse", "albedo", "_color", "texture"],
  normal: ["normal", "_nrm", "bump"],
  metallicRoughness: [
    "metallic_roughness",
    "metallicroughness",
    "metalrough",
    "_orm",
    "_mr_",
    "roughness",
  ],
  emissive: ["emissive", "emission", "emit"],
  occlusion: ["occlusion", "_ao", "ambientocclusion"],
};

type GltfImage = {
  bufferView?: number;
  uri?: string;
  mimeType?: string;
  name?: string;
  extras?: { _pipeline?: { source?: Buffer } };
};
// biome-ignore lint/suspicious/noExplicitAny: gltf JSON has no static type
export type GltfJson = any;

export function parseGlbMinimal(buf: Buffer): { json: GltfJson; bin: Buffer | null } {
  if (buf.length < 12 || buf.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error("Not a valid GLB");
  }
  const totalLength = buf.readUInt32LE(8);
  let offset = 12;
  let json: GltfJson | null = null;
  let bin: Buffer | null = null;
  while (offset < totalLength) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    offset += 8;
    const data = buf.subarray(offset, offset + chunkLength);
    if (chunkType === GLB_JSON) json = JSON.parse(data.toString("utf8"));
    else if (chunkType === GLB_BIN) bin = Buffer.from(data);
    offset += chunkLength;
  }
  if (!json) throw new Error("GLB has no JSON chunk");
  return { json, bin };
}

function getImageBytes(img: GltfImage, gltf: GltfJson, bin: Buffer | null): Buffer | null {
  if (img.bufferView !== undefined && bin) {
    const bv = gltf.bufferViews[img.bufferView];
    const start = bv.byteOffset ?? 0;
    return Buffer.from(bin.subarray(start, start + bv.byteLength));
  }
  if (typeof img.uri === "string" && img.uri.startsWith("data:")) {
    const marker = ";base64,";
    const idx = img.uri.indexOf(marker);
    if (idx < 0) return null;
    return Buffer.from(img.uri.slice(idx + marker.length), "base64");
  }
  return null;
}

function isPlaceholderPng(data: Buffer): boolean {
  if (data.length >= PLACEHOLDER_BYTE_LIMIT) return false;
  if (data.length < 24) return false;
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (data[i] !== PNG_MAGIC[i]) return false;
  }
  const w = data.readUInt32BE(16);
  const h = data.readUInt32BE(20);
  return w > 0 && h > 0 && w <= PLACEHOLDER_DIM_LIMIT && h <= PLACEHOLDER_DIM_LIMIT;
}

function detectImageSlot(gltf: GltfJson, imageIdx: number): TextureSlot | null {
  const textures: { source?: number }[] = gltf.textures ?? [];
  const texturesUsingImage = new Set<number>();
  for (let ti = 0; ti < textures.length; ti++) {
    if (textures[ti]?.source === imageIdx) texturesUsingImage.add(ti);
  }
  if (texturesUsingImage.size === 0) return null;
  const materials = gltf.materials ?? [];
  for (const mat of materials) {
    const pbr = mat.pbrMetallicRoughness ?? {};
    if (texturesUsingImage.has(pbr.baseColorTexture?.index)) return "baseColor";
    if (texturesUsingImage.has(pbr.metallicRoughnessTexture?.index)) return "metallicRoughness";
    if (texturesUsingImage.has(mat.normalTexture?.index)) return "normal";
    if (texturesUsingImage.has(mat.occlusionTexture?.index)) return "occlusion";
    if (texturesUsingImage.has(mat.emissiveTexture?.index)) return "emissive";
  }
  return null;
}

function mimeForExtension(ext: string): string {
  const lower = ext.toLowerCase();
  if (lower === ".jpg" || lower === ".jpeg") return "image/jpeg";
  if (lower === ".webp") return "image/webp";
  if (lower === ".bmp") return "image/bmp";
  return "image/png";
}

// Loose normalization for fuzzy material/file name matches. "BirchTree_Bark"
// and "birchtreebark" and "BirchTree-Bark" all collapse to "birchtreebark".
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.\d+$/, "") // strip Blender ".001" duplicate suffix
    .replace(/[^a-z0-9]/g, "");
}

// ---------------------------------------------------------------------------
// Stage 1: placeholder recovery
// ---------------------------------------------------------------------------

async function findReplacementTexture(
  searchDirs: string[],
  fbxBaseLower: string,
  slot: TextureSlot | null,
): Promise<string | null> {
  const slotKeywords = slot ? SLOT_KEYWORDS[slot] : [];
  let best: { p: string; score: number; size: number } | null = null;

  for (const dir of searchDirs) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    const candidates = entries.filter((n) => {
      if (n.startsWith(".")) return false;
      const ext = path.extname(n).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) return false;
      const lower = n.toLowerCase();
      return (
        !lower.includes("preview") && !lower.includes("thumbnail") && !lower.includes("sample")
      );
    });

    for (const name of candidates) {
      const lower = name.toLowerCase();
      let score = 1;
      if (fbxBaseLower && lower.includes(fbxBaseLower)) score += 10;
      if (slotKeywords.some((k) => lower.includes(k))) score += 5;
      // Subtract points when the file looks like a different slot, so a
      // baseColor placeholder doesn't grab a Normal map sitting in the same dir.
      if (slot) {
        for (const [other, kws] of Object.entries(SLOT_KEYWORDS) as [TextureSlot, string[]][]) {
          if (other === slot) continue;
          if (kws.some((k) => lower.includes(k))) {
            score -= 5;
            break;
          }
        }
      }
      if (score <= 0) continue;
      const full = path.join(dir, name);
      let size = 0;
      try {
        size = (await stat(full)).size;
      } catch {
        continue;
      }
      if (!best || score > best.score || (score === best.score && size > best.size)) {
        best = { p: full, score, size };
      }
    }
  }
  return best?.p ?? null;
}

async function expandSearchDirs(sourceDir: string, extraDirs: string[]): Promise<string[]> {
  const dirs: string[] = [sourceDir];
  for (const candidate of COMMON_TEXTURE_DIRS) {
    const full = path.join(sourceDir, candidate);
    try {
      const s = await stat(full);
      if (s.isDirectory()) dirs.push(full);
    } catch {
      // not present — fine
    }
  }
  for (const d of extraDirs) {
    if (!dirs.includes(d)) dirs.push(d);
  }
  return dirs;
}

export async function recoverFbxPlaceholders(
  glbPath: string,
  fbxPath: string,
  extraDirs: string[] = [],
): Promise<number> {
  let buf: Buffer;
  try {
    buf = await readFile(glbPath);
  } catch {
    return 0;
  }
  let parsed: { json: GltfJson; bin: Buffer | null };
  try {
    parsed = parseGlbMinimal(buf);
  } catch {
    return 0;
  }
  const { json: gltf, bin } = parsed;
  const images: GltfImage[] = gltf.images ?? [];
  if (images.length === 0) return 0;

  const fbxDir = path.dirname(fbxPath);
  const fbxBaseLower = path.basename(fbxPath, path.extname(fbxPath)).toLowerCase();
  const searchDirs = await expandSearchDirs(fbxDir, extraDirs);

  let recovered = 0;
  for (let i = 0; i < images.length; i++) {
    const img = images[i]!;
    const data = getImageBytes(img, gltf, bin);
    if (!data || !isPlaceholderPng(data)) continue;

    const slot = detectImageSlot(gltf, i);
    const replacementPath = await findReplacementTexture(searchDirs, fbxBaseLower, slot);
    if (!replacementPath) continue;

    const real = await readFile(replacementPath);
    img.extras = img.extras ?? {};
    img.extras._pipeline = img.extras._pipeline ?? {};
    img.extras._pipeline.source = real;
    img.mimeType = mimeForExtension(path.extname(replacementPath));
    img.bufferView = undefined;
    img.uri = undefined;
    recovered++;
  }
  if (recovered === 0) return 0;

  await writeGlb(glbPath, gltf, bin);
  return recovered;
}

// Backwards-compatible alias: tests and external callers import this name.
export const recoverFbxTextures = recoverFbxPlaceholders;

// ---------------------------------------------------------------------------
// Stage 2: missing-texture seeding
//
// Find materials with no baseColorTexture but UVs in the meshes that use them.
// Search the source dir + sibling Textures/ folders for an image whose
// normalized stem matches the normalized material name. Embed it as the
// material's baseColorTexture.
//
// Two passes:
//   - per-material match: "Banner" -> "Banner.png" / "BannerTexture.png"
//   - shared-atlas fallback: when the texture dir contains exactly one usable
//     image and several materials need one, attach it to all of them.
// ---------------------------------------------------------------------------

function materialUsesUvs(gltf: GltfJson, materialIdx: number): boolean {
  const meshes = gltf.meshes ?? [];
  for (const mesh of meshes) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.material === materialIdx && prim.attributes?.TEXCOORD_0 !== undefined) {
        return true;
      }
    }
  }
  return false;
}

async function indexImageFiles(searchDirs: string[]): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  for (const dir of searchDirs) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (name.startsWith(".")) continue;
      const ext = path.extname(name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) continue;
      const lower = name.toLowerCase();
      if (lower.includes("preview") || lower.includes("thumbnail") || lower.includes("sample")) {
        continue;
      }
      const stem = path.basename(name, ext);
      const norm = normalizeName(stem);
      // First-found wins so the source-dir match beats a sibling-dir match
      // when names collide.
      if (!index.has(norm)) index.set(norm, path.join(dir, name));
    }
  }
  return index;
}

function appendImageToBin(
  gltf: GltfJson,
  bin: Buffer | null,
  imageBytes: Buffer,
  mimeType: string,
  name: string,
): { textureIndex: number; bin: Buffer } {
  const existingBin = bin ?? Buffer.alloc(0);
  const pad = (4 - (existingBin.length % 4)) % 4;
  const offset = existingBin.length + pad;
  const newBin = Buffer.concat([existingBin, Buffer.alloc(pad), imageBytes]);

  if (!Array.isArray(gltf.bufferViews)) gltf.bufferViews = [];
  if (!Array.isArray(gltf.buffers)) gltf.buffers = [];
  if (gltf.buffers.length === 0) gltf.buffers.push({ byteLength: newBin.length });
  else gltf.buffers[0].byteLength = newBin.length;

  const bvIdx = gltf.bufferViews.length;
  gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: imageBytes.length });

  if (!Array.isArray(gltf.images)) gltf.images = [];
  const imgIdx = gltf.images.length;
  gltf.images.push({ name, mimeType, bufferView: bvIdx });

  if (!Array.isArray(gltf.samplers)) gltf.samplers = [];
  if (gltf.samplers.length === 0) gltf.samplers.push({});

  if (!Array.isArray(gltf.textures)) gltf.textures = [];
  const texIdx = gltf.textures.length;
  gltf.textures.push({ sampler: 0, source: imgIdx });

  return { textureIndex: texIdx, bin: newBin };
}

// Score how well an image's normalized stem matches a source-file stem.
// Returns 0 when there's no relationship at all. Quaternius-style packs
// suffix textures with "texture" (e.g. SodaTexture.png alongside Soda.fbx),
// so prefer that convention to break ties between sibling models.
function scoreStemMatch(sourceStem: string, imageStem: string): number {
  if (!sourceStem || !imageStem) return 0;
  if (sourceStem === imageStem) return 100;
  if (imageStem.startsWith(sourceStem)) {
    const suffix = imageStem.slice(sourceStem.length);
    if (suffix === "texture") return 90;
    if (/^[a-z]+$/.test(suffix)) return 80;
    if (/^[a-z]/.test(suffix)) return 60; // "PizzaAlt2"
    return 30; // "Pizza2" — could be a separate variant
  }
  // "Donut2" → "Donut" + trailing digit. Try the bare stem.
  const bare = sourceStem.replace(/\d+$/, "");
  if (bare && bare !== sourceStem && imageStem.startsWith(bare)) {
    const suffix = imageStem.slice(bare.length);
    if (suffix === "texture") return 55;
    if (/^[a-z]+$/.test(suffix)) return 50; // "Donut2" → "DonutTexture"
    return 20;
  }
  if (imageStem.includes(sourceStem)) return 10;
  return 0;
}

function pickBestStemMatch(sourceStem: string, imageIndex: Map<string, string>): string | null {
  const stemNorm = normalizeName(sourceStem);
  if (stemNorm.length === 0) return null;

  let bestScore = 0;
  let bestPaths: string[] = [];
  for (const [k, v] of imageIndex) {
    const score = scoreStemMatch(stemNorm, k);
    if (score === 0) continue;
    if (score > bestScore) {
      bestScore = score;
      bestPaths = [v];
    } else if (score === bestScore) {
      bestPaths.push(v);
    }
  }
  // Refuse ambiguous ties — better to leave it untextured than guess wrong.
  if (bestPaths.length === 1 && bestScore >= 10) return bestPaths[0]!;
  return null;
}

export async function seedMissingTextures(
  glbPath: string,
  sourceDir: string,
  extraDirs: string[] = [],
  sourceStem?: string,
): Promise<number> {
  let buf: Buffer;
  try {
    buf = await readFile(glbPath);
  } catch {
    return 0;
  }
  let parsed: { json: GltfJson; bin: Buffer | null };
  try {
    parsed = parseGlbMinimal(buf);
  } catch {
    return 0;
  }
  const { json: gltf } = parsed;
  let { bin } = parsed;
  const materials: { name?: string; pbrMetallicRoughness?: GltfJson }[] = gltf.materials ?? [];
  if (materials.length === 0) return 0;

  // Skip materials that already have a baseColorTexture or no UVs in any prim.
  const needsTexture: number[] = [];
  for (let i = 0; i < materials.length; i++) {
    const m = materials[i]!;
    if (m.pbrMetallicRoughness?.baseColorTexture) continue;
    if (!materialUsesUvs(gltf, i)) continue;
    needsTexture.push(i);
  }
  if (needsTexture.length === 0) return 0;

  const searchDirs = await expandSearchDirs(sourceDir, extraDirs);
  const imageIndex = await indexImageFiles(searchDirs);
  if (imageIndex.size === 0) return 0;

  // Cache: file path -> texture index in this GLB. Avoids embedding the same
  // image twice when several materials share a texture.
  const embedded = new Map<string, number>();
  let attached = 0;

  // First pass: per-material name match.
  const stillUnmatched: number[] = [];
  for (const idx of needsTexture) {
    const m = materials[idx]!;
    const name = m.name ?? "";
    const hit = imageIndex.get(normalizeName(name));
    if (!hit) {
      stillUnmatched.push(idx);
      continue;
    }
    const texIdx = await embedAndAttach(
      gltf,
      hit,
      embedded,
      name,
      (newBin) => {
        bin = newBin;
      },
      bin,
    );
    m.pbrMetallicRoughness ??= {};
    const pbr = m.pbrMetallicRoughness;
    pbr.baseColorTexture = { index: texIdx };
    pbr.baseColorFactor = [1.0, 1.0, 1.0, 1.0];
    pbr.metallicFactor = pbr.metallicFactor ?? 0.0;
    pbr.roughnessFactor = pbr.roughnessFactor ?? 0.9;
    attached++;
  }

  // Second pass: source-stem fallback. Quaternius-style packs often have
  // generic material names ("Material") but the source FBX is named after
  // the model ("Burger.fbx"), and the texture filename embeds the same stem
  // ("BurgerTexture.png"). Score every image by how well its stem relates to
  // the source stem and pick the unambiguous winner.
  //
  // Tiers (highest first):
  //   exact          source stem == image stem                              "Pizza" / "Pizza"
  //   suffix         image stem == source stem + alpha suffix               "Pizza" / "PizzaTexture"
  //   prefix-alpha   image stem starts with source stem + alpha             "Cake"  / "CakeAlt"
  //   short-prefix   source stem ends in digits, drop trailing digits then  "Donut2" → "Donut" → "DonutTexture"
  //                  re-evaluate. (Quaternius numbers variants per model.)
  //   contains       image stem contains source stem (loosest)              "Pizza" / "Pizza2"
  if (stillUnmatched.length > 0 && sourceStem) {
    const lonePath = pickBestStemMatch(sourceStem, imageIndex);
    if (lonePath) {
      for (const idx of stillUnmatched) {
        const m = materials[idx]!;
        const texIdx = await embedAndAttach(
          gltf,
          lonePath,
          embedded,
          sourceStem,
          (newBin) => {
            bin = newBin;
          },
          bin,
        );
        m.pbrMetallicRoughness ??= {};
        const pbr = m.pbrMetallicRoughness;
        pbr.baseColorTexture = { index: texIdx };
        pbr.baseColorFactor = [1.0, 1.0, 1.0, 1.0];
        pbr.metallicFactor = pbr.metallicFactor ?? 0.0;
        pbr.roughnessFactor = pbr.roughnessFactor ?? 0.9;
        attached++;
      }
      stillUnmatched.length = 0;
    }
  }

  // Third pass: shared-atlas fallback. If exactly one image is in the search
  // dirs, every still-unmatched material gets it.
  if (stillUnmatched.length > 0 && imageIndex.size === 1) {
    const lonePath = imageIndex.values().next().value!;
    for (const idx of stillUnmatched) {
      const m = materials[idx]!;
      const texIdx = await embedAndAttach(
        gltf,
        lonePath,
        embedded,
        "atlas",
        (newBin) => {
          bin = newBin;
        },
        bin,
      );
      m.pbrMetallicRoughness ??= {};
      const pbr = m.pbrMetallicRoughness;
      pbr.baseColorTexture = { index: texIdx };
      pbr.baseColorFactor = [1.0, 1.0, 1.0, 1.0];
      pbr.metallicFactor = pbr.metallicFactor ?? 0.0;
      pbr.roughnessFactor = pbr.roughnessFactor ?? 0.9;
      attached++;
    }
  }

  if (attached === 0) return 0;
  await writeGlb(glbPath, gltf, bin);
  return attached;
}

// Helper that embeds a file's bytes into the GLB binary chunk if not already
// embedded, and returns the texture index. Calls back with the updated BIN
// because Buffer is immutable and the caller needs to track the latest.
async function embedAndAttach(
  gltf: GltfJson,
  filePath: string,
  embedded: Map<string, number>,
  fallbackName: string,
  onBinUpdate: (bin: Buffer) => void,
  currentBin: Buffer | null,
): Promise<number> {
  const cached = embedded.get(filePath);
  if (cached !== undefined) return cached;
  const bytes = await readFile(filePath);
  const mime = mimeForExtension(path.extname(filePath));
  const name = path.basename(filePath, path.extname(filePath)) || fallbackName;
  const { textureIndex, bin } = appendImageToBin(gltf, currentBin, bytes, mime, name);
  embedded.set(filePath, textureIndex);
  onBinUpdate(bin);
  return textureIndex;
}

// ---------------------------------------------------------------------------
// Stage 3: foliage alpha hints
//
// Materials whose names contain "leaves", "bush", etc. usually use a PNG
// with a hard-edge alpha cutout. Without alphaMode=MASK the leaf shapes
// render as opaque rectangles showing the PNG's transparent background.
// Apply the standard alpha-cutout settings; this only kicks in for materials
// that already have a baseColorTexture (otherwise there's nothing to mask).
// ---------------------------------------------------------------------------

export async function applyFoliageHints(glbPath: string): Promise<number> {
  let buf: Buffer;
  try {
    buf = await readFile(glbPath);
  } catch {
    return 0;
  }
  let parsed: { json: GltfJson; bin: Buffer | null };
  try {
    parsed = parseGlbMinimal(buf);
  } catch {
    return 0;
  }
  const { json: gltf, bin } = parsed;
  const materials: GltfJson[] = gltf.materials ?? [];
  if (materials.length === 0) return 0;

  let changed = 0;
  for (const m of materials) {
    if (!m.pbrMetallicRoughness?.baseColorTexture) continue;
    const name = (m.name ?? "").toLowerCase();
    if (!FOLIAGE_KEYWORDS.some((k) => name.includes(k))) continue;
    if (m.alphaMode === "MASK" && m.doubleSided === true) continue; // already set
    m.alphaMode = "MASK";
    m.alphaCutoff = m.alphaCutoff ?? 0.5;
    m.doubleSided = true;
    changed++;
  }
  if (changed === 0) return 0;
  await writeGlb(glbPath, gltf, bin);
  return changed;
}

// ---------------------------------------------------------------------------
// Stage 4: material colors from JSON
//
// JSON shape (output of scripts/blender/extract-material-colors.py):
//
//   {
//     "<glb_stem>": {
//       "<material_name>": { "color": [r, g, b, a], "source": "principled" }
//     }
//   }
//
// Or a flat single-pack form (no per-stem nesting):
//
//   {
//     "<material_name>": { "color": [r, g, b, a] }
//   }
//
// Materials whose name matches get baseColorFactor replaced. Skipped if the
// material already has a non-default color (won't clobber real data).
// ---------------------------------------------------------------------------

type ColorEntry = { color: number[]; source?: string };
type ColorsManifest = Record<string, Record<string, ColorEntry> | ColorEntry>;

// fbx2gltf / obj2gltf both emit baseColorFactor 0.8/0.8/0.8/1.0 when no color
// is bound. The float32 round-trip means we can't compare against exact 0.8.
function isDefaultGrey(c: number[] | undefined): boolean {
  if (!c) return true;
  if (c.length < 3) return true;
  return (
    Math.abs(c[0]! - 0.8) < 1e-3 &&
    Math.abs(c[1]! - 0.8) < 1e-3 &&
    Math.abs(c[2]! - 0.8) < 1e-3 &&
    (c.length < 4 || Math.abs(c[3]! - 1.0) < 1e-3)
  );
}

function findColorForMaterial(name: string, map: Record<string, ColorEntry>): number[] | null {
  const direct = map[name];
  if (direct) return direct.color;
  const normTarget = normalizeName(name);
  for (const [k, v] of Object.entries(map)) {
    if (normalizeName(k) === normTarget) return v.color;
  }
  return null;
}

export async function applyMaterialColors(
  glbPath: string,
  manifest: ColorsManifest,
): Promise<number> {
  let buf: Buffer;
  try {
    buf = await readFile(glbPath);
  } catch {
    return 0;
  }
  let parsed: { json: GltfJson; bin: Buffer | null };
  try {
    parsed = parseGlbMinimal(buf);
  } catch {
    return 0;
  }
  const { json: gltf, bin } = parsed;
  const materials: GltfJson[] = gltf.materials ?? [];
  if (materials.length === 0) return 0;

  // Resolve which sub-map applies to this GLB.
  const stem = path.basename(glbPath, path.extname(glbPath));
  let colorMap: Record<string, ColorEntry> | null = null;
  const stemEntry = manifest[stem] ?? manifest[normalizeName(stem)];
  if (stemEntry && !("color" in stemEntry)) {
    colorMap = stemEntry as Record<string, ColorEntry>;
  } else {
    // Fallback: try a normalized-stem key search.
    for (const [k, v] of Object.entries(manifest)) {
      if (normalizeName(k) === normalizeName(stem) && !("color" in v)) {
        colorMap = v as Record<string, ColorEntry>;
        break;
      }
    }
    // Final fallback: maybe the manifest is flat (no stem nesting).
    if (!colorMap) {
      const anyHasColor = Object.values(manifest).some((v) => v && "color" in v);
      if (anyHasColor) colorMap = manifest as Record<string, ColorEntry>;
    }
  }
  if (!colorMap) return 0;

  let changed = 0;
  for (const m of materials) {
    const name = m.name ?? "";
    const color = findColorForMaterial(name, colorMap);
    if (!color) continue;
    m.pbrMetallicRoughness ??= {};
    const pbr = m.pbrMetallicRoughness;
    // Don't clobber a real, non-default color the converter already produced.
    if (!isDefaultGrey(pbr.baseColorFactor)) continue;
    pbr.baseColorFactor = color;
    pbr.metallicFactor = pbr.metallicFactor ?? 0.0;
    pbr.roughnessFactor = pbr.roughnessFactor ?? 0.9;
    changed++;
  }
  if (changed === 0) return 0;
  await writeGlb(glbPath, gltf, bin);
  return changed;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export type PostProcessOptions = {
  recoverTextures?: boolean; // default true; covers stages 1+2+3
  texturesDir?: string; // additional dir to scan for textures
  materialColors?: ColorsManifest; // already-parsed manifest
};

export type PostProcessResult = {
  placeholdersRecovered: number;
  texturesSeeded: number;
  foliageHinted: number;
  colorsApplied: number;
};

export async function postProcessGlb(
  glbPath: string,
  sourcePath: string,
  opts: PostProcessOptions,
): Promise<PostProcessResult> {
  const recoverTextures = opts.recoverTextures !== false;
  const extraDirs = opts.texturesDir ? [path.resolve(opts.texturesDir)] : [];
  const result: PostProcessResult = {
    placeholdersRecovered: 0,
    texturesSeeded: 0,
    foliageHinted: 0,
    colorsApplied: 0,
  };

  if (recoverTextures) {
    result.placeholdersRecovered = await recoverFbxPlaceholders(glbPath, sourcePath, extraDirs);
    const sourceStem = path.basename(sourcePath, path.extname(sourcePath));
    result.texturesSeeded = await seedMissingTextures(
      glbPath,
      path.dirname(sourcePath),
      extraDirs,
      sourceStem,
    );
    result.foliageHinted = await applyFoliageHints(glbPath);
  }

  if (opts.materialColors) {
    result.colorsApplied = await applyMaterialColors(glbPath, opts.materialColors);
  }

  return result;
}

// ---------------------------------------------------------------------------
// GLB writer
//
// Two paths:
//   - Fast path: build the GLB ourselves when no images point at our patched
//     `extras._pipeline.source` (i.e. all images are bufferView-backed and we
//     have a coherent BIN to round-trip).
//   - Re-encode path: when we patched images via `extras._pipeline.source`
//     (placeholder recovery), defer to gltf-pipeline so it re-merges buffer
//     views correctly.
// ---------------------------------------------------------------------------

async function writeGlb(glbPath: string, gltf: GltfJson, bin: Buffer | null): Promise<void> {
  const usesPipelineExtras = (gltf.images ?? []).some(
    (img: GltfImage) => img.extras?._pipeline?.source,
  );

  if (usesPipelineExtras) {
    if (!Array.isArray(gltf.buffers)) gltf.buffers = [];
    if (!Array.isArray(gltf.bufferViews)) gltf.bufferViews = [];
    if (bin && gltf.buffers.length > 0) {
      gltf.buffers[0].extras = gltf.buffers[0].extras ?? {};
      gltf.buffers[0].extras._pipeline = gltf.buffers[0].extras._pipeline ?? {};
      gltf.buffers[0].extras._pipeline.source = bin;
    }
    const result = await gltfToGlb(gltf);
    await writeFile(glbPath, result.glb);
    return;
  }

  // Direct GLB serializer — preserves any in-place mutation of the BIN.
  const jsonStr = JSON.stringify(gltf);
  let jsonBuf = Buffer.from(jsonStr, "utf8");
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);

  let binBuf: Buffer | null = bin;
  if (binBuf) {
    const binPad = (4 - (binBuf.length % 4)) % 4;
    if (binPad) binBuf = Buffer.concat([binBuf, Buffer.alloc(binPad, 0)]);
  }

  const totalLength = 12 + 8 + jsonBuf.length + (binBuf ? 8 + binBuf.length : 0);
  const out = Buffer.alloc(totalLength);
  let off = 0;
  out.writeUInt32LE(GLB_MAGIC, off);
  off += 4;
  out.writeUInt32LE(2, off);
  off += 4;
  out.writeUInt32LE(totalLength, off);
  off += 4;
  out.writeUInt32LE(jsonBuf.length, off);
  off += 4;
  out.writeUInt32LE(GLB_JSON, off);
  off += 4;
  jsonBuf.copy(out, off);
  off += jsonBuf.length;
  if (binBuf) {
    out.writeUInt32LE(binBuf.length, off);
    off += 4;
    out.writeUInt32LE(GLB_BIN, off);
    off += 4;
    binBuf.copy(out, off);
  }
  await writeFile(glbPath, out);
}

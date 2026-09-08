// ---------------------------------------------------------------------------
// Stage 1 (placeholder recovery) + Stage 2 (missing-texture seeding).
//
//   1. recoverFbxPlaceholders — swap 1×1 magenta placeholders (baked by
//      fbx2gltf when it can't resolve an external path) for real sibling
//      images, matched by filename + texture-slot heuristics.
//   2. seedMissingTextures    — for materials with UVs but no baseColorTexture,
//      find an image in the source/sibling dirs whose normalized stem matches
//      the material (or source-file) name and embed it as baseColorTexture.
// ---------------------------------------------------------------------------

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  appendImageToBin,
  getImageBytes,
  isPlaceholderPng,
  mimeForExtension,
  parseGlbMinimal,
  writeGlb,
} from "./glb-binary.js";
import type {
  GltfImage,
  GltfJson,
  GltfMaterial,
  GltfTextureRef,
  TextureSlot,
} from "./gltf-types.js";
import { isImageCandidate, normalizeName } from "./names.js";

const COMMON_TEXTURE_DIRS = ["Textures", "textures", "Texture", "texture", "tex", "Materials"];

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

function detectImageSlot(gltf: GltfJson, imageIdx: number): TextureSlot | null {
  const textures = gltf.textures ?? [];
  const texturesUsingImage = new Set<number>();
  for (let ti = 0; ti < textures.length; ti++) {
    if (textures[ti]?.source === imageIdx) texturesUsingImage.add(ti);
  }
  if (texturesUsingImage.size === 0) return null;
  const hits = (ref: GltfTextureRef | undefined) =>
    ref !== undefined && texturesUsingImage.has(ref.index);
  const materials = gltf.materials ?? [];
  for (const mat of materials) {
    const pbr = mat.pbrMetallicRoughness ?? {};
    if (hits(pbr.baseColorTexture)) return "baseColor";
    if (hits(pbr.metallicRoughnessTexture)) return "metallicRoughness";
    if (hits(mat.normalTexture)) return "normal";
    if (hits(mat.occlusionTexture)) return "occlusion";
    if (hits(mat.emissiveTexture)) return "emissive";
  }
  return null;
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
    const candidates = entries.filter(isImageCandidate);

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
// Three passes:
//   - per-material match: "Banner" -> "Banner.png" / "BannerTexture.png"
//   - source-stem fallback: score every image against the source-file stem.
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
      if (!isImageCandidate(name)) continue;
      const stem = path.basename(name, path.extname(name));
      const norm = normalizeName(stem);
      // First-found wins so the source-dir match beats a sibling-dir match
      // when names collide.
      if (!index.has(norm)) index.set(norm, path.join(dir, name));
    }
  }
  return index;
}

// Score tiers for matching a source-file stem against a candidate image
// stem. Higher = stronger match. MIN_ACCEPTED is the threshold used by
// pickBestStemMatch — anything below is treated as "no match".
const SCORE_EXACT = 100; // "Pizza" / "Pizza"
const SCORE_SUFFIX_TEXTURE = 90; // "Pizza" / "PizzaTexture"
const SCORE_SUFFIX_ALPHA = 80; // "Pizza" / "PizzaAlbedo"
const SCORE_SUFFIX_MIXED = 60; // "Pizza" / "PizzaAlt2"
const SCORE_SUFFIX_DIGITS = 30; // "Pizza" / "Pizza2"
const SCORE_BARE_SUFFIX_TEXTURE = 55; // "Donut2" → "Donut" / "DonutTexture"
const SCORE_BARE_SUFFIX_ALPHA = 50; // "Donut2" → "Donut" / "DonutAlbedo"
const SCORE_BARE_SUFFIX_DIGITS = 20;
const SCORE_REVERSE_INCLUDES = 25; // "CupcakeCherry" / "Cupcake" or "BigTree" / "Tree"
const SCORE_LOOSE_CONTAINS = 10;
const REVERSE_MIN_IMAGE_STEM_LENGTH = 4;
const SCORE_MIN_ACCEPTED = 10;

// Score how well an image's normalized stem matches a source-file stem.
// Returns 0 when there's no relationship at all. Quaternius-style packs
// suffix textures with "texture" (e.g. SodaTexture.png alongside Soda.fbx),
// so prefer that convention to break ties between sibling models.
function scoreStemMatch(sourceStem: string, imageStem: string): number {
  if (!sourceStem || !imageStem) return 0;
  if (sourceStem === imageStem) return SCORE_EXACT;
  if (imageStem.startsWith(sourceStem)) {
    const suffix = imageStem.slice(sourceStem.length);
    if (suffix === "texture") return SCORE_SUFFIX_TEXTURE;
    if (/^[a-z]+$/.test(suffix)) return SCORE_SUFFIX_ALPHA;
    if (/^[a-z]/.test(suffix)) return SCORE_SUFFIX_MIXED;
    return SCORE_SUFFIX_DIGITS;
  }
  // "Donut2" → "Donut" + trailing digit. Try the bare stem.
  const bare = sourceStem.replace(/\d+$/, "");
  if (bare && bare !== sourceStem && imageStem.startsWith(bare)) {
    const suffix = imageStem.slice(bare.length);
    if (suffix === "texture") return SCORE_BARE_SUFFIX_TEXTURE;
    if (/^[a-z]+$/.test(suffix)) return SCORE_BARE_SUFFIX_ALPHA;
    return SCORE_BARE_SUFFIX_DIGITS;
  }
  // Reverse: "CupcakeCherry" / "Cupcake" — source name extends a parent
  // image. "BigTree" / "Tree" — source name decorates a base image with a
  // size/state qualifier prefix.
  if (
    imageStem.length >= REVERSE_MIN_IMAGE_STEM_LENGTH &&
    (sourceStem.startsWith(imageStem) || sourceStem.endsWith(imageStem))
  ) {
    return SCORE_REVERSE_INCLUDES;
  }
  if (imageStem.includes(sourceStem)) return SCORE_LOOSE_CONTAINS;
  return 0;
}

// Tiebreak rule across all match passes: prefer shortest filename (most
// canonical — "Tree.png" beats "Tree_Bark.png" beats "Tree7_Variant.png"),
// then alphabetical. Stable across runs and prefers generic names.
function pickCanonical(paths: string[]): string {
  if (paths.length === 1) return paths[0]!;
  const sorted = [...paths].sort((a, b) => {
    const an = path.basename(a, path.extname(a));
    const bn = path.basename(b, path.extname(b));
    if (an.length !== bn.length) return an.length - bn.length;
    return an.localeCompare(bn);
  });
  return sorted[0]!;
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
  if (bestPaths.length === 0 || bestScore < SCORE_MIN_ACCEPTED) return null;
  return pickCanonical(bestPaths);
}

function findImagesByPattern(
  imageIndex: Map<string, string>,
  predicate: (key: string) => boolean,
): string | null {
  const hits: string[] = [];
  for (const [k, v] of imageIndex) {
    if (predicate(k)) hits.push(v);
  }
  if (hits.length === 0) return null;
  return pickCanonical(hits);
}

// Initialize the baseColor side of a material's PBR block when seeding a
// recovered texture. Leaves an existing metallic/roughness untouched.
function attachBaseColorTexture(mat: GltfMaterial, textureIndex: number): void {
  mat.pbrMetallicRoughness ??= {};
  const pbr = mat.pbrMetallicRoughness;
  pbr.baseColorTexture = { index: textureIndex };
  pbr.baseColorFactor = [1.0, 1.0, 1.0, 1.0];
  pbr.metallicFactor = pbr.metallicFactor ?? 0.0;
  pbr.roughnessFactor = pbr.roughnessFactor ?? 0.9;
}

// Find an image whose normalized stem matches a material name via "prefix +
// alpha tag" (e.g. material "Birch_Leaves" hits image "Birch_Leaves_Green")
// or "alpha tag + suffix" (e.g. material "Bark" hits image "Tree_Bark").
function findMaterialAdjacentImage(
  imageIndex: Map<string, string>,
  normMat: string,
): string | null {
  const longer = (k: string) => k.length > normMat.length;
  const tail = (k: string) => k.slice(normMat.length);
  const head = (k: string) => k.slice(0, k.length - normMat.length);

  return (
    findImagesByPattern(
      imageIndex,
      (k) => longer(k) && k.startsWith(normMat) && /^[a-z]+$/.test(tail(k)),
    ) ??
    findImagesByPattern(
      imageIndex,
      (k) => longer(k) && k.endsWith(normMat) && /^[a-z]+$/.test(head(k)),
    )
  );
}

type BinState = { bin: Buffer | null };

// Mutable holder so callers can pass `state` once and let helpers update the
// growing BIN buffer in-place. Buffer is immutable so each append produces a
// new instance — the state shim avoids threading callbacks through every call
// site.
async function embedAndAttach(
  gltf: GltfJson,
  filePath: string,
  embedded: Map<string, number>,
  fallbackName: string,
  state: BinState,
): Promise<number> {
  const cached = embedded.get(filePath);
  if (cached !== undefined) return cached;
  const bytes = await readFile(filePath);
  const mime = mimeForExtension(path.extname(filePath));
  const name = path.basename(filePath, path.extname(filePath)) || fallbackName;
  const { textureIndex, bin } = appendImageToBin(gltf, state.bin, bytes, mime, name);
  embedded.set(filePath, textureIndex);
  state.bin = bin;
  return textureIndex;
}

// Per-material match. Tries (in order):
//   1. exact         material name == image stem
//   2. composite     "<sourceStemPrefix>_<material>" (Tree_1.fbx + "Bark" -> Tree_Bark)
//   3. material-adjacent (suffix/inverse alpha-tag patterns)
async function matchPerMaterial(
  gltf: GltfJson,
  needsTexture: number[],
  imageIndex: Map<string, string>,
  stemPrefix: string,
  embedded: Map<string, number>,
  state: BinState,
): Promise<{ attached: number; unmatched: number[] }> {
  const materials = gltf.materials ?? [];
  const unmatched: number[] = [];
  let attached = 0;

  for (const idx of needsTexture) {
    const m = materials[idx]!;
    const name = m.name ?? "";
    const normMat = normalizeName(name);
    if (!normMat) {
      unmatched.push(idx);
      continue;
    }

    let hit: string | null | undefined = imageIndex.get(normMat);
    if (!hit && stemPrefix) {
      hit = imageIndex.get(normalizeName(`${stemPrefix}_${name}`));
    }
    if (!hit) hit = findMaterialAdjacentImage(imageIndex, normMat);

    if (!hit) {
      unmatched.push(idx);
      continue;
    }

    const texIdx = await embedAndAttach(gltf, hit, embedded, name, state);
    attachBaseColorTexture(m, texIdx);
    attached++;
  }

  return { attached, unmatched };
}

// Apply one resolved image to every material in `materialIndices`, embedding
// it once and reusing the texture index. Used by the source-stem and
// shared-atlas fallback passes.
async function attachImageToMaterials(
  gltf: GltfJson,
  imagePath: string,
  materialIndices: number[],
  fallbackName: string,
  embedded: Map<string, number>,
  state: BinState,
): Promise<number> {
  const materials = gltf.materials ?? [];
  for (const idx of materialIndices) {
    const texIdx = await embedAndAttach(gltf, imagePath, embedded, fallbackName, state);
    attachBaseColorTexture(materials[idx]!, texIdx);
  }
  return materialIndices.length;
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
  const state: BinState = { bin: parsed.bin };
  const materials = gltf.materials ?? [];
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
  const stemPrefix = sourceStem ? sourceStem.replace(/[_-]?\d+$/, "") : "";

  // Pass 1: per-material name match (exact / composite / material-adjacent).
  const pass1 = await matchPerMaterial(gltf, needsTexture, imageIndex, stemPrefix, embedded, state);
  let attached = pass1.attached;
  let unmatched = pass1.unmatched;

  // Pass 2: source-stem fallback. Quaternius-style packs often have generic
  // material names ("Material") but encode the model name in the texture
  // filename ("BurgerTexture.png" for Burger.fbx). Score every image against
  // the source stem and use the unambiguous winner for all stragglers.
  if (unmatched.length > 0 && sourceStem) {
    const stemHit = pickBestStemMatch(sourceStem, imageIndex);
    if (stemHit) {
      attached += await attachImageToMaterials(
        gltf,
        stemHit,
        unmatched,
        sourceStem,
        embedded,
        state,
      );
      unmatched = [];
    }
  }

  // Pass 3: shared-atlas fallback. If exactly one image is in the search
  // dirs, every still-unmatched material gets it.
  if (unmatched.length > 0 && imageIndex.size === 1) {
    const atlasPath = imageIndex.values().next().value!;
    attached += await attachImageToMaterials(gltf, atlasPath, unmatched, "atlas", embedded, state);
  }

  if (attached === 0) return 0;
  await writeGlb(glbPath, gltf, state.bin);
  return attached;
}

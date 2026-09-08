// ---------------------------------------------------------------------------
// Stage 3 (foliage alpha hints) + Stage 4 (material colors from JSON).
//
//   3. applyFoliageHints  — alphaMode=MASK + doubleSided for leaf/petal/etc.
//      materials so PNG cutouts render correctly instead of as opaque quads.
//   4. applyMaterialColors — apply a baseColorFactor map (extracted from the
//      original .blend) to materials that lost their diffuse color.
// ---------------------------------------------------------------------------

import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseGlbMinimal, writeGlb } from "./glb-binary.js";
import type { GltfJson } from "./gltf-types.js";
import { normalizeName } from "./names.js";

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
  const materials = gltf.materials ?? [];
  if (materials.length === 0) return 0;

  const FOLIAGE_ALPHA_CUTOFF = 0.5;
  let changed = 0;
  for (const m of materials) {
    if (!m.pbrMetallicRoughness?.baseColorTexture) continue;
    const name = (m.name ?? "").toLowerCase();
    if (!FOLIAGE_KEYWORDS.some((k) => name.includes(k))) continue;
    const alphaCutoffOk = m.alphaCutoff !== undefined;
    if (m.alphaMode === "MASK" && m.doubleSided === true && alphaCutoffOk) continue;
    m.alphaMode = "MASK";
    m.alphaCutoff = m.alphaCutoff ?? FOLIAGE_ALPHA_CUTOFF;
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

export type ColorEntry = { color: number[]; source?: string };
export type ColorsManifest = Record<string, Record<string, ColorEntry> | ColorEntry>;

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
  const materials = gltf.materials ?? [];
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

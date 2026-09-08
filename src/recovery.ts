// ---------------------------------------------------------------------------
// GLB post-processing — texture and material recovery (public barrel).
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
// The pipeline runs four idempotent, no-op-when-nothing-to-do stages, split
// across sibling modules:
//
//   1. recoverFbxPlaceholders — swap 1×1 placeholders for real images.  (textures)
//   2. seedMissingTextures    — attach textures from sibling dirs by name. (textures)
//   3. applyFoliageHints      — alphaMode=MASK + doubleSided for leaves.  (materials)
//   4. applyMaterialColors    — apply baseColorFactor map from JSON.      (materials)
//
// `postProcessGlb` orchestrates all four.
// ---------------------------------------------------------------------------

import path from "node:path";
import {
  applyFoliageHints,
  applyMaterialColors,
  type ColorsManifest,
} from "./recovery/materials.js";
import { recoverFbxPlaceholders, seedMissingTextures } from "./recovery/textures.js";

export { parseGlbMinimal } from "./recovery/glb-binary.js";
// Re-export the public API so importers (converters.ts, tests) keep resolving
// against ./recovery.js.
export type { GltfJson, TextureSlot } from "./recovery/gltf-types.js";
export type { ColorEntry, ColorsManifest } from "./recovery/materials.js";
export { applyFoliageHints, applyMaterialColors } from "./recovery/materials.js";
export {
  recoverFbxPlaceholders,
  recoverFbxTextures,
  seedMissingTextures,
} from "./recovery/textures.js";

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

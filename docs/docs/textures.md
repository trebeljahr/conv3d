---
sidebar_position: 6
title: FBX texture recovery
---

# FBX texture recovery

When you convert an FBX file with conv3d, you'll sometimes see a line like:

```
✨ Recovered 4 external texture(s)
```

This page explains what that means and why it matters.

## The problem

Lots of freely-distributed FBX packs (Kenney's KAYKIT, Synty bundles, archived Mixamo rigs) record their texture paths as absolute Windows paths:

```
C:\Files\Work\KAYKIT\barbarian\textures\barbarian_color.png
```

When you run `fbx2gltf` on Linux or macOS, the FBX SDK can't find that path. Worse, it doesn't fall back to looking for the basename (`barbarian_color.png`) **next to the FBX**. Instead, it silently bakes a **1×1 magenta placeholder** into the resulting `.glb` and moves on.

You don't notice until you load the model in three.js and see a solid pink mesh. By then the original texture isn't even on disk inside the `.glb` anymore — it's been replaced with a 1×1 PNG.

If you then run conv3d's `--optimize` pass on top, the palette merge step happily turns that 1×1 placeholder into a single-pixel atlas, and the texture is gone for good.

## What conv3d does

After every FBX conversion, conv3d:

1. **Scans the output GLB** for textures whose embedded PNG decodes to a 1×1 image.
2. **Looks at the texture's material slot** (`baseColor`, `normal`, `metallicRoughness`, `emissive`, …) to decide what kind of texture is missing.
3. **Searches the FBX's directory** (and common siblings: `Textures/`, `textures/`, `tex/`, `Materials/`) for a file whose name matches the slot.
4. **Replaces the placeholder bytes** in the `.glb` with the recovered file's bytes.

The search is heuristic-driven — it matches naming conventions like `*_color.png`, `*_normal.png`, `*_roughness.png`, etc. — and biased toward the textures the FBX actually wanted (it looks at the original texture filenames it parsed out of the FBX, even though it couldn't load them at conversion time).

The result: your `.glb` ends up with the real textures embedded, and downstream tools (gltfjsx, the `--optimize` pass) see them and act accordingly.

## Foliage hints

A common subset of "recovered" textures is the foliage / alpha-cut category. conv3d also seeds an `alphaMode: "MASK"` hint on materials whose recovered baseColor texture has substantial transparency — so three.js renders the leaves with proper alpha cutoff rather than as a flat opaque billboard.

## Material color manifests

For projects where the FBX baked colors as `baseColorFactor` rather than textures (and Blender exported them differently than expected), you can pass:

```bash
conv3d bulk ./models -m FBX --material-colors ./colors.json -y
```

The JSON should map material names to baseColor RGB(A) values:

```json
{
  "barbarian_skin": [0.86, 0.65, 0.45, 1],
  "barbarian_armor": [0.18, 0.18, 0.22, 1]
}
```

There's a Blender script under `scripts/blender/extract-material-colors.py` in the repo that produces a manifest in exactly this shape from a `.blend` file.

## Turning it off

Texture recovery runs by default. To opt out — say, you intentionally want the magenta placeholders for debugging:

```bash
conv3d bulk ./models -m FBX --no-recover-textures -y
```

## Pointing at an extra textures directory

If your textures live somewhere unusual — say, a `shared-textures/` folder at the project root — point conv3d at it:

```bash
conv3d bulk ./models -m FBX --textures-dir ./shared-textures -y
```

conv3d will scan that directory in addition to the FBX's own neighbours.

## What conv3d will not do

- **Re-bake materials from scratch.** If a material in the FBX doesn't reference any texture (just a `baseColorFactor`), conv3d won't invent one.
- **Recover audio, animations, or rigging metadata.** Texture recovery is strictly about the `images[]` array of the resulting glTF.
- **Touch GLBs that didn't come from FBX.** OBJ and glTF inputs don't have this Windows-path problem, so the recovery pass is skipped.

"""
Dump per-material baseColor from each .blend in a directory to a JSON manifest
that conv3d can apply via `conv3d ... --material-colors <out.json>`.

Useful for old packs whose FBX exports lost per-material diffuse colors. We
look in the Blender shader node tree (Principled BSDF base color, then
Diffuse BSDF color) before falling back to the modern `diffuse_color` slot.

Usage:
  blender --background --python extract-material-colors.py -- <blend_dir> <out_json>

Output shape:
  {
    "<blend_stem>": {
      "<material_name>": { "color": [r, g, b, a], "source": "principled" }
    }
  }
"""
import bpy
import json
import sys
from pathlib import Path


def color_from_material(m):
    """Return (source_label, [r, g, b, a]) for the first reliable color we find."""
    if m.use_nodes and m.node_tree:
        for node in m.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                base = node.inputs.get("Base Color")
                if base and not base.is_linked:
                    return ("principled", list(base.default_value))
            if node.type == "BSDF_DIFFUSE":
                color = node.inputs.get("Color")
                if color and not color.is_linked:
                    return ("diffuse_node", list(color.default_value))
            if node.type == "TEX_IMAGE" and node.image:
                img = node.image
                if img.pixels and len(img.pixels) >= 4:
                    px = img.pixels[:4]
                    return ("image_first_pixel", [px[0], px[1], px[2], px[3]])
    return ("diffuse_color", list(m.diffuse_color))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(argv) != 2:
        print("usage: blender --background --python extract-material-colors.py -- <blend_dir> <out_json>")
        sys.exit(1)
    blends_dir = Path(argv[0])
    out_path = Path(argv[1])

    if not blends_dir.exists():
        print(f"blend dir not found: {blends_dir}")
        sys.exit(1)

    result = {}
    for blend in sorted(blends_dir.glob("*.blend")):
        bpy.ops.wm.open_mainfile(filepath=str(blend))
        mats = {}
        for m in bpy.data.materials:
            source, color = color_from_material(m)
            mats[m.name] = {"source": source, "color": color}
        # GLB filenames have no spaces; .blend filenames sometimes do.
        key = blend.stem.replace(" ", "")
        result[key] = mats
        print(f"[{key}] {len(mats)} mats")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2))
    print(f"wrote {out_path}")


main()

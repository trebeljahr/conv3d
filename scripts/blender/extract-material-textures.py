"""
Walk each .blend in a directory and record the texture image filename used by
its materials. Useful when an FBX export dropped texture bindings but the
.blend still has the proper image references.

The output is a JSON manifest you can feed back to your own pipeline; conv3d
itself doesn't need it (it auto-discovers textures by material name from
sibling Textures/ folders), but this is helpful when material names and
texture filenames don't match cleanly.

Usage:
  blender --background --python extract-material-textures.py -- <blend_dir> <out_json>

Output shape:
  {
    "<blend_stem>": {
      "materials": { "<material_name>": ["candidate1.png", "candidate2.png"] },
      "all": ["candidate1.png", "candidate2.png"]
    }
  }
"""
import bpy
import json
import sys
from pathlib import Path


def texture_for(m):
    """Return candidate image filenames used by this material, in priority order."""
    if not (m.use_nodes and m.node_tree):
        return []
    for node in m.node_tree.nodes:
        if node.type == "TEX_IMAGE" and node.image:
            candidates = []
            # 1. filepath_raw — most reliable when the image is on disk
            path = node.image.filepath_raw or node.image.filepath
            if path:
                candidates.append(Path(path).name)
            # 2. the image data-block name — sometimes matches a filename
            if node.image.name and node.image.name not in candidates:
                candidates.append(node.image.name)
                # Some Blender data-blocks lose the .png suffix
                if not Path(node.image.name).suffix:
                    candidates.append(node.image.name + ".png")
            return candidates
    return []


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(argv) != 2:
        print("usage: blender --background --python extract-material-textures.py -- <blend_dir> <out_json>")
        sys.exit(1)
    blends_dir = Path(argv[0])
    out_path = Path(argv[1])

    result = {}
    for blend in sorted(blends_dir.glob("*.blend")):
        bpy.ops.wm.open_mainfile(filepath=str(blend))
        per_mat: dict[str, list[str]] = {}
        all_textures: dict[str, None] = {}
        for m in bpy.data.materials:
            cands = texture_for(m)
            if cands:
                per_mat[m.name] = cands
                for t in cands:
                    all_textures.setdefault(t, None)
        key = blend.stem.replace(" ", "")
        result[key] = {
            "materials": per_mat,
            "all": list(all_textures.keys()),
        }
        print(f"[{key}] {len(per_mat)} materials with textures")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2))
    print(f"wrote {out_path}")


main()

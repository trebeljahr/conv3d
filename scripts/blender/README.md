# Blender sidecar scripts

These scripts run inside Blender (headless) to extract data that conv3d can't
recover from FBX/OBJ alone. They're optional — only useful when you have the
original `.blend` files alongside the FBX exports.

## When you need them

conv3d's built-in texture recovery handles most cases automatically:
- Replaces fbx2gltf's 1×1 magenta placeholders with real images.
- Seeds missing `baseColorTexture` bindings from sibling `Textures/` folders.
- Sets `alphaMode=MASK + doubleSided` on foliage materials.

But two failure modes need data only the `.blend` knows about:

1. **All materials end up default-grey.** The FBX exporter dropped per-material
   diffuse colors. The mesh names and material names survive, but every
   `baseColorFactor` is `0.8/0.8/0.8`.
2. **Material names don't match texture filenames.** conv3d's auto-seeding
   matches material name to image stem (normalized). If your material is
   "MyMat" but the texture is "diffuse_atlas.png", auto-seeding can't connect
   them.

## extract-material-colors.py

Walks each `.blend` in a directory and dumps per-material baseColor to JSON.
Looks at Principled BSDF, then Diffuse BSDF, then `material.diffuse_color`.

```sh
blender --background --python scripts/blender/extract-material-colors.py \
    -- /path/to/blends /tmp/colors.json
```

Then pass it to conv3d:

```sh
conv3d bulk /path/to/fbx --recursive -m FBX --tsx --optimize \
    --material-colors /tmp/colors.json -y
```

conv3d will apply each material's color from the manifest, but only when the
GLB material is still default-grey (won't clobber colors the converter
already produced).

## extract-material-textures.py

Walks each `.blend` and records the texture image filename used per material.
The output is a manifest you can feed to your own pipeline. conv3d itself
doesn't consume this directly today — it auto-discovers textures by material
name from sibling folders, which works for the common case.

```sh
blender --background --python scripts/blender/extract-material-textures.py \
    -- /path/to/blends /tmp/textures.json
```

## Why isn't this in conv3d itself?

Blender is a 400MB+ install with multi-second startup per file. Bundling it
into a Node CLI would be a footgun for the 95% of users who don't have
`.blend` files. Keeping these as opt-in sidecar scripts:

- Lets users without `.blend` files use conv3d normally.
- Keeps the conv3d package small and dependency-light.
- Makes the data extraction step explicit and inspectable.

The JSON manifest is the contract — anything that produces it works.

# Funnel Model Credits

Every model in this folder is by [Quaternius](https://quaternius.com) and is
released under CC0 1.0. Quaternius states "All models are under the CC0
License" on https://quaternius.com/faq.html, and each pack page below lists
CC0 (checked 2026-10-20). Attribution is not required; the docs site credits
Quaternius under the landing hero and under the KnightHelmet showcase.

| File | Pack | Pack page |
| --- | --- | --- |
| `AnimatedChest.glb` | RPG Essentials Pack (May 2017) | https://quaternius.com/packs/rpg.html |
| `KnightHelmet.glb` | RPG Essentials Pack (May 2017) | https://quaternius.com/packs/rpg.html |
| `Burger.glb` | Junk Food Pack (April 2017) | https://quaternius.com/packs/junkfood.html |
| `Cake.glb` | Junk Food Pack (April 2017) | https://quaternius.com/packs/junkfood.html |
| `Donut.glb` | Junk Food Pack (April 2017) | https://quaternius.com/packs/junkfood.html |
| `Hotdog.glb` | Junk Food Pack (April 2017) | https://quaternius.com/packs/junkfood.html |
| `Milkshake.glb` | Junk Food Pack (April 2017) | https://quaternius.com/packs/junkfood.html |
| `Pizza.glb` | Junk Food Pack (April 2017) | https://quaternius.com/packs/junkfood.html |
| `SodaCan.glb` | Junk Food Pack (April 2017) | https://quaternius.com/packs/junkfood.html |
| `ChairCushioned.glb` | Furniture Pack (October 2017) | https://quaternius.com/packs/furniture.html |
| `Lamp.glb` | Furniture Pack (October 2017) | https://quaternius.com/packs/furniture.html |
| `Plant.glb` | Furniture Pack (October 2017) | https://quaternius.com/packs/furniture.html |
| `Sofa.glb` | Furniture Pack (October 2017) | https://quaternius.com/packs/furniture.html |

Regenerated 2026-10-20 with conv3d 1a895cb, so Phong materials come out
non-metallic (they were metallic 0.4 before). Per pack, from the FBX files in
the author's local copy of these packs:

```sh
blender --background --python scripts/blender/extract-material-colors.py -- <pack blends dir> colors.json
conv3d bulk <fbx dir> -m FBX --no-tsx --optimize --keep-materials \
  --material-colors colors.json --textures-dir <pack textures dir> -y
```

The FBX files carry no diffuse colors, so the colors come from the pack's
`.blend` files. Each `<Name>-transformed.glb` is served here as `<Name>.glb`.
`SodaCan.glb` is not used by the hero today.

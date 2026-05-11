---
sidebar_position: 4
title: Output layout
---

# Output layout

How conv3d decides where to put converted files, and how to bend that to your project.

## Default — subdirectories under `_convert-3d-for-web`

By default every command writes into a single sibling folder:

```
<inputDir>/_convert-3d-for-web/
├── glb/          # converted .glb files (always)
├── tsx/          # React Three Fiber components (when --tsx)
└── glb-for-web/  # web-optimized .glb (when --optimize)
```

A typical run that produces all three artefacts:

```
raw-assets/
├── barbarian.fbx
├── knight.fbx
├── rogue.fbx
└── _convert-3d-for-web/
    ├── glb/
    │   ├── barbarian.glb
    │   ├── knight.glb
    │   └── rogue.glb
    ├── tsx/
    │   ├── Barbarian.tsx
    │   ├── Knight.tsx
    │   └── Rogue.tsx
    └── glb-for-web/
        ├── barbarian-transformed.glb
        ├── knight-transformed.glb
        └── rogue-transformed.glb
```

`_convert-3d-for-web` is just the default. Pass `-o <path>` to point everything somewhere else:

```bash
conv3d bulk ./raw-assets -m FBX --tsx --optimize -o ./public/models -y
```

The subdirectory shape stays the same — `./public/models/glb/`, `./public/models/tsx/`, `./public/models/glb-for-web/`.

## Flat output

If you don't want the subdirectories — for example, when pointing directly at a Next.js `public/` folder — pass `--flat`:

```bash
conv3d bulk ./raw-assets --flat -o ./public/models --tsx --optimize -y
```

Result:

```
public/models/
├── barbarian.glb
├── Barbarian.tsx
├── barbarian-transformed.glb
├── knight.glb
├── Knight.tsx
└── …
```

Use `--flat` only when you're sure the filenames don't collide.

## Per-bucket overrides

For finer control, override each subdirectory individually:

| Flag | Default | Routes |
|---|---|---|
| `--glb-dir <path>` | `<outputDir>/glb` | Converted `.glb` files. |
| `--tsx-dir <path>` | `<outputDir>/tsx` | Generated `.tsx` components. |
| `--optimized-dir <path>` | `<outputDir>/glb-for-web` | Web-optimized `.glb` files. |

```bash
conv3d bulk ./raw-assets -m FBX --tsx --optimize \
  --glb-dir ./public/models \
  --tsx-dir ./src/components/models \
  --optimized-dir ./public/models-web \
  -y
```

Each `--*-dir` is independent of `-o` and `--flat`. If you specify all three, `-o` becomes optional.

## Overwrite behaviour

When an output file already exists, conv3d decides what to do based on `--overwrite`:

| Mode | Effect |
|---|---|
| `ask` | Prompts before overwriting each existing file. **Default in interactive mode.** |
| `skip` | Leaves the existing file alone and counts it under `skipped[]`. **Default in non-interactive mode.** |
| `replace` | Overwrites every existing file. Same as `-f` / `--force-overwrite`. |

```bash
# Idempotent re-run — replaces stale outputs
conv3d bulk ./raw-assets -m FBX -y -f

# Same thing, explicit
conv3d bulk ./raw-assets -m FBX -y --overwrite=replace

# Quietly skip files that already converted
conv3d bulk ./raw-assets -m FBX -y --overwrite=skip
```

In `ask` mode conv3d serializes the run (`--concurrency 1`) so prompts don't interleave with progress output. Switch to a fixed mode if you want full parallelism.

## Where the JSON points

When you pass `--json`, the returned object lists every path conv3d touched:

```jsonc
{
  "converted":    ["/abs/.../glb/barbarian.glb"],
  "tsx":          ["/abs/.../tsx/Barbarian.tsx"],
  "glbOptimized": ["/abs/.../glb-for-web/barbarian-transformed.glb"],
  "skipped":      [],
  "errors":       []
}
```

Use `jq` (or any JSON parser) to pipe the paths into the next step of your build.

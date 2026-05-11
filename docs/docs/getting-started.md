---
sidebar_position: 2
title: Getting Started
---

# Getting Started

From nothing to your first converted model in three minutes.

## 1. Install

```bash
# global
npm install -g conv3d
conv3d --version

# or ad-hoc
npx conv3d --version
```

Requirements:

- **Node.js 24+** (older Node versions will refuse to install — `fbx2gltf` needs a modern runtime).
- macOS or Linux. Windows is unsupported because of `fbx2gltf` native binaries.

Verify the install:

```bash
conv3d doctor
```

You should see versions for Node, the platform, and the bundled converters (`obj2gltf`, `gltf-pipeline`, `fbx2gltf`, `gltfjsx`).

## 2. Convert a single file

The fastest way to see what conv3d does:

```bash
conv3d single ./character.fbx
```

You'll be prompted for the two optional steps:

1. **Create a `.tsx` component?** (runs `gltfjsx` against the converted `.glb`)
2. **Emit a web-optimized `.glb`?** (clamps textures, palettes untextured materials)

Skip the prompts by passing the flags upfront:

```bash
conv3d single ./character.fbx --tsx --optimize -y
```

Outputs land beside the input under `_convert-3d-for-web/`:

```
character.fbx
_convert-3d-for-web/
├── glb/character.glb
├── tsx/Character.tsx
└── glb-for-web/character-transformed.glb
```

## 3. Convert a folder

Most projects have a folder of source assets:

```bash
conv3d bulk ./raw-assets -r -m FBX --tsx --optimize -y
```

- `-r` recurses into subdirectories.
- `-m FBX` restricts to FBX files — also accepts `OBJ`, `GLTF`, or `ALL`.
- `-y` skips every prompt.

Use a glob when the files are scattered:

```bash
conv3d bulk "./assets/**/*.fbx" -o ./public/models --tsx --optimize -y
```

When the input is a glob, `-m` defaults to `ALL` and `-r` is implied.

## 4. Preview before writing

`--dry-run` prints the plan without creating anything:

```bash
conv3d bulk ./models -m ALL --tsx --optimize --dry-run
```

Combine with `--json` to feed the plan to another tool:

```bash
conv3d bulk ./models -m ALL --tsx --dry-run --json | jq '.converted[]'
```

## 5. Use it from a script or agent

```bash
conv3d bulk ./models -m ALL --tsx --optimize -y --json
```

- `-y` disables every prompt — required.
- `--json` emits a single result object on stdout. Stderr keeps the human-readable errors.
- The process exits `0` on success, `2` if some files failed (look at `errors[]` in the JSON), `1` on a fatal error.

See [Using conv3d from scripts & agents](./agents.md) for the full contract.

## Next

- [Commands reference](./commands.md) — every flag for every command.
- [Output layout](./output.md) — how to control where files land.
- [FBX texture recovery](./textures.md) — what those `✨ Recovered N external texture(s)` lines mean.

---
sidebar_position: 7
title: Architecture
---

# Architecture

A tour of what happens when you run a conv3d command, and how the pieces fit together.

## Repository layout

```
conv3d/
├─ src/
│  ├─ conv3d.ts            # entry point
│  ├─ program.ts           # commander setup, global flags, helpers
│  ├─ converters.ts        # the format-specific conversion runners
│  ├─ commands/
│  │  ├─ single.ts         # `conv3d single`
│  │  ├─ bulk.ts           # `conv3d bulk`
│  │  ├─ tsxGen.ts         # `conv3d tsx-gen`
│  │  └─ doctor.ts         # `conv3d doctor`
│  ├─ prompts.ts           # inquirer prompts for interactive mode
│  ├─ outputDirs.ts        # --flat / --*-dir / -o resolution
│  ├─ recovery.ts          # FBX texture recovery pass
│  ├─ log.ts               # stdout / stderr / --json discipline
│  └─ utils.ts             # shared helpers
├─ tests/                  # smoke tests against the compiled CLI
├─ patches/                # patch-package patches for upstream libs
├─ scripts/                # release prep, Blender helpers
└─ docs/                   # this Docusaurus site
```

## The conversion pipeline

For a single file (the `bulk` command runs this in parallel for each match):

```
input file
  └─> format-specific converter
        ├─ .obj  → obj2gltf       → in-memory glTF
        ├─ .fbx  → fbx2gltf       → glTF on disk in temp dir
        └─ .gltf → gltf-pipeline  → in-memory glTF
  └─> serialize as .glb
  └─> [if FBX] texture-recovery pass
  └─> [if --tsx] gltfjsx → .tsx
  └─> [if --optimize] gltfjsx --transform → web-optimized .glb
  └─> emit JSON record (or progress line) for this file
```

Key invariants:

- **`.glb` always lands first.** The other two artefacts are derived from the GLB, never from the raw input. This means `tsx-gen` can operate on already-converted GLBs interchangeably.
- **Texture recovery runs after conversion, before optimization.** Otherwise the optimizer would already have replaced the magenta placeholders with palette atlases.
- **The optimization pass is independent of TSX generation.** You can request either, both, or neither.

## Configuration surface

Three layers, in order of precedence (highest first):

1. **CLI flags** — every option on the `program.ts` definition. Most have a `--no-…` counterpart that explicitly opts out.
2. **Inferred non-interactive mode** — when stdin is not a TTY (CI, pipes), the CLI flips to `--yes` semantics automatically.
3. **Interactive prompts** — fill in anything not yet decided. Only run when stdin is a TTY and `--yes` wasn't passed.

The result is a single resolved configuration object threaded through the converter for that file.

## Concurrency model

- Default: `min(cpus, 4)` files converted in parallel.
- Overrideable per-run with `-c <n>`.
- Falls back to `1` when the overwrite mode is `ask` — otherwise prompts would interleave with progress output and chaos ensues.

Each parallel slot runs the **full** sub-pipeline (convert → recover → tsx → optimize) for its file. There's no shared state besides the output directories.

## Output discipline

- **stdout** is for the **result** — JSON in `--json` mode, progress text otherwise.
- **stderr** is for **warnings and errors** — including the ASCII banner.
- The banner is suppressed automatically when stdout is not a TTY, or when `--help` / `--version` / `--quiet` / `--json` is passed.

This split is what lets agents pipe stdout into `jq` without ever seeing decoration.

## Exit-code semantics

| Code | When |
|---|---|
| `0` | All requested conversions succeeded. **Includes "glob matched nothing"** — empty output is not an error. |
| `1` | Fatal: bad args, missing input, unsupported model type. No files were touched. |
| `2` | Partial success. `converted[]` lists what succeeded; `errors[]` lists what didn't. |

The split matters because agents can re-run on partial failure (`errors[]` is enough information to retry just the broken files), but should bail loudly on fatal errors.

## Testing

`npm test` builds the CLI and then runs Node's built-in test runner against the compiled JS (`tests/**/*.test.mjs`). The tests:

- Invoke the actual binary with `node ./dist/conv3d.js`.
- Verify exit codes for representative invocations (success, missing input, bad model type, partial failure).
- Check the shape of `--json` output against the documented schema.
- Run inside a temp dir so they're hermetic.

A pre-push git hook (`.githooks/pre-push`) runs `npm test`. `npm install` wires the hook via `core.hooksPath`.

## Why patches?

The `patches/` directory contains `patch-package` patches for upstream tools that don't quite behave the way conv3d needs:

- `fbx2gltf` — patched to write to the temp dir conv3d asks for rather than CWD-relative paths.
- `gltfjsx` — patched for API stability around the transform pipeline.

Patches are applied automatically by `npm install` via `postinstall: patch-package`.

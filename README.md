![banner image for conv3d](https://raw.githubusercontent.com/trebeljahr/conv3d/refs/heads/main/image.png)

# conv3d

A command-line tool for converting 3D models (GLTF, FBX, OBJ) into GLB and generating matching React Three Fiber components — so you can drop them into a react-three-fiber / three.js project without a round-trip through Blender.

- **Inputs:** `.fbx`, `.obj`, `.gltf` — directories, single files, or glob patterns
- **Outputs:** `.glb` (always), `.tsx` components (optional), web-optimized `.glb` (optional)
- **Works interactively** (prompts guide you) **or fully non-interactively** (`--yes`, `--json`, `--dry-run` — ideal for scripts, CI, and AI coding agents)
- **Parallel conversion** with a sensible default, tunable via `--concurrency`

## Installation

```bash
npm install -g conv3d
```

## Quick start

```bash
# One file, interactive
conv3d single ./character.fbx

# A folder of FBX files, fully non-interactive
conv3d bulk ./models --recursive -m FBX --tsx --optimize --yes

# Glob pattern — grab every FBX under ./assets
conv3d bulk "./assets/**/*.fbx" -o ./public/models --tsx --optimize --yes

# Preview the plan without touching disk, machine-readable
conv3d bulk ./models -m ALL --tsx --optimize --dry-run --json
```

## Commands

| Command   | What it does                                                       |
| --------- | ------------------------------------------------------------------ |
| `single`  | Convert a single `.fbx` / `.obj` / `.gltf` file to `.glb`          |
| `bulk`    | Convert every supported model in a directory or matching a glob    |
| `tsx-gen` | Run gltfjsx on existing `.glb` files to generate `.tsx` components |
| `doctor`  | Print environment + dependency diagnostics                         |

Each command (except `doctor`) accepts its input either **positionally** or via `-i`:

```bash
conv3d single ./model.fbx
conv3d single -i ./model.fbx             # equivalent
conv3d bulk   ./models
conv3d bulk   "./assets/**/*.fbx"        # glob
```

Run `conv3d <command> --help` for full options and examples.

## Output layout

By default, every command writes into `<inputDir>/_convert-3d-for-web/`:

```
_convert-3d-for-web/
├── glb/          # converted .glb files
├── tsx/          # React Three Fiber components (when --tsx)
└── glb-for-web/  # web-optimized .glb (when --optimize)
```

Override with `-o <outputDir>`. For a flat structure, use `--flat` (every output goes directly into `outputDir`), or override each subdir individually with `--glb-dir`, `--tsx-dir`, `--optimized-dir`.

## Global options

| Flag                              | Meaning                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| `--tsx` / `--no-tsx`              | Opt in / out of `.tsx` generation (otherwise you'll be prompted)                            |
| `--optimize` / `--no-optimize`    | Opt in / out of web-optimized `.glb` (otherwise you'll be prompted)                         |
| `--overwrite <skip\|replace\|ask>`| What to do when an output file already exists                                               |
| `-f, --force-overwrite`           | Shortcut for `--overwrite=replace`                                                          |
| `-y, --yes` / `--non-interactive` | Skip every prompt — required for scripts, CI, and agents                                    |
| `--dry-run`                       | Print the plan without creating or modifying anything                                       |
| `--json`                          | Emit a single JSON result object on **stdout**. Implies `--quiet`. Errors stay on stderr.   |
| `-q, --quiet`                     | Suppress progress output on stdout                                                          |
| `-c, --concurrency <n>`           | Convert N files in parallel (default: `min(cpus, 4)`, or 1 in interactive ask-mode)         |
| `--resolution <n>`                | Max texture resolution during `--optimize` (default `1024`; normals get `max(n, 2048)`)     |
| `--keep-materials`                | Skip the palette step during `--optimize`, preserving original materials                    |
| `--flat`                          | Write every output file directly into `outputDir` (no subdirectories)                       |
| `--glb-dir <path>`                | Override where converted `.glb` files go                                                    |
| `--tsx-dir <path>`                | Override where `.tsx` files go                                                              |
| `--optimized-dir <path>`          | Override where optimized `.glb` files go                                                    |
| `-V, --version`                   | Print the version                                                                           |
| `-h, --help`                      | Show help                                                                                   |

> **Note:** `--forceOverwrite` still works but is deprecated — prefer `--force-overwrite`, `-f`, or `--overwrite=replace`.

## Exit codes

| Code | Meaning                                                                     |
| ---- | --------------------------------------------------------------------------- |
| `0`  | Success (including "no matching files found" — safe for agent globs)        |
| `1`  | Fatal error (invalid args, missing input, etc.) — nothing was converted     |
| `2`  | Completed, but one or more files failed to convert — see `errors[]` in JSON |

## Command reference

### `conv3d single [path]`

Convert one file. Format is inferred from the extension.

```bash
conv3d single ./model.fbx                       # interactive
conv3d single ./model.fbx --tsx --optimize -y   # no prompts
conv3d single ./model.obj --no-tsx -y           # glb only
conv3d single ./model.fbx --tsx --dry-run --json
```

### `conv3d bulk [input]`

Convert every supported model in a directory, or every file matching a glob.

```bash
conv3d bulk ./models                                                # interactive
conv3d bulk ./models -r -m FBX --tsx --optimize -y                  # no prompts
conv3d bulk "./assets/**/*.fbx" -o ./public/models -y               # glob
conv3d bulk ./models --flat -o ./public/models --tsx -y             # flat output
conv3d bulk ./models -m ALL --tsx --optimize --dry-run --json       # preview
```

| Flag                     | Description                                                              |
| ------------------------ | ------------------------------------------------------------------------ |
| `[input]` (positional)   | Directory, file, or glob pattern (e.g. `./models/**/*.fbx`)              |
| `-i, --inputDir <path>`  | Same as positional form                                                  |
| `-o, --outputDir <path>` | Where to write outputs (default: `<inputDir>/_convert-3d-for-web`)       |
| `-m, --modelType <type>` | `GLTF` \| `FBX` \| `OBJ` \| `ALL` (required when `-y` in directory mode) |
| `-r, --recursive`        | Recurse into subdirectories (directory mode only; globs choose scope)    |

When the input is a glob, the file list comes from the matches (no `-r` needed) and `-m` defaults to `ALL`. When no matching models are found, `bulk` exits `0` with a warning.

### `conv3d tsx-gen [dir]`

Run gltfjsx over `.glb` files that are already converted.

```bash
conv3d tsx-gen ./models
conv3d tsx-gen ./models -r --optimize -y
conv3d tsx-gen ./models -r --force-overwrite -y
conv3d tsx-gen ./models --dry-run --json
```

### `conv3d doctor`

Print the versions of `conv3d`, Node, the platform, and the bundled conversion libraries. Useful for bug reports and for agents verifying install health.

```bash
conv3d doctor
conv3d doctor --json
```

## Using conv3d from a script or AI agent

conv3d is designed to be safe to call from automations:

1. **Always pass `-y`** (or `--non-interactive`) so no prompt ever blocks. Non-interactive mode is also inferred when stdin is not a TTY.
2. **Explicitly pass `--tsx` / `--no-tsx` and `--optimize` / `--no-optimize`** — in non-interactive mode the defaults are `--tsx --optimize`, but being explicit is clearer.
3. **For `bulk`, pass `-m`** in directory mode. In glob mode, `-m ALL` is the default.
4. **Pass `--json`** to get a machine-readable result object on stdout.
5. **Pass `--dry-run`** first to preview what would be written.
6. **Check the exit code**: `0` = success, `1` = fatal, `2` = partial (some files failed).
7. **Read the known output layout** — or pass `-o`, `--flat`, or the `--*-dir` flags for full control.

### JSON output schema

On success, stdout is a single JSON object:

```jsonc
{
  "command": "bulk",                 // "single" | "bulk" | "tsx-gen" | "doctor"
  "ok": true,                        // false when errors[] is non-empty
  "inputDir": "/abs/path/models",    // absolute input (single uses "inputPath")
  "outputDir": "/abs/path/models/_convert-3d-for-web",
  "dryRun": false,
  "modelType": "ALL",                // null / unset when n/a
  "converted": [                     // .glb paths (or planned paths in --dry-run)
    "/abs/.../glb/a.glb"
  ],
  "tsx": [                           // .tsx paths (empty if --no-tsx)
    "/abs/.../tsx/a.tsx"
  ],
  "glbOptimized": [                  // web-optimized .glb paths (empty if --no-optimize)
    "/abs/.../glb-for-web/a-transformed.glb"
  ],
  "skipped": [],                     // outputs skipped because they already existed
  "errors": []                       // { file, message } entries for per-file failures
}
```

On a fatal error the object is `{ "command": "...", "ok": false, "error": "..." }` and the process exits `1`. When per-file errors occurred the exit code is `2` and `errors[]` contains the details.

`--optimize` works independently of `--tsx`: you can emit web-optimized `.glb` files without generating React components, generate components without optimizing, or both together.

### Recipes

```bash
# Import FBX characters into a Next.js project, no subdirs
conv3d bulk ./raw-assets/characters \
  -o ./public/models --flat \
  -m FBX -r --tsx --optimize -y

# Every FBX under ./assets, no matter how nested
conv3d bulk "./assets/**/*.fbx" -o ./public/models --tsx --optimize -y

# Optimize only — produce web-ready .glb without generating React components
conv3d bulk ./models -m ALL --no-tsx --optimize -y

# Parse the result in an agent tool
conv3d bulk ./models -m ALL --tsx -y --json | jq '.converted[]'

# Sanity-check the environment
conv3d doctor --json | jq '.dependencies[] | select(.installed == null)'
```

### Notes for agents

- Progress on **stdout**; warnings and errors on **stderr**. In `--json` / `--quiet` mode, stdout is either empty or a single JSON object.
- The ASCII banner is suppressed automatically when stdout is not a TTY, and when `--help` / `--version` / `--quiet` / `--json` is passed.
- `figlet` and `lolcatjs` are optional dependencies — `npm install --omit=optional` still gives you a fully working CLI with no banner.
- File-exists conflicts default to `skip` in non-interactive mode; pass `--overwrite=replace` (or `-f`) for idempotent reruns.
- `--dry-run` never writes to disk (not even the output directories).

## Development

```bash
npm install
npm test              # build + run smoke tests against the compiled CLI
npm run build         # just tsc
```

A pre-push git hook (in `.githooks/pre-push`) runs `npm test` before every push. `npm install` wires the hook via `core.hooksPath`; skip it per-push with `git push --no-verify` if you really must.

## Releasing

```bash
npm run release          # patch bump (default)
npm run release:patch    # 1.0.5 → 1.0.6
npm run release:minor    # 1.0.5 → 1.1.0
npm run release:major    # 1.0.5 → 2.0.0
```

Each command: bumps the version (tagged commit), builds, runs tests, publishes to npm, pushes the tag to GitHub, and re-installs conv3d globally so your `PATH` matches what was just published.

## What's under the hood

- [obj2gltf](https://www.npmjs.com/package/obj2gltf) — OBJ → GLB
- [gltf-pipeline](https://www.npmjs.com/package/gltf-pipeline) — GLTF → GLB
- [fbx2gltf](https://www.npmjs.com/package/fbx2gltf) — FBX → GLTF
- [gltfjsx](https://www.npmjs.com/package/gltfjsx) — `.glb` → React component + web optimization
- [fast-glob](https://www.npmjs.com/package/fast-glob) — glob-pattern expansion

### FBX texture recovery

Many freely-distributed packs (Kenney's KAYKIT, etc.) record texture paths in their `.fbx` files as absolute Windows paths like `C:\Files\Work\...\barbarian_texture.png` — and the FBX SDK doesn't fall back to looking for the basename next to the `.fbx`. The result: `fbx2gltf` silently bakes a 1×1 magenta placeholder into the GLB, which then survives (or gets pruned to a solid color) by the optimization step.

After every FBX conversion, conv3d scans the output GLB for 1×1 placeholder PNGs. For each one it finds an image file in the FBX's directory that best matches the texture's slot (baseColor / normal / metallicRoughness / etc.) and replaces the placeholder bytes. You'll see a `✨ Recovered N external texture(s)` line per affected FBX.

CLI polish: [commander](https://www.npmjs.com/package/commander), [inquirer](https://www.npmjs.com/package/inquirer), [chalk](https://www.npmjs.com/package/chalk), [ora](https://www.npmjs.com/package/ora), [figlet](https://www.npmjs.com/package/figlet), [lolcatjs](https://www.npmjs.com/package/lolcatjs).

## License

MIT

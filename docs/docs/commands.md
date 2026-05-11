---
sidebar_position: 3
title: Commands
---

# Commands reference

Every conv3d command supports `--help` and respects the [global flags](#global-options).

| Command | What it does |
|---|---|
| [`single`](#conv3d-single-path) | Convert one `.fbx` / `.obj` / `.gltf` file to `.glb`. |
| [`bulk`](#conv3d-bulk-input) | Convert every supported model in a directory or matching a glob. |
| [`tsx-gen`](#conv3d-tsx-gen-dir) | Run `gltfjsx` over `.glb` files that already exist. |
| [`doctor`](#conv3d-doctor) | Print environment + dependency diagnostics. |

Each command (except `doctor`) accepts its input **positionally** or via `-i`:

```bash
conv3d single ./model.fbx
conv3d single -i ./model.fbx              # equivalent
conv3d bulk   ./models
conv3d bulk   "./assets/**/*.fbx"         # glob
```

---

## Global options

These flags apply to every command.

| Flag | Effect |
|---|---|
| `--tsx` / `--no-tsx` | Opt in / out of `.tsx` generation. Otherwise you'll be prompted (interactive) or `--tsx` is the default (non-interactive). |
| `--optimize` / `--no-optimize` | Opt in / out of web-optimized `.glb`. Same default behaviour as `--tsx`. |
| `--overwrite <skip\|replace\|ask>` | What to do when an output file already exists. Defaults to `ask` interactively, `skip` non-interactively. |
| `-f, --force-overwrite` | Shortcut for `--overwrite=replace`. |
| `-y, --yes` / `--non-interactive` | Skip every prompt. Required for scripts, CI, and agents. |
| `--dry-run` | Print the plan without creating or modifying anything. |
| `--json` | Emit a single JSON result object on stdout. Implies `--quiet`. Errors stay on stderr. |
| `-q, --quiet` | Suppress progress output on stdout. |
| `-c, --concurrency <n>` | Convert N files in parallel. Default `min(cpus, 4)`, or `1` in interactive ask-mode. |
| `--resolution <n>` | Max texture resolution during `--optimize`. Default `1024`; normals get `max(n, 2048)`. |
| `--keep-materials` | Preserve original materials during `--optimize`. Skips the palette merge step. |
| `--no-recover-textures` | Disable post-conversion texture recovery. On by default. |
| `--textures-dir <path>` | Extra directory to scan when seeding missing textures. |
| `--material-colors <path>` | JSON manifest of per-material `baseColorFactor` overrides. |
| `--flat` | Write every output directly into `outputDir` (no `glb/`, `tsx/`, `glb-for-web/`). |
| `--glb-dir <path>` | Override where converted `.glb` files go. |
| `--tsx-dir <path>` | Override where `.tsx` files go. |
| `--optimized-dir <path>` | Override where optimized `.glb` files go. |
| `-V, --version` | Print the version. |
| `-h, --help` | Show help. Pass it to any subcommand for topic-specific help. |

> `--forceOverwrite` (camelCase) still works but is deprecated — prefer `--force-overwrite`, `-f`, or `--overwrite=replace`.

---

## `conv3d single [path]`

Convert one file. The input format is inferred from its extension.

```bash
conv3d single ./model.fbx                        # interactive
conv3d single ./model.fbx --tsx --optimize -y    # no prompts
conv3d single ./model.obj --no-tsx -y            # glb only
conv3d single ./model.fbx --tsx --dry-run --json # preview as JSON
```

| Flag | Effect |
|---|---|
| `[path]` (positional) | Path to a `.fbx` / `.obj` / `.gltf` file. |
| `-i, --inputPath <path>` | Same as positional form. |
| `-o, --outputDir <path>` | Where to write outputs. Defaults to `<inputDir>/_convert-3d-for-web`. |

---

## `conv3d bulk [input]`

Convert every supported model in a directory, or every file matching a glob.

```bash
conv3d bulk ./models                                                # interactive
conv3d bulk ./models -r -m FBX --tsx --optimize -y                  # no prompts
conv3d bulk "./assets/**/*.fbx" -o ./public/models -y               # glob
conv3d bulk ./models --flat -o ./public/models --tsx -y             # flat output
conv3d bulk ./models -m ALL --tsx --optimize --dry-run --json       # preview
```

| Flag | Effect |
|---|---|
| `[input]` (positional) | Directory, file, or glob pattern (e.g. `./models/**/*.fbx`). |
| `-i, --inputDir <path>` | Same as positional form. |
| `-o, --outputDir <path>` | Where to write outputs (default `<inputDir>/_convert-3d-for-web`). |
| `-m, --modelType <type>` | `GLTF` \| `FBX` \| `OBJ` \| `ALL`. Required when `-y` in directory mode. |
| `-r, --recursive` | Recurse into subdirectories (directory mode only; globs choose scope). |

When the input is a glob:

- The file list comes from the matches — no `-r` needed.
- `-m` defaults to `ALL`.
- No matches → exits `0` with a warning (safe for agent globs over empty folders).

---

## `conv3d tsx-gen [dir]`

Run `gltfjsx` over `.glb` files that have already been converted. Use this when you have existing GLBs and just need React components (and optionally web-optimized variants) on top.

```bash
conv3d tsx-gen ./models
conv3d tsx-gen ./models -r --optimize -y
conv3d tsx-gen ./models -r --force-overwrite -y
conv3d tsx-gen ./models --dry-run --json
```

| Flag | Effect |
|---|---|
| `[dir]` (positional) | Directory containing `.glb` files. |
| `-i, --inputDir <path>` | Same as positional. |
| `-o, --outputDir <path>` | Where the `.tsx` (and optimized `.glb`) files go. |
| `-r, --recursive` | Recurse into subdirectories. |

`--optimize` here means "also emit a web-optimized variant of each existing `.glb`" — the original `.glb` is left alone.

---

## `conv3d doctor`

Print versions of `conv3d`, Node, the platform, and the bundled conversion libraries. No conversion is performed; safe to run any time.

```bash
conv3d doctor
conv3d doctor --json
```

Useful for:

- Bug reports — paste the JSON output.
- Agents verifying install health: `conv3d doctor --json | jq '.dependencies[] | select(.installed == null)'`.

---

## Exit codes

Every command uses the same exit codes:

| Code | Meaning |
|---|---|
| `0` | Success (including "no matching files found" — safe for agent globs). |
| `1` | Fatal error (invalid args, missing input, etc.) — nothing was converted. |
| `2` | Completed, but one or more files failed — see `errors[]` in the JSON output. |

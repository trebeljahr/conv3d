# conv3d launch-day posts

Numbers pulled: 2026-05-19 09:58:05 CEST

- Current weekly npm downloads: 11
- Current GitHub stars: 4

## Hacker News (Show HN) — first comment

```text
Hi HN — I made a small CLI that folds the usual react-three-fiber
asset-import chore into one command. Inputs: .fbx, .obj, .gltf (file,
directory, or glob). Outputs: .glb plus, optionally, a typed React
Three Fiber .tsx component and a web-optimized .glb.

Under the hood it composes obj2gltf, gltf-pipeline, fbx2gltf, and
gltfjsx. Credit to those projects for the actual conversion work;
conv3d is the connective tissue around them.

A few things I tried to get right:
- Same binary serves humans and AI agents. Interactive prompts by
  default; `--yes --json --dry-run` for scripts and tool-call loops.
- Stable contract: single JSON object on stdout, errors on stderr,
  exit codes 0 (success, including "no matches"), 1 (fatal), 2
  (partial: some files failed; details in errors[]).
- `--dry-run` never writes to disk, not even the output directories.
- Predictable output layout (glb/, tsx/, glb-for-web/), or `--flat`,
  or per-bucket directory overrides.

The thing I'm most curious to hear feedback on: FBX texture recovery.
Many freely distributed FBX packs (Kenney's KAYKIT, Quaternius,
similar) record texture paths as absolute Windows paths like
C:\Files\Work\...\barbarian_texture.png. fbx2gltf doesn't fall back
to looking next to the FBX, so it bakes a 1×1 magenta placeholder.
After every FBX conversion conv3d scans the output GLB for those
placeholders and replaces them with matching textures from the FBX's
directory.

Known rough edges:
- macOS + Linux only (the bundled fbx2gltf binary gates Windows).
- Node >= 24.
- CLI only — there is no Node API. The supported way to call it from
  another program is `--yes --json` + exit code.

Install: `npm install -g conv3d`
Docs: https://conv3d.trebeljahr.com
Repo: https://github.com/trebeljahr/conv3d

Happy to talk about the JSON contract, the texture-recovery heuristic,
the choice to stay CLI-only, or anything else. Thanks for taking a
look.
```

## Bluesky

```text
I shipped conv3d — a CLI that converts .fbx / .obj / .gltf to .glb
and (optionally) a typed react-three-fiber component, in one
command. Designed so AI coding agents can call it too:
`--yes --json --dry-run`, stable exit codes.

https://conv3d.trebeljahr.com
```

## Mastodon

```text
I shipped a small open-source CLI called conv3d. It converts 3D
models (.fbx, .obj, .gltf) into web-ready .glb and, if you want, a
typed React Three Fiber .tsx component. One command instead of
juggling fbx2gltf + gltf-pipeline + gltfjsx by hand.

The thing I'm proudest of is the agent-friendly contract:
`--yes --json --dry-run`, stable exit codes (0/1/2), single JSON
object on stdout, errors on stderr. Same binary serves humans and
AI coding agents.

MIT, macOS + Linux, Node >= 24. Built on top of obj2gltf,
gltf-pipeline, fbx2gltf, and gltfjsx — credit where credit is due.

https://conv3d.trebeljahr.com

#ThreeJS #ReactJS #WebDev
```

## Reddit — r/threejs

```text
I built a CLI for the part of the r3f workflow I kept doing by hand:
convert an FBX/OBJ/glTF, bake to GLB, run gltfjsx for the React
component, optimize textures.

`conv3d bulk ./models --tsx --optimize -y` does the whole pipeline,
in parallel, with sensible defaults. `conv3d single ./model.fbx` for
one file. Globs work too: `conv3d bulk "./assets/**/*.fbx" -y`.

A couple of details that may be useful:
- Output layout is predictable: `glb/`, `tsx/`, `glb-for-web/`. Or
  `--flat` if you want everything in one folder.
- After FBX conversion it auto-rescues missing textures from packs
  that record Windows paths (Kenney / KAYKIT). No more magenta
  placeholders.
- Non-interactive mode (`-y --json`) is stable enough to script
  against. Single JSON object on stdout, errors on stderr, exit codes
  0/1/2.

Built on top of obj2gltf, gltf-pipeline, fbx2gltf, and gltfjsx — all
credit to those maintainers. conv3d just wraps them with one CLI and
parallelism.

npm: `npm install -g conv3d`
Docs: https://conv3d.trebeljahr.com
Repo: https://github.com/trebeljahr/conv3d

Open to feedback. macOS + Linux only today.
```

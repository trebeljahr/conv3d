# docs/scripts

Re-render the landing-page terminal demo with [vhs](https://github.com/charmbracelet/vhs):

```sh
brew install vhs           # one-time
pnpm --filter . build      # ensure dist/conv3d.js is up to date
cd docs/scripts && vhs landing-demo.tape
```

Outputs land in `docs/public/media/` (`landing-demo.webm`, `.mp4`, `.gif`, and a poster PNG that you'll need to re-extract with `ffmpeg -ss 10.5 -vframes 1` if the recording length changes).

`_demo-setup.sh` wires the recording to the local repo build via a shell function — no global install or PATH munging required. Override with `CONV3D_BIN=...` if you want to record against a different binary.

`sample-pack/` is a directory of empty `.fbx` files used only so `conv3d bulk --dry-run` has something to plan against; do not ship it elsewhere.

## Press hero screenshot

```sh
cd docs && pnpm press:hero
```

`docs-hero.mjs` builds the static export, serves `out/` on a random free high port, waits for the hero's funnel models to load and animate, and writes a 1920x1080 `public/press/docs-hero.png`. It fails if a "loading model…" placeholder is visible. Set `BASE_URL` to capture from a server you already run, or `SETTLE_MS` to change the animation settle time.

## Press screenshot: JSON output

```sh
cd docs/scripts && vhs terminal-json.tape
```

Writes `docs/public/press/terminal-json.png` (1920x1080): `conv3d bulk tests/fixtures -m ALL --tsx --optimize --dry-run --yes --json | jq`. `_json-shot-setup.sh` creates a scratch project in `/tmp/my-game` with one empty `.fbx`, `.obj` and `.gltf` in `tests/fixtures/`, because the repo has no `tests/fixtures/` folder.

## Press screenshot: interactive bulk run

`terminal-screenshot.tape` records an interactive `conv3d bulk ./models` run (answering the format, `.tsx`, optimize and confirm prompts) and saves the final screen as a lossless 1920x1080 PNG:

```sh
pnpm build
cd docs/scripts && vhs terminal-screenshot.tape
```

Output: `docs/public/press/terminal-screenshot.png`. `_screenshot-setup.sh` unpacks a few `docs/public/models/conv3d-funnel/` GLBs into `.gltf` sources in a fresh `/tmp/conv3d.*` dir, so the run converts real geometry and writes nothing into the repo. The throwaway GIF goes to `/tmp` and takes a few minutes to encode at this size.

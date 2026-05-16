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

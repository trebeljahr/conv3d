# Marketing assets

Index of every image and video used for the README, the press page and the GitHub social preview. The published press files live in [`docs/public/press/`](../public/press/) and are served at [conv3d.trebeljahr.com/press](https://conv3d.trebeljahr.com/press). This folder holds the social preview candidates, which are not published, and [`manifest.json`](manifest.json) with the pixel size, bytes, SHA-256 and last-change date of every file below.

Brand: the docs site's palette (near-black `#0a1014`, teal `#2dd4bf`, diagonal hatch lines), Inter for text, JetBrains Mono for commands, and the cube mark from [`docs/public/img/logo.svg`](../public/img/logo.svg). Every image that shows a model carries its credit.

## Press files (in `docs/public/press/`)

| File | Purpose | Pixels | Made by | Date |
| --- | --- | --- | --- | --- |
| [`before-after.png`](../public/press/before-after.png) | Barbarian.fbx converted by FBX2glTF alone vs conv3d (texture recovery). README hero. | 1920×1080 | `pnpm press:before-after` | 2026-10-20 |
| [`docs-hero.png`](../public/press/docs-hero.png) | Docs site hero with the 3D model funnel. | 1920×1080 | `pnpm press:hero` | 2026-10-20 |
| [`walkthrough.mp4`](../public/press/walkthrough.mp4), [`.webm`](../public/press/walkthrough.webm) | 30 s, no sound: bulk run, generated `.tsx`, react-three-fiber render. | 1920×1080 | `pnpm press:walkthrough` | 2026-10-20 |
| [`walkthrough-poster.png`](../public/press/walkthrough-poster.png) | First frame of the walkthrough. README quick start, linked to the video. | 1920×1080 | `pnpm press:walkthrough` | 2026-10-20 |
| [`terminal-screenshot.png`](../public/press/terminal-screenshot.png) | Interactive `conv3d bulk ./models` run. | 1920×1080 | `vhs scripts/terminal-screenshot.tape` | 2026-10-08 |
| [`terminal-json.png`](../public/press/terminal-json.png) | `conv3d bulk … --dry-run --json \| jq` output. | 1920×1080 | `vhs scripts/terminal-json.tape` | 2026-10-08 |
| [`og-card.png`](../public/press/og-card.png) | The docs site's Open Graph card. | 1200×630 | export of `docs/app/opengraph-image.tsx` | 2026-10-08 |

How each press script works, and the sample packs it needs, is in [`docs/scripts/README.md`](../scripts/README.md).

## Social preview candidates (in `social-preview/`)

Round 2 (2026-11-07) keeps round 1's A concept, the texture before/after, and adds what the round-1 card left out: one command converts a whole pack. Every image comes from one real run over the KayKit Adventurers pack (6 characters and 31 props, 37 FBX files):

```bash
conv3d bulk ./kaykit-adventurers -r --tsx --optimize -y
```

It wrote 37 `.glb`, 37 `.tsx` and 37 optimized `.glb` files, and recovered one placeholder texture per FBX file. The "FBX2glTF alone" images come from the FBX2glTF binary conv3d ships with, with the same flags and no post-processing.

| File | Purpose | Pixels | Made by | Date |
| --- | --- | --- | --- | --- |
| [`social-preview-a.png`](social-preview/social-preview-a.png) | Round 1 A, the current pick: "FBX in, textured GLB out." beside a crop of `before-after.png`. | 1280×640 | `pnpm press:social --only a` | 2026-11-06 |
| [`social-preview-a2.png`](social-preview/social-preview-a2.png) | Round 2 A, dark: Barbarian before/after above the last screen of the bulk run, and "37 .fbx → 37 .glb + 37 .tsx". | 1280×640 | `pnpm press:social` | 2026-11-07 |
| [`social-preview-b2.png`](social-preview/social-preview-b2.png) | Round 2 B: A in the light palette. | 1280×640 | `pnpm press:social` | 2026-11-07 |
| [`social-preview-c2.png`](social-preview/social-preview-c2.png) | Round 2 C, dark: all 37 models of the pack in one grid, FBX2glTF alone left of the split and conv3d right of it, with the run's "Successfully converted 37/37 models" line. | 1280×640 | `pnpm press:social` | 2026-11-07 |
| [`social-preview-d2.png`](social-preview/social-preview-d2.png) | Round 2 D: C in the light palette. | 1280×640 | `pnpm press:social` | 2026-11-07 |
| [`template.html`](social-preview/template.html) | Source for the cards (`?v=a`, `a2`, `b2`, `c2`, `d2`). | 1280×640 | hand-written | 2026-11-07 |
| [`renders/terminal-dark.webp`](social-preview/renders/terminal-dark.webp), [`-light.webp`](social-preview/renders/terminal-light.webp) | Last screen of the bulk run, recorded with vhs in a dark and a light theme. | 2000×760 | `pnpm press:bulk` | 2026-11-07 |
| [`renders/pack-before.webp`](social-preview/renders/pack-before.webp), [`pack-after.webp`](social-preview/renders/pack-after.webp) | The 37 models in the same grid: FBX2glTF alone, and the run's `glb/` output. Transparent. | 1280×830 | `pnpm press:bulk` | 2026-11-07 |
| [`renders/barbarian-before.webp`](social-preview/renders/barbarian-before.webp), [`-after.webp`](social-preview/renders/barbarian-after.webp) | The same pair for one model, larger. Transparent. | 640×600 | `pnpm press:bulk` | 2026-11-07 |

The round-1 candidates B (typographic) and C (docs-site funnel) were not picked and are removed; they stay in the git history. No candidate is uploaded to GitHub yet. Repository Settings → Social preview takes the chosen PNG.

## Regenerate the cards

```bash
pnpm build                             # repo root: dist/conv3d.js
cd docs
pnpm install
pnpm press:bulk                        # the bulk run, its terminal screens and the renders
pnpm press:social                      # round-2 cards + manifest.json
pnpm press:social --only a             # the round-1 card
pnpm press:social --review-dir <dir>   # also copies the round-2 cards there as -a … -d with a labelled review-sheet.jpg
```

`press:bulk` needs vhs, the KayKit Adventurers pack and, on Apple Silicon, Rosetta for FBX2glTF (see [`docs/scripts/README.md`](../scripts/README.md)). The round-1 card embeds `before-after.png`, so re-run `press:before-after` first when that changes. Fonts load from Google Fonts, so rendering needs a network connection. When Playwright's own Chromium is missing, `press:social` uses the installed Google Chrome, headless.

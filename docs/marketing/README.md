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

| File | Purpose | Pixels | Made by | Date |
| --- | --- | --- | --- | --- |
| [`social-preview-a.png`](social-preview/social-preview-a.png) | A: screenshot-led. "FBX in, textured GLB out." beside a crop of `before-after.png`. | 1280×640 | `pnpm press:social` | 2026-11-06 |
| [`social-preview-b.png`](social-preview/social-preview-b.png) | B: typographic. "Asset packs in. Web-sized GLBs out." with the bulk command. | 1280×640 | `pnpm press:social` | 2026-11-06 |
| [`social-preview-c.png`](social-preview/social-preview-c.png) | C: the docs-site funnel (crop of `docs-hero.png`) beside the component headline. | 1280×640 | `pnpm press:social` | 2026-11-06 |
| [`template.html`](social-preview/template.html) | Source for the three cards (`?v=a`, `b`, `c`). | 1280×640 | hand-written | 2026-11-06 |

No candidate is uploaded to GitHub yet. Repository Settings → Social preview takes the chosen PNG.

## Regenerate the cards

```bash
cd docs
pnpm install
pnpm press:social                      # cards + manifest.json
pnpm press:social --review-dir <dir>   # also copies the cards there with a labelled review-sheet.jpg
```

The cards embed `before-after.png` and `docs-hero.png`, so re-run `press:before-after` or `press:hero` first when those change. Fonts load from Google Fonts, so rendering needs a network connection. When Playwright's own Chromium is missing, the script uses the installed Google Chrome, headless.

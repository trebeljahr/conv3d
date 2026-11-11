#!/usr/bin/env node
// Renders the GitHub social preview candidates (1280x640 PNG) and the og:image
// cards (1200x630 PNG) from docs/marketing/social-preview/template.html, then
// rewrites docs/marketing/manifest.json for every press and marketing image.
//
//   cd docs && pnpm press:social [--only a2,b2] [--review-dir <dir>]
//
// By default it renders the round-3 cards a3-c3 and the og:image cards
// og-wordmark and og-clean (both built on b3; the downscale needs ImageMagick's
// `magick`). `--only og-wordmark,og-clean` renders only those. Rounds 2 and 3 embed
// social-preview/renders/ (made by press:bulk from one real bulk run);
// `--only a2,b2,c2,d2` re-renders round 2. `--only a` re-renders the round-1
// card, which embeds public/press/before-after.png. Re-run those scripts first
// when their inputs change. With --review-dir, the round-3 cards are also
// copied there as social-preview-a.png ... -c.png with a labelled
// review-sheet.jpg. Fonts load from Google Fonts (needs network). Playwright
// comes from @playwright/test, or from PLAYWRIGHT_MODULE (any playwright or
// playwright-core folder) when the docs dependencies are not installed.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import("@playwright/test").catch((error) => {
  if (!process.env.PLAYWRIGHT_MODULE) throw error;
  return createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE);
});

const DOCS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const MARKETING_DIR = join(DOCS_DIR, "marketing");
const SOCIAL_DIR = join(MARKETING_DIR, "social-preview");
const RENDERS_DIR = join(SOCIAL_DIR, "renders");
const PRESS_DIR = join(DOCS_DIR, "public", "press");
const FONTS_HREF = "https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=block";

// [template id, review letter (current round only), review label]
const VARIANTS = [
  ["a", null, "Round 1 A: texture before/after"],
  ["a2", null, "Round 2 A (dark): Barbarian before/after + the bulk run"],
  ["b2", null, "Round 2 B (light): Barbarian before/after + the bulk run"],
  ["c2", null, "Round 2 C (dark): the whole pack, split before/after"],
  ["d2", null, "Round 2 D (light): the whole pack, split before/after"],
  ["a3", "a", "A (dark): Mage.fbx → FBX2glTF, beside 18 conv3d models"],
  ["b3", "b", "B (light): A in the light palette"],
  ["c3", "c", "C (dark, name only): FBX2glTF's Mage → the conv3d grid"],
];

// og:image cards, both built on b3 (light, vignette). The card is laid out at
// 1280x672, the 1200x630 shape on the template's 1280 px width, rendered at
// device scale 2 and downscaled to exactly 1200x630, so nothing is cropped or
// squashed. [file name, template id, override CSS, page script]
const OG_TALL =
  "html, body { width: 1280px !important; height: 672px !important; } .card { height: 672px; }";
// Both og:image cards mark the two ways: a red cross badge on the yellow,
// untextured Mage that FBX2glTF alone makes, and a green check badge on the
// conv3d grid. 44 px circles with a white ring, placed from the rendered boxes.
function markBadWayAndGoodWay() {
  const badge = (x, y, color, path) => {
    const d = document.createElement("div");
    d.style.cssText = `position:absolute;left:${x - 22}px;top:${y - 22}px;width:44px;height:44px;border-radius:50%;background:${color};box-shadow:0 4px 12px rgba(0,0,0,.18),0 0 0 3px #fff;z-index:20`;
    d.innerHTML = `<svg viewBox="0 0 24 24" width="44" height="44"><path d="${path}" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    document.body.appendChild(d);
  };
  const bad = [...document.querySelectorAll('img[src*="mage-before"]')]
    .find((img) => img.offsetParent)
    .getBoundingClientRect();
  const grid = (
    document.querySelector(".clean-grid") ?? document.querySelector(".vig .grid")
  ).getBoundingClientRect();
  badge(bad.right - 14, bad.top + 18, "#e5484d", "M8 8 L16 16 M16 8 L8 16");
  badge(grid.right - 30, grid.top + 30, "#16a34a", "M7 12.5 L10.5 16 L17 8.5");
}

const OG = [
  // b3 as it is: the grid panel grows 32 px (its image centred in it), the
  // pair and credit move down 32 px, so every margin stays as it was.
  [
    "og-wordmark",
    "b3",
    `${OG_TALL}
    .vig .grid { height: 528px; }
    .vig .grid img { top: 68px; }
    .vig .credit { top: 604px; }`,
  ],
  // No logo, name, headline, tool labels or credit (the KayKit models are
  // CC0): the Mage pair stacked in its own panel (textured FBX, arrow down,
  // yellow FBX2glTF result) beside the grid panel, both full height, in a
  // content box 64 px in from every edge (1152 x 544).
  [
    "og-clean",
    "b3",
    `${OG_TALL}
    .clean-pair, .clean-grid { position: absolute; top: 64px; height: 544px; }
    .clean-pair { left: 64px; width: 280px; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 6px; }
    .clean-pair img { width: 200px; height: 220px; display: block; }
    .clean-pair .arrow path { stroke: var(--muted); }
    .clean-grid { left: 368px; width: 848px; display: flex; align-items: center; justify-content: center; }
    .clean-grid img { width: 800px; height: ${Math.round((800 * 820) / 1400)}px; display: block; }`,
    () => {
      document.getElementById("content").innerHTML = `
        <div class="clean-pair panel">
          <img src="renders/mage-fbx.webp" alt="">
          <svg class="arrow" width="24" height="64" viewBox="0 0 24 64"><path d="M12 4 V58 M4 48 L12 58 L20 48"/></svg>
          <img src="renders/mage-before.webp" alt="">
        </div>
        <div class="clean-grid panel"><img src="renders/grid-after.webp" alt=""></div>`;
    },
  ],
];

const onlyIdx = process.argv.indexOf("--only");
const only =
  onlyIdx > -1
    ? process.argv[onlyIdx + 1].split(",")
    : ["a3", "b3", "c3", "og-wordmark", "og-clean"];
const reviewIdx = process.argv.indexOf("--review-dir");
const reviewDir = reviewIdx > -1 ? process.argv[reviewIdx + 1] : null;

async function launch() {
  try {
    return await chromium.launch({ headless: true });
  } catch {
    // Playwright's own Chromium build is missing: use the installed Chrome, headless.
    return await chromium.launch({ headless: true, channel: "chrome" });
  }
}

const browser = await launch();
try {
  const template = pathToFileURL(join(SOCIAL_DIR, "template.html")).href;
  for (const [v] of VARIANTS.filter(([id]) => only.includes(id))) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 640 },
      deviceScaleFactor: 1,
    });
    await page.goto(`${template}?v=${v}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const out = join(SOCIAL_DIR, `social-preview-${v}.png`);
    await page.screenshot({ path: out });
    await page.close();
    const kb = Math.round(statSync(out).size / 1024);
    if (kb > 1000) throw new Error(`${out} is ${kb} KB; GitHub wants under 1 MB`);
    console.log(`wrote ${relative(DOCS_DIR, out)} (${kb} KB)`);
  }

  for (const [name, v, css, script] of OG.filter(([id]) => only.includes(id))) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 672 },
      deviceScaleFactor: 2,
      colorScheme: "light",
    });
    const page = await context.newPage();
    await page.goto(`${template}?v=${v}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: css });
    if (script) await page.evaluate(script);
    await page.evaluate(() =>
      Promise.all([...document.images].map((i) => i.decode().catch(() => {}))),
    );
    await page.evaluate(markBadWayAndGoodWay);
    await page.waitForTimeout(400);
    const out = join(SOCIAL_DIR, `${name}.png`);
    try {
      // No date chunks, so an unchanged card keeps its SHA-256.
      execFileSync(
        "magick",
        ["png:-", "-resize", "1200x630!", "-define", "png:exclude-chunks=date,time", out],
        {
          input: await page.screenshot(),
        },
      );
    } catch (error) {
      if (error.code === "ENOENT")
        throw new Error("The og:image cards need ImageMagick: brew install imagemagick");
      throw error;
    }
    await context.close();
    console.log(`wrote ${relative(DOCS_DIR, out)} (${Math.round(statSync(out).size / 1024)} KB)`);
  }

  if (reviewDir) {
    mkdirSync(reviewDir, { recursive: true });
    const tiles = VARIANTS.filter(([, letter]) => letter)
      .map(([v, letter, label]) => {
        const file = `social-preview-${v}.png`;
        copyFileSync(join(SOCIAL_DIR, file), join(reviewDir, `social-preview-${letter}.png`));
        const data = readFileSync(join(SOCIAL_DIR, file)).toString("base64");
        return `<figure><img src="data:image/png;base64,${data}"><figcaption>${label}</figcaption></figure>`;
      })
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS_HREF}">
<style>body{margin:0;background:#e9ecee;font-family:Inter,sans-serif}
.sheet{display:grid;grid-template-columns:640px 640px;gap:36px 32px;padding:40px;width:max-content}
figure{margin:0;display:flex;flex-direction:column;gap:14px}
img{width:640px;height:320px;display:block;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.18)}
figcaption{font-size:22px;font-weight:600;color:#0a1014}</style></head>
<body><div class="sheet">${tiles}</div></body></html>`;
    const page = await browser.newPage({
      viewport: { width: 1400, height: 900 },
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const out = join(reviewDir, "review-sheet.jpg");
    await page.locator(".sheet").screenshot({ path: out, type: "jpeg", quality: 88 });
    await page.close();
    console.log(`wrote ${out}`);
  }
} finally {
  await browser.close();
}

// manifest.json: purpose, pixel size, bytes and SHA-256 of every image.
const PURPOSE = {
  "public/press/before-after.png": [
    "FBX2glTF alone vs conv3d on Barbarian.fbx (texture recovery); README hero",
    "pnpm press:before-after",
  ],
  "public/press/docs-hero.png": ["Docs site hero with the 3D model funnel", "pnpm press:hero"],
  "public/press/og-card.png": [
    "Docs site Open Graph card",
    "export of docs/app/opengraph-image.tsx (commit 85f28ac)",
  ],
  "public/press/terminal-json.png": [
    "`conv3d bulk ... --dry-run --json | jq` output",
    "vhs scripts/terminal-json.tape",
  ],
  "public/press/terminal-screenshot.png": [
    "Interactive `conv3d bulk ./models` run",
    "vhs scripts/terminal-screenshot.tape",
  ],
  "public/press/walkthrough-poster.png": [
    "First frame of the walkthrough video; README quick start",
    "pnpm press:walkthrough",
  ],
  "public/press/walkthrough.mp4": [
    "30 s walkthrough: bulk run, generated .tsx, r3f render (no sound)",
    "pnpm press:walkthrough",
  ],
  "public/press/walkthrough.webm": ["Same walkthrough, WebM", "pnpm press:walkthrough"],
  "marketing/social-preview/social-preview-a.png": [
    "GitHub social preview, round 1 A: texture before/after",
    "pnpm press:social --only a",
  ],
  "marketing/social-preview/social-preview-a2.png": [
    "GitHub social preview, round 2 A (dark): Barbarian before/after + end of the bulk run",
    "pnpm press:social --only a2",
  ],
  "marketing/social-preview/social-preview-b2.png": [
    "GitHub social preview, round 2 B (light): Barbarian before/after + end of the bulk run",
    "pnpm press:social --only b2",
  ],
  "marketing/social-preview/social-preview-c2.png": [
    "GitHub social preview, round 2 C (dark): all 37 pack models, split before/after",
    "pnpm press:social --only c2",
  ],
  "marketing/social-preview/social-preview-d2.png": [
    "GitHub social preview, round 2 D (light): all 37 pack models, split before/after",
    "pnpm press:social --only d2",
  ],
  "marketing/social-preview/social-preview-a3.png": [
    "GitHub social preview, round 3 A (dark): Mage.fbx -> FBX2glTF beside 18 conv3d GLBs",
    "pnpm press:social",
  ],
  "marketing/social-preview/social-preview-b3.png": [
    "GitHub social preview, round 3 B (light): A in the light palette",
    "pnpm press:social",
  ],
  "marketing/social-preview/social-preview-c3.png": [
    "GitHub social preview, round 3 C (dark, name only): FBX2glTF's Mage -> the conv3d grid",
    "pnpm press:social",
  ],
  "marketing/social-preview/og-wordmark.png": [
    "og:image (1200x630): round 3 B with logo, name, headline, Mage pair, grid and credit",
    "pnpm press:social",
  ],
  "marketing/social-preview/og-clean.png": [
    "og:image (1200x630) without text: the Mage pair (FBX -> FBX2glTF) beside the conv3d grid, light palette",
    "pnpm press:social",
  ],
  "marketing/social-preview/renders/grid-after.webp": [
    "18 KayKit Adventurers GLBs from the bulk run (conv3d), 6-column grid, transparent",
    "pnpm press:bulk",
  ],
  "marketing/social-preview/renders/mage-fbx.webp": [
    "Mage.fbx itself, loaded with three.js FBXLoader and its own texture, transparent",
    "pnpm press:bulk",
  ],
  "marketing/social-preview/renders/mage-before.webp": [
    "Mage.fbx through FBX2glTF alone, transparent",
    "pnpm press:bulk",
  ],
  "marketing/social-preview/renders/barbarian-after.webp": [
    "Barbarian.glb from the bulk run (conv3d), transparent",
    "pnpm press:bulk",
  ],
  "marketing/social-preview/renders/barbarian-before.webp": [
    "Barbarian.fbx through FBX2glTF alone, transparent",
    "pnpm press:bulk",
  ],
  "marketing/social-preview/renders/pack-after.webp": [
    "All 37 KayKit Adventurers GLBs from the bulk run (conv3d), one grid",
    "pnpm press:bulk",
  ],
  "marketing/social-preview/renders/pack-before.webp": [
    "The same 37 FBX files through FBX2glTF alone, same grid",
    "pnpm press:bulk",
  ],
  "marketing/social-preview/renders/terminal-dark.webp": [
    "Last screen of `conv3d bulk ./kaykit-adventurers -r --tsx --optimize -y` (vhs, dark theme)",
    "pnpm press:bulk",
  ],
  "marketing/social-preview/renders/terminal-light.webp": [
    "Last screen of the same bulk run (vhs, light theme)",
    "pnpm press:bulk",
  ],
};

// PNG sizes come from the IHDR chunk, WebP sizes from the VP8X chunk (the
// renders all carry alpha, so Chromium writes VP8X). The walkthrough videos
// are recorded at 1920x1080 (see scripts/README.md).
function imageSize(buf) {
  if (buf.readUInt32BE(0) === 0x89504e47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (buf.toString("ascii", 8, 16) === "WEBPVP8X") {
    return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  }
  return [1920, 1080];
}

// Last commit date of a file, or today for a file not committed yet.
function changed(abs) {
  const out = execFileSync("git", ["log", "-1", "--format=%cs", "--", abs], {
    cwd: DOCS_DIR,
    encoding: "utf8",
  }).trim();
  return out || new Date().toLocaleDateString("sv-SE"); // local YYYY-MM-DD, as git's %cs
}

const files = [];
for (const dir of [PRESS_DIR, SOCIAL_DIR, RENDERS_DIR]) {
  for (const name of readdirSync(dir).sort()) {
    if (!/\.(png|jpe?g|webp|mp4|webm)$/.test(name)) continue;
    const abs = join(dir, name);
    const rel = relative(DOCS_DIR, abs);
    const buf = readFileSync(abs);
    const [purpose, madeBy] = PURPOSE[rel] ?? ["", ""];
    const [width, height] = imageSize(buf);
    files.push({
      file: `docs/${rel}`,
      purpose,
      madeBy,
      width,
      height,
      bytes: buf.length,
      sha256: createHash("sha256").update(buf).digest("hex"),
      changed: changed(abs),
    });
  }
}
writeFileSync(
  join(MARKETING_DIR, "manifest.json"),
  `${JSON.stringify({ schemaVersion: 1, project: "conv3d", files }, null, 2)}\n`,
);
console.log(`wrote marketing/manifest.json (${files.length} files)`);

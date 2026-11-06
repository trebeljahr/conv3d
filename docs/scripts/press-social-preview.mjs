#!/usr/bin/env node
// Renders the three GitHub social preview candidates (1280x640 PNG) from
// docs/marketing/social-preview/template.html, then rewrites
// docs/marketing/manifest.json for every press and marketing image.
//
//   cd docs && pnpm press:social [--review-dir <dir>]
//
// The cards embed the existing press images (public/press/before-after.png
// and docs-hero.png), so re-run press:before-after / press:hero first when
// those change. With --review-dir, the three PNGs are also copied there with
// a labelled review-sheet.jpg. Fonts load from Google Fonts (needs network).

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
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const DOCS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const MARKETING_DIR = join(DOCS_DIR, "marketing");
const SOCIAL_DIR = join(MARKETING_DIR, "social-preview");
const PRESS_DIR = join(DOCS_DIR, "public", "press");
const FONTS_HREF = "https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=block";

const VARIANTS = [
  ["a", "A: screenshot-led, texture before/after"],
  ["b", "B: typographic, docs-site brand"],
  ["c", "C: docs-site 3D funnel"],
];

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
  for (const [v] of VARIANTS) {
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

  if (reviewDir) {
    mkdirSync(reviewDir, { recursive: true });
    const tiles = VARIANTS.map(([v, label]) => {
      const file = `social-preview-${v}.png`;
      copyFileSync(join(SOCIAL_DIR, file), join(reviewDir, file));
      const data = readFileSync(join(SOCIAL_DIR, file)).toString("base64");
      return `<figure><img src="data:image/png;base64,${data}"><figcaption>${label}</figcaption></figure>`;
    }).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS_HREF}">
<style>body{margin:0;background:#e9ecee;font-family:Inter,sans-serif}
.sheet{display:flex;gap:32px;padding:40px;width:max-content}
figure{margin:0;display:flex;flex-direction:column;gap:14px}
img{width:640px;height:320px;display:block;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.18)}
figcaption{font-size:22px;font-weight:600;color:#0a1014}</style></head>
<body><div class="sheet">${tiles}</div></body></html>`;
    const page = await browser.newPage({
      viewport: { width: 2100, height: 460 },
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
    "GitHub social preview candidate A: texture before/after",
    "pnpm press:social",
  ],
  "marketing/social-preview/social-preview-b.png": [
    "GitHub social preview candidate B: typographic",
    "pnpm press:social",
  ],
  "marketing/social-preview/social-preview-c.png": [
    "GitHub social preview candidate C: docs-site 3D funnel",
    "pnpm press:social",
  ],
};

// PNG sizes come from the IHDR chunk. The walkthrough videos are recorded at
// 1920x1080 (see scripts/README.md).
function pngSize(buf) {
  return buf.readUInt32BE(0) === 0x89504e47
    ? [buf.readUInt32BE(16), buf.readUInt32BE(20)]
    : [1920, 1080];
}

// Last commit date of a file, or today for a file not committed yet.
function changed(abs) {
  const out = execFileSync("git", ["log", "-1", "--format=%cs", "--", abs], {
    cwd: DOCS_DIR,
    encoding: "utf8",
  }).trim();
  return out || new Date().toISOString().slice(0, 10);
}

const files = [];
for (const dir of [PRESS_DIR, SOCIAL_DIR]) {
  for (const name of readdirSync(dir).sort()) {
    if (!/\.(png|jpe?g|webp|mp4|webm)$/.test(name)) continue;
    const abs = join(dir, name);
    const rel = relative(DOCS_DIR, abs);
    const buf = readFileSync(abs);
    const [purpose, madeBy] = PURPOSE[rel] ?? ["", ""];
    const [width, height] = pngSize(buf);
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

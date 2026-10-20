#!/usr/bin/env node
// Builds public/press/before-after.png (1920x1080): the same KayKit FBX
// converted by plain FBX2glTF (left) and by conv3d (right), rendered side by
// side in one plain three.js GLB viewer.
//
//   pnpm build                              # repo root: dist/conv3d.js
//   cd docs && pnpm press:before-after
//
// Needs the KayKit Adventurers pack (CC0, https://kaylousberg.itch.io/kaykit-adventurers);
// set KAYKIT_FBX_DIR if it is not at the default path in _press-lib.mjs.
// FBX2glTF is x86-64 only, so on Apple Silicon this needs Rosetta.

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import {
  bundle,
  KAYKIT_FBX_DIR,
  MODEL_CREDIT,
  PRESS_DIR,
  REPO_ROOT,
  requireKaykit,
  run,
  SCRIPTS_DIR,
  serveDirs,
} from "./_press-lib.mjs";

const MODEL = "Barbarian";
const OUT_FILE = join(PRESS_DIR, "before-after.png");

requireKaykit();
const work = mkdtempSync(join(tmpdir(), "conv3d-before-after-"));
const models = join(work, "models");
mkdirSync(models);
cpSync(join(KAYKIT_FBX_DIR, `${MODEL}.fbx`), join(models, `${MODEL}.fbx`));
cpSync(
  join(KAYKIT_FBX_DIR, `${MODEL.toLowerCase()}_texture.png`),
  join(models, `${MODEL.toLowerCase()}_texture.png`),
);

// Left: the FBX2glTF binary conv3d ships with, same flags conv3d passes, no
// post-processing. The texture sits next to the FBX in both runs.
const fbx2gltfBin = join(
  createRequire(join(REPO_ROOT, "package.json")).resolve("fbx2gltf/package.json"),
  "..",
  "bin",
  process.platform === "darwin" ? "Darwin" : "Linux",
  "FBX2glTF",
);
mkdirSync(join(work, "plain"));
run(fbx2gltfBin, [
  "--binary",
  "--pbr-metallic-roughness",
  "--input",
  join(models, `${MODEL}.fbx`),
  "--output",
  join(work, "plain", MODEL),
]);

// Right: conv3d's own FBX step (FBX2glTF + texture recovery).
run("node", [join(REPO_ROOT, "dist", "conv3d.js"), "bulk", models, "-m", "FBX", "-y"]);

writeFileSync(
  join(work, "index.html"),
  `<!doctype html>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1920px; height: 1080px; background: #11111b; color: #cdd6f4;
    font: 24px/1.35 -apple-system, "Inter", "Helvetica Neue", Arial, sans-serif; padding: 56px 72px 40px; }
  h1 { font-size: 40px; font-weight: 650; letter-spacing: -0.01em; }
  h1 code { font: 600 40px "JetBrains Mono", "SF Mono", Menlo, monospace; color: #f5c2e7; }
  .sub { color: #a6adc8; margin-top: 8px; }
  .panels { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 28px; }
  figure { background: #1e1e2e; border: 1px solid #313244; border-radius: 16px; overflow: hidden; }
  canvas { display: block; width: 100%; height: 660px; }
  figcaption { padding: 18px 24px 20px; border-top: 1px solid #313244; }
  .tool { font: 600 26px "JetBrains Mono", "SF Mono", Menlo, monospace; }
  .left .tool { color: #f9e2af; } .right .tool { color: #a6e3a1; }
  .what { color: #a6adc8; font-size: 22px; margin-top: 4px; }
  footer { display: flex; justify-content: space-between; margin-top: 22px; color: #7f849c; font-size: 20px; }
</style>
<h1><code>${MODEL}.fbx → ${MODEL}.glb</code></h1>
<p class="sub">The same FBX and texture file, converted by FBX2glTF alone (left) and by conv3d (right).</p>
<div class="panels">
  <figure class="left">
    <canvas data-glb="/work/plain/${MODEL}.glb" data-yaw="0.35"></canvas>
    <figcaption><div class="tool">FBX2glTF</div>
      <div class="what">The FBX records a texture path from another machine. FBX2glTF cannot find it and embeds a 1×1 placeholder texture.</div></figcaption>
  </figure>
  <figure class="right">
    <canvas data-glb="/work/models/_convert-3d-for-web/glb/${MODEL}.glb" data-yaw="0.35"></canvas>
    <figcaption><div class="tool">conv3d</div>
      <div class="what">conv3d finds the matching texture next to the FBX and swaps it in for the placeholder.</div></figcaption>
  </figure>
</div>
<footer><span>${MODEL_CREDIT}</span><span>Both GLBs shown in the same three.js GLTFLoader viewer with the same lights.</span></footer>
<script type="module" src="/work/viewer.js"></script>
`,
);
await bundle(join(SCRIPTS_DIR, "_press-viewer.js"), join(work, "viewer.js"));

const server = await serveDirs({ "/work/": work, "/": work });
try {
  const browser = await chromium.launch({ channel: "chromium", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (err) => console.error(err));
  await page.goto(`${server.url}/index.html`);
  await page.waitForFunction(() => window.__ready, null, { timeout: 60_000 });
  await page.screenshot({ path: OUT_FILE });
  await browser.close();
  console.log(`wrote ${OUT_FILE}`);
} finally {
  server.close();
  rmSync(work, { recursive: true, force: true });
}

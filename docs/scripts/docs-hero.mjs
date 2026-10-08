#!/usr/bin/env node
// Captures the landing-page hero at 1920x1080 for the press kit.
//
//   pnpm press:hero            # build, serve out/ on a free port, capture
//   BASE_URL=http://127.0.0.1:PORT node scripts/docs-hero.mjs   # reuse a server
//
// Writes public/press/docs-hero.png. The hero canvas has no "ready" signal, so
// we wait for every funnel GLB response and web fonts, then let
// the animation run until the models are inside the processor rings.

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const DOCS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = join(DOCS_DIR, "public", "press", "docs-hero.png");
const WIDTH = 1920;
const HEIGHT = 1080;
const FUNNEL_MODELS = 12;
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 4500);

function freePort() {
  return new Promise((resolve, reject) => {
    const tryPort = (attempt) => {
      const port = 49152 + Math.floor(Math.random() * (65535 - 49152));
      const srv = createServer();
      srv.once("error", () => (attempt < 5 ? tryPort(attempt + 1) : reject(new Error("no free port"))));
      srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(port)));
    };
    tryPort(0);
  });
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server at ${url} did not come up`);
}

async function startServer() {
  const port = await freePort();
  const child = spawn("pnpm", ["dlx", "serve@14", "out", "--listen", String(port), "--no-clipboard"], {
    cwd: DOCS_DIR,
    stdio: "ignore",
    detached: true,
  });
  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url);
  return { url, stop: () => process.kill(-child.pid) };
}

const server = process.env.BASE_URL ? { url: process.env.BASE_URL, stop() {} } : await startServer();

try {
  // Full Chromium in new-headless mode: the default headless shell stalls the
  // page load on this landing page and never fires "load".
  const browser = await chromium.launch({ channel: "chromium", headless: true });
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });

  const glbDone = new Set();
  page.on("requestfinished", (req) => {
    if (req.url().includes("/models/conv3d-funnel/")) glbDone.add(req.url());
  });

  await page.goto(server.url, { waitUntil: "load" });
  await page.locator("header canvas").first().waitFor({ state: "visible" });
  await page.waitForFunction(() => document.fonts.ready.then(() => true));
  const deadline = Date.now() + 60_000;
  while (glbDone.size < FUNNEL_MODELS) {
    if (Date.now() > deadline) throw new Error(`only ${glbDone.size}/${FUNNEL_MODELS} funnel models loaded`);
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(SETTLE_MS);

  const placeholders = await page.getByText(/loading model/i).evaluateAll((els) =>
    els.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
    }).length,
  );
  if (placeholders > 0) throw new Error("loading placeholder visible in the hero viewport");

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await page.screenshot({ path: OUT_FILE, animations: "allow" });
  await browser.close();
  console.log(`wrote ${OUT_FILE}`);
} finally {
  server.stop();
}

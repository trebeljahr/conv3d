// Shared helpers for the press-asset scripts (press-before-after.mjs,
// press-walkthrough.mjs): a free high port, a tiny static server, an esbuild
// bundle step, and the location of the KayKit pack used as sample input.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { homedir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

export const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
export const DOCS_DIR = join(SCRIPTS_DIR, "..");
export const REPO_ROOT = join(DOCS_DIR, "..");
export const PRESS_DIR = join(DOCS_DIR, "public", "press");

// KayKit "Adventurers 2.0 FREE" by Kay Lousberg, CC0
// (https://kaylousberg.itch.io/kaykit-adventurers). Point KAYKIT_FBX_DIR at the
// pack's characters/fbx folder: the .fbx files plus their *_texture.png files.
export const KAYKIT_FBX_DIR =
  process.env.KAYKIT_FBX_DIR ??
  join(
    homedir(),
    "projects/gamedev/assets/raw/kaykit/adventurers/extracted/kaykit-adventurers-2-0-free/characters/fbx",
  );

export const MODEL_CREDIT = "Model: KayKit Adventurers by Kay Lousberg (CC0)";

export function requireKaykit() {
  if (!existsSync(join(KAYKIT_FBX_DIR, "Barbarian.fbx"))) {
    throw new Error(
      `KayKit pack not found at ${KAYKIT_FBX_DIR}. Download "KayKit Adventurers" from ` +
        "https://kaylousberg.itch.io/kaykit-adventurers and set KAYKIT_FBX_DIR to its characters/fbx folder.",
    );
  }
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const tryPort = (attempt) => {
      const port = 49152 + Math.floor(Math.random() * (65535 - 49152));
      const srv = createNetServer();
      srv.once("error", () =>
        attempt < 5 ? tryPort(attempt + 1) : reject(new Error("no free port")),
      );
      srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(port)));
    };
    tryPort(0);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".wasm": "application/wasm",
  ".png": "image/png",
};

// Serves files from `roots` (url prefix -> directory) on 127.0.0.1 and a free
// high port. Returns { url, close }.
export async function serveDirs(roots) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    for (const [prefix, dir] of Object.entries(roots)) {
      if (!path.startsWith(prefix)) continue;
      const rel = normalize(path.slice(prefix.length) || "index.html").replace(/^(\.\.[/\\])+/, "");
      try {
        const body = await readFile(join(dir, rel === "/" ? "index.html" : rel));
        res.writeHead(200, { "content-type": MIME[extname(rel)] ?? "application/octet-stream" });
        res.end(body);
        return;
      } catch {}
    }
    res.writeHead(404);
    res.end();
  });
  const port = await freePort();
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

// Bundles a browser entry with the docs site's own three / react / r3f copies.
export async function bundle(entry, outfile, alias = {}) {
  await build({
    alias,
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: "esm",
    platform: "browser",
    jsx: "automatic",
    minify: true,
    logLevel: "warning",
    define: { "process.env.NODE_ENV": '"production"' },
    // Generated components import three-stdlib, which only drei depends on.
    nodePaths: [
      join(DOCS_DIR, "node_modules"),
      join(DOCS_DIR, "node_modules", ".pnpm", "node_modules"),
    ],
  });
}

export function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: "inherit", ...opts });
}

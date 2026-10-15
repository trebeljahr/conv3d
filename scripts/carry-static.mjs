#!/usr/bin/env node
/**
 * Carry the hashed build files of earlier releases into a static upload.
 *
 * Why: a Cloudflare Worker version serves only the assets it was uploaded
 * with. A tab opened before a deploy still asks for its own hashed chunks,
 * and the new version answers 404 (measured: about 70 s after a deploy, once
 * the edge cache lets go). So every upload carries the hashed files of the
 * releases before it.
 *
 * How: each upload ships a small manifest (`/release-assets.json` by
 * default) listing, per release, every hashed file with its sha256:
 *   { schema: 1, releases: [{ sha, files: [{ path, sha256, size }] }] }
 * newest release first; extra keys on a release are kept as they are. The next
 * build fetches the LIVE manifest, downloads from the live site the files it
 * does not have, checks their hashes, and writes a new manifest with its own
 * release first. The live manifest belongs to the version actually serving,
 * so an upload that was never activated is skipped on its own.
 *
 *   node carry-static.mjs --site https://example.com --out packages/client/out
 *     [--release <sha>]          default $GITHUB_SHA, then $COMMIT_SHA
 *     [--dir _next/static]       hashed directory under --out, repeatable
 *     [--keep 2]                 earlier releases to carry
 *     [--manifest release-assets.json]
 *     [--max-bytes 157286400]    limit on carried bytes (150 MiB)
 *     [--max-files 20000]        Workers Free: files per version
 *     [--max-file-bytes 26214400] Workers Free: 25 MiB per file
 *     [--require-previous]       fail when the live site has no manifest
 *     [--dry-run]                download and check, write nothing
 *
 * Rules, each one a failure:
 *   - one path never holds two different contents across releases (hashed
 *     names must not collide). Next's per-build manifests are exempt: with a
 *     fixed build ID every release has `<buildId>/_buildManifest.js` with its
 *     own bytes; the new build keeps its own copy and the carried release
 *     drops that entry.
 *   - a listed file downloads with the listed sha256.
 *   - the upload stays under the file and size limits.
 *
 * No live manifest (first deploy, or the site is still served by something
 * else) is a warning, not a failure, unless --require-previous is set.
 *
 * Standalone on purpose: Node 20+ and no dependencies, so a project copies
 * this one file. Source: hatchkit cli/src/templates/client-host/scripts/.
 * Put `/release-assets.json` under a `no-store` rule in `_headers`.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const MANIFEST_SCHEMA = 1;
const RELEASE_ID = /^[0-9A-Za-z._-]{1,64}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const PER_BUILD_MANIFEST =
  /^\/_next\/static\/[^/]+\/_(build|ssg|clientMiddleware)Manifest\.(js|json)$/;

const DEFAULTS = {
  dirs: ["_next/static"],
  keep: 2,
  manifest: "release-assets.json",
  maxBytes: 150 * 1024 * 1024,
  maxFiles: 20_000,
  maxFileBytes: 25 * 1024 * 1024,
  concurrency: 8,
  retries: 3,
};

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** Every file under `root`, as repo-style relative paths with `/`. */
function walk(root) {
  const found = [];
  if (!existsSync(root)) return found;
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Refusing symlink in build output: ${path}`);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) found.push(relative(root, path).split(sep).join("/"));
    }
  };
  visit(root);
  return found;
}

function normaliseDir(dir) {
  const clean = String(dir).replace(/^\/+|\/+$/g, "");
  if (!clean || clean.split("/").some((part) => part === ".." || part === "."))
    throw new Error(`Bad --dir ${dir}`);
  return clean;
}

/** The hashed files this build wrote, keyed by URL path. */
export function listOwnFiles(out, dirs) {
  const files = new Map();
  for (const dir of dirs.map(normaliseDir)) {
    for (const rel of walk(join(out, dir))) {
      const buf = readFileSync(join(out, dir, rel));
      files.set(`/${dir}/${rel}`, {
        path: `/${dir}/${rel}`,
        sha256: sha256(buf),
        size: buf.length,
      });
    }
  }
  return files;
}

/** Throws unless `value` is a manifest this script wrote. Paths must sit
 *  under one of `dirs` and hold no `..`, so a bad manifest cannot write
 *  outside the build output. */
export function validateManifest(value, dirs) {
  const prefixes = dirs.map((dir) => `/${normaliseDir(dir)}/`);
  if (!value || typeof value !== "object") throw new Error("manifest is not an object");
  if (value.schema !== MANIFEST_SCHEMA)
    throw new Error(`manifest schema ${value.schema} (expected ${MANIFEST_SCHEMA})`);
  if (!Array.isArray(value.releases)) throw new Error("manifest has no releases array");
  for (const release of value.releases) {
    if (!RELEASE_ID.test(release?.sha ?? "")) throw new Error("manifest release sha is invalid");
    if (!Array.isArray(release.files)) throw new Error(`release ${release.sha} has no files`);
    for (const file of release.files) {
      const path = file?.path;
      if (
        typeof path !== "string" ||
        !prefixes.some((prefix) => path.startsWith(prefix)) ||
        path.split("/").some((part) => part === ".." || part === ".") ||
        path.includes("\\") ||
        path.includes("?") ||
        path.includes("#")
      )
        throw new Error(
          `release ${release.sha} lists a path outside ${prefixes.join(", ")}: ${path}`,
        );
      if (!SHA256.test(file.sha256 ?? "")) throw new Error(`bad sha256 for ${path}`);
      if (!Number.isInteger(file.size) || file.size < 0) throw new Error(`bad size for ${path}`);
    }
  }
  return value;
}

async function fetchManifest(site, manifest, fetchImpl) {
  const url = new URL(`/${manifest}`, site);
  // A query string misses any edge-cached copy; asset matching ignores it.
  url.searchParams.set("carry", String(Date.now()));
  let response;
  try {
    response = await fetchImpl(url, { cache: "no-store", redirect: "follow" });
  } catch (err) {
    return { manifest: null, reason: `fetch failed: ${err.message}` };
  }
  if (!response.ok) return { manifest: null, reason: `HTTP ${response.status}` };
  const text = await response.text();
  try {
    return { manifest: JSON.parse(text), reason: "" };
  } catch {
    // A site with an SPA fallback answers unknown paths with index.html.
    return { manifest: null, reason: "response is not JSON" };
  }
}

async function download(site, file, { fetchImpl, retries, maxFileBytes }) {
  const url = new URL(file.path, site);
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetchImpl(url, { redirect: "follow" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buf = Buffer.from(await response.arrayBuffer());
      if (buf.length > maxFileBytes)
        throw new Error(`${buf.length} bytes is over the per-file limit`);
      const got = sha256(buf);
      if (got !== file.sha256)
        throw new Error(`sha256 ${got.slice(0, 12)}… != listed ${file.sha256.slice(0, 12)}…`);
      return buf;
    } catch (err) {
      lastError = err;
      // A 404 or a hash mismatch will not change on retry.
      if (/HTTP 404|sha256|per-file/.test(err.message)) break;
    }
  }
  throw new Error(`could not carry ${file.path}: ${lastError.message}`);
}

async function pool(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Carry earlier releases into `out`. Returns a summary; throws on any rule
 * break. Writes nothing when `dryRun` is set.
 */
export async function carry(options) {
  const o = { ...DEFAULTS, ...options };
  const fetchImpl = o.fetch ?? globalThis.fetch;
  if (!o.site) throw new Error("--site is required");
  if (!o.out || !existsSync(o.out)) throw new Error(`--out ${o.out} does not exist; build first`);
  if (!RELEASE_ID.test(o.release ?? "")) throw new Error("--release (or GITHUB_SHA) must be set");
  const dirs = o.dirs.map(normaliseDir);
  const notes = [];

  const own = listOwnFiles(o.out, dirs);
  const ownRelease = { sha: o.release, files: [...own.values()] };

  const live = await fetchManifest(o.site, o.manifest, fetchImpl);
  let previous = [];
  if (live.manifest) {
    validateManifest(live.manifest, dirs);
    previous = live.manifest.releases;
  } else {
    if (o.requirePrevious)
      throw new Error(`no live manifest at ${o.site}/${o.manifest} (${live.reason})`);
    notes.push(`no live manifest at /${o.manifest} (${live.reason}); nothing carried`);
  }

  // path → { sha256, label } for every file that will be in the upload.
  const claimed = new Map();
  for (const file of own.values())
    claimed.set(file.path, { sha256: file.sha256, label: "this build" });

  const carried = [];
  const toFetch = new Map();
  for (const release of previous) {
    if (carried.length >= o.keep) break;
    // A re-run of the same commit: its files are already this build's.
    if (release.sha === o.release) continue;
    const kept = [];
    for (const file of release.files) {
      const seen = claimed.get(file.path);
      if (seen && seen.sha256 !== file.sha256) {
        if (PER_BUILD_MANIFEST.test(file.path)) {
          notes.push(`kept this build's ${file.path}; dropped release ${release.sha}'s copy`);
          continue;
        }
        throw new Error(
          `asset collision at ${file.path} between ${seen.label} and release ${release.sha}`,
        );
      }
      if (!seen) {
        claimed.set(file.path, { sha256: file.sha256, label: `release ${release.sha}` });
        toFetch.set(file.path, file);
      }
      kept.push(file);
    }
    carried.push({ ...release, files: kept });
  }

  const outFiles = walk(o.out).length;
  const carriedBytes = [...toFetch.values()].reduce((sum, file) => sum + file.size, 0);
  if (carriedBytes > o.maxBytes)
    throw new Error(`carry needs ${carriedBytes} bytes (limit ${o.maxBytes}); lower --keep`);
  // +1 for the manifest itself when this is the first one.
  const total = outFiles + toFetch.size + (existsSync(join(o.out, o.manifest)) ? 0 : 1);
  if (total > o.maxFiles)
    throw new Error(`upload would hold ${total} files (limit ${o.maxFiles}); lower --keep`);
  for (const file of toFetch.values())
    if (file.size > o.maxFileBytes)
      throw new Error(`${file.path} is ${file.size} bytes (limit ${o.maxFileBytes})`);

  const fetched = new Map();
  await pool([...toFetch.values()], o.concurrency, async (file) => {
    fetched.set(
      file.path,
      await download(o.site, file, { fetchImpl, retries: o.retries, maxFileBytes: o.maxFileBytes }),
    );
  });

  const manifest = { schema: MANIFEST_SCHEMA, releases: [ownRelease, ...carried] };
  if (!o.dryRun) {
    for (const [path, buf] of fetched) {
      const target = join(o.out, ...path.slice(1).split("/"));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, buf);
    }
    writeFileSync(join(o.out, o.manifest), `${JSON.stringify(manifest)}\n`);
  }

  return {
    release: o.release,
    carried: carried.map((row) => ({ sha: row.sha, files: row.files.length })),
    downloaded: fetched.size,
    carriedBytes,
    uploadFiles: total,
    previous: live.manifest ? "found" : live.reason,
    notes,
    dryRun: Boolean(o.dryRun),
  };
}

function parseArgs(argv) {
  const out = { dirs: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--require-previous") out.requirePrevious = true;
    else if (arg.startsWith("--") && i + 1 < argv.length) {
      const value = argv[++i];
      const key = arg.slice(2);
      if (key === "dir") out.dirs.push(value);
      else if (key === "site") out.site = value;
      else if (key === "out") out.out = value;
      else if (key === "release") out.release = value;
      else if (key === "manifest") out.manifest = value;
      else if (key === "keep") out.keep = Number(value);
      else if (key === "max-bytes") out.maxBytes = Number(value);
      else if (key === "max-files") out.maxFiles = Number(value);
      else if (key === "max-file-bytes") out.maxFileBytes = Number(value);
      else throw new Error(`Unknown option ${arg}`);
    } else throw new Error(`Unexpected argument ${arg}`);
  }
  if (!out.dirs.length) delete out.dirs;
  out.release ??= process.env.GITHUB_SHA || process.env.COMMIT_SHA;
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const summary = await carry(parseArgs(process.argv.slice(2)));
    if (process.env.GITHUB_ACTIONS)
      for (const note of summary.notes) console.log(`::warning::carry-static: ${note}`);
    console.log(JSON.stringify(summary, null, 2));
  } catch (err) {
    console.error(`carry-static: ${err.message}`);
    process.exit(1);
  }
}

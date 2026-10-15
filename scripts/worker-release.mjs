// Builds the asset directory for the conv3d-docs Cloudflare Worker.
//
// A Worker version serves only its own files, so every upload carries the
// hashed chunks and release-addressed public files of the releases before it.
// See scripts/WORKER-RELEASES.md.
//
//   seed-image <image-html-root> <carry-dir>   carry from the last nginx image
//   fetch <origin> <carry-dir>                 carry from the live Worker
//   assemble <export-dir> <sha> <carry-dir> <out-dir>
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DOCS_BOOTSTRAP } from "./docs-bootstrap.mjs";

export const ORIGIN = "https://conv3d.trebeljahr.com";
// Releases carried beside the current one. nginx kept the same window of three.
export const KEEP = 2;
// Workers Free: 20,000 files per version, 25 MiB per file, 100 _headers rules.
export const LIMITS = Object.freeze({
  files: 20000,
  fileBytes: 25 * 1024 * 1024,
  headerRules: 100,
  carryBytes: 256 * 1024 * 1024,
});

const isSha = (value) => /^[a-f0-9]{40}$/.test(value ?? "");
const SEGMENT = "[A-Za-z0-9_.~-]+";
const STATIC_PATH = new RegExp(`^/_next/static(?:/${SEGMENT})+$`);
const RELEASE_PATH = new RegExp(
  `^/_release/([a-f0-9]{40})/(?:(?:models|draco|media)(?:/${SEGMENT})+|api/search)$`,
);
// Runtime-fetched public files, addressed by release SHA (docs/lib/release-asset.ts).
const RELEASE_DIRS = ["models", "draco", "media"];
// Next writes these under the build ID, which deploymentId pins for every
// release. The current build's bytes win; old tabs never request them again.
const PER_BUILD_MANIFEST = /^\/_next\/static\/[^/]+\/_(?:build|ssg|clientMiddleware)Manifest\.js$/;
// Root names the assembler writes itself or that only the nginx image used.
const RESERVED = [
  "_headers",
  "_redirects",
  ".assetsignore",
  "_release",
  "releases.json",
  "release-assets.json",
  "__releases",
  "__legacy-assets",
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function checkPath(path, owner) {
  if (path.split("/").some((segment) => segment === "." || segment === ".."))
    throw new Error(`Unsafe asset path ${path}.`);
  if (STATIC_PATH.test(path)) return path;
  const release = RELEASE_PATH.exec(path);
  if (release && release[1] === owner) return path;
  throw new Error(`Asset path ${path} is not carried for ${owner}.`);
}

async function walk(root, prefix = "") {
  const found = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not allowed: ${relative}`);
    if (entry.isDirectory()) found.push(...(await walk(root, relative)));
    else if (entry.isFile()) found.push(relative);
    else throw new Error(`Unsupported file: ${relative}`);
  }
  return found.sort();
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function exportCommit(directory) {
  return JSON.parse(await readFile(join(directory, "version.json"), "utf8")).commit;
}

// URL path → source file for one release export: its hashed chunks and its
// runtime-fetched public files under /_release/<sha>/.
export async function releaseSources(exportDir, id) {
  const sources = new Map();
  if (await exists(join(exportDir, "_next", "static")))
    for (const file of await walk(exportDir, "_next/static"))
      sources.set(`/${file}`, join(exportDir, file));
  for (const dir of RELEASE_DIRS)
    if (await exists(join(exportDir, dir)))
      for (const file of await walk(exportDir, dir))
        sources.set(`/_release/${id}/${file}`, join(exportDir, file));
  if (await exists(join(exportDir, "api", "search")))
    sources.set(`/_release/${id}/api/search`, join(exportDir, "api", "search"));
  for (const path of sources.keys()) checkPath(path, id);
  return sources;
}

async function inventory(sources) {
  const files = [];
  for (const [path, source] of sources) {
    const bytes = await readFile(source);
    files.push({ path, size: bytes.length, sha256: sha256(bytes) });
  }
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// Same hash as retain-docs-releases.mjs's assetInventoryHash over the legacy
// _next/static tree, so the pinned baseline keeps its recorded identity.
function legacyInventoryHash(files) {
  const entries = files
    .map(({ path, size, sha256: hash }) => ({
      path: path.slice("/_next/static/".length),
      bytes: size,
      sha256: hash,
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return sha256(JSON.stringify(entries));
}

function checkGroup(group, { pinned = false } = {}) {
  if (!isSha(group?.id) || !Array.isArray(group.files) || group.files.length === 0)
    throw new Error("Invalid carried release.");
  const paths = new Set();
  for (const file of group.files) {
    checkPath(file?.path, pinned ? null : group.id);
    if (pinned && !STATIC_PATH.test(file.path)) throw new Error("Pinned assets are chunks only.");
    if (paths.has(file.path)) throw new Error(`Duplicate carried path ${file.path}.`);
    paths.add(file.path);
    if (!Number.isInteger(file.size) || file.size < 0 || file.size > LIMITS.fileBytes)
      throw new Error(`Invalid size for ${file.path}.`);
    if (!/^[a-f0-9]{64}$/.test(file.sha256 ?? ""))
      throw new Error(`Invalid hash for ${file.path}.`);
  }
  if (
    pinned &&
    (group.id !== DOCS_BOOTSTRAP.sha ||
      legacyInventoryHash(group.files) !== DOCS_BOOTSTRAP.inventorySha256)
  )
    throw new Error("Pinned legacy assets differ from the fixed baseline inventory.");
  return group;
}

export function parseManifest(manifest) {
  if (
    manifest?.schema !== 1 ||
    !isSha(manifest.head) ||
    !Array.isArray(manifest.releases) ||
    manifest.releases.length < 1 ||
    manifest.releases.length > KEEP + 1 ||
    manifest.releases[0]?.id !== manifest.head ||
    !Array.isArray(manifest.pinned) ||
    manifest.pinned.length > 1
  )
    throw new Error("Invalid release asset manifest.");
  const ids = manifest.releases.map((group) => checkGroup(group).id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate release in asset manifest.");
  for (const group of manifest.pinned) checkGroup(group, { pinned: true });
  const bytes = [...manifest.releases, ...manifest.pinned]
    .flatMap((group) => group.files)
    .reduce((total, file) => total + file.size, 0);
  if (bytes > LIMITS.carryBytes) throw new Error(`Carried assets use ${bytes} bytes.`);
  return manifest;
}

async function writeCarry(carryDir, manifest, read) {
  parseManifest(manifest);
  await mkdir(dirname(resolve(carryDir)), { recursive: true });
  await mkdir(carryDir);
  const written = new Map();
  for (const group of [...manifest.releases, ...manifest.pinned]) {
    for (const file of group.files) {
      const previous = written.get(file.path);
      if (previous) {
        if (previous !== file.sha256) throw new Error(`Asset collision at ${file.path}.`);
        continue;
      }
      const bytes = await read(file.path, group.id);
      if (bytes.length !== file.size || sha256(bytes) !== file.sha256)
        throw new Error(`Carried bytes differ from the manifest at ${file.path}.`);
      const target = join(carryDir, "files", file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
      written.set(file.path, file.sha256);
    }
  }
  await writeFile(join(carryDir, "release-assets.json"), `${JSON.stringify(manifest)}\n`);
  return { releases: manifest.releases.map((group) => group.id), files: written.size };
}

// First adoption: the nginx image keeps each retained export under
// __releases/<sha> and the legacy baseline under __legacy-assets.
export async function seedFromImage(imageRoot, carryDir) {
  const metadata = JSON.parse(await readFile(join(imageRoot, "releases.json"), "utf8"));
  if (
    metadata.schema !== 1 ||
    !Array.isArray(metadata.releases) ||
    metadata.releases[0] !== metadata.current
  )
    throw new Error("Invalid nginx release metadata.");
  const sources = new Map();
  const releases = [];
  for (const id of metadata.releases.slice(0, KEEP + 1)) {
    const exportDir = join(imageRoot, "__releases", id);
    if ((await exportCommit(exportDir)) !== id)
      throw new Error(`Export ${id} has another identity.`);
    const own = await releaseSources(exportDir, id);
    for (const [path, source] of own) sources.set(`${id}:${path}`, source);
    releases.push({ id, files: await inventory(own) });
  }
  const legacy = new Map();
  for (const file of await walk(join(imageRoot, "__legacy-assets")))
    legacy.set(`/_next/static/${file}`, join(imageRoot, "__legacy-assets", file));
  for (const [path, source] of legacy) sources.set(`${DOCS_BOOTSTRAP.sha}:${path}`, source);
  const manifest = {
    schema: 1,
    head: metadata.current,
    releases,
    pinned: [{ id: DOCS_BOOTSTRAP.sha, files: await inventory(legacy) }],
  };
  return writeCarry(carryDir, manifest, (path, id) => readFile(sources.get(`${id}:${path}`)));
}

// Later releases: the live Worker publishes what it carries in /release-assets.json.
export async function fetchCarry(origin, carryDir, { fetch: request = fetch } = {}) {
  const get = async (path) => {
    let failure;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await request(`${origin}${path}`, {
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(30000),
        });
        if (response.status !== 200) throw new Error(`HTTP ${response.status} for ${path}`);
        return Buffer.from(await response.arrayBuffer());
      } catch (error) {
        failure = error;
      }
    }
    throw failure;
  };
  const manifest = JSON.parse(
    (await get(`/release-assets.json?at=${Date.now()}`)).toString("utf8"),
  );
  return writeCarry(carryDir, manifest, get);
}

export function headersFile(sha, releases = [sha]) {
  if (!isSha(sha) || !releases.every(isSha)) throw new Error("A full commit SHA is required.");
  return [
    `# Generated by scripts/worker-release.mjs for ${sha}.`,
    "# Exported Flight data has no build ID, so Next compares this header with",
    "# its deploymentId. A different release makes the client load the page.",
    "/*",
    `  x-nextjs-deployment-id: ${sha}`,
    "/version.json",
    "  Cache-Control: no-store",
    "/releases.json",
    "  Cache-Control: no-store",
    "/release-assets.json",
    "  Cache-Control: no-store",
    "# Exported route handlers have no file extension.",
    "/api/search",
    "  Content-Type: application/json",
    ...releases.flatMap((id) => [`/_release/${id}/api/search`, "  Content-Type: application/json"]),
    "/opengraph-image",
    "  Content-Type: image/png",
    "/twitter-image",
    "  Content-Type: image/png",
    "",
  ].join("\n");
}

export async function checkLimits(outDir) {
  const files = (await walk(outDir)).filter((file) => file !== "_headers");
  if (files.length > LIMITS.files)
    throw new Error(`${files.length} files exceed the version limit.`);
  let bytes = 0;
  let largest = { file: null, size: 0 };
  for (const file of files) {
    const { size } = await lstat(join(outDir, file));
    if (size > LIMITS.fileBytes) throw new Error(`${file} exceeds the per-file limit.`);
    if (size > largest.size) largest = { file, size };
    bytes += size;
  }
  const rules = (await readFile(join(outDir, "_headers"), "utf8"))
    .split("\n")
    .filter((line) => line.startsWith("/") || line.startsWith("https://")).length;
  if (rules > LIMITS.headerRules) throw new Error(`${rules} _headers rules exceed the limit.`);
  return { files: files.length, bytes, largest, headerRules: rules };
}

export async function assemble({ exportDir, sha, carryDir, outDir }) {
  if (!isSha(sha) || (await exportCommit(exportDir)) !== sha)
    throw new Error("Export revision differs from the release SHA.");
  const exported = await walk(exportDir);
  const reserved = exported.find((file) => RESERVED.includes(file.split("/")[0]));
  if (reserved) throw new Error(`The export must not contain ${reserved}.`);
  // A fresh directory: never prune or merge into an earlier assembly.
  await mkdir(dirname(resolve(outDir)), { recursive: true });
  await mkdir(outDir);
  const place = async (path, bytes) => {
    const target = join(outDir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  };
  for (const file of exported) await place(file, await readFile(join(exportDir, file)));
  const own = await releaseSources(exportDir, sha);
  for (const [path, source] of own)
    if (path.startsWith("/_release/")) await place(path, await readFile(source));
  const head = { id: sha, files: await inventory(own) };
  const served = new Map(head.files.map((file) => [file.path, file.sha256]));

  const carried = carryDir
    ? parseManifest(JSON.parse(await readFile(join(carryDir, "release-assets.json"), "utf8")))
    : { releases: [], pinned: [] };
  const groups = [];
  for (const [kind, group] of [
    ...carried.releases
      .filter(({ id }) => id !== sha)
      .slice(0, KEEP)
      .map((group) => ["release", group]),
    ...carried.pinned.map((group) => ["pinned", group]),
  ]) {
    const files = [];
    for (const file of group.files) {
      const bytes = await readFile(join(carryDir, "files", file.path));
      if (bytes.length !== file.size || sha256(bytes) !== file.sha256)
        throw new Error(`Carried bytes differ from the manifest at ${file.path}.`);
      const current = served.get(file.path);
      if (current && current !== file.sha256) {
        if (PER_BUILD_MANIFEST.test(file.path)) continue;
        throw new Error(`Asset collision at ${file.path}.`);
      }
      if (!current) {
        await place(file.path, bytes);
        served.set(file.path, file.sha256);
      }
      files.push(file);
    }
    groups.push([kind, { id: group.id, files }]);
  }
  const releases = [
    head,
    ...groups.filter(([kind]) => kind === "release").map(([, group]) => group),
  ];
  const pinned = groups.filter(([kind]) => kind === "pinned").map(([, group]) => group);
  const manifest = parseManifest({ schema: 1, head: sha, releases, pinned });
  await writeFile(join(outDir, "release-assets.json"), `${JSON.stringify(manifest)}\n`);
  // ReleaseLifetime reloads a tab whose release is no longer listed here.
  await writeFile(
    join(outDir, "releases.json"),
    `${JSON.stringify({ schema: 2, head: sha, releases: releases.map(({ id }) => id) })}\n`,
  );
  await writeFile(
    join(outDir, "_headers"),
    headersFile(
      sha,
      releases.map(({ id }) => id),
    ),
  );
  return { head: sha, releases: releases.map(({ id }) => id), ...(await checkLimits(outDir)) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  try {
    let result;
    if (command === "seed-image") result = await seedFromImage(rest[0], rest[1]);
    else if (command === "fetch") result = await fetchCarry(rest[0] || ORIGIN, rest[1]);
    else if (command === "assemble")
      result = await assemble({
        exportDir: rest[0],
        sha: rest[1],
        carryDir: rest[2],
        outDir: rest[3],
      });
    else throw new Error("usage: worker-release.mjs seed-image|fetch|assemble ...");
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Worker release step failed.");
    process.exitCode = 1;
  }
}

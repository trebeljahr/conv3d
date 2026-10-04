import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  lstat,
  rename,
  rm,
  link,
  copyFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DOCS_BOOTSTRAP } from "./docs-bootstrap.mjs";
import { assetInventoryHash } from "./retain-docs-releases.mjs";

export const STORE = "/var/lib/conv3d-docs-releases";
export const STORE_ID = Object.freeze({
  schema: 1,
  app: "trebeljahr/conv3d",
  volume: "conv3d-docs-releases",
  purpose: "immutable-docs-releases",
});
const MAX_STORE_BYTES = 256 * 1024 * 1024;
const MAX_STORE_FILES = 20000;
const isSha = (value) => /^[a-f0-9]{40}$/.test(value ?? "");
async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
async function present(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
async function files(root, prefix = "") {
  if (!(await lstat(root)).isDirectory()) throw new Error("Expected a real directory.");
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) result.push(...(await files(join(root, entry.name), relative + "/")));
    else if (entry.isFile()) result.push(relative);
    else throw new Error("Unsupported release file.");
  }
  return result;
}
async function safeDirectory(path) {
  await mkdir(path, { recursive: true });
  if (!(await lstat(path)).isDirectory()) throw new Error("Expected a real directory.");
}
async function copyTree(from, to) {
  await safeDirectory(to);
  for (const relative of await files(from)) {
    const target = join(to, relative);
    await safeDirectory(resolve(target, ".."));
    await copyFile(join(from, relative), target);
  }
}
async function atomicJson(path, data) {
  const temporary = path + "." + randomUUID();
  await writeFile(temporary, JSON.stringify(data) + "\n", { flag: "wx" });
  await rename(temporary, path);
}
export async function validateMount(store = STORE, mountInfo) {
  if (store !== STORE) throw new Error("Unexpected release store path.");
  if (!(await lstat(store)).isDirectory()) throw new Error("Release store is not a directory.");
  const info = mountInfo ?? (await readFile("/proc/self/mountinfo", "utf8"));
  const mounts = info
    .trim()
    .split("\n")
    .filter((line) => line.split(" ")[4] === STORE);
  if (mounts.length !== 1 || !mounts[0].split(" ")[5].split(",").includes("rw"))
    throw new Error("Required writable release-store mount is absent.");
  // Before locking, inspect only stable names. Another publisher can be
  // atomically replacing trees; the full recursive check runs under the lock.
  for (const entry of await readdir(store, { withFileTypes: true }))
    if (entry.isSymbolicLink()) throw new Error("Unexpected store symlink.");
  const leases = join(store, "leases");
  if (await present(leases)) await files(leases);
  const publishLock = join(store, ".publish.lock");
  if ((await present(publishLock)) && !(await lstat(publishLock)).isFile())
    throw new Error("Invalid publication lock.");
  const marker = await json(join(store, ".store-identity.json"));
  if (JSON.stringify(marker) !== JSON.stringify(STORE_ID))
    throw new Error("Release store identity differs.");
}
export async function releaseSha(source) {
  const sha = (await json(join(source, "version.json"))).commit;
  if (!isSha(sha)) throw new Error("Invalid local release.");
  return sha;
}
function heldLease(path) {
  const result = spawnSync("flock", ["-n", "-x", path, "true"], {
    stdio: "ignore",
  });
  if (result.status === 0) return false;
  if (result.status === 1) return true;
  throw new Error("Could not inspect a release lease.");
}

// Call with the global publish lock held and a shared lease on this image's SHA.
// Test injection supplies only a synthetic baseline and lease observer.
export async function publishRelease(
  source,
  store,
  { bootstrap = DOCS_BOOTSTRAP, isHeld = heldLease } = {},
) {
  await files(store);
  // Bound even crash leftovers or repeatedly rejected candidates. Reproducible
  // docs must never turn this app-owned volume into an unbounded asset archive.
  let bytes = 0,
    count = 0;
  for (const root of [store, source])
    for (const name of await files(root)) {
      bytes += (await lstat(join(root, name))).size;
      count++;
      if (bytes > MAX_STORE_BYTES || count > MAX_STORE_FILES)
        throw new Error("Release store capacity requires reconciliation.");
    }
  const meta = await json(join(source, "releases.json"));
  if (
    meta.schema !== 1 ||
    meta.current !== (await releaseSha(source)) ||
    !Array.isArray(meta.releases) ||
    meta.releases.length > 3 ||
    meta.releases[0] !== meta.current ||
    // The legacy parent has no selectable snapshot; later parents must.
    (meta.releases.length === 1
      ? meta.previousSha !== bootstrap.sha
      : meta.releases[1] !== meta.previousSha) ||
    meta.releases.some((id) => !isSha(id)) ||
    new Set(meta.releases).size !== meta.releases.length ||
    JSON.stringify(meta.legacyAssets) !== JSON.stringify(bootstrap)
  )
    throw new Error("Invalid image retention metadata.");
  const legacy = join(source, "__legacy-assets");
  if ((await assetInventoryHash(legacy)) !== bootstrap.inventorySha256)
    throw new Error("Bootstrap bytes changed.");
  for (const directory of ["releases", "leases", "_next/static"])
    await safeDirectory(join(store, directory));
  let old = null;
  if (await present(join(store, "releases.json"))) old = await json(join(store, "releases.json"));
  if (
    old &&
    (old.schema !== 2 ||
      !isSha(old.head) ||
      !Array.isArray(old.window) ||
      old.window.length > 3 ||
      old.window[0] !== old.head ||
      old.window.some((id) => !isSha(id)) ||
      !Array.isArray(old.releases) ||
      old.releases.length > 6 ||
      old.releases.some((id) => !isSha(id)))
  )
    throw new Error("Invalid shared retention metadata.");
  if (!old && (meta.previousSha !== bootstrap.sha || meta.previousDigest !== bootstrap.digest))
    throw new Error("Only the fixed first adoption may initialize an empty store.");
  const restarting = old?.window.includes(meta.current);
  if (old && !restarting && old.head !== meta.previousSha)
    throw new Error(
      "Prepared head differs from the image parent; reconcile the failed candidate first.",
    );
  const window = restarting ? old.window : meta.releases;
  const held = [];
  for (const name of await readdir(join(store, "leases"))) {
    if (!/^[a-f0-9]{40}\.lock$/.test(name) || !(await lstat(join(store, "leases", name))).isFile())
      throw new Error("Invalid lease file.");
    if (isHeld(join(store, "leases", name))) held.push(name.slice(0, 40));
  }
  if (held.length > 3 || !held.includes(meta.current))
    throw new Error("Missing image lease or too many live releases.");
  const keep = [...new Set([...window, ...held])];
  // Publish all snapshots before exposing metadata or starting nginx.
  for (const id of keep) {
    const destination = join(store, "releases", id);
    const input = join(source, "__releases", id);
    if (!meta.releases.includes(id)) {
      if (!(await present(destination)) || (await releaseSha(destination)) !== id)
        throw new Error("A serving image has lost its leased export.");
      continue;
    }
    if ((await releaseSha(input)) !== id) throw new Error("Snapshot identity differs.");
    const expected = await assetInventoryHash(input);
    if (await present(destination)) {
      if ((await assetInventoryHash(destination)) !== expected)
        throw new Error("Immutable export collision.");
    } else {
      const staging = join(store, ".stage-" + randomUUID());
      try {
        await copyTree(input, staging);
        await rename(staging, destination);
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
    }
  }
  const required = new Set();
  for (const input of [legacy, ...keep.map((id) => join(store, "releases", id, "_next/static"))]) {
    for (const relative of await files(input)) {
      required.add(relative);
      const destination = join(store, "_next/static", relative);
      await safeDirectory(resolve(destination, ".."));
      if (await present(destination)) {
        if (
          !(await lstat(destination)).isFile() ||
          !(await readFile(destination)).equals(await readFile(join(input, relative)))
        )
          throw new Error("Immutable asset collision.");
      } else {
        // Copy into the volume, then atomically link: readers never see a partial file.
        const staged = join(store, ".asset-" + randomUUID());
        try {
          await copyFile(join(input, relative), staged);
          await link(staged, destination);
        } finally {
          await rm(staged, { force: true });
        }
      }
    }
  }
  const metadata = {
    schema: 2,
    head: restarting ? old.head : meta.current,
    window,
    releases: keep,
    legacyAssets: bootstrap,
  };
  await atomicJson(join(store, "releases.json"), metadata);
  // Kernel leases protect every still-running image, including the retiring one.
  for (const id of await readdir(join(store, "releases"))) {
    if (!isSha(id) || !(await lstat(join(store, "releases", id))).isDirectory())
      throw new Error("Invalid shared release directory.");
    if (!keep.includes(id)) await rm(join(store, "releases", id), { recursive: true });
  }
  for (const relative of await files(join(store, "_next/static")))
    if (!required.has(relative)) await rm(join(store, "_next/static", relative));
  return metadata;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [operation, source = "/usr/share/nginx/html"] = process.argv.slice(2);
    await validateMount();
    if (operation === "check") console.log(await releaseSha(source));
    else if (operation === "publish") await publishRelease(source, STORE);
    else throw new Error("Unknown release-store operation.");
  } catch {
    console.error("Shared documentation release preparation failed.");
    process.exitCode = 1;
  }
}

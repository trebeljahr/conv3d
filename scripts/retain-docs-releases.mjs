import { createHash } from "node:crypto";
import { DOCS_BOOTSTRAP } from "./docs-bootstrap.mjs";
import { copyFile, mkdir, readFile, readdir, lstat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const isSha = (value) => /^[a-f0-9]{40}$/.test(value ?? "");
const isDigest = (value) => /^sha256:[a-f0-9]{64}$/.test(value ?? "");
async function version(directory) {
  return JSON.parse(await readFile(join(directory, "version.json"), "utf8")).commit;
}
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function copyTree(source, target, { root = true, collisionCheck = false } = {}) {
  if (!(await lstat(source)).isDirectory()) throw new Error("Expected an export directory.");
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (root && ["__releases", "__legacy-assets", "releases.json"].includes(entry.name)) continue;
    const from = join(source, entry.name),
      to = join(target, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Symlinks are not allowed in retained exports.");
    if (entry.isDirectory()) await copyTree(from, to, { root: false, collisionCheck });
    else if (entry.isFile()) {
      if (collisionCheck) {
        try {
          if (!(await readFile(from)).equals(await readFile(to)))
            throw new Error("Immutable asset path collision.");
          continue;
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      await copyFile(from, to);
    } else throw new Error("Unsupported exported file.");
  }
}

export async function assetInventoryHash(directory) {
  const entries = [];
  async function walk(path, prefix = "") {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error("Symlinks are not allowed in bootstrap assets.");
      if (entry.isDirectory()) await walk(join(path, entry.name), relative + "/");
      else if (entry.isFile()) {
        const bytes = await readFile(join(path, entry.name));
        entries.push({
          path: relative,
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      } else throw new Error("Unsupported bootstrap asset.");
    }
  }
  await walk(directory);
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

// The second argument isolates synthetic tests. The Docker CLI always uses the fixed baseline above.
export async function retainDocsReleases(
  { current, previous, output, sha, previousSha, previousDigest },
  { bootstrap = DOCS_BOOTSTRAP } = {},
) {
  if (!isSha(sha) || !isSha(previousSha) || sha === previousSha || !isDigest(previousDigest))
    throw new Error("Invalid release ancestry.");
  if ((await version(current)) !== sha)
    throw new Error("Export revision differs from image ancestry.");
  let old = null;
  try {
    old = JSON.parse(await readFile(join(previous, "releases.json"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (
    old &&
    (old.schema !== 1 ||
      old.current !== previousSha ||
      !Array.isArray(old.releases) ||
      old.releases.length > 3 ||
      old.releases[0] !== previousSha ||
      old.releases.some((id) => !isSha(id)) ||
      new Set(old.releases).size !== old.releases.length)
  )
    throw new Error("Invalid retained release metadata.");
  const inherited = old?.legacyAssets;
  if (
    inherited &&
    (inherited.sha !== bootstrap.sha ||
      inherited.digest !== bootstrap.digest ||
      inherited.inventorySha256 !== bootstrap.inventorySha256 ||
      inherited.indexSha256 !== bootstrap.indexSha256)
  )
    throw new Error("Bootstrap asset identity changed.");
  if (!inherited && (previousSha !== bootstrap.sha || previousDigest !== bootstrap.digest))
    throw new Error("The fixed bootstrap image is required before retaining legacy assets.");
  // The legacy image predates version.json. Its exact homepage bytes identify it.
  if (
    inherited
      ? (await version(previous)) !== previousSha
      : sha256(await readFile(join(previous, "index.html"))) !== bootstrap.indexSha256
  )
    throw new Error("Export revision differs from image ancestry.");
  // Legacy tabs send no deployment ID, so its snapshot could never be selected.
  const releases = old ? [sha, ...old.releases.slice(0, 2)] : [sha];
  const legacySource = inherited
    ? join(previous, "__legacy-assets")
    : join(previous, "_next", "static");
  if ((await assetInventoryHash(legacySource)) !== bootstrap.inventorySha256)
    throw new Error("Bootstrap asset bytes differ from the fixed image inventory.");
  const destination = resolve(output);
  for (const input of [current, previous]) {
    const source = resolve(input);
    if (destination === source || destination.startsWith(source + "/"))
      throw new Error("Output must be outside input exports.");
  }
  // A fresh directory prevents accidental in-place pruning of an input or user data.
  await mkdir(output);
  for (const id of releases) {
    const source = id === sha ? current : join(previous, "__releases", id);
    if ((await version(source)) !== id)
      throw new Error("Retained export identity differs from its directory.");
    await copyTree(source, join(output, "__releases", id));
  }
  await copyTree(current, output);
  await copyTree(legacySource, join(output, "__legacy-assets"), { root: false });
  await copyTree(legacySource, join(output, "_next", "static"), {
    root: false,
    collisionCheck: true,
  });
  for (const id of releases) {
    await copyTree(
      join(output, "__releases", id, "_next", "static"),
      join(output, "_next", "static"),
      { root: false, collisionCheck: true },
    );
  }
  const metadata = {
    schema: 1,
    current: sha,
    previousSha,
    previousDigest,
    releases,
    legacyAssets: bootstrap,
  };
  await writeFile(join(output, "releases.json"), JSON.stringify(metadata) + "\n");
  return metadata;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [current, previous, output, sha, previousSha, previousDigest] = process.argv.slice(2);
  try {
    await retainDocsReleases({ current, previous, output, sha, previousSha, previousDigest });
  } catch {
    console.error(
      "Retained export construction failed; check identities, paths and immutable asset collisions.",
    );
    process.exitCode = 1;
  }
}

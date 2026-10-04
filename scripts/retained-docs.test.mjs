import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
const indexSha = async (path) =>
  createHash("sha256")
    .update(await readFile(join(path, "index.html")))
    .digest("hex");
import { retainDocsReleases, assetInventoryHash } from "./retain-docs-releases.mjs";
const ids = ["a", "b", "c", "d", "e"].map((letter) => letter.repeat(40));
const digest = "sha256:" + "1".repeat(64);
async function exportFixture(root, id) {
  const path = join(root, id);
  await mkdir(join(path, "_next/static/chunks"), { recursive: true });
  await writeFile(join(path, "version.json"), JSON.stringify({ commit: id }));
  await writeFile(
    join(path, "index.html"),
    `<html><head><meta name="build-sha" content="${id}"></head></html>`,
  );
  await writeFile(join(path, "docs.txt"), `RSC-${id}`);
  await writeFile(join(path, "_next/static/chunks", `${id}.js`), `window.fixture = '${id}';`);
  return path;
}
test("retains exact old RSC and changed lazy chunks, then prunes outside three releases", async () => {
  const root = await mkdtemp(join(tmpdir(), "docs-retention-"));
  try {
    let previous = await exportFixture(root, ids[0]);
    await rm(join(previous, "version.json")); // the legacy image predates version.json
    const bootstrap = {
      sha: ids[0],
      digest,
      inventorySha256: await assetInventoryHash(join(previous, "_next/static")),
      indexSha256: await indexSha(previous),
    };
    for (let i = 1; i < ids.length; i++) {
      const current = await exportFixture(root, ids[i]);
      const output = join(root, `combined-${i}`);
      const result = await retainDocsReleases(
        { current, previous, output, sha: ids[i], previousSha: ids[i - 1], previousDigest: digest },
        { bootstrap },
      );
      const expected = ids.slice(Math.max(1, i - 2), i + 1).reverse(); // no selectable legacy snapshot
      assert.deepEqual(result.releases, expected);
      assert.equal(JSON.parse(await readFile(join(output, "version.json"))).commit, ids[i]);
      for (const id of expected) {
        assert.equal(
          await readFile(join(output, "__releases", id, "docs.txt"), "utf8"),
          `RSC-${id}`,
        );
        assert.equal(
          await readFile(join(output, "_next/static/chunks", `${id}.js`), "utf8"),
          `window.fixture = '${id}';`,
        );
      }
      previous = output;
    }
    await assert.rejects(access(join(previous, "__releases", ids[0])));
    await assert.rejects(access(join(previous, "__releases", ids[1])));
    await access(join(previous, "_next/static/chunks", `${ids[0]}.js`));
    await assert.rejects(access(join(previous, "_next/static/chunks", `${ids[1]}.js`)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("rejects wrong ancestry, injected release paths, symlinks, and immutable path collisions", async () => {
  const root = await mkdtemp(join(tmpdir(), "docs-retention-bad-"));
  try {
    const previous = await exportFixture(root, ids[0]),
      current = await exportFixture(root, ids[1]);
    const bootstrap = {
      sha: ids[0],
      digest,
      inventorySha256: await assetInventoryHash(join(previous, "_next/static")),
      indexSha256: await indexSha(previous),
    };
    const base = {
      current,
      previous,
      output: join(root, "output"),
      sha: ids[1],
      previousSha: ids[0],
      previousDigest: digest,
    };
    await assert.rejects(
      retainDocsReleases({ ...base, previousSha: ids[2] }, { bootstrap }),
      /bootstrap image/,
    );
    await writeFile(join(previous, "index.html"), "another legacy page");
    await assert.rejects(retainDocsReleases(base, { bootstrap }), /ancestry/);
    await writeFile(
      join(previous, "index.html"),
      `<html><head><meta name="build-sha" content="${ids[0]}"></head></html>`,
    );
    await assert.rejects(
      retainDocsReleases({ ...base, output: join(current, "nested") }, { bootstrap }),
      /outside/,
    );
    await writeFile(
      join(previous, "releases.json"),
      JSON.stringify({ schema: 1, current: ids[0], releases: [ids[0], "../../escape"] }),
    );
    await assert.rejects(retainDocsReleases(base, { bootstrap }), /metadata/);
    await rm(join(previous, "releases.json"));
    await symlink("/tmp", join(current, "escape"));
    await assert.rejects(retainDocsReleases(base, { bootstrap }), /Symlinks/);
    await rm(join(current, "escape"));
    await rm(base.output, { recursive: true });
    await writeFile(
      join(current, "_next/static/chunks", `${ids[0]}.js`),
      "changed bytes behind immutable URL",
    );
    await assert.rejects(retainDocsReleases(base, { bootstrap }), /collision/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("pins bootstrap identity and rejects changed inherited bytes or metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "docs-bootstrap-"));
  try {
    const a = await exportFixture(root, ids[0]),
      b = await exportFixture(root, ids[1]);
    const bootstrap = {
      sha: ids[0],
      digest,
      inventorySha256: await assetInventoryHash(join(a, "_next/static")),
      indexSha256: await indexSha(a),
    };
    const first = {
      current: b,
      previous: a,
      output: join(root, "first"),
      sha: ids[1],
      previousSha: ids[0],
      previousDigest: digest,
    };
    await assert.rejects(
      retainDocsReleases({ ...first, previousDigest: "sha256:" + "2".repeat(64) }, { bootstrap }),
      /fixed bootstrap image/,
    );
    await retainDocsReleases(first, { bootstrap });
    const c = await exportFixture(root, ids[2]);
    const next = {
      current: c,
      previous: first.output,
      output: join(root, "next"),
      sha: ids[2],
      previousSha: ids[1],
      previousDigest: digest,
    };
    const metadataPath = join(first.output, "releases.json");
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    await writeFile(
      metadataPath,
      JSON.stringify({
        ...metadata,
        legacyAssets: { ...bootstrap, digest: "sha256:" + "2".repeat(64) },
      }),
    );
    await assert.rejects(retainDocsReleases(next, { bootstrap }), /identity changed/);
    await writeFile(metadataPath, JSON.stringify(metadata));
    await writeFile(
      join(first.output, "__legacy-assets/chunks", `${ids[0]}.js`),
      "tampered legacy bytes",
    );
    await assert.rejects(retainDocsReleases(next, { bootstrap }), /fixed image inventory/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

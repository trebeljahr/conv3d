import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assemble, fetchCarry, headersFile, parseManifest } from "./worker-release.mjs";

const ids = ["a", "b", "c", "d"].map((letter) => letter.repeat(40));
const SEARCH = (id) => `/_release/${id}/api/search`;

async function exportFixture(
  root,
  id,
  { chunk = `window.fixture = '${id}';`, manifest = "self.__BUILD_MANIFEST={}" } = {},
) {
  const path = join(root, `export-${id}`);
  await mkdir(join(path, "_next/static/chunks"), { recursive: true });
  await mkdir(join(path, "_next/static/build-fixed"), { recursive: true });
  await mkdir(join(path, "models/funnel"), { recursive: true });
  await mkdir(join(path, "api"), { recursive: true });
  await writeFile(join(path, "version.json"), JSON.stringify({ commit: id }));
  await writeFile(
    join(path, "index.html"),
    `<html><head><meta name="build-sha" content="${id}"></head></html>`,
  );
  await writeFile(join(path, "404.html"), "missing");
  await writeFile(join(path, "_next/static/chunks", `${id.slice(0, 6)}~x.js`), chunk);
  await writeFile(join(path, "_next/static/chunks/shared.js"), "shared");
  await writeFile(join(path, "_next/static/build-fixed/_buildManifest.js"), manifest);
  await writeFile(join(path, "models/funnel/Knight.glb"), `glb-${id}`);
  await writeFile(join(path, "api/search"), JSON.stringify({ id }));
  return path;
}

// Serves an assembled directory the way the Worker does, for fetchCarry.
const serve = (dir) => async (url) => {
  const path = new URL(url).pathname;
  try {
    return new Response(await readFile(join(dir, path)), { status: 200 });
  } catch {
    return new Response("missing", { status: 404 });
  }
};

async function release(root, id, previous, options) {
  const exportDir = await exportFixture(root, id, options);
  let carryDir;
  if (previous) {
    carryDir = join(root, `carry-${id}`);
    await fetchCarry("https://conv3d.test", carryDir, { fetch: serve(previous) });
  }
  const outDir = join(root, `out-${id}`);
  return { outDir, result: await assemble({ exportDir, sha: id, carryDir, outDir }) };
}

test("carries two earlier releases through the live manifest and drops the third", async () => {
  const root = await mkdtemp(join(tmpdir(), "worker-release-"));
  try {
    let previous;
    const outs = [];
    for (const id of ids) {
      const { outDir, result } = await release(root, id, previous);
      outs.push(outDir);
      previous = outDir;
      assert.equal(result.head, id);
    }
    const last = outs.at(-1);
    const releases = JSON.parse(await readFile(join(last, "releases.json"), "utf8"));
    assert.deepEqual(releases, { schema: 2, head: ids[3], releases: [ids[3], ids[2], ids[1]] });
    for (const id of [ids[1], ids[2], ids[3]]) {
      assert.equal(
        await readFile(join(last, `_next/static/chunks/${id.slice(0, 6)}~x.js`), "utf8"),
        `window.fixture = '${id}';`,
      );
      assert.equal(
        await readFile(join(last, `_release/${id}/models/funnel/Knight.glb`), "utf8"),
        `glb-${id}`,
      );
      assert.equal(await readFile(join(last, SEARCH(id)), "utf8"), JSON.stringify({ id }));
    }
    await assert.rejects(readFile(join(last, `_next/static/chunks/${ids[0].slice(0, 6)}~x.js`)), {
      code: "ENOENT",
    });
    await assert.rejects(readFile(join(last, `_release/${ids[0]}/api/search`)), { code: "ENOENT" });
    // Current HTML only: no earlier release's pages are served.
    assert.match(await readFile(join(last, "index.html"), "utf8"), new RegExp(ids[3]));
    const manifest = parseManifest(
      JSON.parse(await readFile(join(last, "release-assets.json"), "utf8")),
    );
    assert.deepEqual(
      manifest.releases.map(({ id }) => id),
      [ids[3], ids[2], ids[1]],
    );
    const headers = await readFile(join(last, "_headers"), "utf8");
    assert.match(headers, new RegExp(`^/\\*\\n  x-nextjs-deployment-id: ${ids[3]}$`, "m"));
    assert.match(headers, /^\/version\.json\n {2}Cache-Control: no-store$/m);
    assert.match(
      headers,
      new RegExp(`^${SEARCH(ids[1])}\\n  Content-Type: application/json$`, "m"),
    );
    assert.doesNotMatch(headers, /immutable/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses a hashed path whose bytes changed between releases", async () => {
  const root = await mkdtemp(join(tmpdir(), "worker-release-"));
  try {
    const { outDir } = await release(root, ids[0]);
    const exportDir = await exportFixture(root, ids[1]);
    await writeFile(join(exportDir, "_next/static/chunks/shared.js"), "changed");
    const carryDir = join(root, "carry");
    await fetchCarry("https://conv3d.test", carryDir, { fetch: serve(outDir) });
    await assert.rejects(
      assemble({ exportDir, sha: ids[1], carryDir, outDir: join(root, "out") }),
      /Asset collision at \/_next\/static\/chunks\/shared\.js/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps the current build manifest and stops listing the old one", async () => {
  const root = await mkdtemp(join(tmpdir(), "worker-release-"));
  try {
    const first = await release(root, ids[0]);
    const { outDir } = await release(root, ids[1], first.outDir, {
      manifest: "self.__BUILD_MANIFEST={b:1}",
    });
    assert.equal(
      await readFile(join(outDir, "_next/static/build-fixed/_buildManifest.js"), "utf8"),
      "self.__BUILD_MANIFEST={b:1}",
    );
    const manifest = JSON.parse(await readFile(join(outDir, "release-assets.json"), "utf8"));
    const old = manifest.releases.find(({ id }) => id === ids[0]);
    assert.equal(
      old.files.some(({ path }) => path.endsWith("_buildManifest.js")),
      false,
    );
    // The next release can fetch every listed file with matching bytes.
    await fetchCarry("https://conv3d.test", join(root, "again"), { fetch: serve(outDir) });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects tampered bytes, unsafe paths and foreign release paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "worker-release-"));
  try {
    const { outDir } = await release(root, ids[0]);
    await writeFile(join(outDir, SEARCH(ids[0])), "tampered");
    await assert.rejects(
      fetchCarry("https://conv3d.test", join(root, "carry"), { fetch: serve(outDir) }),
      /Carried bytes differ/,
    );
    const manifest = JSON.parse(await readFile(join(outDir, "release-assets.json"), "utf8"));
    const file = manifest.releases[0].files[0];
    for (const path of [
      "/_next/static/../../etc/passwd",
      "/_next/static/chunks/./x.js",
      `${SEARCH(ids[1])}`,
      "/index.html",
    ]) {
      const bad = structuredClone(manifest);
      bad.releases[0].files[0] = { ...file, path };
      assert.throws(() => parseManifest(bad));
    }
    const pinned = structuredClone(manifest);
    pinned.pinned = [{ id: ids[1], files: [file] }];
    assert.throws(() => parseManifest(pinned), /Pinned/);
    const missing = await mkdtemp(join(tmpdir(), "worker-release-none-"));
    await assert.rejects(
      fetchCarry("https://conv3d.test", join(root, "carry-none"), { fetch: serve(missing) }),
      /HTTP 404/,
    );
    await rm(missing, { recursive: true, force: true });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses a mismatched export, reserved names and an existing output", async () => {
  const root = await mkdtemp(join(tmpdir(), "worker-release-"));
  try {
    const exportDir = await exportFixture(root, ids[0]);
    await assert.rejects(
      assemble({ exportDir, sha: ids[1], outDir: join(root, "o1") }),
      /revision/,
    );
    await mkdir(join(root, "o2"));
    await assert.rejects(assemble({ exportDir, sha: ids[0], outDir: join(root, "o2") }), {
      code: "EEXIST",
    });
    await writeFile(join(exportDir, "_headers"), "/*\n  x: y\n");
    await assert.rejects(
      assemble({ exportDir, sha: ids[0], outDir: join(root, "o3") }),
      /must not contain _headers/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails a file over the Workers per-file limit", async () => {
  const root = await mkdtemp(join(tmpdir(), "worker-release-"));
  try {
    const exportDir = await exportFixture(root, ids[0]);
    await writeFile(join(exportDir, "press-kit.zip"), Buffer.alloc(25 * 1024 * 1024 + 1));
    await assert.rejects(
      assemble({ exportDir, sha: ids[0], outDir: join(root, "out") }),
      /per-file limit/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writes no header rule without a full SHA", () => {
  assert.throws(() => headersFile("abc"));
  assert.throws(() => headersFile(ids[0], ["abc"]));
});

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { carry } from "./carry-static.mjs";
import { CARRY_DIRS, finish, headersFile, stage } from "./worker-release.mjs";

const ids = ["a", "b", "c", "d"].map((letter) => letter.repeat(40));
const chunk = (id) => `_next/static/chunks/${id.slice(0, 6)}~x.js`;

async function exportFixture(root, id) {
  const path = join(root, `export-${id}`);
  await mkdir(join(path, "_next/static/chunks"), { recursive: true });
  await mkdir(join(path, "models/funnel"), { recursive: true });
  await mkdir(join(path, "api"), { recursive: true });
  await writeFile(join(path, "version.json"), JSON.stringify({ commit: id }));
  await writeFile(join(path, "index.html"), `<html><head><meta name="build-sha" content="${id}"></head></html>`);
  await writeFile(join(path, chunk(id)), `window.fixture = '${id}';`);
  await writeFile(join(path, "_next/static/chunks/shared.js"), "shared");
  await writeFile(join(path, "models/funnel/Knight.glb"), `glb-${id}`);
  await writeFile(join(path, "api/search"), JSON.stringify({ id }));
  return path;
}

// Serves a finished export the way the Worker does.
const serve = (dir) => async (url) => {
  try {
    return new Response(await readFile(join(dir, new URL(url).pathname)), { status: 200 });
  } catch {
    return new Response("missing", { status: 404 });
  }
};

async function release(root, id, live) {
  const out = await exportFixture(root, id);
  await stage(out, id);
  await carry({ site: "https://conv3d.test", out, release: id, dirs: CARRY_DIRS, fetch: serve(live ?? root) });
  return { out, result: await finish(out, id) };
}

test("each version carries two earlier releases' chunks and release files", async () => {
  const root = await mkdtemp(join(tmpdir(), "worker-release-"));
  try {
    let live;
    for (const id of ids) ({ out: live } = await release(root, id, live));
    const releases = JSON.parse(await readFile(join(live, "releases.json"), "utf8"));
    assert.deepEqual(releases, { schema: 2, head: ids[3], releases: [ids[3], ids[2], ids[1]] });
    for (const id of ids.slice(1)) {
      assert.equal(await readFile(join(live, chunk(id)), "utf8"), `window.fixture = '${id}';`);
      assert.equal(await readFile(join(live, `_release/${id}/models/funnel/Knight.glb`), "utf8"), `glb-${id}`);
      assert.equal(await readFile(join(live, `_release/${id}/api/search`), "utf8"), JSON.stringify({ id }));
    }
    await assert.rejects(readFile(join(live, chunk(ids[0]))), { code: "ENOENT" });
    await assert.rejects(readFile(join(live, `_release/${ids[0]}/api/search`)), { code: "ENOENT" });
    // Only the current release's pages are served.
    assert.match(await readFile(join(live, "index.html"), "utf8"), new RegExp(ids[3]));
    const headers = await readFile(join(live, "_headers"), "utf8");
    assert.match(headers, new RegExp(`^/\\*\\n {2}x-nextjs-deployment-id: ${ids[3]}$`, "m"));
    assert.match(headers, /^\/version\.json\n {2}Cache-Control: no-store$/m);
    assert.match(headers, /^\/release-assets\.json\n {2}Cache-Control: no-store$/m);
    assert.match(headers, new RegExp(`^/_release/${ids[1]}/api/search\\n {2}Content-Type: application/json$`, "m"));
    assert.doesNotMatch(headers, /immutable/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("finish refuses release files listed for another release or left unlisted", async () => {
  const root = await mkdtemp(join(tmpdir(), "worker-release-"));
  try {
    const { out } = await release(root, ids[0]);
    const manifest = JSON.parse(await readFile(join(out, "release-assets.json"), "utf8"));
    const foreign = structuredClone(manifest);
    foreign.releases[0].files[0].path = `/_release/${ids[1]}/api/search`;
    await writeFile(join(out, "release-assets.json"), JSON.stringify(foreign));
    await assert.rejects(finish(out, ids[0]), /is listed for release/);
    await writeFile(join(out, "release-assets.json"), JSON.stringify(manifest));
    await mkdir(join(out, `_release/${ids[2]}`));
    await assert.rejects(finish(out, ids[0]), /belongs to no listed release/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stage refuses a mismatched export and names the assembler writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "worker-release-"));
  try {
    const out = await exportFixture(root, ids[0]);
    await assert.rejects(stage(out, ids[1]), /revision/);
    await writeFile(join(out, "_headers"), "/*\n  x: y\n");
    await assert.rejects(stage(out, ids[0]), /must not contain _headers/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("finish fails a file over the Workers per-file limit", async () => {
  const root = await mkdtemp(join(tmpdir(), "worker-release-"));
  try {
    const out = await exportFixture(root, ids[0]);
    await writeFile(join(out, "press-kit.zip"), Buffer.alloc(25 * 1024 * 1024 + 1));
    await stage(out, ids[0]);
    await carry({ site: "https://conv3d.test", out, release: ids[0], dirs: CARRY_DIRS, fetch: serve(root) });
    await assert.rejects(finish(out, ids[0]), /per-file limit/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writes no header rule without a full SHA", () => {
  assert.throws(() => headersFile("abc"));
  assert.throws(() => headersFile(ids[0], ["abc"]));
});

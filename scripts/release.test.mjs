import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { verifyRelease, ORIGINS, PAGE_MARKER } from "./verify-release.mjs";
const SHA = "a".repeat(40);
function transport(commits, { cache = "no-store", marker = PAGE_MARKER, htmlCommit = SHA } = {}) {
  return async (url) => {
    assert.ok(ORIGINS.includes(new URL(url).origin));
    if (new URL(url).pathname === "/version.json") {
      const index = Number(new URL(url).searchParams.get("release").split("-")[1]);
      return new Response(JSON.stringify({ commit: commits[index] ?? commits.at(-1) }), {
        headers: { "Cache-Control": cache },
      });
    }
    return new Response(
      `<head><title>${marker}</title><meta name="build-sha" content="${htmlCommit}"></head>`,
    );
  };
}
test("writes only a validated full release identity", () => {
  const directory = mkdtempSync(join(tmpdir(), "image-release-"));
  try {
    const writer = new URL("./write-version.mjs", import.meta.url);
    assert.equal(spawnSync(process.execPath, [writer.pathname, directory, SHA]).status, 0);
    assert.deepEqual(JSON.parse(readFileSync(join(directory, "version.json"))), { commit: SHA });
    writeFileSync(
      join(directory, "index.html"),
      '<html><head><meta name="build-sha" content="old"></head></html>',
    );
    assert.equal(
      spawnSync(process.execPath, [writer.pathname, directory, SHA, "--stamp-html"]).status,
      0,
    );
    assert.ok(readFileSync(join(directory, "index.html"), "utf8").includes(`content="${SHA}"`));
    assert.equal(
      readFileSync(join(directory, "index.html"), "utf8").match(/name="build-sha"/g).length,
      1,
    );
    assert.notEqual(spawnSync(process.execPath, [writer.pathname, directory, "latest"]).status, 0);
    assert.deepEqual(JSON.parse(readFileSync(join(directory, "version.json"))), { commit: SHA });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("requires 30 seconds of consecutive serving identity", async () => {
  let elapsed = 0;
  const result = await verifyRelease(SHA, {
    fetch: transport([SHA]),
    sleep: async (ms) => {
      elapsed += ms;
    },
  });
  assert.equal(result.samples, 16);
  assert.equal(elapsed, 30000);
});
test("a stale or mixed replica resets the stability window", async () => {
  let elapsed = 0;
  const result = await verifyRelease(SHA, {
    fetch: transport([SHA, "b".repeat(40), SHA]),
    sleep: async (ms) => {
      elapsed += ms;
    },
    stableSamples: 3,
    attempts: 5,
  });
  assert.equal(result.samples, 3);
  assert.equal(elapsed, 8000);
});
test("rejects stale, cached, wrong-site and invalid-SHA evidence", async () => {
  const options = { sleep: async () => {}, attempts: 2, stableSamples: 2 };
  for (const fetch of [
    transport(["b".repeat(40)]),
    transport([SHA], { cache: "public" }),
    transport([SHA], { htmlCommit: "b".repeat(40) }),
    transport([SHA], { marker: "Welcome to nginx" }),
  ]) {
    await assert.rejects(verifyRelease(SHA, { ...options, fetch }));
  }
  await assert.rejects(
    verifyRelease("main", {
      ...options,
      fetch: async () => {
        throw new Error("must not request");
      },
    }),
  );
});

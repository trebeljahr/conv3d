import assert from "node:assert/strict";
import test from "node:test";
import { writeFile, readFile, rm, access, symlink, truncate } from "node:fs/promises";
import { join } from "node:path";
import { fixture, ids } from "./shared-docs-fixtures.mjs";
test("publishes future assets/RSC before readiness and protects all live image leases during bounded GC", async () => {
  const f = await fixture();
  try {
    await f.lease(ids[1]);
    await f.publish(1);
    await f.lease(ids[2]);
    await f.publish(2);
    assert.equal(
      await readFile(join(f.store, "releases", ids[2], "docs.txt"), "utf8"),
      `RSC-${ids[2]}`,
    );
    assert.equal(
      await readFile(join(f.store, "_next/static/chunks", ids[2] + ".js"), "utf8"),
      `window.revision='${ids[2]}';`,
    );
    let meta = JSON.parse(await readFile(join(f.store, "releases.json")));
    // Same metadata through old B and new C. The legacy parent contributes only assets.
    assert.deepEqual(meta.releases, [ids[2], ids[1]]);
    for (const id of [ids[1], ids[2]])
      assert.equal(
        await readFile(join(f.store, "releases", id, "models/scene.glb"), "utf8"),
        `MODEL-${id}`,
      );
    await assert.rejects(access(join(f.store, "releases", ids[0])));
    await f.publish(1); // restarting B must not rewind C or expire a C tab
    assert.equal(JSON.parse(await readFile(join(f.store, "releases.json"))).head, ids[2]);
    f.held.delete(ids[2]);
    await f.lease(ids[3]);
    await f.publish(3);
    f.held.delete(ids[3]);
    await f.lease(ids[4]);
    await f.publish(4);
    meta = JSON.parse(await readFile(join(f.store, "releases.json")));
    assert.deepEqual(meta.window, [ids[4], ids[3], ids[2]]);
    assert.ok(meta.releases.includes(ids[1]), "old B still has a running container lease");
    await access(join(f.store, "releases", ids[1]));
    f.held.delete(ids[1]);
    await f.publish(4);
    await assert.rejects(access(join(f.store, "releases", ids[1])));
    await assert.rejects(access(join(f.store, "_next/static/chunks", ids[1] + ".js")));
    await access(join(f.store, "_next/static/chunks", ids[0] + ".js")); // fixed legacy baseline
    await f.lease(ids[1]);
    await assert.rejects(f.publish(1), /Prepared head/);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("refuses absent leases, changed immutable exports, unknown lease names, and symlinks", async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.publish(1), /Missing image lease/);
    await f.lease(ids[1]);
    await f.publish(1);
    await writeFile(join(f.store, "releases", ids[1], "docs.txt"), "modified");
    await assert.rejects(f.publish(1), /Immutable export/);
    await writeFile(join(f.store, "releases", ids[1], "docs.txt"), `RSC-${ids[1]}`);
    await writeFile(join(f.store, "leases", "unknown.lock"), "");
    await assert.rejects(f.publish(1), /Invalid lease/);
    await rm(join(f.store, "leases", "unknown.lock"));
    await symlink("/tmp", join(f.store, "escape"));
    await assert.rejects(f.publish(1), /Unsupported/);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("caps accumulated store bytes before adding another image", async () => {
  const f = await fixture();
  try {
    await f.lease(ids[1]);
    const oversized = join(f.store, "interrupted-publication");
    await writeFile(oversized, "");
    await truncate(oversized, 257 * 1024 * 1024);
    await assert.rejects(f.publish(1), /capacity/);
    await assert.rejects(access(join(f.store, "releases.json")));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

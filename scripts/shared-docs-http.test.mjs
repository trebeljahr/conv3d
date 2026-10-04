import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { fixture, ids } from "./shared-docs-fixtures.mjs";
import { STORE, STORE_ID } from "./shared-docs-releases.mjs";

test("mixed B/C routing serves both immutable releases; real kernel leases prevent overlap cleanup", {
  skip: process.env.RUN_DOCKER_TESTS !== "1",
  timeout: 180000,
}, async () => {
  const f = await fixture(),
    suffix = randomUUID(),
    image = `conv3d-shared-test:${suffix}`,
    volume = `conv3d-shared-test-${suffix}`;
  const containers = [];
  let volumeCreated = false,
    imageCreated = false;
  const docker = (...args) =>
    execFileSync("docker", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  try {
    const context = join(f.root, "context");
    await mkdir(join(context, "scripts"), { recursive: true });
    await mkdir(join(context, "deploy"));
    for (const name of ["shared-docs-releases.mjs", "retain-docs-releases.mjs"])
      await copyFile(new URL("./" + name, import.meta.url), join(context, "scripts", name));
    await writeFile(
      join(context, "scripts/docs-bootstrap.mjs"),
      `export const DOCS_BOOTSTRAP = ${JSON.stringify(f.bootstrap)};\n`,
    );
    for (const name of ["nginx.conf", "drain-entrypoint.sh"])
      await copyFile(new URL("../deploy/" + name, import.meta.url), join(context, "deploy", name));
    const production = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");
    const runtime = production
      .slice(production.indexOf("FROM nginx:alpine AS runner"))
      .replace("COPY --from=build /retained-out /usr/share/nginx/html", "");
    await writeFile(join(context, "Dockerfile"), runtime);
    docker("build", "--quiet", "-t", image, context);
    imageCreated = true;
    docker("volume", "create", volume);
    volumeCreated = true;
    docker(
      "run",
      "--rm",
      "--memory=96m",
      "--mount",
      `type=volume,src=${volume},dst=${STORE}`,
      "--entrypoint",
      "node",
      image,
      "-e",
      `require('fs').writeFileSync('${STORE}/.store-identity.json',${JSON.stringify(JSON.stringify(STORE_ID))})`,
    );
    async function start(i) {
      const name = `conv3d-shared-${i}-${suffix}`;
      docker(
        "create",
        "--name",
        name,
        "--memory=96m",
        "--cpus=0.5",
        "--mount",
        `type=volume,src=${volume},dst=${STORE}`,
        "-p",
        "127.0.0.1::80",
        "-e",
        "SHUTDOWN_DRAIN_SECONDS=0",
        image,
      );
      containers.push(name);
      docker("cp", `${f.exports[i]}/.`, `${name}:/usr/share/nginx/html`);
      docker("start", name);
      const base = "http://" + docker("port", name, "80/tcp");
      for (let j = 0; j < 60; j++) {
        try {
          if ((await fetch(base)).ok) return { name, base };
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error("Fixture did not become ready.");
    }
    const b = await start(1),
      c = await start(2);
    for (const [server, htmlSha] of [
      [b, ids[1]],
      [c, ids[2]],
    ]) {
      assert.match(await (await fetch(server.base)).text(), new RegExp(htmlSha));
      for (const sha of [ids[1], ids[2]]) {
        const chunk = await fetch(`${server.base}/_next/static/chunks/${sha}.js`);
        assert.equal(chunk.status, 200);
        assert.match(await chunk.text(), new RegExp(sha));
        const rsc = await fetch(`${server.base}/docs.txt`, {
          headers: { "x-deployment-id": sha },
        });
        assert.equal(rsc.status, 200);
        assert.equal(await rsc.text(), `RSC-${sha}`);
        assert.equal(rsc.headers.get("x-nextjs-deployment-id"), sha);
        // Runtime models are addressed by release, not by the serving image.
        const model = await fetch(`${server.base}/_release/${sha}/models/scene.glb`);
        assert.equal(model.status, 200);
        assert.equal(await model.text(), `MODEL-${sha}`);
        assert.match(model.headers.get("cache-control"), /immutable/);
      }
      // The unversioned path stays the serving image's own file (legacy tabs).
      assert.equal(
        await (await fetch(`${server.base}/models/scene.glb`)).text(),
        `MODEL-${htmlSha}`,
      );
      for (const path of [
        `/_release/${ids[0]}/models/scene.glb`,
        `/_release/${ids[1]}/version.json`,
        `/_release/${ids[1]}/models/../version.json`,
        `/_release/${ids[1].slice(1)}/models/scene.glb`,
        `/__releases/${ids[1]}/docs.txt`,
        "/__legacy-assets/chunks/x.js",
      ])
        assert.equal((await fetch(server.base + path)).status, 404, path);
      assert.equal(
        (
          await fetch(server.base + "/docs.txt", {
            headers: { "x-deployment-id": "latest" },
          })
        ).status,
        400,
      );
      const slash = await fetch(server.base + "/docs/?q=1", {
        redirect: "manual",
      });
      assert.equal(slash.status, 301);
      assert.equal(slash.headers.get("location"), "/docs?q=1");
      const meta = await (await fetch(server.base + "/releases.json")).json();
      assert.equal(meta.schema, 2);
      assert.ok(meta.releases.includes(ids[2]));
    }
    docker("stop", "-t", "5", c.name);
    const d = await start(3);
    docker("stop", "-t", "5", d.name);
    const e = await start(4);
    assert.equal(
      (
        await fetch(e.base + "/docs.txt", {
          headers: { "x-deployment-id": ids[1] },
        })
      ).status,
      200,
      "old B kernel lease survives beyond normal retention window",
    );
    docker("stop", "-t", "5", b.name);
    docker("restart", "-t", "5", e.name);
    e.base = "http://" + docker("port", e.name, "80/tcp");
    let ready = false;
    for (let j = 0; j < 60; j++) {
      try {
        if ((await fetch(e.base)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, docker("logs", e.name));
    assert.equal(
      (
        await fetch(e.base + "/docs.txt", {
          headers: { "x-deployment-id": ids[1] },
        })
      ).status,
      404,
    );
    assert.equal((await fetch(`${e.base}/_next/static/chunks/${ids[0]}.js`)).status, 200);
    assert.equal((await fetch(`${e.base}/_next/static/chunks/${ids[1]}.js`)).status, 404);
    assert.equal(
      (await fetch(`${e.base}/_release/${ids[1]}/models/scene.glb`)).status,
      404,
      "expired release models are not served",
    );
  } finally {
    for (const name of containers) docker("rm", "-f", name);
    if (volumeCreated) docker("volume", "rm", volume);
    if (imageCreated) docker("image", "rm", image);
    await rm(f.root, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";
import { readFileSync } from "node:fs";
import { APP, queuedDeployment, rollingRelease, safeFailure } from "./lib/rolling-release.mjs";

const OLD = "a".repeat(40);
const NEW = "b".repeat(40);
const OTHER = "c".repeat(40);
const TYPE = "application/vnd.oci.image.manifest.v1+json";
const hash = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const config = {
  uuid: APP.uuid,
  repository: APP.repository,
  branch: APP.branch,
  baseUrl: APP.coolify,
  secret: "fixture-hook-secret",
  token: "fixture-registry-token",
  actor: "fixture",
  mode: "manual",
};

function platform(options = {}) {
  const blobs = new Map();
  const images = new Map();
  const tags = new Map();
  const requests = [];
  const reports = [];
  const hooks = [];
  const verified = [];
  for (const sha of [OLD, NEW, OTHER]) {
    const bytes = Buffer.from(
      JSON.stringify({
        os: "linux",
        architecture: "amd64",
        config: {
          Labels: { "org.opencontainers.image.revision": sha },
        },
      }),
    );
    blobs.set(hash(bytes), bytes);
    const manifest = Buffer.from(
      JSON.stringify({
        schemaVersion: 2,
        mediaType: TYPE,
        config: {
          digest: hash(bytes),
          mediaType: "application/vnd.oci.image.config.v1+json",
          size: bytes.length,
        },
        layers: [],
      }),
    );
    images.set(hash(manifest), manifest);
    tags.set(sha, hash(manifest));
  }
  tags.set("latest", tags.get(OLD));
  if (options.initialized) {
    tags.set("rolling-started", tags.get(OLD));
    tags.set("rolling-verified", tags.get(OLD));
  }
  let serving = OLD;
  const responseFor = (bytes) =>
    new Response(bytes, {
      headers: {
        "Content-Type": JSON.parse(bytes.toString()).mediaType ?? "application/octet-stream",
        "Docker-Content-Digest": hash(bytes),
      },
    });
  const deps = {
    record: (report) => reports.push(report),
    verify: async (sha) => {
      verified.push(sha);
      if (options.baselineUnavailable && sha === OLD) throw new Error("No public build identity.");
      if (options.failTarget && sha === NEW) throw new Error("Candidate is unhealthy.");
      assert.equal(serving, sha);
      if (options.driftDuringBaseline && sha === OLD) tags.set("latest", tags.get(OTHER));
      if (options.driftDuringTarget && sha === NEW) tags.set("latest", tags.get(OTHER));
    },
    fetch: async (url, init = {}) => {
      requests.push({ url, init });
      const target = new URL(url);
      if (target.pathname === "/token") {
        assert.equal(target.origin, "https://ghcr.io");
        assert.equal(
          target.searchParams.get("scope"),
          `repository:${APP.registryRepository}:pull,push`,
        );
        assert.equal(init.redirect, "error");
        return Response.json({ token: "fixture-bearer" });
      }
      if (target.origin === APP.coolify) {
        assert.equal(target.pathname, "/webhooks/source/github/events/manual");
        assert.equal(init.method, "POST");
        assert.equal(init.redirect, "error");
        assert.equal(
          init.headers["X-Hub-Signature-256"],
          `sha256=${createHmac("sha256", config.secret).update(init.body).digest("hex")}`,
        );
        const payload = JSON.parse(init.body);
        assert.equal(payload.repository.full_name, APP.repository);
        assert.equal(payload.ref, "refs/heads/main");
        assert.deepEqual(payload.commits[0].modified, [".hatchkit/deploy-webhook"]);
        hooks.push(payload.after);
        if (options.hookThrows && hooks.length === 1)
          throw new Error(options.failureText ?? "Unknown queue outcome.");
        if (options.foreignHook)
          return Response.json([
            {
              status: "success",
              application_uuid: "another-app",
              deployment_uuid: "foreign0000001",
            },
          ]);
        serving = payload.after;
        return Response.json([
          {
            status: "success",
            application_uuid: APP.uuid,
            deployment_uuid: `deployment0000${hooks.length}`,
          },
        ]);
      }
      const blob = target.pathname.split("/blobs/")[1];
      if (target.hostname === "pkg-containers.githubusercontent.com") {
        assert.equal(init.headers, undefined, "Never forward a bearer to blob storage.");
        return new Response(blobs.get(target.searchParams.get("digest")));
      }
      assert.equal(target.origin, "https://ghcr.io");
      assert.equal(init.headers.Authorization, "Bearer fixture-bearer");
      assert.ok(
        target.pathname.startsWith(`/v2/${APP.registryRepository}/`),
        "Registry traffic must use the fixed image package, not the source repository.",
      );
      if (blob) {
        if (options.blobRedirect)
          return new Response(null, {
            status: 307,
            headers: {
              Location: `https://${options.blobRedirect}/blob?digest=${blob}`,
            },
          });
        return new Response(blobs.get(blob));
      }
      const ref = target.pathname.split("/manifests/")[1];
      if (init.method === "PUT") {
        images.set(hash(init.body), init.body);
        tags.set(ref, hash(init.body));
        if (options.crashMarker && ref === "rolling-started")
          throw new Error("Marker response lost.");
        return new Response(null, { status: 201 });
      }
      const bytes = images.get(tags.get(ref) ?? ref);
      if (!bytes) return new Response(null, { status: 404 });
      return responseFor(bytes);
    },
  };
  const release = {
    sha: NEW,
    digest: tags.get(NEW),
    expectedCurrentDigest: tags.get(OLD),
    automatic: false,
  };
  return { deps, release, tags, images, blobs, requests, reports, hooks, verified };
}

const writes = (p) => p.requests.filter(({ init }) => ["PUT", "POST"].includes(init.method));

test("manual rollout preserves exact bytes, sends one scoped hook, and verifies before completing markers", async () => {
  const p = platform();
  const result = await rollingRelease(config, p.release, p.deps);
  assert.equal(result.stage, "http-verified");
  assert.equal(result.previousDigest, p.release.expectedCurrentDigest);
  assert.equal(result.deploymentUuid, "deployment00001");
  assert.deepEqual(p.hooks, [NEW]);
  assert.deepEqual(p.verified, [OLD, NEW]);
  for (const tag of ["latest", "rolling-started", "rolling-verified"])
    assert.equal(p.tags.get(tag), p.release.digest);
  const promotion = writes(p).find(({ url }) => url.endsWith("/manifests/latest"));
  assert.deepEqual(promotion.init.body, p.images.get(p.release.digest));
  assert.equal(p.reports[0].stage, "preflight");
  assert.ok(
    p.reports.some(
      (r) => r.previousDigest === p.release.expectedCurrentDigest && r.stage === "starting",
    ),
  );
  assert.ok(!JSON.stringify(p.reports).includes(config.secret));
  assert.ok(!JSON.stringify(p.reports).includes(config.token));
});

test("automatic rollout requires explicit mode and an initialized clean journal", async () => {
  const p = platform({ initialized: true });
  await rollingRelease(
    { ...config, mode: "automatic" },
    { ...p.release, automatic: true, expectedCurrentDigest: "" },
    p.deps,
  );
  assert.deepEqual(p.hooks, [NEW]);
  const empty = platform();
  await assert.rejects(
    rollingRelease(
      { ...config, mode: "automatic" },
      { ...empty.release, automatic: true },
      empty.deps,
    ),
    /first rolling release must run manually/,
  );
  assert.equal(writes(empty).length, 0);
});

test("target, mode and missing manual baseline validation happens before any network request", async () => {
  const variants = [
    { uuid: "stale-app" },
    { repository: "owner/other" },
    { branch: "other" },
    { baseUrl: "https://wrong.example" },
    { secret: "" },
    { mode: "off" },
  ];
  for (const change of variants) {
    const p = platform();
    await assert.rejects(rollingRelease({ ...config, ...change }, p.release, p.deps));
    assert.equal(p.requests.length, 0);
  }
  const p = platform();
  await assert.rejects(
    rollingRelease(config, { ...p.release, expectedCurrentDigest: "" }, p.deps),
    /expected current/,
  );
  await assert.rejects(
    rollingRelease(config, { ...p.release, automatic: true }, p.deps),
    /Automatic rolling/,
  );
  assert.equal(p.requests.length, 0);
});

test("stale manual baseline and target SHA tag mismatch cannot mutate latest", async () => {
  for (const kind of ["baseline", "tag", "revision"]) {
    const p = platform();
    if (kind === "baseline") p.release.expectedCurrentDigest = p.tags.get(OTHER);
    if (kind === "tag") p.tags.set(NEW, p.tags.get(OTHER));
    if (kind === "revision") p.release.sha = OTHER;
    await assert.rejects(rollingRelease(config, p.release, p.deps));
    assert.equal(writes(p).length, 0);
  }
});

test("old image without public identity is rejected before any adoption mutation", async () => {
  const p = platform({ baselineUnavailable: true });
  await assert.rejects(rollingRelease(config, p.release, p.deps), /No public build identity/);
  assert.equal(writes(p).length, 0);
});

test("baseline drift during public checks blocks promotion", async () => {
  const p = platform({ driftDuringBaseline: true });
  await assert.rejects(
    rollingRelease(config, p.release, p.deps),
    /Latest changed during preflight/,
  );
  assert.equal(writes(p).length, 0);
});

test("failed candidate leaves the target and latch untouched for exact queue inspection", async () => {
  const p = platform({ failTarget: true });
  await assert.rejects(rollingRelease(config, p.release, p.deps), /Release operation failed/);
  assert.deepEqual(p.hooks, [NEW]);
  assert.equal(p.tags.get("latest"), p.release.digest);
  assert.equal(p.tags.get("rolling-started"), p.release.digest);
  assert.equal(p.tags.get("rolling-verified"), p.release.expectedCurrentDigest);
  assert.equal(p.reports.at(-1).stage, "recovery-required");
  assert.match(p.reports.at(-1).recovery, /no second hook or tag rewrite/);
  const before = writes(p).length;
  await assert.rejects(
    rollingRelease(config, { ...p.release, expectedCurrentDigest: p.release.digest }, p.deps),
    /operator reconciliation/,
  );
  assert.equal(writes(p).length, before);
});

test("unknown webhook outcome preserves the tag and remains latched without retry", async () => {
  const p = platform({ hookThrows: true });
  await assert.rejects(rollingRelease(config, p.release, p.deps), /Release operation failed/);
  assert.deepEqual(p.hooks, [NEW]);
  assert.equal(p.tags.get("latest"), p.release.digest);
  assert.notEqual(p.tags.get("rolling-started"), p.tags.get("rolling-verified"));
});

test("lost marker response cannot queue a deployment and blocks next run", async () => {
  const p = platform({ crashMarker: true });
  await assert.rejects(rollingRelease(config, p.release, p.deps), /Release operation failed/);
  assert.equal(p.hooks.length, 0);
  await assert.rejects(rollingRelease(config, p.release, p.deps), /operator reconciliation/);
});

test("a concurrent external writer is never overwritten during recovery", async () => {
  const p = platform({ driftDuringTarget: true });
  await assert.rejects(rollingRelease(config, p.release, p.deps), /Latest changed while verifying/);
  assert.equal(p.tags.get("latest"), p.tags.get(OTHER));
  assert.deepEqual(p.hooks, [NEW]);
});

test("an unexpected accepted app causes no second webhook", async () => {
  const p = platform({ foreignHook: true });
  await assert.rejects(rollingRelease(config, p.release, p.deps), /hook isolation/);
  assert.equal(p.hooks.length, 1);
  assert.equal(p.tags.get("latest"), p.release.digest);
});

test("skipped, missing deployment ID, multiple successes and wrong app are never queue proof", () => {
  for (const response of [
    [],
    {},
    [{ status: "skipped" }],
    [{ status: "success", application_uuid: APP.uuid }],
    [{ status: "success", application_uuid: "other", deployment_uuid: "deployment00001" }],
    Array(2).fill({
      status: "success",
      application_uuid: APP.uuid,
      deployment_uuid: "deployment00001",
    }),
  ]) {
    assert.throws(() => queuedDeployment(response));
  }
});

test("signed GHCR blob redirects drop auth, while other hosts fail before writes", async () => {
  const p = platform({ blobRedirect: "pkg-containers.githubusercontent.com" });
  await rollingRelease(config, p.release, p.deps);
  const bad = platform({ blobRedirect: "outside.example" });
  await assert.rejects(
    rollingRelease(config, bad.release, bad.deps),
    /Untrusted registry blob redirect/,
  );
  assert.equal(writes(bad).length, 0);
});

test("manifest content with an incorrect digest is rejected", async () => {
  const p = platform();
  p.images.set(p.release.digest, p.images.get(p.tags.get(OTHER)));
  await assert.rejects(rollingRelease(config, p.release, p.deps), /manifest digest/);
  assert.equal(writes(p).length, 0);
});

test("OCI index chooses the linux/amd64 image and excludes attestations", async () => {
  const p = platform();
  const index = Buffer.from(
    JSON.stringify({
      schemaVersion: 2,
      mediaType: "application/vnd.oci.image.index.v1+json",
      manifests: [
        { digest: p.release.digest, platform: { os: "linux", architecture: "amd64" } },
        {
          digest: `sha256:${"f".repeat(64)}`,
          platform: { os: "unknown", architecture: "unknown" },
        },
      ],
    }),
  );
  p.images.set(hash(index), index);
  p.tags.set(NEW, hash(index));
  p.release.digest = hash(index);
  await rollingRelease(config, p.release, p.deps);
  assert.equal(p.tags.get("latest"), hash(index));
});

test("wrong architecture index cannot be promoted", async () => {
  const p = platform();
  const index = Buffer.from(
    JSON.stringify({
      schemaVersion: 2,
      mediaType: "application/vnd.oci.image.index.v1+json",
      manifests: [{ digest: p.release.digest, platform: { os: "linux", architecture: "arm64" } }],
    }),
  );
  p.images.set(hash(index), index);
  p.tags.set(NEW, hash(index));
  p.release.digest = hash(index);
  await assert.rejects(rollingRelease(config, p.release, p.deps), /one linux\/amd64/);
  assert.equal(writes(p).length, 0);
});

test("an already verified image is a read-only no-op", async () => {
  const p = platform({ initialized: true });
  const result = await rollingRelease(
    config,
    { ...p.release, sha: OLD, digest: p.tags.get(OLD) },
    p.deps,
  );
  assert.equal(result.stage, "already-serving");
  assert.equal(writes(p).length, 0);
});

// Source repositories and deployed image packages intentionally differ for some apps.
test("source hook and registry package are independently fixed", () => {
  assert.equal(APP.uuid, "u12da0bdw4lwueu6cc4gevpa");
  assert.equal(APP.repository, "trebeljahr/conv3d");
  assert.equal(APP.image, "ghcr.io/trebeljahr/conv3d");
  assert.equal(APP.registryRepository, "trebeljahr/conv3d");
});

test("untrusted failure details never enter release artifacts or user-facing errors", async () => {
  const raw = "synthetic-private-token in invalid provider JSON at signed-url";
  const p = platform({ hookThrows: true, failureText: raw });
  await assert.rejects(rollingRelease(config, p.release, p.deps), (error) => {
    assert.equal(error.message.includes(raw), false);
    return true;
  });
  assert.equal(JSON.stringify(p.reports).includes(raw), false);
  assert.equal(safeFailure(new SyntaxError(raw)), "Release operation failed.");
});

test("build, verify and deploy workflow gates all name the fixed source repository", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/deploy.yml", import.meta.url),
    "utf8",
  );
  const repositories = [...workflow.matchAll(/github\.repository == '([^']+)'/g)].map(
    (match) => match[1],
  );
  assert.ok(repositories.length >= 3);
  assert.deepEqual([...new Set(repositories)], [APP.repository]);
});

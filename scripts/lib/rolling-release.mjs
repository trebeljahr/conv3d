import { createHash, createHmac } from "node:crypto";
import { verifyRelease } from "../verify-release.mjs";

export const APP = Object.freeze({
  uuid: "u12da0bdw4lwueu6cc4gevpa",
  repository: "trebeljahr/conv3d",
  branch: "main",
  coolify: "https://coolify.trebeljahr.com",
  image: "ghcr.io/trebeljahr/conv3d",
  registryRepository: "trebeljahr/conv3d",
});
// Only errors authored here may enter release artifacts or workflow logs.
// Transport, parsing and provider failures may contain response bodies or URLs.
export class ReleaseError extends Error {}
export const safeFailure = (error) =>
  error instanceof ReleaseError ? error.message : "Release operation failed.";

const TYPES = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
];
const isSha = (value) => /^[a-f0-9]{40}$/.test(value ?? "");
const isDigest = (value) => /^sha256:[a-f0-9]{64}$/.test(value ?? "");
const hash = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export function validateRelease(config, release) {
  if (
    config.uuid !== APP.uuid ||
    config.repository !== APP.repository ||
    config.branch !== APP.branch ||
    config.baseUrl !== APP.coolify
  )
    throw new ReleaseError("The hook bundle must name exactly the configured Conv3d site app.");
  if (!config.secret || !config.actor || !config.token)
    throw new ReleaseError("Missing scoped hook or registry credentials.");
  if (!isSha(release.sha) || !isDigest(release.digest))
    throw new ReleaseError("A full SHA and exact image digest are required.");
  if (!["manual", "automatic"].includes(config.mode))
    throw new ReleaseError("Rolling deployment is not activated.");
  if (release.automatic && config.mode !== "automatic")
    throw new ReleaseError("Automatic rolling deployment is not activated.");
  if (!release.automatic && !isDigest(release.expectedCurrentDigest)) {
    throw new ReleaseError("Manual deployment requires the expected current image digest.");
  }
}

export function queuedDeployment(body) {
  if (!Array.isArray(body)) throw new ReleaseError("Coolify did not return a deployment list.");
  const accepted = body.filter((item) => item?.status === "success");
  if (accepted.some((item) => item.application_uuid !== APP.uuid)) {
    const error = new ReleaseError(
      "The signed hook accepted another app; stop and inspect hook isolation.",
    );
    error.code = "UNSAFE_HOOK_TARGET";
    throw error;
  }
  if (
    accepted.length !== 1 ||
    accepted[0].application_uuid !== APP.uuid ||
    !/^[a-z0-9]{10,64}$/.test(accepted[0].deployment_uuid ?? "") ||
    body.some((item) => item?.status === "skipped")
  )
    throw new ReleaseError("Coolify did not queue exactly one identified deployment of this app.");
  return accepted[0].deployment_uuid;
}

// All network, polling and journal operations are injected for regression tests.
// The workflow is the exclusive latest/marker writer and serializes all runs.
// The markers leave crashes and ambiguous deployments latched closed across runs.
export async function rollingRelease(config, release, dependencies = {}) {
  validateRelease(config, release);
  const request = dependencies.fetch ?? fetch;
  const verify =
    dependencies.verify ??
    ((sha) =>
      verifyRelease(sha, {
        fetch: request,
        ...(dependencies.sleep ? { sleep: dependencies.sleep } : {}),
      }));
  const record = dependencies.record ?? (() => {});
  const report = {
    appUuid: APP.uuid,
    targetSha: release.sha,
    targetDigest: release.digest,
    stage: "preflight",
  };
  const save = (stage) => {
    report.stage = stage;
    record({ ...report });
  };
  save("preflight");

  const { registry, manifest, revision, identity } = await openRegistry(config, dependencies);
  const point = async (tag, image) => {
    const response = await registry(`manifests/${tag}`, {
      method: "PUT",
      body: image.bytes,
      headers: { "Content-Type": image.type },
    });
    if (!response.ok) throw new ReleaseError(`Registry ${tag} update failed (${response.status}).`);
    if ((await manifest(tag)).digest !== image.digest)
      throw new ReleaseError(`Registry ${tag} update did not persist.`);
  };
  const queue = async (sha) => {
    const body = JSON.stringify({
      ref: `refs/heads/${APP.branch}`,
      after: sha,
      repository: { full_name: APP.repository },
      commits: [{ id: sha, added: [], removed: [], modified: [".hatchkit/deploy-webhook"] }],
    });
    const signature = createHmac("sha256", config.secret).update(body).digest("hex");
    const response = await request(`${APP.coolify}/webhooks/source/github/events/manual`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      body,
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "push",
        "X-Hub-Signature-256": `sha256=${signature}`,
      },
    });
    if (!response.ok)
      throw new ReleaseError(
        `Coolify hook failed (${response.status}); queue outcome may be unknown.`,
      );
    return queuedDeployment(await response.json());
  };

  const target = await manifest(release.digest);
  const targetIdentity = await identity(target);
  if (targetIdentity.sha !== release.sha)
    throw new ReleaseError("Target image revision differs from the requested commit.");
  if ((await manifest(release.sha)).digest !== release.digest)
    throw new ReleaseError("SHA tag differs from the reviewed image digest.");
  const previous = await manifest("latest");
  if (release.expectedCurrentDigest && previous.digest !== release.expectedCurrentDigest) {
    throw new ReleaseError("Current latest differs from the reviewed baseline.");
  }
  const previousSha = await revision(previous);
  if (
    target.digest !== previous.digest &&
    (targetIdentity.labels["io.conv3d.docs.parent-digest"] !== previous.digest ||
      targetIdentity.labels["io.conv3d.docs.parent-sha"] !== previousSha ||
      targetIdentity.labels["io.conv3d.docs.retention"] !== "3" ||
      targetIdentity.labels["io.conv3d.docs.storage"] !== "shared-v1")
  )
    throw new ReleaseError("Target retained assets were not built from the exact current image.");
  report.previousSha = previousSha;
  report.previousDigest = previous.digest;
  save("baseline");
  const started = await manifest("rolling-started", true);
  const verified = await manifest("rolling-verified", true);
  if (started || verified) {
    if (started?.digest !== previous.digest || verified?.digest !== previous.digest) {
      throw new ReleaseError(
        "An unfinished release or external registry change requires operator reconciliation.",
      );
    }
  } else if (release.automatic) {
    throw new ReleaseError(
      "The first rolling release must run manually to initialize its journal.",
    );
  }
  // First adoption of an old image without /version.json remains operator-owned.
  await verify(previousSha);
  if (target.digest === previous.digest) {
    save("already-serving");
    return report;
  }
  if ((await manifest("latest")).digest !== previous.digest)
    throw new ReleaseError("Latest changed during preflight.");

  let hookAttempted = false;
  try {
    // Persist rollback identity before touching latest. Partial marker writes
    // also block future runs; never automatically clear a failed-run latch.
    if (!verified) await point("rolling-verified", previous);
    save("starting");
    await point("rolling-started", target);
    if ((await manifest("latest")).digest !== previous.digest)
      throw new ReleaseError("Latest changed before promotion.");
    save("promoting");
    await point("latest", target);
    save("queueing");
    hookAttempted = true;
    report.hookAttempted = true;
    report.deploymentUuid = await queue(release.sha);
    save("verifying");
    await verify(release.sha);
    if ((await manifest("latest")).digest !== target.digest)
      throw new ReleaseError("Latest changed while verifying the release.");
    await point("rolling-verified", target);
    save("http-verified");
    return report;
  } catch (error) {
    report.error = safeFailure(error);
    save("recovery-required");
    if (hookAttempted) {
      // A queued job can still pull latest after an HTTP timeout. Even seeing
      // the old SHA again does not prove that job stopped. Preserve the latch
      // and tag until an operator checks the exact queue through Coolify.
      report.recovery =
        "Inspect the exact Coolify queue before rollback or marker reconciliation; no second hook or tag rewrite was attempted.";
      save("recovery-required");
      throw new ReleaseError(`${report.error} ${report.recovery}`);
    }
    try {
      const current = await manifest("latest");
      if (![target.digest, previous.digest].includes(current.digest)) {
        throw new ReleaseError("Latest belongs to another writer; refusing to overwrite it.");
      }
      if (current.digest === target.digest) await point("latest", previous);
      report.rollback =
        "previous digest restored before any webhook; operator must reconcile markers";
    } catch (rollbackError) {
      report.rollback = safeFailure(rollbackError);
    }
    save("recovery-required");
    throw new ReleaseError(`${report.error} ${report.rollback}`);
  }
}

// Shared byte-verified registry reads for build ancestry and deployment.
export async function openRegistry(config, dependencies = {}) {
  const request = dependencies.fetch ?? fetch;
  const authUrl = new URL("https://ghcr.io/token");
  authUrl.searchParams.set("service", "ghcr.io");
  authUrl.searchParams.set("scope", `repository:${APP.registryRepository}:pull,push`);
  const auth = await request(authUrl.href, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.actor}:${config.token}`).toString("base64")}`,
    },
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!auth.ok) throw new ReleaseError(`Registry authentication failed (${auth.status}).`);
  const tokenBody = await auth.json();
  const token = tokenBody.token ?? tokenBody.access_token;
  if (typeof token !== "string" || !token) throw new ReleaseError("Registry token is missing.");

  const registry = async (path, options = {}) => {
    const response = await request(`https://ghcr.io/v2/${APP.registryRepository}/${path}`, {
      ...options,
      redirect: options.redirect ?? "error",
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, Accept: TYPES.join(", "), ...options.headers },
    });
    return response;
  };
  const manifest = async (reference, optional = false) => {
    const response = await registry(`manifests/${reference}`);
    if (optional && response.status === 404) return null;
    if (!response.ok) throw new ReleaseError(`Registry manifest read failed (${response.status}).`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const digest = hash(bytes);
    const reported = response.headers.get("docker-content-digest");
    if ((reported && reported !== digest) || (isDigest(reference) && reference !== digest)) {
      throw new ReleaseError("Registry manifest digest does not match its bytes.");
    }
    const body = JSON.parse(bytes.toString("utf8"));
    const type = response.headers.get("content-type")?.split(";")[0] || body.mediaType;
    if (!TYPES.includes(type)) throw new ReleaseError("Unsupported registry manifest type.");
    return { bytes, digest, type, body };
  };
  const identity = async (image) => {
    let selected = image;
    if (image.body.manifests) {
      const linux = image.body.manifests.filter(
        (item) => item.platform?.os === "linux" && item.platform?.architecture === "amd64",
      );
      if (linux.length !== 1 || !isDigest(linux[0].digest))
        throw new ReleaseError("Image must contain one linux/amd64 manifest.");
      selected = await manifest(linux[0].digest);
    }
    const digest = selected.body.config?.digest;
    if (!isDigest(digest)) throw new ReleaseError("Image config digest is missing.");
    let response = await registry(`blobs/${digest}`, { redirect: "manual" });
    if ([302, 307].includes(response.status)) {
      const location = new URL(response.headers.get("location") ?? "", "https://ghcr.io");
      if (
        location.protocol !== "https:" ||
        location.hostname !== "pkg-containers.githubusercontent.com" ||
        location.username ||
        location.password ||
        location.port
      ) {
        throw new ReleaseError("Untrusted registry blob redirect.");
      }
      // GHCR redirects blobs to a signed download URL. Never forward registry
      // authorization to that host, nor print the signed URL in reports.
      response = await request(location.href, {
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
    }
    if (!response.ok) throw new ReleaseError(`Image config read failed (${response.status}).`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== digest)
      throw new ReleaseError("Image config digest does not match its bytes.");
    const body = JSON.parse(bytes.toString("utf8"));
    const sha = body.config?.Labels?.["org.opencontainers.image.revision"];
    if (body.os !== "linux" || body.architecture !== "amd64" || !isSha(sha)) {
      throw new ReleaseError(
        "Image config must identify a linux/amd64 build and full source commit.",
      );
    }
    return { sha, labels: body.config.Labels };
  };
  const revision = async (image) => (await identity(image)).sha;
  return { registry, manifest, revision, identity };
}

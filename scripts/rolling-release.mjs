import { writeFileSync } from "node:fs";
import { ReleaseError, rollingRelease, safeFailure } from "./lib/rolling-release.mjs";

const env = (name) => (process.env[name] ?? "").trim();
try {
  if (env("GITHUB_REPOSITORY") !== "trebeljahr/conv3d" || env("GITHUB_REF") !== "refs/heads/main") {
    throw new ReleaseError("Rolling deployment only runs from this repository's main workflow.");
  }
  if (!["push", "workflow_dispatch"].includes(env("GITHUB_EVENT_NAME")))
    throw new ReleaseError("Unsupported release trigger.");
  await rollingRelease(
    {
      baseUrl: env("COOLIFY_BASE_URL").replace(/\/$/, ""),
      uuid: env("COOLIFY_RESOURCE_UUID"),
      repository: env("COOLIFY_DEPLOY_REPOSITORY"),
      branch: env("COOLIFY_DEPLOY_BRANCH"),
      secret: env("COOLIFY_DEPLOY_SECRET"),
      actor: env("GITHUB_ACTOR"),
      token: env("GITHUB_TOKEN"),
      mode: env("ROLLOUT_MODE"),
    },
    {
      sha: env("TARGET_SHA"),
      digest: env("TARGET_DIGEST"),
      expectedCurrentDigest: env("EXPECTED_CURRENT_DIGEST"),
      automatic: env("GITHUB_EVENT_NAME") === "push",
    },
    {
      record: (report) => {
        writeFileSync("rollout.json", `${JSON.stringify(report, null, 2)}\n`);
        console.log(`Release stage: ${report.stage}`);
      },
    },
  );
} catch (error) {
  console.error(safeFailure(error));
  process.exitCode = 1;
}

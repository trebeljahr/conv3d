# Rolling image release contract

This controller manages only `u12da0bdw4lwueu6cc4gevpa` (Conv3d site), source `trebeljahr/conv3d` on `main`, image `ghcr.io/trebeljahr/conv3d`. Builds publish full-SHA candidate tags and a `release-<sha>-<run>-<attempt>` digest artifact. Building does not move `latest`.

`CONV3D_ROLLOUT_MODE` defaults to unset/off. `manual` permits an explicit **Build & Release** dispatch with operation `deploy`, `target_sha`, `image_digest`, and `expected_current_digest`. `automatic` also releases successful future pushes. Repository/ref guards and a single workflow concurrency group serialize this controller. Keep the gate off until the operator completes first adoption and reviews the exact app settings below.

The controller requires the app's generic hook bundle: `COOLIFY_BASE_URL`, `COOLIFY_RESOURCE_UUID`, `COOLIFY_DEPLOY_REPOSITORY`, `COOLIFY_DEPLOY_BRANCH`, and `COOLIFY_DEPLOY_SECRET`. Each value must name this fixed app and source repository; the secret must uniquely select it. It uses the built-in GitHub package token and never receives a Coolify API token.

The existing docs GitHub Pages workflow also runs when `docs/**` changes. It is independent of Coolify and is unchanged by this controller. Account for that publication when pushing the first adoption commit.

## First adoption

The existing image cannot acquire a drain period or public identity retroactively. An operator must preserve its current digest and safe configuration, deploy the first prepared image using an exact digest pin, inspect that exact Coolify deployment to terminal success, confirm the new running image digest, old-container retirement, and the public response checks. In Coolify 4.0.0-beta.469, the digest tag field is `sha256-<64 hex characters>`. No automatic first adoption or rollback is provided here.

Before that deployment, verify image repository, port `80`, no fixed host port bindings, and container names that permit overlap. The only allowed mount is the shared release volume described in `RETAINED-DOCS.md`: exact name `conv3d-docs-releases`, type volume, destination `/var/lib/conv3d-docs-releases`, read-write, seeded with its exact identity marker. Images built from this source refuse to start without it. Configure loopback HTTP GET `/` on port `80`, response 200, interval 2s, timeout 5s, retries 5, start period 15s. The new image drains 20s; Docker's effective stop timeout must be at least 30s. Verify the generated/running container settings, not only the saved API settings.

Set the provider's `git_repository` and the bundle's `COOLIFY_DEPLOY_REPOSITORY` to `trebeljahr/conv3d`, both branch values to `main`, and watch path to `.hatchkit/deploy-webhook`. Existing Docker Image apps may still use Coolify's placeholder repository; image publication does not repair this binding. Confirm no active deployment or other mutable-tag writer before activation.

After successful first adoption, align `latest` with the same verified digest and configure this app to pull `latest`. Enable `manual`, then deploy a distinct reviewed second candidate through the controller. This exercises the first image's outgoing drain and initializes the journal. An already-serving no-op deliberately does not initialize it. Enable `automatic` only after this replacement is proven, including operator inspection of the exact provider deployment and old-container retirement.

## Verification and recovery

Before promotion, the controller hashes the target manifest bytes and config, checks Linux amd64 and the full OCI revision, matches the full-SHA tag to the reviewed digest, and verifies the public baseline against current `latest`. It copies the reviewed manifest bytes to `latest`, reads back the digest, and sends one signed hook. Queue acceptance must identify this app and one deployment UUID.

Public verification requires the homepage and uncached `/version.json` to name the same full commit for 16 consecutive samples over at least 30s. This is HTTP evidence; `http-verified` is not a claim that the provider job finished or that old containers retired. Read-only operation `verify` performs only the public checks.

`rolling-started` and `rolling-verified` must both agree with current `latest` before another run can mutate anything. A crash, unknown hook outcome, external tag writer, or failed public check leaves the journal closed. The rollout artifact records previous digest and returned deployment UUID. After any hook attempt, failure never triggers another hook or tag rewrite. Inspect and settle that exact queue before rollback or journal reconciliation; observing old HTML does not prove a queued job stopped. Pre-hook failures may restore the previous tag while keeping the journal closed.

Builds pin the verified serving image as `PREVIOUS_IMAGE` (`scripts/prepare-docs-build.mjs`), and the controller refuses a target whose `io.conv3d.docs.*` labels do not name the current digest and shared storage. An existing SHA tag is never rebuilt.

Offline controller checks: `node --test scripts/release.test.mjs scripts/rolling-release.test.mjs scripts/retained-docs.test.mjs scripts/shared-docs-releases.test.mjs`. They cover fixed scope, digest/revision disagreement, architecture, baseline drift, latched failures, ambiguous hooks, and authenticated registry redirect limits. They do not replace the live two-release proof.

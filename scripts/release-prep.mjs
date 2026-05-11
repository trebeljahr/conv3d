#!/usr/bin/env node
/*
 * release-prep — strict pre-release verification.
 *
 * Refuses to release if the working tree has uncommitted or untracked
 * changes. Exits with a clear list of what's dirty so the version
 * commit + tag, the npm publish, and the push all line up against the
 * same baseline.
 *
 * ALSO refuses when the local package.json version is at-or-behind the
 * version published to npm. `npm version patch` increments from the
 * LOCAL version, so drift between local and registry leads to the bump
 * generating a number that's already taken and the publish step
 * crashing after build/test. Catch it up front.
 *
 * Skip with RELEASE_SKIP_PREP=1 (e.g. a CI-driven release that's
 * already vouched for cleanliness). RELEASE_SKIP_NPM_CHECK=1 only
 * skips the npm-version comparison, useful offline.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.RELEASE_SKIP_PREP === "1") {
  console.log("  release-prep: RELEASE_SKIP_PREP=1 — skipping.");
  process.exit(0);
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf8", ...opts }).trim();
}

let repoRoot;
try {
  repoRoot = sh("git rev-parse --show-toplevel");
} catch {
  console.error("  release-prep: not inside a git repo. Aborting.");
  process.exit(1);
}

let status;
try {
  status = sh("git status --porcelain", { cwd: repoRoot });
} catch (err) {
  console.error(`  release-prep: couldn't read git status: ${err.message}`);
  process.exit(1);
}

if (status) {
  console.error("\n  ✗ release-prep: cannot release — dangling changes.\n");
  for (const line of status.split("\n")) {
    console.error(`      ${line}`);
  }
  console.error("\n  Commit, stash, or discard them, then re-run the release.\n");
  process.exit(1);
}

if (process.env.RELEASE_SKIP_NPM_CHECK !== "1") {
  const driftError = checkNpmDrift();
  if (driftError) {
    console.error(`\n  ✗ release-prep: ${driftError}\n`);
    process.exit(1);
  }
}

console.log("  ✓ release-prep: tree clean and version not behind registry. Continuing release.");
process.exit(0);

/** Returns null on success, an error message string when the local
 *  package.json is at-or-behind what's published on npm. We only read
 *  the registry — never write — so it's safe to run blind. */
function checkNpmDrift() {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(here, "..", "package.json");
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch (err) {
    return `couldn't parse package.json — ${err.message}`;
  }
  const local = pkg.version;
  const name = pkg.name;
  if (!local || !name) return null;

  let registry;
  try {
    registry = sh(`npm view ${name} version`, { stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    // 404 (package doesn't exist yet on npm) is fine — first publish.
    return null;
  }
  if (!registry) return null;

  // Only refuse when local is BEHIND registry. Equal is the post-sync
  // state — `npm version patch` increments past it cleanly.
  if (compareSemver(local, registry) < 0) {
    return [
      `local ${name}@${local} is behind the registry's ${registry}.`,
      "",
      "  `npm version` increments from the LOCAL version, so a release now",
      "  would try to publish a version that's already taken. Sync first:",
      "",
      `      npm version ${registry} --no-git-tag-version    # match the registry`,
      `      git add package.json`,
      `      git commit -m "chore: release v${registry}"`,
      `      git tag v${registry}`,
      "",
      "  Then re-run the release; it'll bump cleanly past that.",
    ].join("\n");
  }
  return null;
}

/** Tiny semver compare — returns -1 / 0 / 1 for a vs b. We only feed
 *  it values that come straight out of package.json + npm view, so
 *  pre-release / build-metadata strings are out of scope. */
function compareSemver(a, b) {
  const [aa, bb] = [a, b].map((v) => v.split(".").map((n) => Number(n) || 0));
  for (let i = 0; i < 3; i++) {
    if ((aa[i] ?? 0) > (bb[i] ?? 0)) return 1;
    if ((aa[i] ?? 0) < (bb[i] ?? 0)) return -1;
  }
  return 0;
}

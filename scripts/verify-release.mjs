import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ORIGINS = ["https://conv3d.trebeljahr.com"];
export const PAGE_MARKER = "conv3d";
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

// Public HTTP proves the serving build. The rollout operator also verifies
// Coolify's exact deployment UUID and the running container's image digest.
export async function verifyRelease(
  commit,
  { fetch: request = fetch, sleep = pause, attempts = 90, stableSamples = 16 } = {},
) {
  if (!/^[a-f0-9]{40}$/.test(commit ?? ""))
    throw new Error("Expected a full lowercase Git commit SHA.");
  let consecutive = 0;
  let lastFailure = "No matching build observed.";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      for (const origin of ORIGINS) {
        const nonce = `${commit}-${attempt}-${Date.now()}`;
        const options = () => ({
          redirect: "manual",
          cache: "no-store",
          headers: { "Cache-Control": "no-cache, no-store" },
          signal: AbortSignal.timeout(5000),
        });
        const version = await request(`${origin}/version.json?release=${nonce}`, options());
        if (
          version.status !== 200 ||
          !(version.headers.get("cache-control") ?? "").includes("no-store")
        ) {
          throw new Error("Version endpoint must return HTTP 200 without caching.");
        }
        if ((await version.json()).commit !== commit)
          throw new Error("Public version differs from the expected commit.");
        const page = await request(`${origin}/?release=${nonce}`, options());
        const html = await page.text();
        if (page.status !== 200 || !html.toLowerCase().includes(PAGE_MARKER)) {
          throw new Error("The homepage did not serve the expected application.");
        }
        const identities = [
          ...html.matchAll(
            /<meta\b(?=[^>]*\bname=["']build-sha["'])(?=[^>]*\bcontent=["']([a-f0-9]{40})["'])[^>]*>/gi,
          ),
        ];
        if (identities.length !== 1 || identities[0][1] !== commit)
          throw new Error("The homepage and version endpoint differ from the requested build.");
      }
      consecutive += 1;
      if (consecutive >= stableSamples) return { commit, samples: consecutive, origins: ORIGINS };
    } catch (error) {
      consecutive = 0;
      lastFailure = error instanceof Error ? error.message : "HTTP verification failed.";
    }
    if (attempt + 1 < attempts) await sleep(2000);
  }
  throw new Error(`Release did not remain healthy at ${commit}: ${lastFailure}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await verifyRelease(process.argv[2])));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Release verification failed.");
    process.exitCode = 1;
  }
}

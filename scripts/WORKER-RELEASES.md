# Docs site on a Cloudflare Worker

`conv3d.trebeljahr.com` is served by the Worker `conv3d-docs`: static assets
only, no Worker script, attached by the zone route `conv3d.trebeljahr.com/*`.
A second route, `conv3d.trebeljahr.com/.well-known/acme-challenge/*`, has no
Worker, so those requests still reach Traefik on the origin while it holds a
certificate for the host. `wrangler.jsonc` has no `routes`, so a deploy never
changes either route. Asset requests do not count toward the Workers Free
request cap.

This replaces the nginx image, the shared release volume and the rolling
Coolify controller described in `RETAINED-DOCS.md` and `ROLLING_RELEASE.md`.
The Coolify app stays in place, unchanged, until it is retired.

## What one version contains

`scripts/worker-release.mjs assemble` builds `docs/worker/assets`:

- the static export of this commit, with `version.json`;
- this commit's runtime-fetched files under `/_release/<sha>/` (`models/`,
  `draco/`, `media/`, `api/search`; see `docs/lib/release-asset.ts`);
- the `/_next/static/` files and `/_release/<sha>/` files of the two releases
  before it, plus the fixed legacy baseline from `docs-bootstrap.mjs`;
- `releases.json` (`schema: 2`), which `ReleaseLifetime` polls. A tab whose
  release is not listed reloads the same URL;
- `release-assets.json`, the path, size and SHA-256 of every carried file;
- `_headers`.

A Worker version serves only its own files. The next build reads the live
`/release-assets.json`, downloads the listed files from the live site, checks
each size and hash, and uploads them again. Uploads are content-addressed, so
unchanged files are not sent twice. The build fails when one hashed path holds
different bytes in two releases. Next's per-build manifests
(`/_next/static/<buildId>/_*Manifest.js`) are the exception: deploymentId pins
one build ID, so the current build's bytes win.

## nginx behaviour and its Worker equivalent

| nginx | Worker |
| --- | --- |
| `try_files $uri $uri.html $uri/index.html` | `html_handling: drop-trailing-slash` serves `<route>.html` at `/<route>`. |
| `/<route>/` → 301 to `/<route>`, relative `Location`, query kept | Same redirect with status 307. |
| `/index.html`, `/docs.html` answered 200 | 307 to `/` and `/docs`. |
| `error_page 404 /404.html` | `not_found_handling: 404-page`. |
| `Cache-Control: no-store` on every response | Cloudflare's default `public, max-age=0, must-revalidate` with an ETag. `version.json`, `releases.json` and `release-assets.json` keep `no-store`. |
| `/_next/static/` and `/_release/` immutable for a year, 2xx only | Default revalidation. A `_headers` rule would also mark 404 responses immutable, and the edge caches them. |
| `/_release/<sha>/…` read from the shared volume, unknown SHA 404 | Uploaded per version for the three releases; anything else is the 404 page. |
| `__releases/`, `__legacy-assets/` 404 | Not uploaded. |
| `x-deployment-id` selects a retained RSC tree; nginx echoes it in `x-nextjs-deployment-id` | No equivalent: static assets cannot route on a request header. `_headers` sends the current SHA in `x-nextjs-deployment-id`. A tab from another release sees the mismatch and loads the target page in full instead of a client navigation. |
| Malformed `x-deployment-id` → 400; `Vary: x-deployment-id` | Dropped. Responses no longer vary by release. |
| Drain marker: `/` answers 503 to the Coolify probe | Not needed. |
| `api/search`, `opengraph-image`, `twitter-image` sent as `application/octet-stream` | `_headers` sets `application/json` and `image/png`. |
| `Range` requests | Answered with the full file, as the proxied nginx site was. |
| `http://` redirected to `https://` by Traefik | Needs the zone's Always Use HTTPS or a redirect rule for the host. |

The `x-nextjs-deployment-id` header is required. Exported Flight data has no
build ID, so without the header every client navigation turns into a full page
load.

Limits on Workers Free: 20,000 files per version, 25 MiB per file, 100
`_headers` rules. `assemble` checks all three. The first version had 274 files
(19.9 MB) and 10 rules.

## Release flow

`.github/workflows/deploy.yml`:

1. **build**: export with `NEXT_PUBLIC_BUILD_COMMIT`, write `version.json`,
   carry from the live site, assemble, then `wrangler versions upload --tag
   <sha>`. Nothing changes for visitors. The artifact `release.json` records
   the version ID.
2. **deploy** (push with `CONV3D_ROLLOUT_MODE=automatic`, or a dispatch with
   `operation: deploy`, `target_sha` and `version_id`): checks that the
   version's tag is the target SHA and, for a push, that the version carries
   the live release; then `wrangler versions deploy <id>@100%` and
   `verify-release.mjs`, which waits for 16 consecutive matching
   `version.json` and homepage samples.

Uploading first and activating later avoids the seconds of 404s on new chunks
that a one-step `wrangler deploy` leaves.

Secrets: `CLOUDFLARE_API_TOKEN` (Individual Workers Editor on `conv3d-docs`
only) and `CLOUDFLARE_ACCOUNT_ID`.

## Rollback

- To an earlier version: dispatch `operation: deploy` with its `version_id` and
  `target_sha`, or run `npx wrangler@4.145.0 rollback`. A version keeps its own
  files, so it is complete. Tabs on the newer release reload once
  `releases.json` stops listing it.
- Off the Worker (while the Coolify app still runs): delete the route
  `conv3d.trebeljahr.com/*`. Traefik answers again within seconds, with the
  image it last ran (`908533a`).

## First adoption

The first version was seeded from the last nginx image instead of the live
site, because nginx publishes no `release-assets.json`:

```sh
node scripts/worker-release.mjs seed-image <image>/usr/share/nginx/html docs/worker/carry
node scripts/worker-release.mjs assemble <image>/usr/share/nginx/html/__releases/<sha> <sha> docs/worker/carry docs/worker/assets
```

`<image>` is the extracted `COPY /retained-out` layer of
`ghcr.io/trebeljahr/conv3d:<sha>`. That version serves the same files as the
image, so the cutover changed the server but not the content.

## Local check

```sh
node --test scripts/worker-release.test.mjs
npx wrangler@4.145.0 dev --port <free port above 49152>
```

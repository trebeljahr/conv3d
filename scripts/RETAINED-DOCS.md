# Retained site releases

Ported from Hatchkit's shared documentation releases. Each image keeps its own
static export and up to two prior exports under `__releases/<SHA>`, each with its
own `version.json`. Those directories cannot be fetched directly. nginx selects
one only from a validated `x-deployment-id` request header. Missing or expired
releases return 404; malformed IDs return 400. Neither case falls through to
current RSC.

Every container mounts the **same named volume** `conv3d-docs-releases` at
`/var/lib/conv3d-docs-releases`. The host must assert its exact Docker mount
name, type, destination and write mode. Startup also requires a real writable
mountpoint and this exact `.store-identity.json` marker:

```json
{"schema":1,"app":"trebeljahr/conv3d","volume":"conv3d-docs-releases","purpose":"immutable-docs-releases"}
```

Before nginx starts, a serialized publisher copies complete SHA snapshots by
atomic rename, verifies immutable collisions, and atomically installs shared
lifetime metadata. Old and new containers read chunks, selected RSC and
SHA-scoped public files from this volume, so a C page can fetch C files from B
during overlap. Current HTML and `version.json` stay local to each image.

Each running container holds a kernel shared lock on its own SHA until nginx
exits. Cleanup keeps the latest prepared window of three snapshots **plus every
leased running image** (at most three live release IDs). Unleased assets outside
that set are removed except the fixed legacy baseline. File and byte budgets
(20,000 files; 256 MiB, including incoming image files) fail closed. A restart
within the current window never rewinds metadata; an expired image restart is
refused. A candidate that seeds files but never becomes healthy can leave a
prepared head; reconcile that exact candidate before a new image whose parent
differs. Never erase the volume or rewind its metadata while containers serve it.

## Release-addressed public files

The landing scenes fetch GLB models and the Draco decoder at runtime, the demo
video loads media, and the search dialog downloads the static search index.
These requests use `/_release/<SHA>/…` (`docs/lib/release-asset.ts`), served from
that release's snapshot in the shared volume with immutable caching. Only
`models/`, `draco/`, `media/` and `api/search` are exposed this way. A lazy
Knight scene opened from release B therefore receives B's
`/models/conv3d-funnel/KnightHelmet.glb`, even when C serves the request and C
changed that file. Unversioned public paths remain the serving image's own
files for legacy tabs and external links.

## Legacy baseline and first adoption

The site before this change is image `sha-39bafd8`,
`sha256:515dc95c405932ef4d7dddb9911f2a8874afe53faadf18352bcf5def1f3c0073`. It
has no `version.json`, deployment ID or expiry guard. `docs-bootstrap.mjs` pins
its 46 hashed assets (2,670,092 bytes) by sorted path/size/SHA-256 inventory and
its exact homepage bytes. The live homepage was byte-identical to that image on
2026-10-05. Its assets are inherited under the inaccessible `__legacy-assets`
directory and stay in the shared `_next/static` union indefinitely.

Because legacy tabs send no deployment ID, the first retained image keeps only
its own snapshot (`releases` has one entry). The build-ancestry step accepts this
parent only when both journal markers are absent, `latest` and `sha-39bafd8`
name the pinned digest, and eight public homepage samples hash to the pinned
bytes. Legacy unversioned page-data requests select the current export, so a
legacy tab may switch to the current page on navigation. That is not a promise
of old RSC compatibility for tabs older than the lifetime guard.

The legacy nginx config also answered every subpage with 301 to a slash form
and then 403. The new config serves `<route>.html` and redirects slash forms to
the bare route with a relative Location.

## Lifetime

Next 16 uses `x-nextjs-deployment-id` to compare navigation versions. nginx
echoes the validated selected SHA. `ReleaseLifetime` checks `/releases.json` on
focus and every minute and reloads the exact URL once the tab's SHA leaves the
retained set. The site has no editor state, so this reload loses nothing.

## Local checks

```sh
node --test scripts/release.test.mjs scripts/rolling-release.test.mjs scripts/retained-docs.test.mjs scripts/shared-docs-releases.test.mjs
RUN_DOCKER_TESTS=1 node --test scripts/shared-docs-http.test.mjs
```

For browser compatibility, build two exports with different deployment IDs and
a real change to `KnightShowcaseScene.tsx`, `KnightHelmet.glb` and an MDX page.
Open B on a docs page, switch its backend to C, then navigate home: the Knight
chunk and model must be B's bytes from C. Repeat in the other direction, then
expire B in fixture metadata and confirm focus reloads the same URL.

# Dev URL setup (`https://conv3d.local.ricoslabs.com/`)

This project ships with the **hatchkit local-dev** integration: when you run
`pnpm dev`, the dev server is reachable from any Tailscale peer (phone,
tablet, other laptop) at:

```
https://conv3d.local.ricoslabs.com/
```

Caddy on your host terminates TLS with a real Cloudflare-issued wildcard
cert, and tailscale serve forwards inbound port-443 traffic from the
tailnet to Caddy. No per-project DNS work, no port juggling, no
framework `base` / `basePath` config.

## One-time host setup

Do this **once per machine**, not per project. After it's wired,
every hatchkit project that opts in just works.

### 1. Cloudflare DNS — auto-managed

`hatchkit dev-setup init` creates a DNS-only A record:

```
*.local.ricoslabs.com   A   <your-tailnet-ip>   (DNS-only, TTL 60)
```

It uses your hatchkit DNS token (or the `caddy-dev/cloudflare-acme`
keychain entry as a fallback) — the same token Caddy already needs for
DNS-01 ACME. `Zone:DNS:Edit` + `Zone:Zone:Read` on the parent zone.

**Why a direct A record instead of a CNAME to laptop.tail4a5428.ts.net?**
A CNAME to a `.ts.net` name only resolves when each peer has
Tailscale's MagicDNS resolver in front of its public DNS. iOS's stub
resolver caches NXDOMAIN for the intermediate lookup, so phone requests
silently fail. Pointing the wildcard at the laptop's tailnet IP makes
the resolution a single hop — tailnet peers reach the laptop, anyone
else gets a useless 100.x address (intended).

If you're using a non-Cloudflare DNS provider, add the record yourself:

```
*.local.ricoslabs.com   A   <your-tailnet-ip>   (DNS-only)
```

### 2. Cloudflare API token

Caddy needs a Cloudflare token to fetch the wildcard cert via DNS-01
ACME. `hatchkit config add dns` already prompts for one — if you ran
`hatchkit setup`, you've got it. Otherwise:

```
hatchkit config add dns
```

Permissions: `Zone:DNS:Edit` + `Zone:Zone:Read` scoped to
`ricoslabs.com`. The token gets embedded in the launchd plist
during `dev-setup init`.

### 3. Caddy with the Cloudflare DNS plugin

```
brew install caddy
caddy list-modules | grep cloudflare
```

If `dns.providers.cloudflare` isn't in the module list, rebuild with
xcaddy:

```
go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest
xcaddy build --with github.com/caddy-dns/cloudflare
```

### 4. Wire it all up

```
hatchkit dev-setup init
```

This writes `~/.config/dev/Caddyfile`, a launchd plist that runs Caddy
on a free port (default 9443, auto-bumps if taken), loads the launchd
job, and registers `tailscale serve --tcp=443 → localhost:<caddyPort>`.
Idempotent — safe to re-run.

### 5. Verify

```
hatchkit doctor
```

Look for the **Local-dev** rows. All six should be green:

- Tailscale daemon
- Caddy installed
- Caddy cloudflare plugin
- Cloudflare API token in plist
- Caddy launchd job
- Tailscale serve bridge

## Per-project bits

This project's slug is **`conv3d`**, recorded in
`.hatchkit.json` under `localDev.slug`. When `pnpm dev` starts, the
hatchkit dev plugin:

1. Reads the slug + the live dev port from the running server.
2. Writes/updates `~/.config/dev/projects/conv3d.caddy` pointing at
   that port. Caddy's `--watch` picks it up without a restart.
3. Probes `tailscale serve status` for the TCP=443 bridge.
4. Prints a banner:

```
➜  Local:     http://localhost:<port>/
➜  Tailscale: https://conv3d.local.ricoslabs.com/
```

`HATCHKIT_LOCAL_DEV=0` in the environment disables the plugin entirely;
the dev server falls back to its default banner.

## Cleanup

If you tear down this project:

```
hatchkit destroy
```

…also removes `~/.config/dev/projects/conv3d.caddy`. Other projects'
fragments stay put.

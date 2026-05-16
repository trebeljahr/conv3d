# Docs E2E tests

Minimal Playwright smoke for the landing page. Focused on the WebGL hero
(`HeroFunnelScene.tsx`) — which has broken silently before — plus the
section that proves it, the chart, and the CTAs.

We deliberately don't test MDX docs pages (Fumadocs validates at build).

## Run

```sh
# from docs/
pnpm test:e2e             # build + start + run
pnpm test:e2e:ui          # interactive
```

First run on a fresh checkout also needs the chromium binary:

```sh
pnpm exec playwright install chromium
```

Tests own the dev server through `webServer` in `playwright.config.ts` —
`pnpm build && pnpm start` on port 4488. Locally we reuse an existing
server on that port if one is running; CI always builds fresh.

## Visual regression baselines

Screenshots live in `tests/__screenshots__/<spec>/`. The path is set by
`snapshotPathTemplate` in `playwright.config.ts`. To regenerate after
an intentional UI change:

```sh
pnpm test:e2e:update
```

Diff tolerance is loose (`maxDiffPixelRatio: 0.05`) because the canvas
pixels are inherently non-deterministic. If a hero refactor lands and
the screenshot shifts more than that, update the baseline rather than
tightening the threshold.

## What's covered

- Page loads, `<title>` contains `conv3d`.
- Hero `<h1>` + headline visible.
- Primary CTA links to `/docs/getting-started`, secondary to the repo.
- `BatchChart` visible (role=img + aria-label).
- At least one `<canvas>` inside `<header>` (the WebGL hero mount).
- No unexpected console errors after a 3s settle.
- Mobile viewport (390×844) renders without horizontal overflow.
- One screenshot per viewport.

## What's not covered

- MDX content pages.
- Chart math (trivial).
- Three.js scene contents (canvas pixels are noisy; we only check the
  element mounts and JS doesn't throw).

# Contributing

conv3d is a TypeScript CLI (`src/`) with a Next.js + Fumadocs docs site (`docs/`). Bug reports, fixes and docs improvements are welcome.

## Local setup

```bash
pnpm install
pnpm build                          # tsc → dist/
node dist/conv3d.js doctor          # run the local build
pnpm test                           # build + node --test + JSON schema audit
pnpm lint                           # Biome
```

Docs site:

```bash
pnpm docs:install
pnpm docs:dev                       # http://localhost:3485
```

Husky runs Biome on staged files before each commit and `pnpm test` before each push.

## Pull requests

- Keep a change to one concern, and say what changed and why.
- List the commands you ran to check it.
- For CLI output or flag changes, update the README, the matching page in `docs/content/docs/`, and the changelog (`docs/content/docs/changelog.mdx`, under "Unreleased").
- Never commit model files you are not allowed to redistribute. Test fixtures and press images use CC0 packs only.

## Releasing (maintainers)

```bash
pnpm release          # patch bump (default)
pnpm release:patch    # 1.0.5 → 1.0.6
pnpm release:minor    # 1.0.5 → 1.1.0
pnpm release:major    # 1.0.5 → 2.0.0
```

Each command first runs `scripts/release-prep.mjs`, which refuses a dirty working tree or a local version that is not ahead of npm. It then bumps the version (tagged commit), builds, runs the tests and an install test, publishes to npm, pushes the tag to GitHub, and re-installs conv3d globally so your `PATH` matches what was just published.

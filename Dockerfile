# syntax=docker/dockerfile:1
#
# Static-site image for conv3d.
# Built by .github/workflows/deploy.yml, pushed to GHCR, pulled by
# Coolify via docker-compose.yml. nginx serves the built bundle —
# no runtime Node, so any sensitive values must be build-time-only
# (baked into the static bundle) or non-sensitive.
#
# .env.production is committed to the repo dotenvx-encrypted. The
# build stage decrypts it via the dotenvx_private_key BuildKit secret
# (passed by .github/workflows/deploy.yml from the GH Actions secret
# DOTENV_PRIVATE_KEY_PRODUCTION) so `pnpm build` sees the plain values
# when it bakes them into the static output.
#
# Why BuildKit secrets and not ARG: ARG values land in `docker history`
# and the image manifest. BuildKit secrets are mounted as tmpfs at
# build time and never persist — `docker history` won't show them, the
# final image won't either. Requires BuildKit (default in modern
# Docker; the GH Actions workflow uses docker/setup-buildx-action
# which enables it).
#
# What ends up in the bundle: NEXT_PUBLIC_* / VITE_* / similar values
# that the framework explicitly inlines into client JS. What does NOT:
# any non-public values, since this static site has no runtime to
# read them.
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
# `--mount=type=secret,id=dotenvx_private_key,env=DOTENV_PRIVATE_KEY_PRODUCTION`
# exposes the secret value as the env var the wrapped command reads,
# only for the duration of each RUN it's mounted into. dotenvx picks
# it up, decrypts .env.production in memory, and re-exports each
# KEY=VALUE for `pnpm build`. If the secret is missing, dotenvx
# silently skips decryption and the build would bake `encrypted:...`
# strings into asset URLs — fail fast instead.
#
# Two separate RUN steps on purpose: BuildKit dumps the entire RUN
# command into the build error when ANY step in a chained `&&` fails,
# echo strings included. Splitting the secret check off means the
# "secret not supplied" message only shows up when that's actually
# what failed — a downstream `pnpm build` failure won't drag the
# misleading echo into its error context.
RUN --mount=type=secret,id=dotenvx_private_key,env=DOTENV_PRIVATE_KEY_PRODUCTION \
    test -n "$DOTENV_PRIVATE_KEY_PRODUCTION" || { \
      echo "ERROR: dotenvx_private_key build secret not supplied. The workflow at .github/workflows/deploy.yml should pass it via 'secrets:' from the GH Actions secret DOTENV_PRIVATE_KEY_PRODUCTION." >&2; \
      exit 1; \
    }
RUN --mount=type=secret,id=dotenvx_private_key,env=DOTENV_PRIVATE_KEY_PRODUCTION \
    pnpm dlx @dotenvx/dotenvx run -- pnpm build

FROM nginx:alpine AS runner
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

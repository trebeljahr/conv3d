# syntax=docker/dockerfile:1
#
# Static-site image for conv3d's docs site.
#
# What this image serves: the Fumadocs Next.js site under docs/, NOT
# the conv3d CLI at the repo root. The site is configured with
# `output: 'export'` so the build emits a fully static bundle to
# docs/out/ — which is what we copy into nginx.
#
# Why this isn't built at the repo root: hatchkit's framework detector
# scans the root package.json, sees a CLI (no Next.js), and scaffolds a
# generic nginx-static Dockerfile that copies /app/dist. /app/dist for
# the CLI is compiled JavaScript, not a website; nginx serves its
# fallback index.html in that case → the "Welcome to nginx" banner.
#
# Built by .github/workflows/deploy.yml, pushed to GHCR, pulled by
# Coolify via docker-compose.yml. The deploy workflow still mounts the
# dotenvx_private_key BuildKit secret, but the docs build itself doesn't
# read .env.production today (no NEXT_PUBLIC_* values needed). Re-add
# the dotenvx wrapper if that changes.
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app/docs
# docs/package.json doesn't pin packageManager (the root package.json does,
# but we never copy it). Without an explicit pin corepack falls back to a
# newer pnpm than local, and fumadocs-mdx@15's postinstall blows up trying
# to load a `vite/index.js` that isn't a declared dep
# (ERR_MODULE_NOT_FOUND: Cannot find package 'vite'). Pin to match what
# the local install + build was tested against.
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
# Copy the whole docs/ tree before install: fumadocs-mdx's postinstall
# (`fumadocs-mdx` CLI) probes for next.config.* to decide between its
# Next.js and Vite code paths. Without next.config.mjs present it falls
# through to ./dist/vite/index.js, which imports `vite` (not declared)
# and crashes with ERR_MODULE_NOT_FOUND. So skip the split-COPY cache
# trick and copy everything first.
COPY docs/ ./
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM nginx:alpine AS runner
COPY --from=build /app/docs/out /usr/share/nginx/html
EXPOSE 80

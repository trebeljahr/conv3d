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
# Coolify's Docker Image application. The docs build requires no secrets;
# its public release identity is supplied as a build argument.
ARG NODE_VERSION=24
ARG PREVIOUS_IMAGE

# The exact verified serving image. Its export supplies retained releases and
# the fixed legacy asset baseline; see scripts/RETAINED-DOCS.md.
FROM ${PREVIOUS_IMAGE} AS previous

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
ARG RELEASE_SHA
ENV NEXT_PUBLIC_BUILD_COMMIT=${RELEASE_SHA}
RUN pnpm build
COPY scripts/write-version.mjs /tmp/write-version.mjs
RUN node /tmp/write-version.mjs out "$RELEASE_SHA"
COPY --from=previous /usr/share/nginx/html /previous-export
COPY scripts/retain-docs-releases.mjs scripts/docs-bootstrap.mjs /tmp/
ARG PREVIOUS_SHA
ARG PREVIOUS_DIGEST
RUN node /tmp/retain-docs-releases.mjs out /previous-export /retained-out "$RELEASE_SHA" "$PREVIOUS_SHA" "$PREVIOUS_DIGEST"

FROM nginx:alpine AS runner
# Startup seeds the shared release volume before nginx serves; see the entrypoint.
RUN apk add --no-cache nodejs
COPY scripts/shared-docs-releases.mjs scripts/retain-docs-releases.mjs scripts/docs-bootstrap.mjs /usr/local/lib/docs/
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /retained-out /usr/share/nginx/html
ARG PREVIOUS_SHA
ARG PREVIOUS_DIGEST
LABEL io.conv3d.docs.parent-sha=$PREVIOUS_SHA \
      io.conv3d.docs.parent-digest=$PREVIOUS_DIGEST \
      io.conv3d.docs.retention="3" \
      io.conv3d.docs.storage="shared-v1"
COPY deploy/drain-entrypoint.sh /usr/local/bin/drain-entrypoint
RUN chmod +x /usr/local/bin/drain-entrypoint
ENV SHUTDOWN_DRAIN_SECONDS=20
EXPOSE 80
HEALTHCHECK --interval=2s --timeout=5s --start-period=15s --retries=5 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:80/ || exit 1
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/local/bin/drain-entrypoint"]
CMD ["nginx", "-g", "daemon off;"]

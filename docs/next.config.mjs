import { withLocalDev } from "@hatchkit/dev-plugin-next";
import { createMDX } from 'fumadocs-mdx/next';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  output: 'export',
  deploymentId: process.env.NEXT_PUBLIC_BUILD_COMMIT,
  env: {
    // Defined even when unset. The bundler inlines only the NEXT_PUBLIC_*
    // variables that exist at build time; an unset one stays a runtime
    // `process.env` lookup, and lib/error-reporting/reporter.ts keeps the SDK
    // import behind `NEXT_PUBLIC_SENTRY_DSN ? import(…) : …`. Only a literal
    // "" folds that to its false branch and drops the SDK chunk from the
    // export.
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
  },
  images: { unoptimized: true },
  turbopack: {
    root: __dirname,
  },
};

const __hatchkitLocalDevConfig = withMDX(config);
export default withLocalDev(__hatchkitLocalDevConfig, { slug: "conv3d" });

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
  images: { unoptimized: true },
  turbopack: {
    root: __dirname,
  },
};

const __hatchkitLocalDevConfig = withMDX(config);
export default withLocalDev(__hatchkitLocalDevConfig, { slug: "conv3d" });

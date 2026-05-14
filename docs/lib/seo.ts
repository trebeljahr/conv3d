import { statSync } from "node:fs";
import { join } from "node:path";

export const SITE_URL = "https://conv3d.trebeljahr.com";
export const SITE_NAME = "conv3d";
export const SITE_DESCRIPTION =
  "Command-line tool that converts FBX, OBJ, and glTF files into GLB and generates matching React Three Fiber components - interactive or fully scripted.";
export const DEFAULT_SOCIAL_IMAGE = "/opengraph-image";
export const DEFAULT_TWITTER_IMAGE = "/twitter-image";

const FALLBACK_LAST_MODIFIED = new Date("2026-05-14T00:00:00.000Z");

export function absoluteUrl(pathname: string): string {
  return new URL(pathname, SITE_URL).toString();
}

export function docDescription(description: string | undefined, title: string): string {
  const trimmed = description?.trim();
  if (trimmed) return trimmed;
  return `${title} documentation for conv3d, the CLI for converting 3D assets to web-ready GLB files and React Three Fiber components.`;
}

export function docSourcePath(slug: string[] | undefined): string {
  const file = slug && slug.length > 0 ? `${slug.join("/")}.mdx` : "index.mdx";
  return join(process.cwd(), "content", "docs", file);
}

export function lastModifiedForFile(pathname: string): Date {
  try {
    return statSync(pathname).mtime;
  } catch {
    return FALLBACK_LAST_MODIFIED;
  }
}

export function lastModifiedForDoc(slug: string[] | undefined): Date {
  return lastModifiedForFile(docSourcePath(slug));
}

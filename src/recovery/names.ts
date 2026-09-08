// ---------------------------------------------------------------------------
// Name normalization and image-file detection helpers shared by the texture
// and material recovery stages.
// ---------------------------------------------------------------------------

import path from "node:path";

export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp"]);
export const NON_TEXTURE_NAME_HINTS = ["preview", "thumbnail", "sample"];

export function isImageCandidate(name: string): boolean {
  if (name.startsWith(".")) return false;
  if (!IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase())) return false;
  const lower = name.toLowerCase();
  return !NON_TEXTURE_NAME_HINTS.some((h) => lower.includes(h));
}

// Loose normalization for fuzzy material/file name matches. "BirchTree_Bark"
// and "birchtreebark" and "BirchTree-Bark" all collapse to "birchtreebark".
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.\d+$/, "") // strip Blender ".001" duplicate suffix
    .replace(/[^a-z0-9]/g, "");
}

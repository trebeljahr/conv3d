// ---------------------------------------------------------------------------
// GLB binary helpers — parse, inspect, and (re)serialize the .glb container.
// ---------------------------------------------------------------------------

import { writeFile } from "node:fs/promises";
import gltfPipeline from "gltf-pipeline";
import type { GltfImage, GltfJson } from "./gltf-types.js";

const { gltfToGlb } = gltfPipeline;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47] as const;
const GLB_MAGIC = 0x46546c67;
const GLB_JSON = 0x4e4f534a;
const GLB_BIN = 0x004e4942;

// GLB binary layout (https://www.khronos.org/registry/glTF/specs/2.0/glTF-2.0.html#binary-gltf-layout)
const GLB_VERSION = 2;
const GLB_HEADER_SIZE = 12; // magic (u32) + version (u32) + total length (u32)
const GLB_CHUNK_HEADER_SIZE = 8; // chunk length (u32) + chunk type (u32)
const UINT32_BYTES = 4;

export function padTo4(n: number): number {
  return (UINT32_BYTES - (n % UINT32_BYTES)) % UINT32_BYTES;
}

const PLACEHOLDER_BYTE_LIMIT = 256;
const PLACEHOLDER_DIM_LIMIT = 4;

export function mimeForExtension(ext: string): string {
  const lower = ext.toLowerCase();
  if (lower === ".jpg" || lower === ".jpeg") return "image/jpeg";
  if (lower === ".webp") return "image/webp";
  if (lower === ".bmp") return "image/bmp";
  return "image/png";
}

export function parseGlbMinimal(buf: Buffer): { json: GltfJson; bin: Buffer | null } {
  if (buf.length < GLB_HEADER_SIZE || buf.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error("Not a valid GLB");
  }
  const totalLength = buf.readUInt32LE(2 * UINT32_BYTES);
  let offset = GLB_HEADER_SIZE;
  let json: GltfJson | null = null;
  let bin: Buffer | null = null;
  while (offset < totalLength) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + UINT32_BYTES);
    offset += GLB_CHUNK_HEADER_SIZE;
    const data = buf.subarray(offset, offset + chunkLength);
    if (chunkType === GLB_JSON) json = JSON.parse(data.toString("utf8"));
    else if (chunkType === GLB_BIN) bin = Buffer.from(data);
    offset += chunkLength;
  }
  if (!json) throw new Error("GLB has no JSON chunk");
  return { json, bin };
}

export function getImageBytes(img: GltfImage, gltf: GltfJson, bin: Buffer | null): Buffer | null {
  if (img.bufferView !== undefined && bin) {
    const bv = gltf.bufferViews?.[img.bufferView];
    if (!bv) return null;
    const start = bv.byteOffset ?? 0;
    return Buffer.from(bin.subarray(start, start + bv.byteLength));
  }
  if (typeof img.uri === "string" && img.uri.startsWith("data:")) {
    const marker = ";base64,";
    const idx = img.uri.indexOf(marker);
    if (idx < 0) return null;
    return Buffer.from(img.uri.slice(idx + marker.length), "base64");
  }
  return null;
}

export function isPlaceholderPng(data: Buffer): boolean {
  if (data.length >= PLACEHOLDER_BYTE_LIMIT) return false;
  if (data.length < 24) return false;
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (data[i] !== PNG_MAGIC[i]) return false;
  }
  const w = data.readUInt32BE(16);
  const h = data.readUInt32BE(20);
  return w > 0 && h > 0 && w <= PLACEHOLDER_DIM_LIMIT && h <= PLACEHOLDER_DIM_LIMIT;
}

export function appendImageToBin(
  gltf: GltfJson,
  bin: Buffer | null,
  imageBytes: Buffer,
  mimeType: string,
  name: string,
): { textureIndex: number; bin: Buffer } {
  const existingBin = bin ?? Buffer.alloc(0);
  const pad = padTo4(existingBin.length);
  const offset = existingBin.length + pad;
  const newBin = Buffer.concat([existingBin, Buffer.alloc(pad), imageBytes]);

  gltf.bufferViews ??= [];
  gltf.buffers ??= [];
  gltf.images ??= [];
  gltf.samplers ??= [];
  gltf.textures ??= [];

  const { bufferViews, buffers, images, samplers, textures } = gltf;
  if (buffers.length === 0) buffers.push({ byteLength: newBin.length });
  else buffers[0]!.byteLength = newBin.length;

  const bvIdx = bufferViews.length;
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: imageBytes.length });

  const imgIdx = images.length;
  images.push({ name, mimeType, bufferView: bvIdx });

  if (samplers.length === 0) samplers.push({});

  const texIdx = textures.length;
  textures.push({ sampler: 0, source: imgIdx });

  return { textureIndex: texIdx, bin: newBin };
}

// ---------------------------------------------------------------------------
// GLB writer
//
// Two paths:
//   - Fast path: build the GLB ourselves when no images point at our patched
//     `extras._pipeline.source` (i.e. all images are bufferView-backed and we
//     have a coherent BIN to round-trip).
//   - Re-encode path: when we patched images via `extras._pipeline.source`
//     (placeholder recovery), defer to gltf-pipeline so it re-merges buffer
//     views correctly.
// ---------------------------------------------------------------------------

export async function writeGlb(glbPath: string, gltf: GltfJson, bin: Buffer | null): Promise<void> {
  const usesPipelineExtras = (gltf.images ?? []).some(
    (img: GltfImage) => img.extras?._pipeline?.source,
  );

  if (usesPipelineExtras) {
    gltf.buffers ??= [];
    gltf.bufferViews ??= [];
    if (bin && gltf.buffers.length > 0) {
      const buf0 = gltf.buffers[0]!;
      buf0.extras ??= {};
      buf0.extras._pipeline ??= {};
      buf0.extras._pipeline.source = bin;
    }
    const result = await gltfToGlb(gltf);
    await writeFile(glbPath, result.glb);
    return;
  }

  // Direct GLB serializer — preserves any in-place mutation of the BIN.
  // JSON chunks pad with 0x20 (ASCII space) to keep the JSON parser happy;
  // BIN chunks pad with 0x00. Both must be 4-byte aligned per spec.
  const JSON_PAD_BYTE = 0x20;
  const BIN_PAD_BYTE = 0x00;

  let jsonBuf = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonPad = padTo4(jsonBuf.length);
  if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, JSON_PAD_BYTE)]);

  let binBuf: Buffer | null = bin;
  if (binBuf) {
    const binPad = padTo4(binBuf.length);
    if (binPad) binBuf = Buffer.concat([binBuf, Buffer.alloc(binPad, BIN_PAD_BYTE)]);
  }

  const binChunkSize = binBuf ? GLB_CHUNK_HEADER_SIZE + binBuf.length : 0;
  const totalLength = GLB_HEADER_SIZE + GLB_CHUNK_HEADER_SIZE + jsonBuf.length + binChunkSize;
  const out = Buffer.alloc(totalLength);
  let off = 0;
  out.writeUInt32LE(GLB_MAGIC, off);
  off += UINT32_BYTES;
  out.writeUInt32LE(GLB_VERSION, off);
  off += UINT32_BYTES;
  out.writeUInt32LE(totalLength, off);
  off += UINT32_BYTES;
  out.writeUInt32LE(jsonBuf.length, off);
  off += UINT32_BYTES;
  out.writeUInt32LE(GLB_JSON, off);
  off += UINT32_BYTES;
  jsonBuf.copy(out, off);
  off += jsonBuf.length;
  if (binBuf) {
    out.writeUInt32LE(binBuf.length, off);
    off += UINT32_BYTES;
    out.writeUInt32LE(GLB_BIN, off);
    off += UINT32_BYTES;
    binBuf.copy(out, off);
  }
  await writeFile(glbPath, out);
}

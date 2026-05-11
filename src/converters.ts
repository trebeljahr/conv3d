import { readdir, readFile, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import convertFbxToGlb from "fbx2gltf";
import gltfPipeline from "gltf-pipeline";
import gltfjsx from "gltfjsx/src/gltfjsx.js";
import obj2gltf from "obj2gltf";
import { createSpinner, err, info, warn } from "./log.js";
import type { OutputDirs } from "./outputDirs.js";
import { globalOptions, isDryRun, resolveConcurrency, resolveOverwriteMode } from "./program.js";
import { askForFileOverwrite } from "./prompts.js";
import { checkFileExists } from "./utils.js";

const { green, red, yellow } = chalk;
const { gltfToGlb } = gltfPipeline;

export type InputFormats = keyof typeof converters;

export const converters = {
  GLTF: convertSingleGltf,
  FBX: convertSingleFbx,
  OBJ: convertSingleObj,
  GLB: prepareGlbForWeb,
};

const getNew = (format: InputFormats) => {
  if (format === "GLB") return "TSX";
  return "GLB";
};

export type ConvertResult = {
  converted: string[];
  skipped: string[];
  errors: { file: string; message: string }[];
  planned: string[];
  glbOptimized: string[];
  plannedGlbOptimized: string[];
};

function optimizedGlbPathFor(tsxOutputPath: string, dirs: OutputDirs): string {
  const filename = path.basename(tsxOutputPath).replace(/\.tsx$/, "-transformed.glb");
  return path.resolve(dirs.optimized, filename);
}

async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<void>,
): Promise<void> {
  if (limit <= 1) {
    for (let i = 0; i < items.length; i++) await worker(items[i]!, i);
    return;
  }
  let next = 0;
  const runners: Promise<void>[] = [];
  const runOne = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i]!, i);
    }
  };
  for (let k = 0; k < Math.min(limit, items.length); k++) {
    runners.push(runOne());
  }
  await Promise.all(runners);
}

export async function convertModels(
  format: InputFormats,
  filesToConvert: string[],
  inputDir: string,
  dirs: OutputDirs,
): Promise<ConvertResult> {
  const empty: ConvertResult = {
    converted: [],
    skipped: [],
    errors: [],
    planned: [],
    glbOptimized: [],
    plannedGlbOptimized: [],
  };

  if (filesToConvert.length === 0) {
    warn(yellow(`⚠️ No ${format} models found in the input directory, skipping...`));
    return empty;
  }

  const isGlbStep = format === "GLB";
  if (isGlbStep && !globalOptions.tsx && !globalOptions.optimize) {
    return empty;
  }

  info(
    `ℹ️ Found ${filesToConvert.length} ${format} model${
      filesToConvert.length > 1 ? "s" : ""
    } to convert from input dir: ${inputDir}`,
  );

  const newFormat = getNew(format);
  const newExtension = newFormat.toLowerCase();

  const spinnerLabel = isGlbStep
    ? `Generating ${
        globalOptions.tsx && globalOptions.optimize
          ? ".tsx + optimized .glb"
          : globalOptions.tsx
            ? ".tsx"
            : "optimized .glb"
      } files...`
    : `Converting ${format} files to ${newFormat}...`;
  const spinner = createSpinner(spinnerLabel).start();

  const result: ConvertResult = {
    converted: [],
    skipped: [],
    errors: [],
    planned: [],
    glbOptimized: [],
    plannedGlbOptimized: [],
  };
  const converter = converters[format];
  const total = filesToConvert.length;
  const overwriteMode = resolveOverwriteMode();
  const concurrency = resolveConcurrency();
  let done = 0;

  const worker = async (filePath: string): Promise<void> => {
    const oldExtension = path.extname(filePath);
    const file = path.basename(filePath);
    const newFile = file.replace(oldExtension, "." + newExtension);

    const outputDirForStep = isGlbStep ? dirs.tsx : dirs.glb;
    const outputPath = path.resolve(outputDirForStep, newFile);
    const optimizedPath = isGlbStep ? optimizedGlbPathFor(outputPath, dirs) : null;

    if (isGlbStep) {
      if (globalOptions.tsx) result.planned.push(outputPath);
      if (globalOptions.optimize && optimizedPath) {
        result.plannedGlbOptimized.push(optimizedPath);
      }
    } else {
      result.planned.push(outputPath);
    }

    if (isDryRun()) {
      spinner.text = `[dry-run] ${file}`;
      return;
    }

    // Overwrite check — on the file the user would actually keep.
    const primaryOutputPath = isGlbStep
      ? globalOptions.tsx
        ? outputPath
        : optimizedPath
      : outputPath;

    if (primaryOutputPath) {
      const exists = await checkFileExists(primaryOutputPath);
      if (exists) {
        let proceed: boolean;
        if (overwriteMode === "replace") proceed = true;
        else if (overwriteMode === "skip") {
          proceed = false;
          warn(yellow(`⚠️ ${path.basename(primaryOutputPath)} already exists — skipping`));
        } else {
          spinner.stopAndPersist({ symbol: "ℹ️" });
          warn(
            yellow(`⚠️ ${path.basename(primaryOutputPath)} already exists in the output directory`),
          );
          proceed = await askForFileOverwrite(primaryOutputPath);
          spinner.start();
        }
        if (!proceed) {
          result.skipped.push(primaryOutputPath);
          done += 1;
          spinner.text = `${spinnerLabel} (${done}/${total}) ${file}`;
          return;
        }
      }
    }

    const inputPath = path.resolve(inputDir, filePath);

    try {
      await converter(inputPath, outputPath);

      if (isGlbStep) {
        // gltfjsx writes both the .tsx and, when transform is true, a
        // <name>-transformed.glb next to it. Move / delete as configured.
        if (globalOptions.optimize) {
          const source = outputPath.replace(/\.tsx$/, "-transformed.glb");
          const target = optimizedPath!;
          if (source !== target) {
            try {
              await rename(source, target);
            } catch {
              // gltfjsx may not have produced the file; ignore.
            }
          }
          result.glbOptimized.push(target);
        }
        if (globalOptions.tsx) {
          result.converted.push(outputPath);
        } else {
          try {
            await rm(outputPath, { force: true });
          } catch {
            // best-effort
          }
        }
      } else {
        result.converted.push(outputPath);
      }

      done += 1;
      spinner.text = `${spinnerLabel} (${done}/${total}) ${file}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push({ file: inputPath, message: errorMessage });
      err(red(`\n🚨 Error converting ${filePath}`));
      err(red(errorMessage));
      info("ℹ️ Continuing with the rest of the models...");
      done += 1;
    }
  };

  await runPool(filesToConvert, concurrency, worker);

  spinner.stopAndPersist({ symbol: "🌻" });

  // Clean up empty scratch tsx dir when we used it only for optimize.
  if (
    isGlbStep &&
    !isDryRun() &&
    !globalOptions.tsx &&
    dirs.tsx !== dirs.base &&
    dirs.tsx !== dirs.optimized
  ) {
    try {
      await rmdir(dirs.tsx);
    } catch {
      // non-empty or missing — fine either way
    }
  }

  if (isDryRun()) {
    const n = result.planned.length + result.plannedGlbOptimized.length;
    info(
      green(
        `✨ [dry-run] ${format} → ${newFormat}: ${n} file${n === 1 ? "" : "s"} would be written`,
      ),
    );
  } else {
    info(green(`✨ ${format} step completed`));
  }

  return result;
}

export async function collectFiles(files: string[], { modelType }: { modelType: InputFormats }) {
  const inputEnding = "." + modelType.toLowerCase();
  const modelFiles = files.filter((file) => file.endsWith(inputEnding));
  return modelFiles;
}

export async function convertSingleObj(inputPath: string, outputPath: string) {
  // binary: true makes obj2gltf return a real GLB Buffer (with embedded
  // textures and geometry). Without it, obj2gltf returns a glTF JSON object
  // and we'd be writing JSON into a .glb file — parseable by lenient tools,
  // but semantically wrong.
  const glb = (await obj2gltf(inputPath, { binary: true })) as Buffer;
  await writeFile(outputPath, glb);
}

export async function convertSingleFbx(inputPath: string, outputPath: string) {
  const inputDir = path.dirname(inputPath);
  const pathsBefore = await readdir(inputDir);
  const fbmFoldersBefore = pathsBefore.filter((file) => file.endsWith(".fbm"));

  const cleanup = async () => {
    const paths = await readdir(inputDir);
    const newFbmFolders = paths.filter(
      (file) => file.endsWith(".fbm") && !fbmFoldersBefore.includes(file),
    );

    for (const folder of newFbmFolders) {
      const folderPath = path.resolve(inputDir, folder);
      await rm(folderPath, { recursive: true, force: true });
    }
  };

  try {
    await convertFbxToGlb(inputPath, outputPath, ["--binary", "--pbr-metallic-roughness"]);
    // fbx2gltf bakes a 1×1 magenta placeholder when it can't resolve a
    // texture (e.g. Kenney/Kaykit packs store textures via absolute Windows
    // paths that don't exist on macOS/Linux, and the FBX SDK doesn't fall
    // back to the basename). Patch any such placeholders by matching against
    // image files next to the .fbx.
    const recovered = await recoverFbxTextures(outputPath, inputPath);
    if (recovered > 0) {
      info(
        green(
          `✨ Recovered ${recovered} external texture${
            recovered === 1 ? "" : "s"
          } for ${path.basename(inputPath)}`,
        ),
      );
    }
  } catch (error) {
    await cleanup();
    throw error;
  } finally {
    await cleanup();
  }
}

export async function convertSingleGltf(inputPath: string, outputPath: string) {
  const gltf = JSON.parse(await readFile(inputPath, "utf8"));
  const options = { resourceDirectory: path.dirname(inputPath) };
  const results = await gltfToGlb(gltf, options);
  await writeFile(outputPath, results.glb);
}

export async function prepareGlbForWeb(inputPath: string, outputPath: string) {
  await gltfjsx(inputPath, outputPath, {
    transform: !!globalOptions.optimize,
    debug: false,
    types: true,
    ...(globalOptions.resolution !== undefined ? { resolution: globalOptions.resolution } : {}),
    ...(globalOptions.keepMaterials ? { keepmaterials: true } : {}),
  });
}

// ---------------------------------------------------------------------------
// FBX placeholder-texture recovery
//
// fbx2gltf bakes a 1×1 magenta PNG into the output GLB whenever the FBX SDK
// can't resolve a referenced texture file. Two common reasons:
//
//  - Many free packs (Kenney's KAYKIT, etc.) record `FileName` and even
//    `RelativeFilename` as absolute Windows paths (`C:\\Files\\Work\\...`),
//    which obviously don't exist on macOS/Linux.
//  - The FBX SDK's fallback "look next to the FBX" search doesn't kick in
//    because the (relative) filename it derived is empty.
//
// We post-process the GLB to: (1) detect those 1×1 placeholders, (2) match
// them against image files in the FBX's directory using a tiny scoring
// heuristic, and (3) swap the placeholder bytes for the real file.
// ---------------------------------------------------------------------------

type TextureSlot = "baseColor" | "normal" | "metallicRoughness" | "emissive" | "occlusion";

const PLACEHOLDER_BYTE_LIMIT = 256;
const PLACEHOLDER_DIM_LIMIT = 4;

const SLOT_KEYWORDS: Record<TextureSlot, string[]> = {
  baseColor: ["basecolor", "base_color", "diffuse", "albedo", "_color", "texture"],
  normal: ["normal", "_nrm", "bump"],
  metallicRoughness: [
    "metallic_roughness",
    "metallicroughness",
    "metalrough",
    "_orm",
    "_mr_",
    "roughness",
  ],
  emissive: ["emissive", "emission", "emit"],
  occlusion: ["occlusion", "_ao", "ambientocclusion"],
};

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp"]);

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47] as const;
const GLB_MAGIC = 0x46546c67;
const GLB_JSON = 0x4e4f534a;
const GLB_BIN = 0x004e4942;

type GltfImage = {
  bufferView?: number;
  uri?: string;
  mimeType?: string;
  name?: string;
  extras?: { _pipeline?: { source?: Buffer } };
};
// biome-ignore lint/suspicious/noExplicitAny: gltf JSON has no static type
type GltfJson = any;

function parseGlbMinimal(buf: Buffer): { json: GltfJson; bin: Buffer | null } {
  if (buf.length < 12 || buf.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error("Not a valid GLB");
  }
  const totalLength = buf.readUInt32LE(8);
  let offset = 12;
  let json: GltfJson | null = null;
  let bin: Buffer | null = null;
  while (offset < totalLength) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    offset += 8;
    const data = buf.subarray(offset, offset + chunkLength);
    if (chunkType === GLB_JSON) json = JSON.parse(data.toString("utf8"));
    else if (chunkType === GLB_BIN) bin = Buffer.from(data);
    offset += chunkLength;
  }
  if (!json) throw new Error("GLB has no JSON chunk");
  return { json, bin };
}

function getImageBytes(img: GltfImage, gltf: GltfJson, bin: Buffer | null): Buffer | null {
  if (img.bufferView !== undefined && bin) {
    const bv = gltf.bufferViews[img.bufferView];
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

function isPlaceholderPng(data: Buffer): boolean {
  if (data.length >= PLACEHOLDER_BYTE_LIMIT) return false;
  if (data.length < 24) return false;
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (data[i] !== PNG_MAGIC[i]) return false;
  }
  const w = data.readUInt32BE(16);
  const h = data.readUInt32BE(20);
  return w > 0 && h > 0 && w <= PLACEHOLDER_DIM_LIMIT && h <= PLACEHOLDER_DIM_LIMIT;
}

function detectImageSlot(gltf: GltfJson, imageIdx: number): TextureSlot | null {
  const textures: { source?: number }[] = gltf.textures ?? [];
  const texturesUsingImage = new Set<number>();
  for (let ti = 0; ti < textures.length; ti++) {
    if (textures[ti]?.source === imageIdx) texturesUsingImage.add(ti);
  }
  if (texturesUsingImage.size === 0) return null;
  const materials = gltf.materials ?? [];
  for (const mat of materials) {
    const pbr = mat.pbrMetallicRoughness ?? {};
    if (texturesUsingImage.has(pbr.baseColorTexture?.index)) return "baseColor";
    if (texturesUsingImage.has(pbr.metallicRoughnessTexture?.index)) return "metallicRoughness";
    if (texturesUsingImage.has(mat.normalTexture?.index)) return "normal";
    if (texturesUsingImage.has(mat.occlusionTexture?.index)) return "occlusion";
    if (texturesUsingImage.has(mat.emissiveTexture?.index)) return "emissive";
  }
  return null;
}

function mimeForExtension(ext: string): string {
  const lower = ext.toLowerCase();
  if (lower === ".jpg" || lower === ".jpeg") return "image/jpeg";
  if (lower === ".webp") return "image/webp";
  if (lower === ".bmp") return "image/bmp";
  return "image/png";
}

async function findReplacementTexture(
  fbxDir: string,
  fbxBaseLower: string,
  slot: TextureSlot | null,
): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(fbxDir);
  } catch {
    return null;
  }
  const candidates = entries.filter((n) => {
    if (n.startsWith(".")) return false;
    const ext = path.extname(n).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) return false;
    const lower = n.toLowerCase();
    return !lower.includes("preview") && !lower.includes("thumbnail") && !lower.includes("sample");
  });
  if (candidates.length === 0) return null;

  const slotKeywords = slot ? SLOT_KEYWORDS[slot] : [];

  let best: { p: string; score: number; size: number } | null = null;
  for (const name of candidates) {
    const lower = name.toLowerCase();
    let score = 1;
    if (fbxBaseLower && lower.includes(fbxBaseLower)) score += 10;
    if (slotKeywords.some((k) => lower.includes(k))) score += 5;
    // Subtract points when the file looks like a different slot, so a
    // baseColor placeholder doesn't grab a Normal map sitting in the same dir.
    if (slot) {
      for (const [other, kws] of Object.entries(SLOT_KEYWORDS) as [TextureSlot, string[]][]) {
        if (other === slot) continue;
        if (kws.some((k) => lower.includes(k))) {
          score -= 5;
          break;
        }
      }
    }
    if (score <= 0) continue;
    const full = path.join(fbxDir, name);
    let size = 0;
    try {
      size = (await stat(full)).size;
    } catch {
      continue;
    }
    if (!best || score > best.score || (score === best.score && size > best.size)) {
      best = { p: full, score, size };
    }
  }
  return best?.p ?? null;
}

export async function recoverFbxTextures(glbPath: string, fbxPath: string): Promise<number> {
  let buf: Buffer;
  try {
    buf = await readFile(glbPath);
  } catch {
    return 0;
  }
  let parsed: { json: GltfJson; bin: Buffer | null };
  try {
    parsed = parseGlbMinimal(buf);
  } catch {
    return 0;
  }
  const { json: gltf, bin } = parsed;
  const images: GltfImage[] = gltf.images ?? [];
  if (images.length === 0) return 0;

  const fbxDir = path.dirname(fbxPath);
  const fbxBaseLower = path.basename(fbxPath, path.extname(fbxPath)).toLowerCase();

  let recovered = 0;
  for (let i = 0; i < images.length; i++) {
    const img = images[i]!;
    const data = getImageBytes(img, gltf, bin);
    if (!data || !isPlaceholderPng(data)) continue;

    const slot = detectImageSlot(gltf, i);
    const replacementPath = await findReplacementTexture(fbxDir, fbxBaseLower, slot);
    if (!replacementPath) continue;

    const real = await readFile(replacementPath);
    img.extras = img.extras ?? {};
    img.extras._pipeline = img.extras._pipeline ?? {};
    img.extras._pipeline.source = real;
    img.mimeType = mimeForExtension(path.extname(replacementPath));
    img.bufferView = undefined;
    img.uri = undefined;
    recovered++;
  }
  if (recovered === 0) return 0;

  // gltf-pipeline's gltfToGlb reads buffer.extras._pipeline.source for the
  // existing BIN chunk and replaces the image bufferViews from our patched
  // `extras._pipeline.source`. Then it re-merges buffers for output.
  // Ensure buffers/bufferViews arrays exist — addBuffer (called during write)
  // assumes both are arrays.
  if (!Array.isArray(gltf.buffers)) gltf.buffers = [];
  if (!Array.isArray(gltf.bufferViews)) gltf.bufferViews = [];
  if (bin && gltf.buffers.length > 0) {
    gltf.buffers[0].extras = gltf.buffers[0].extras ?? {};
    gltf.buffers[0].extras._pipeline = gltf.buffers[0].extras._pipeline ?? {};
    gltf.buffers[0].extras._pipeline.source = bin;
  }
  const result = await gltfToGlb(gltf);
  await writeFile(glbPath, result.glb);
  return recovered;
}

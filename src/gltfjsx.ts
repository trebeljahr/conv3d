import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Logger, NodeIO, PropertyType } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  dequantize,
  draco,
  flatten,
  join,
  palette,
  prune,
  reorder,
  resample,
  sparse,
  textureCompress,
  unpartition,
  weld,
} from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import { ready as resampleReady, resample as resampleWasm } from "keyframe-resample";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { DRACOLoader } from "./vendor/gltfjsx/DRACOLoader.js";
import { GLTFLoader } from "./vendor/gltfjsx/GLTFLoader.js";
import parse from "./vendor/gltfjsx/parser.js";

// conv3d cannot depend on the gltfjsx package. gltfjsx 6.5.3 pins
// @gltf-transform/functions 4.1.0 and asks for sharp ^0.33.5, so every install
// gets a sharp with known libvips, libheif and librsvg vulnerabilities, whatever
// conv3d itself declares. npm overrides never reach users.
//
// So src/vendor/gltfjsx holds gltfjsx's parser and loaders, and optimizeGlb below
// is gltfjsx's transform with only the options conv3d passes. Calling these parts
// directly also keeps gltfjsx's header off stdout and local paths out of the .tsx.

Object.assign(DRACOLoader, { getDecoderModule: () => {} });
const loader = new GLTFLoader();
loader.setDRACOLoader(new DRACOLoader());

export type GltfjsxOptions = {
  transform: boolean;
  resolution?: number;
  keepmaterials?: boolean;
};

// weld() ran this cleanup itself until @gltf-transform 4.2. Without it, primitives
// that share vertex data each keep their own copy in the .glb.
const cleanupAfterWeld = () => [
  prune({
    propertyTypes: [PropertyType.ACCESSOR, PropertyType.NODE],
    keepAttributes: true,
    keepIndices: true,
    keepLeaves: false,
  }),
  dedup({ propertyTypes: [PropertyType.ACCESSOR] }),
];

async function optimizeGlb(
  inputPath: string,
  outputPath: string,
  { resolution = 1024, keepmaterials }: GltfjsxOptions,
): Promise<void> {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "draco3d.encoder": await draco3d.createEncoderModule(),
      "meshopt.decoder": MeshoptDecoder,
      "meshopt.encoder": MeshoptEncoder,
    })
    .setLogger(new Logger(Logger.Verbosity.WARN));

  const document = await io.read(inputPath);
  await document.transform(
    unpartition(),
    ...(keepmaterials ? [] : [palette({ min: 5 })]),
    reorder({ encoder: MeshoptEncoder }),
    dedup(),
    flatten(),
    dequantize(),
    join(),
    weld(),
    ...cleanupAfterWeld(),
    resample({ ready: resampleReady, resample: resampleWasm }),
    prune({ keepAttributes: false, keepLeaves: false }),
    sparse(),
    // @gltf-transform 4.3 switched non-color textures to 4:4:4 JPEG, which makes
    // normal maps about 75% bigger. conv3d keeps 4:2:0, as gltfjsx's version did.
    // Normal maps keep a resolution of at least 2048.
    textureCompress({
      slots: /^(?!normalTexture).*$/,
      encoder: sharp,
      chromaSubsampling: "4:2:0",
      resize: [resolution, resolution],
    }),
    textureCompress({
      slots: /^(?=normalTexture).*$/,
      encoder: sharp,
      targetFormat: "jpeg",
      chromaSubsampling: "4:2:0",
      resize: [Math.max(resolution, 2048), Math.max(resolution, 2048)],
    }),
    // draco() welds again before it compresses.
    draco(),
    ...cleanupAfterWeld(),
  );
  await io.write(outputPath, document);
}

function loadGltf(data: Buffer): Promise<unknown> {
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return new Promise((resolve, reject) => {
    loader.parse(arrayBuffer, "", resolve, reject);
  });
}

// The parser reports problems with console.log, and stdout belongs to --json.
// parse() runs synchronously up to prettier's promise, so concurrent
// conversions cannot restore the wrong console.log.
function parseWithLogsOnStderr(gltf: unknown, options: Record<string, unknown>): Promise<string> {
  const stdoutLog = console.log;
  console.log = console.error;
  try {
    return parse(gltf, options);
  } finally {
    console.log = stdoutLog;
  }
}

export async function generateTsx(
  inputPath: string,
  outputPath: string,
  options: GltfjsxOptions,
): Promise<void> {
  let glbPath = inputPath;
  if (options.transform) {
    const { name } = path.parse(inputPath);
    glbPath = path.join(path.dirname(path.resolve(outputPath)), `${name}-transformed.glb`);
    await optimizeGlb(inputPath, glbPath, options);
  }

  const gltf = await loadGltf(await readFile(glbPath));
  // `console: true` stops the parser printing its header. Leaving `size` unset
  // keeps the "Files:" line and its local paths out of that header.
  const source = await parseWithLogsOnStderr(gltf, {
    ...options,
    fileName: path.basename(glbPath),
    types: true,
    console: true,
  });
  // The parser leaves a trailing space after the credit line.
  await writeFile(outputPath, source.replace(/ +$/m, ""));
}

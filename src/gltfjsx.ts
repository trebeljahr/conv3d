import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DRACOLoader } from "gltfjsx/src/bin/DRACOLoader.js";
import { GLTFLoader } from "gltfjsx/src/bin/GLTFLoader.js";
import parse from "gltfjsx/src/utils/parser.js";
import transform from "gltfjsx/src/utils/transform.js";

// conv3d calls gltfjsx's parts directly instead of its default export. That
// export prints its header to stdout, writes local paths into the .tsx, and
// never settles when a file cannot be parsed. A patch-package patch cannot fix
// this for everyone: it misses gltfjsx when npm hoists it, as npx and project
// installs do. These are internal paths, so package.json pins the version.

DRACOLoader.getDecoderModule = () => {};
const loader = new GLTFLoader();
loader.setDRACOLoader(new DRACOLoader());

export type GltfjsxOptions = {
  transform: boolean;
  resolution?: number;
  keepmaterials?: boolean;
};

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
    await transform(inputPath, glbPath, options);
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

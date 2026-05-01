import { readdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
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
  const gltf = await obj2gltf(inputPath);
  const data = Buffer.from(JSON.stringify(gltf));
  await writeFile(outputPath, data);
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
  });
}

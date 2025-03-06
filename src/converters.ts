import chalk from "chalk";
import convertFbxToGlb from "fbx2gltf";
import { readdir, readFile, rename, rm, writeFile } from "fs/promises";
import gltfPipeline from "gltf-pipeline";
import gltfjsx from "gltfjsx/src/gltfjsx.js";
import obj2gltf from "obj2gltf";
import ora from "ora";
import path from "path";
import { globalOptions } from "./program.js";
import { isDirectory } from "./utils.js";
import { lstat, lstatSync } from "fs";
import { askForFileOverwrite } from "./prompts.js";

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
  if (format === "GLTF") return "GLB";
  if (format === "FBX") return "GLB";
  if (format === "OBJ") return "GLB";
  if (format === "GLB") return "TSX";
  return "GLB";
};

export async function convertModels(
  format: InputFormats,
  filesToConvert: string[],
  inputDir: string,
  outputDir: string
) {
  if (filesToConvert.length === 0) {
    console.info(
      yellow(`⚠️ No ${format} models found in the input directory, skipping...`)
    );
    return { converted: [], errors: [] };
  }

  console.info(
    `ℹ️ Found ${filesToConvert.length} ${format} model${
      filesToConvert.length > 1 ? "s" : ""
    } to convert from input dir: ${inputDir}`
  );

  const newFormat = getNew(format);
  const newExtension = newFormat.toLowerCase();
  const spinner = ora(`Converting ${format} files to ${newFormat}...`).start();

  let index = 0;
  const converted = [];
  const errors = [];
  const converter = converters[format];
  const total = filesToConvert.length;

  for (const filePath of filesToConvert) {
    const oldExtension = path.extname(filePath);
    const file = path.basename(filePath);
    const newFile = file.replace(oldExtension, "." + newExtension);

    const outputPath = path.resolve(outputDir, newExtension, newFile);

    const fileAlreadyExists = lstatSync(outputPath).isFile();

    if (fileAlreadyExists && !globalOptions.forceOverwrite) {
      spinner.stopAndPersist({ symbol: "ℹ️" });
      console.info(
        yellow(`⚠️ ${newFile} already exists in the output directory`)
      );
      const overwrite = await askForFileOverwrite(outputPath);
      if (!overwrite) {
        console.info(yellow(`⚠️ Skipping ${newFile}`));
        index += 1;

        spinner.start();

        continue;
      }
      spinner.start();
    }

    const inputPath = path.resolve(inputDir, filePath);

    try {
      await converter(inputPath, outputPath);

      converted.push(outputPath);
      const now = converted.length;

      spinner.text = `Converting ${format} files to ${newFormat}... (${now}/${total}) ${file}`;

      index += 1;
    } catch (error) {
      errors.push(error);

      const errorMessage = error instanceof Error ? error.message : error;
      console.error(red(`\n🚨 Error converting ${filesToConvert[index]}`));
      console.error(red(errorMessage));
      console.info("ℹ️ Continuing with the rest of the models...");
    }
  }

  spinner.stopAndPersist({ symbol: "🌻" });
  console.info(green(`✨ ${format} conversion completed`));

  return { converted, errors };
}

export async function collectFiles(
  files: string[],
  { modelType }: { modelType: InputFormats }
) {
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
  const fbmFoldersBefore = pathsBefore.filter(
    (file) => file.endsWith(".fbm") && isDirectory(path.resolve(inputDir, file))
  );

  const cleanup = async () => {
    const paths = await readdir(inputDir);
    const newFbmFolders = paths.filter(
      (file) =>
        file.endsWith(".fbm") &&
        isDirectory(path.resolve(inputDir, file)) &&
        !fbmFoldersBefore.includes(file)
    );

    for (const folder of newFbmFolders) {
      const folderPath = path.resolve(inputDir, folder);
      await rm(folderPath, { recursive: true, force: true });
    }
  };

  try {
    await convertFbxToGlb(inputPath, outputPath, [
      "--binary",
      "--pbr-metallic-roughness",
    ]);
  } catch (error) {
    await cleanup();
    throw error;
  } finally {
    await cleanup();
  }
}

export async function convertSingleGltf(inputPath: string, outputPath: string) {
  const gltf = JSON.parse(await readFile(inputPath, "utf8"));
  const options = { resourceDirectory: "./input/" };
  const results = await gltfToGlb(gltf, options);
  await writeFile(outputPath, results.glb);
}

export async function prepareGlbForWeb(inputPath: string, outputPath: string) {
  const cleanup = async () => {
    if (!globalOptions.optimize) return;

    const outputDir = path.dirname(outputPath);

    const outputDirImprovedGLB = path.resolve(outputDir, "..", "glb-for-web");
    const improvedGlbFilePath = outputPath.replace(".tsx", "-transformed.glb");

    const newImprovedGlbFilePath = path.resolve(
      outputDirImprovedGLB,
      path.basename(improvedGlbFilePath)
    );
    await rename(improvedGlbFilePath, newImprovedGlbFilePath);
  };

  try {
    await gltfjsx(inputPath, outputPath, {
      transform: globalOptions.optimize,
      debug: false,
      types: true,
    });
  } catch (error) {
    await cleanup();
    throw error;
  } finally {
    await cleanup();
  }
}

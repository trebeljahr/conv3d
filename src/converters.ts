import { green, red, yellow } from "chalk";
import { exec as execSync } from "child_process";
import { readdir, rename, rm } from "fs/promises";
import ora from "ora";
import path from "path";
import { promisify } from "util";
import { handleSigint, isDirectory } from "./utils";

const exec = promisify(execSync);

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
    `ℹ️ Found ${filesToConvert.length} ${format} models to convert from input dir: ${inputDir}`
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
    const outputPath = path.resolve(
      outputDir,
      newExtension,
      file.replace(oldExtension, "." + newExtension)
    );

    const inputPath = path.resolve(inputDir, filePath);

    try {
      await converter(inputPath, outputPath);
    } catch (error) {
      handleSigint(error, spinner);

      errors.push(error);
      spinner.fail(`${format} conversion failed`);
      console.error(red(`🚨 Error converting ${filesToConvert[index]}`));
      console.info("ℹ️ Continuing with the rest of the models...");
    }

    converted.push(outputPath);
    const now = converted.length;
    spinner.text = `Converting ${format} files to ${newFormat}... (${now}/${total}) ${file}`;

    index += 1;
  }

  spinner.stop();
  console.info(green(`✓ ${format} conversion completed`));

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
  await exec(`obj2gltf -b -i "${inputPath}" -o "${outputPath}"`);
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
    await exec(
      `FBX2glTF-darwin-x64 -b -i "${inputPath}" -o "${outputPath}" --khr-materials-unlit`
    );
  } catch (error) {
    await cleanup();
    throw error;
  } finally {
    await cleanup();
  }
}

export async function convertSingleGltf(inputPath: string, outputPath: string) {
  await exec(`gltf-pipeline -b -i "${inputPath}" -o "${outputPath}"`);
}

export async function prepareGlbForWeb(inputPath: string, outputPath: string) {
  const cleanup = async () => {
    const inputDir = path.dirname(inputPath);
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
    await exec(`gltfjsx "${inputPath}" -o "${outputPath}" --types --transform`);
  } catch (error) {
    await cleanup();
    throw error;
  } finally {
    await cleanup();
  }
}

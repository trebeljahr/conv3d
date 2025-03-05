import { green, red } from "chalk";
import { exec as execSync } from "child_process";
import ora from "ora";
import path from "path";
import { promisify } from "util";

const exec = promisify(execSync);

export type InputFormats = keyof typeof converters;

export const converters = {
  GLTF: convertSingleGltf,
  FBX: convertSingleFbx,
  OBJ: convertSingleObj,
};

export async function convertModels(
  modelType: InputFormats,
  modelFiles: string[],
  options: Record<string, any>
) {
  if (modelFiles.length === 0) {
    return;
  }

  console.info(
    `ℹ️ Found ${modelFiles.length} ${modelType} models to convert from input dir: }`
  );

  const spinner = ora(`Converting ${modelType} files to "GLB"...`).start();

  try {
    for (const file of modelFiles) {
      await supplyPathsTo(converters[modelType], file, options);
      spinner.text = `Converting ${modelType} files to "GLB"... (${
        modelFiles.indexOf(file) + 1
      }/${modelFiles.length})`;
    }

    spinner.stop();
    options.convertedNum += modelFiles.length;
    console.info(green(`✓ ${modelType} conversion completed`));
  } catch (error) {
    spinner.fail(`${modelType} conversion failed`);
    console.error(red(`🚨 Error converting ${modelType}...`));
    throw error;
  }
}

async function supplyPathsTo(
  convertFn: (i: string, o: string) => Promise<void>,
  filePath: string,
  options: Record<string, any>
) {
  const newExtension = "glb";
  const oldExtension = path.extname(filePath);
  const file = path.basename(filePath);
  const outputPath = path.resolve(
    options.outputDir,
    newExtension,
    file.replace(oldExtension, "." + newExtension)
  );
  const inputPath = path.resolve(options.inputDir, filePath);

  await convertFn(inputPath, outputPath);
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
  await exec(
    `FBX2glTF-darwin-x64 -b -i "${inputPath}" -o "${outputPath}" --pbr-metallic-roughness`
  );
}

export async function convertSingleGltf(inputPath: string, outputPath: string) {
  await exec(`gltf-pipeline -b -i "${inputPath}" -o "${outputPath}"`);
}

export async function convertSingleGlb(inputPath: string, outputPath: string) {
  await exec(`gltfjsx "${inputPath}" -o "${outputPath}" --types --transform`);
}

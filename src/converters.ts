import { green, red, yellow } from "chalk";
import { exec as execSync } from "child_process";
import { readdir } from "fs/promises";
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
  format: InputFormats,
  modelFiles: string[],
  options: Record<string, any>
) {
  if (modelFiles.length === 0) {
    console.info(yellow(`⚠️ No ${format} models found in the input directory`));
    return { numConverted: 0, errors: [] };
  }

  console.info(
    `ℹ️ Found ${modelFiles.length} ${format} models to convert from input dir: }`
  );

  const spinner = ora(`Converting ${format} files to "GLB"...`).start();

  let index = 0;
  const errors = [];
  try {
    for (const file of modelFiles) {
      await supplyPathsTo(converters[format], file, options);

      spinner.text = `Converting ${format} files to "GLB"... (${++index}/${
        modelFiles.length
      })`;
    }

    spinner.stop();
    console.info(green(`✓ ${format} conversion completed`));
  } catch (error) {
    errors.push(error);
    spinner.fail(`${format} conversion failed`);
    console.error(red(`🚨 Error converting ${modelFiles[index]} of ${format}`));
    console.info("ℹ️ Continuing with the rest of the models...");
  }

  return { numConverted: index, errors };
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

export async function generateTSX(
  providedGlbPath: string,
  providedTsxPath: string
) {
  const spinner = ora("Generating TSX components...").start();
  try {
    const glbPath = providedGlbPath;
    const tsxPath = providedTsxPath;

    const files = await readdir(glbPath);
    const glbFiles = files.filter((file) => file.endsWith(".glb"));

    for (const file of glbFiles) {
      const outputPath = path.resolve(tsxPath, file.replace(".glb", ".tsx"));
      const inputPath = path.resolve(glbPath, file);
      await convertSingleGlb(inputPath, outputPath);
    }

    spinner.stop();
    console.info(green("✓ TSX components generated"));
  } catch (error) {
    spinner.fail("Failed to generate TSX components");
    console.error(red("🚨 Error generating TSX:"), error);
    throw error;
  }
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

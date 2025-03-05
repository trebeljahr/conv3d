import { cyan, green, red, yellow } from "chalk";
import { exec as execSync } from "child_process";
import { Command } from "commander";
import { textSync } from "figlet";
import { lstatSync } from "fs";
import { mkdir, readdir, rename, rm } from "fs/promises";
import { prompt } from "inquirer";
import ora from "ora";
import { homedir } from "os";
import path from "path";
import { exit } from "process";
import { promisify } from "util";

const exec = promisify(execSync);
const home = homedir();

console.info(cyan(textSync("Convert 3D", { horizontalLayout: "full" })));

const program = new Command();

program
  .version("1.0.0")
  .description(
    "An interactive CLI tool for converting 3D models to glTF/GLB and generating React components"
  );

let options = program.opts();

type InputFormats = keyof typeof converters;

const converters = {
  GLTF: convertSingleGltf,
  FBX: convertSingleFbx,
  OBJ: convertSingleObj,
};

const inputDir = () => `${options.inputDir.replace(home, "~")}`;
const outputDir = () => `${options.outputDir.replace(home, "~")}`;

export const isDirectory = (strPath: string) =>
  lstatSync(strPath) ? lstatSync(strPath).isDirectory() : false;

program
  .option("--tsx", "Create .tsx files")
  .option("--no-tsx", "Don't create .tsx files")
  .option("--no-optimize", "Don't create optimized output GLB files")
  .option(
    "--rootPath <path>",
    "Change the location of your models in your /public folder for web"
  );

program
  .command("convert-single")
  .option("-i, --inputPath <path>", "Add the input path to the model")
  .description("Convert a single 3D model from directory")
  .action(async (subOptions) => {
    try {
      console.info("🚀 Starting conversion process...");

      if (!subOptions.inputPath) {
        console.error(red("🚨 Please specify an input path"));
        exit(1);
      }

      subOptions.inputPath = path.resolve(subOptions.inputPath);

      if (isDirectory(subOptions.inputPath)) {
        console.error(red("🚨 Input path should point to a file."));
        exit(1);
      }

      subOptions.tsx =
        options.tsx === undefined ? await promptForTsxOutput() : options.tsx;

      const extension = path.extname(subOptions.inputPath);
      const inferredModelType = extension.toUpperCase().replace(".", "");

      if (!Object.keys(converters).includes(inferredModelType)) {
        console.error(red("🚨 Invalid input file type: ", inferredModelType));
        console.error("ℹ️ Please provide a .fbx, .obj, or .gltf file");
        exit(1);
      }

      subOptions.modelType = inferredModelType;

      const inputDir = path.resolve(path.dirname(subOptions.inputPath));
      const outputDir = path.resolve(inputDir, "out");

      subOptions.inputDir = inputDir;
      subOptions.outputDir = outputDir;

      options = { ...options, ...subOptions };

      await setupOutputDirs();
      const outputPath = path.resolve(
        options.outputDir,
        "glb",
        path.basename(subOptions.inputPath).replace(extension, ".glb")
      );

      const cleanup = await setupCleanup();
      if (inferredModelType === "GLTF") {
        await convertSingleGltf(subOptions.inputPath, outputPath);
      }

      if (inferredModelType === "FBX") {
        await convertSingleFbx(subOptions.inputPath, outputPath);
      }
      if (inferredModelType === "OBJ") {
        await convertSingleObj(subOptions.inputPath, outputPath);
      }

      if (subOptions.tsx) await generateTSX();
      else console.info("ℹ️ Didn't add .tsx file");

      await cleanup();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : error;
      console.error(red("🚨 Conversion process failed!"));
      console.error(red("🚨 " + errorMsg));
      exit(1);
    }
  });

program
  .command("convert-bulk")
  .option("-i, --inputDir <path>", "Add the input directory")
  .option("-o, --outputDir <path>", "Specify the output directory")
  .option(
    "-m, --modelType <string>",
    "Specify the type of model you want to convert, options: -m GLTF, -m FBX, -m OBJ, -m ALL"
  )
  .option(
    "-r, --recursive",
    "Find models in directory and subdirectories recursively"
  )
  .description("Convert all 3D models from a directory")
  .action(async (subOptions) => {
    try {
      console.info("🚀 Starting conversion process...");

      if (!subOptions.inputDir) {
        console.error(red("🚨 Please specify an input directory"));
        exit(1);
      }

      subOptions.inputDir = path.resolve(subOptions.inputDir);

      if (!isDirectory(subOptions.inputDir)) {
        console.error(red("🚨 Invalid input directory: ", subOptions.inputDir));
        exit(1);
      }

      subOptions.outputDir =
        subOptions.outputDir || path.resolve(subOptions.inputDir, "out");

      options = { ...options, ...subOptions };

      const files = await readdir(options.inputDir, {
        recursive: options.recursive,
      });

      const filesGLTF = await collectFiles(files, { modelType: "GLTF" });
      const filesFBX = await collectFiles(files, { modelType: "FBX" });
      const filesOBJ = await collectFiles(files, { modelType: "OBJ" });

      const numGLTF = filesGLTF.length;
      const numFBX = filesFBX.length;
      const numOBJ = filesOBJ.length;

      const numAll = numGLTF + numFBX + numOBJ;

      subOptions.modelType =
        subOptions.modelType?.toUpperCase().replace(".", "") ||
        (await promptForModelType({ numGLTF, numFBX, numOBJ, numAll }));

      subOptions.tsx =
        subOptions.tsx === undefined
          ? await promptForTsxOutput()
          : subOptions.tsx;

      options = { ...options, ...subOptions };

      if (
        !Object.keys(converters).includes(subOptions.modelType) &&
        subOptions.modelType !== "ALL"
      ) {
        console.error(red("🚨 Invalid model type: ", subOptions.modelType));
        exit(1);
      }

      // const all = [...filesGLTF, ...filesFBX, ...filesOBJ];
      // const getFolders = (files: string[]) =>
      //   files.map((file) => path.dirname(file));
      // const uniqueFolders = [...new Set(getFolders(all))];
      // console.debug(uniqueFolders);

      await setupOutputDirs();

      const cleanup = await setupCleanup();

      const shouldConvertGLTF =
        options.modelType === "GLTF" || options.modelType === "ALL";
      const shouldConvertFBX =
        options.modelType === "FBX" || options.modelType === "ALL";
      const shouldConvertOBJ =
        options.modelType === "OBJ" || options.modelType === "ALL";

      options.convertedNum = 0;

      if (shouldConvertGLTF) await convertModels("GLTF", filesGLTF);
      if (shouldConvertFBX) await convertModels("FBX", filesFBX);
      if (shouldConvertOBJ) await convertModels("OBJ", filesOBJ);

      if (subOptions.tsx) await generateTSX();
      else console.info("ℹ️ Didn't add .tsx files");

      await cleanup();

      console.info(
        green(
          `✓ Successfully converted ${
            options.convertedNum
          } models from "${inputDir()}"`
        )
      );
      console.info(`ℹ️ Output saved to "${outputDir()}"`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : error;
      console.error(red("🚨 Conversion process failed!"));
      console.error(red("🚨 " + errorMsg));
      exit(1);
    }
  });

async function promptForModelType({
  numGLTF,
  numFBX,
  numOBJ,
  numAll,
}: {
  numGLTF: number;
  numFBX: number;
  numOBJ: number;
  numAll: number;
}) {
  if (numAll === 0) {
    console.error(yellow(`⚠️ No suitable models found in the input directory`));
    return;
  }

  const { modelType } = await prompt([
    {
      type: "list",
      name: "modelType",
      message: "Select the type of 3D models to convert:",
      choices: [
        { name: `GLTF (${numGLTF} available)`, value: "GLTF" },
        { name: `FBX (${numFBX} available)`, value: "FBX" },
        { name: `OBJ (${numOBJ} available)`, value: "OBJ" },
        { name: `ALL (${numAll} available)`, value: "ALL" },
      ].filter(({ name }) => !name.includes("(0 ")),
    },
  ]);
  return modelType;
}

async function promptForTsxOutput() {
  const { tsx } = await prompt([
    {
      type: "confirm",
      name: "tsx",
      message: "Generate .tsx files?",
    },
  ]);
  return tsx;
}

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}

async function setupOutputDirs() {
  try {
    const tsxPath = path.resolve(options.outputDir, "tsx");
    const glbPath = path.resolve(options.outputDir, "glb");
    const optPath = path.resolve(options.outputDir, "glb-for-web");

    console.info("ℹ️ Will write results to:");
    console.info(`ℹ️ For .glb files: ${glbPath.replace(home, "~")}`);

    if (options.tsx) {
      console.info(`ℹ️ For .tsx files: ${tsxPath.replace(home, "~")}`);
      console.info(
        `ℹ️ For optimized .glb files: ${optPath.replace(home, "~")}`
      );
    }

    const { confirmed } = await prompt([
      {
        type: "confirm",
        name: "confirmed",
        message: "Looking good?",
      },
    ]);

    if (!confirmed) {
      exit(0);
    }

    await mkdir(options.outputDir, { recursive: true });
    await mkdir(glbPath, { recursive: true });

    if (options.tsx) {
      await mkdir(tsxPath, { recursive: true });
      await mkdir(optPath, { recursive: true });
    }

    console.info(green("✓ Output directories created"));
  } catch (error) {
    console.error(red("🚨 Error creating directories:"), error);
    throw error;
  }
}

async function generateTSX() {
  const spinner = ora("Generating TSX components...").start();
  try {
    const glbPath = path.resolve(options.outputDir, "glb");
    const tsxPath = path.resolve(options.outputDir, "tsx");

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

async function collectFiles(
  files: string[],
  { modelType }: { modelType: InputFormats }
) {
  const inputEnding = "." + modelType.toLowerCase();
  const modelFiles = files.filter((file) => file.endsWith(inputEnding));
  return modelFiles;
}

async function convertModels(modelType: InputFormats, modelFiles: string[]) {
  if (modelFiles.length === 0) {
    return;
  }

  console.info(
    `ℹ️ Found ${modelFiles.length} ${modelType} models to convert from input dir: }`
  );

  const spinner = ora(`Converting ${modelType} files to "GLB"...`).start();

  try {
    for (const file of modelFiles) {
      await supplyPathsTo(converters[modelType], file);
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

async function setupCleanup() {
  const pathsBefore = await readdir(options.inputDir);
  const fbmFoldersBefore = pathsBefore.filter(
    (file) =>
      file.endsWith(".fbm") && isDirectory(path.resolve(options.inputDir, file))
  );
  return async () => {
    const paths = await readdir(options.inputDir);
    const fbmFolders = paths.filter(
      (file) =>
        file.endsWith(".fbm") &&
        isDirectory(path.resolve(options.inputDir, file)) &&
        !fbmFoldersBefore.includes(file)
    );
    for (const folder of fbmFolders) {
      const folderPath = path.resolve(options.inputDir, folder);
      await rm(folderPath, { recursive: true, force: true });
    }

    const tsxPath = path.resolve(options.outputDir, "tsx");
    const improvedGlbPath = path.resolve(options.outputDir, "glb-for-web");

    const results = await readdir(tsxPath);
    const improvedGlbFiles = results.filter((result) =>
      result.endsWith(".glb")
    );

    for (const result of improvedGlbFiles) {
      const oldPath = path.resolve(tsxPath, result);
      const newPath = path.resolve(improvedGlbPath, result);
      await rename(oldPath, newPath);
    }
  };
}

async function supplyPathsTo(
  convertFn: (i: string, o: string) => Promise<void>,
  filePath: string
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

async function convertSingleObj(inputPath: string, outputPath: string) {
  await exec(`obj2gltf -b -i "${inputPath}" -o "${outputPath}"`);
}

async function convertSingleFbx(inputPath: string, outputPath: string) {
  await exec(
    `FBX2glTF-darwin-x64 -b -i "${inputPath}" -o "${outputPath}" --pbr-metallic-roughness`
  );
}

async function convertSingleGltf(inputPath: string, outputPath: string) {
  await exec(`gltf-pipeline -b -i "${inputPath}" -o "${outputPath}"`);
}

async function convertSingleGlb(inputPath: string, outputPath: string) {
  await exec(`gltfjsx "${inputPath}" -o "${outputPath}" --types --transform`);
}

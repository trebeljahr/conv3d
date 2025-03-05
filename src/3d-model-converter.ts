import { cyan, green, red } from "chalk";
import { Command, program } from "commander";
import { textSync } from "figlet";
import { lstatSync } from "fs";
import { readdir, rename, rm } from "fs/promises";
import ora from "ora";
import { homedir } from "os";
import path from "path";
import { exit } from "process";
import {
  collectFiles,
  converters,
  convertModels,
  convertSingleFbx,
  convertSingleGlb,
  convertSingleGltf,
  convertSingleObj,
  InputFormats,
} from "./converters";
import { promptForModelType, promptForTsxOutput } from "./prompts";
import { home, isDirectory, setupCleanup, setupOutputDirs } from "./utils";
import { globalOptions } from "./program";

console.info(
  cyan(textSync("Convert 3D for WEB", { horizontalLayout: "full" }))
);

const inputDir = () => `${globalOptions.inputDir.replace(home, "~")}`;
const outputDir = () => `${globalOptions.outputDir.replace(home, "~")}`;

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
        globalOptions.tsx === undefined
          ? await promptForTsxOutput()
          : globalOptions.tsx;

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

      const options = { ...globalOptions, ...subOptions };

      await setupOutputDirs(options);
      const outputPath = path.resolve(
        globalOptions.outputDir,
        "glb",
        path.basename(subOptions.inputPath).replace(extension, ".glb")
      );

      const cleanup = await setupCleanup(options);
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

      const files = await readdir(globalOptions.inputDir, {
        recursive: globalOptions.recursive,
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

      const options = { ...globalOptions, ...subOptions };
      options.convertedNum = 0;

      await setupOutputDirs(options);

      const cleanup = await setupCleanup(options);

      const shouldConvertGLTF =
        options.modelType === "GLTF" || options.modelType === "ALL";
      const shouldConvertFBX =
        options.modelType === "FBX" || options.modelType === "ALL";
      const shouldConvertOBJ =
        options.modelType === "OBJ" || options.modelType === "ALL";

      if (shouldConvertGLTF) await convertModels("GLTF", filesGLTF, options);
      if (shouldConvertFBX) await convertModels("FBX", filesFBX, options);
      if (shouldConvertOBJ) await convertModels("OBJ", filesOBJ, options);

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

program
  .command("tsx-gen")
  .option(
    "-i, --inputDir <path>",
    "Add the input directory for the files that need to be converted"
  )
  .option(
    "-r, --recursive",
    "Find models in directory and subdirectories recursively"
  )
  .action(async (subOptions) => {
    try {
      console.info("🚀 Starting TSX generation process...");

      if (!subOptions.inputDir) {
        console.error(red("🚨 Please specify an input directory"));
        exit(1);
      }

      subOptions.inputDir = path.resolve(subOptions.inputDir);

      if (!isDirectory(subOptions.inputDir)) {
        console.error(red("🚨 Invalid input directory: ", subOptions.inputDir));
        exit(1);
      }

      const files = await readdir(subOptions.inputDir, {
        recursive: subOptions.recursive,
      });
      const glbFiles = files.filter((file) => file.endsWith(".glb"));
      if (glbFiles.length === 0) {
        console.error(red(`🚨 No .glb models found in the input directory`));
        exit(1);
      }

      subOptions.outputDir = path.resolve(subOptions.inputDir, "out");

      const options = { ...globalOptions, ...subOptions };

      await setupOutputDirs(options);
      const cleanup = await setupCleanup(options);
      await generateTSX(subOptions.inputDir, subOptions.outputDir);
      await cleanup();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : error;
      console.error(red("🚨 TSX generation failed!"));
      console.error(red("🚨 " + errorMsg));
    }
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}

async function generateTSX(providedGlbPath?: string, providedTsxPath?: string) {
  const spinner = ora("Generating TSX components...").start();
  try {
    const glbPath =
      providedGlbPath || path.resolve(globalOptions.outputDir, "glb");
    const tsxPath =
      providedTsxPath || path.resolve(globalOptions.outputDir, "tsx");

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

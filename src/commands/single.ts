import { red } from "chalk";
import path from "path";
import { exit } from "process";
import {
  converters,
  convertModels,
  convertSingleFbx,
  convertSingleGltf,
  convertSingleObj,
} from "../converters";
import { globalOptions, program } from "../program";
import { promptForTsxOutput } from "../prompts";
import { isDirectory, outDirPrefix, setupOutputDirs } from "../utils";

type SubOptionsConvertSingle = {
  inputPath: string;
  modelType: string;
  inputDir: string;
  outputDir: string;
};

program
  .command("single")
  .option("-i, --inputPath <path>", "Add the input path to the model")
  .description("Convert a single 3D model from directory")
  .action(async (subOptions: SubOptionsConvertSingle) => {
    try {
      if (!subOptions.inputPath) {
        console.error(red("🚨 Please specify an input path"));
        exit(1);
      }

      subOptions.inputPath = path.resolve(subOptions.inputPath);

      if (isDirectory(subOptions.inputPath)) {
        console.error(red("🚨 Input path should point to a file."));
        exit(1);
      }

      console.info("🚀 Starting conversion process...");

      globalOptions.tsx =
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
      const outputDir = path.resolve(inputDir, outDirPrefix);

      subOptions.inputDir = inputDir;
      subOptions.outputDir = outputDir;

      const options = { ...globalOptions, ...subOptions };

      const numFilesToWrite = 1;
      await setupOutputDirs(options, numFilesToWrite);
      const outputPath = path.resolve(
        options.outputDir,
        "glb",
        path.basename(options.inputPath).replace(extension, ".glb")
      );

      console.info("ℹ️ Generating .glb files...");
      if (inferredModelType === "GLTF") {
        await convertSingleGltf(options.inputPath, outputPath);
      }
      if (inferredModelType === "FBX") {
        await convertSingleFbx(options.inputPath, outputPath);
      }
      if (inferredModelType === "OBJ") {
        await convertSingleObj(options.inputPath, outputPath);
      }

      if (options.tsx) {
        console.log("ℹ️ Generating .tsx files...");
        await convertModels("GLB", [outputPath], inputDir, outputDir);
      } else console.info("ℹ️ Skipped adding .tsx files, like instructed 🫡");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : error;
      console.error(red("🚨 Conversion process failed!"));
      console.error(red("🚨 " + errorMsg));
      exit(1);
    }
  });

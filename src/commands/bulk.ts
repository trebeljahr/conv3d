import chalk from "chalk";
import { readdir } from "fs/promises";
import path from "path";
import { exit } from "process";
import {
  collectFiles,
  converters,
  convertModels,
  InputFormats,
} from "../converters.js";
import { GlobalOptions, globalOptions, program } from "../program.js";
import { promptForModelType, promptForTsxOutput } from "../prompts.js";
import { home, isDirectory, outDirPrefix, setupOutputDirs } from "../utils.js";

const { green, red } = chalk;

type SubOptionsBulkCommand = {
  inputDir: string;
  outputDir: string;
  modelType: string;
  recursive: boolean | undefined;
};

type OptionsBulkCommand = SubOptionsBulkCommand & GlobalOptions;

program
  .command("bulk")
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
  .action(async (subOptions: SubOptionsBulkCommand) => {
    try {
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
        subOptions.outputDir || path.resolve(subOptions.inputDir, outDirPrefix);

      const files = await readdir(subOptions.inputDir, {
        recursive: subOptions.recursive,
      });

      const formatMaps = {
        GLTF: { files: await collectFiles(files, { modelType: "GLTF" }) },
        FBX: { files: await collectFiles(files, { modelType: "FBX" }) },
        OBJ: { files: await collectFiles(files, { modelType: "OBJ" }) },
      };
      const formats = Object.entries(formatMaps);

      const numGLTF = formatMaps["GLTF"].files.length;
      const numFBX = formatMaps["FBX"].files.length;
      const numOBJ = formatMaps["OBJ"].files.length;

      const numAll = numGLTF + numFBX + numOBJ;

      console.info("🚀 Starting conversion process...");

      subOptions.modelType =
        subOptions.modelType?.toUpperCase().replace(".", "") ||
        (await promptForModelType({ numGLTF, numFBX, numOBJ, numAll }));

      globalOptions.tsx =
        globalOptions.tsx === undefined
          ? await promptForTsxOutput()
          : globalOptions.tsx;

      if (
        !Object.keys(converters).includes(subOptions.modelType) &&
        subOptions.modelType !== "ALL"
      ) {
        console.error(red("🚨 Invalid model type: ", subOptions.modelType));
        exit(1);
      }

      const options: OptionsBulkCommand = { ...globalOptions, ...subOptions };

      const shouldConvert = (modelType: string) =>
        options.modelType === modelType || options.modelType === "ALL";

      const numExpected = formats.reduce(
        (n, [key, { files }]) => (shouldConvert(key) ? n + files.length : n),
        0
      );

      await setupOutputDirs(options, numExpected);

      const allConverted = [];
      console.info("ℹ️ Generating .glb files...");
      for (const [key, { files }] of formats) {
        if (shouldConvert(key)) {
          const { converted } = await convertModels(
            key as InputFormats,
            files,
            options.inputDir,
            options.outputDir
          );
          allConverted.push(...converted);
        }
      }

      if (options.tsx) {
        console.info("ℹ️ Generating .tsx files...");
        await convertModels(
          "GLB",
          allConverted,
          options.inputDir,
          options.outputDir
        );
      } else console.info("ℹ️ Skipped adding .tsx files, like instructed 🫡");

      const inputDir = `${options.inputDir.replace(home, "~")}`;
      const outputDir = `${options.outputDir.replace(home, "~")}`;

      const numTotal = allConverted.length;
      console.info(
        green(
          `✅ Successfully converted ${numTotal}/${numExpected} models from "${inputDir}"`
        )
      );
      console.info(`ℹ️ Output saved to "${outputDir}"`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : error;
      console.error(red("🚨 Conversion process failed!"));
      console.error(red("🚨 " + errorMsg));
      exit(1);
    }
  });

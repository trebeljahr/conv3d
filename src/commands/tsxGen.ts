import chalk from "chalk";
import { readdir } from "fs/promises";
import path from "path";
import { exit } from "process";
import { convertModels } from "../converters.js";
import { globalOptions, program } from "../program.js";
import { isDirectory, outDirPrefix, setupOutputDirs } from "../utils.js";

const { red } = chalk;

type SubOptionsTsxGenCommand = {
  inputDir: string;
  outputDir: string;
  recursive: boolean | undefined;
  onlyTsx: boolean;
};

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
  .description("Generate .tsx files for 3D models and optimize .glb for web")
  .action(async (subOptions: SubOptionsTsxGenCommand) => {
    try {
      console.info("🚀 Starting TSX generation process...");

      if (!subOptions.inputDir) {
        console.error(
          red(
            `🚨 Please specify an input directory with -i "yourInputDirectory"`
          )
        );
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
      const glbFiles = files.filter(
        (file) => file.endsWith(".glb") && !file.includes(outDirPrefix)
      );

      if (glbFiles.length === 0) {
        console.error(red(`🚨 No .glb models found in the input directory`));
        exit(1);
      }

      subOptions.outputDir = path.resolve(subOptions.inputDir, outDirPrefix);
      subOptions.onlyTsx = true;

      const options = { ...globalOptions, ...subOptions, tsx: true };

      await setupOutputDirs(options, glbFiles.length);

      await convertModels(
        "GLB",
        glbFiles,
        subOptions.inputDir,
        subOptions.outputDir
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : error;
      console.error(red("🚨 TSX generation failed!"));
      console.error(red("🚨 " + errorMsg));
    }
  });

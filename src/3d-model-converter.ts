import { cyan, green, red } from "chalk";
import { textSync } from "figlet";
import { readdir } from "fs/promises";
import path from "path";
import { exit } from "process";
import {
  collectFiles,
  converters,
  convertModels,
  convertSingleFbx,
  convertSingleGltf,
  convertSingleObj,
  InputFormats,
} from "./converters";
import { GlobalOptions, globalOptions, program } from "./program";
import { promptForModelType, promptForTsxOutput } from "./prompts";
import {
  handleSigint,
  home,
  isDirectory,
  moveImprovedGlbFiles,
  setupOutputDirs,
} from "./utils";

console.info(
  cyan(textSync("Convert 3D for WEB", { horizontalLayout: "full" }))
);

type SubOptionsConvertSingle = {
  inputPath: string;
  modelType: string;
  inputDir: string;
  outputDir: string;
};

program
  .command("convert-single")
  .option("-i, --inputPath <path>", "Add the input path to the model")
  .description("Convert a single 3D model from directory")
  .action(async (subOptions: SubOptionsConvertSingle) => {
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
      const outputDir = path.resolve(inputDir, "_out");

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

      if (inferredModelType === "GLTF") {
        await convertSingleGltf(options.inputPath, outputPath);
      }
      if (inferredModelType === "FBX") {
        await convertSingleFbx(options.inputPath, outputPath);
      }
      if (inferredModelType === "OBJ") {
        await convertSingleObj(options.inputPath, outputPath);
      }

      if (options.tsx)
        await convertModels("GLB", [outputPath], inputDir, outputDir);
      else console.info("ℹ️ Didn't add .tsx file");

      await moveImprovedGlbFiles(options);
    } catch (error) {
      handleSigint(error);

      const errorMsg = error instanceof Error ? error.message : error;
      console.error(red("🚨 Conversion process failed!"));
      console.error(red("🚨 " + errorMsg));
      exit(1);
    }
  });

type SubOptionsBulkCommand = {
  inputDir: string;
  outputDir: string;
  modelType: string | undefined;
  recursive: boolean | undefined;
};

type OptionsBulkCommand = SubOptionsBulkCommand & GlobalOptions;

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
  .action(async (subOptions: SubOptionsBulkCommand) => {
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
        subOptions.outputDir || path.resolve(subOptions.inputDir, "_out");

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

      // const all = [...filesGLTF, ...filesFBX, ...filesOBJ];
      // const getFolders = (files: string[]) =>
      //   files.map((file) => path.dirname(file));
      // const uniqueFolders = [...new Set(getFolders(all))];
      // console.debug(uniqueFolders);

      const options: OptionsBulkCommand = { ...globalOptions, ...subOptions };

      const shouldConvert = (modelType: string) =>
        options.modelType === modelType || options.modelType === "ALL";

      const numExpected = formats.reduce(
        (n, [key, { files }]) => (shouldConvert(key) ? n + files.length : n),
        0
      );

      await setupOutputDirs(options, numExpected);

      const allConverted = [];
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

      if (options.tsx)
        await convertModels(
          "GLB",
          allConverted,
          options.inputDir,
          options.outputDir
        );
      else console.info("ℹ️ Didn't add .tsx files");

      await moveImprovedGlbFiles(options);

      const inputDir = `${options.inputDir.replace(home, "~")}`;
      const outputDir = `${options.outputDir.replace(home, "~")}`;

      const numTotal = allConverted.length;
      console.info(
        green(
          `✓ Successfully converted ${numTotal}/${numExpected} models from "${inputDir}"`
        )
      );
      console.info(`ℹ️ Output saved to "${outputDir}"`);
    } catch (error) {
      handleSigint(error);

      const errorMsg = error instanceof Error ? error.message : error;
      console.error(red("🚨 Conversion process failed!"));
      console.error(red("🚨 " + errorMsg));
      exit(1);
    }
  });

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
      const glbFiles = files.filter((file) => file.endsWith(".glb"));

      if (glbFiles.length === 0) {
        console.error(red(`🚨 No .glb models found in the input directory`));
        exit(1);
      }

      subOptions.outputDir = path.resolve(subOptions.inputDir, "_out");
      subOptions.onlyTsx = true;

      const options = { ...globalOptions, ...subOptions, tsx: true };

      await setupOutputDirs(options, glbFiles.length);

      await convertModels(
        "GLB",
        glbFiles,
        subOptions.inputDir,
        subOptions.outputDir
      );
      await moveImprovedGlbFiles(options);
    } catch (error) {
      handleSigint(error);

      const errorMsg = error instanceof Error ? error.message : error;
      console.error(red("🚨 TSX generation failed!"));
      console.error(red("🚨 " + errorMsg));
    }
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}

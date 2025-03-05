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

console.log(cyan(textSync("Convert 3D", { horizontalLayout: "full" })));

const program = new Command();

program
  .version("1.0.0")
  .description(
    "An interactive CLI tool for converting 3D models to glTF/GLB and generating React components"
  );

const options = program.opts();

export const isDirectory = (strPath: string) =>
  lstatSync(strPath) ? lstatSync(strPath).isDirectory() : false;

program
  .command("convert")
  .description("Convert a single 3D model from directory")
  .action(async () => {});

program
  .command("convert-bulk")
  .option("-i, --inputDir DIR", "Add the input directory")
  .option(
    "-r, --recursive",
    "Find models in directory and subdirectories recursively"
  )
  .option("-o, --outputDir DIR", "Specify the output directory")
  .option(
    "-m, --modelType <string>",
    "Specify the type of model you want to convert"
  )
  .option("--tsx", "Create .tsx files")
  .option("--no-tsx", "Don't create .tsx files")
  // .option("--no-optimize", "Don't create optimized output GLB files")
  .description("Convert all 3D models from a directory")
  .action(async () => {
    try {
      options.inputDir = path.resolve(
        options.inputDir || (await promptForInputFolder())
      );
      options.outputDir =
        options.outputDir ||
        path.resolve(options.inputDir, "out") ||
        (await promptForOutputFolder());

      const filesGLTF = await collectFiles({ modelType: "GLTF" });
      const filesFBX = await collectFiles({ modelType: "FBX" });
      const filesOBJ = await collectFiles({ modelType: "OBJ" });

      const numGLTF = filesGLTF.length;
      const numFBX = filesFBX.length;
      const numOBJ = filesOBJ.length;

      const numAll = numGLTF + numFBX + numOBJ;

      options.modelType =
        options.modelType?.toUpperCase().replace(".", "") ||
        (await promptForModelType({ numGLTF, numFBX, numOBJ, numAll }));
      console.log({ tsx: options.tsx });
      options.tsx =
        options.tsx === undefined ? await promptForTsxOutput() : options.tsx;

      if (!Object.keys(converters).includes(options.modelType)) {
        console.error(red("🚨 Invalid model type: ", options.modelType));
        exit(1);
      }

      await setupOutputDirs();

      const cleanup = await setupCleanup();

      if (options.modelType === "ALL") {
        await convertModels({ modelType: "GLTF" });
        await convertModels({ modelType: "FBX" });
        await convertModels({ modelType: "OBJ" });
      } else {
        await convertModels({ modelType: options.modelType });
      }

      await cleanup();

      if (options.tsx) await generateTSX();
      else console.log("ℹ️ Didn't add .tsx files");

      console.log(
        green(`✓  Successfully converted ${numAll} models from "${inputDir()}"`)
      );
      console.log(`ℹ️ Output saved to "${outputDir()}"`);
    } catch (error) {
      console.error(red("🚨 Conversion process failed:"), error);
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
      ],
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

async function promptForInputFolder() {
  const { inputFolder } = await prompt([
    {
      type: "input",
      name: "inputFolder",
      message: "Enter folder path for the input:",
      validate: (input) => {
        if (input.trim() === "") return "Folder name cannot be empty";
        if (!lstatSync(input)) return "Input folder doesn't exist";
        if (!isDirectory(input)) return "Input folder is not a directory";
        return true;
      },
    },
  ]);

  return inputFolder;
}

async function promptForOutputFolder() {
  const { outputFolder } = await prompt([
    {
      type: "input",
      name: "outputFolder",
      message: "Enter folder path for the output:",
      validate: (input) => {
        if (input.trim() === "") return "Folder name cannot be empty";
        return true;
      },
    },
  ]);

  return outputFolder;
}

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}

async function setupOutputDirs() {
  try {
    const tsxPath = path.resolve(options.outputDir, "tsx");
    const glbPath = path.resolve(options.outputDir, "glb");

    console.log("ℹ️ Will write results to:");
    options.tsx &&
      console.log(`ℹ️ For .tsx files: ${tsxPath.replace(home, "~")}`);

    console.log(`ℹ️ For .glb files: ${glbPath.replace(home, "~")}`);

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
    if (options.tsx) await mkdir(tsxPath, { recursive: true });

    console.log(green("✓  Output directories created"));
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

    const results = await readdir(tsxPath);
    const improvedGlbFiles = results.filter((result) =>
      result.endsWith(".glb")
    );

    const improvedGlbPath = path.resolve(options.outputDir, "glb-for-web");
    await mkdir(improvedGlbPath, { recursive: true });

    for (const result of improvedGlbFiles) {
      const oldPath = path.resolve(tsxPath, result);
      const newPath = path.resolve(improvedGlbPath, result);
      await rename(oldPath, newPath);
    }

    spinner.stop();
    console.log(green("✓  TSX components generated"));
  } catch (error) {
    spinner.fail("Failed to generate TSX components");
    console.error(red("🚨 Error generating TSX:"), error);
    throw error;
  }
}

type InputFormats = keyof typeof converters;

const converters = {
  GLTF: convertSingleGltf,
  FBX: convertSingleFbx,
  OBJ: convertSingleObj,
};

const inputDir = () => `${options.inputDir.replace(home, "~")}`;
const outputDir = () => `${options.outputDir.replace(home, "~")}`;

async function collectFiles({ modelType }: { modelType: InputFormats }) {
  const inputEnding = "." + modelType.toLowerCase();
  const files = await readdir(options.inputDir, {
    recursive: options.recursive,
  });
  const modelFiles = files.filter((file) => file.endsWith(inputEnding));

  return modelFiles;
}

async function convertModels({ modelType }: { modelType: InputFormats }) {
  const spinner = ora(`Converting ${modelType} files to "GLB"...`).start();

  try {
    const modelFiles = await collectFiles({ modelType });

    console.log(
      `ℹ️ Found ${modelFiles.length} ${modelType} models to convert from input dir: }`
    );

    if (!modelFiles.length) {
      console.error(
        yellow(`⚠️ No ${modelType} type models found in the input directory`)
      );
      return;
    }

    for (const file of modelFiles) {
      await supplyPathsTo(converters[modelType], file);
    }

    spinner.stop();
    console.log(green(`✓ ${modelType} conversion completed`));
  } catch (error) {
    spinner.fail(`${modelType} conversion failed`);
    console.error(red("🚨 Error converting GLTF:"), error);
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
  };
}

async function supplyPathsTo(
  convertFn: (i: string, o: string) => Promise<void>,
  file: string
) {
  const extension = "glb";
  const outputPath = path.resolve(
    options.outputDir,
    extension,
    file.replace("." + options.modelType.toLowerCase(), "." + extension)
  );
  const inputPath = path.resolve(options.inputDir, file);

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

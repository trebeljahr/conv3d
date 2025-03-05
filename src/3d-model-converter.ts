import { cyan, green, red } from "chalk";
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

program.option("-i, --inputDir <path>", "Add the input directory");
program.option("-o, --outputDir <path>", "Add the output directory");
program.option("-m, --modelType <string>", "Add the type of model.");
program.option("--tsx", "Create .tsx files");
program.option("--no-tsx", "Don't create .tsx files");
program.option("--glb", "Create .glb files");
program.option("--no-glb", "Don't create .glb files but .gltf instead");

const options = program.opts();

export const isDirectory = (strPath: string) =>
  lstatSync(strPath) ? lstatSync(strPath).isDirectory() : false;

program
  .command("bulk-convert")
  .description("Convert all 3D models from directory in one go.")
  .action(async () => {
    try {
      options.inputDir = path.resolve(
        options.inputDir || (await promptForInputFolder())
      );
      options.outputDir =
        options.outputDir ||
        path.resolve(options.inputDir, "out") ||
        (await promptForOutputFolder());

      options.modelType =
        options.modelType?.toUpperCase().replace(".", "") ||
        (await promptForModelType());
      options.tsx = options.tsx || (await promptForTsxOutput());
      options.glb = options.glb || (await promptForGlbOutput());
      options.gltf = !options.glb;

      await setupOutputDirs();

      if (options.modelType === "GLTF" && options.gltf) {
        console.error(red(".gltf models cannot be converted to .gltf"));
        exit(1);
      }

      if (!Object.keys(converters).includes(options.modelType)) {
        console.error(red("Invalid model type: ", options.modelType));
        exit(1);
      }

      const cleanup = await setupCleanup();
      await convertModels();
      await cleanup();

      if (options.tsx) await generateTSXforGLB();
      else console.log("ℹ️ Didn't add .tsx files");

      console.log(
        green(
          `✓  Successfully converted ${
            options.modelType
          } models from "${options.inputDir.replace(home, "~")}"`
        )
      );
      console.log(
        `ℹ️ Output saved to "${options.outputDir.replace(home, "~")}"`
      );
    } catch (error) {
      console.error(red("Conversion process failed:"), error);
    }
  });

async function promptForModelType() {
  const files = await readdir(options.inputDir);
  const numGLTF = files.filter((file) => file.endsWith(".gltf")).length;
  const numFBX = files.filter((file) => file.endsWith(".fbx")).length;
  const numOBJ = files.filter((file) => file.endsWith(".obj")).length;

  const { modelType } = await prompt([
    {
      type: "list",
      name: "modelType",
      message: "Select the type of 3D models to convert:",
      choices: [
        { name: `GLTF (${numGLTF} available)`, value: "GLTF" },
        { name: `FBX (${numFBX} available)`, value: "FBX" },
        { name: `OBJ (${numOBJ} available)`, value: "OBJ" },
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

async function promptForGlbOutput() {
  const { glb } = await prompt([
    {
      type: "list",
      name: "glb",
      message: "Select an output format:",
      choices: [
        { name: ".glb", value: true },
        { name: ".gltf", value: false },
      ],
    },
  ]);
  return glb;
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
    const gltfPath = path.resolve(options.outputDir, "gltf");

    const allFiles = await readdir(options.inputDir);
    const extension = "." + options.modelType.toLowerCase();
    const files = allFiles.filter((file) => file.endsWith(extension));
    console.log(
      `ℹ️ Found ${
        files.length
      } ${extension} models to convert from input dir: ${options.inputDir.replace(
        home,
        "~"
      )}`
    );

    if (!files.length) {
      console.log(red("Aborting, because there are no models to convert!"));
      exit(0);
    }

    console.log("ℹ️ Will write results to:");
    options.tsx &&
      console.log(`ℹ️ For .tsx files: ${tsxPath.replace(home, "~")}`);
    options.glb &&
      console.log(`ℹ️ For .glb files: ${glbPath.replace(home, "~")}`);
    options.gltf &&
      console.log(`ℹ️ For .gltf files: ${gltfPath.replace(home, "~")}`);

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

    if (options.tsx) await mkdir(tsxPath, { recursive: true });
    if (options.glb) await mkdir(glbPath, { recursive: true });

    console.log(green("✓  Output directories created"));
  } catch (error) {
    console.error(red("Error creating directories:"), error);
    throw error;
  }
}

async function generateTSXforGLB() {
  const spinner = ora("Generating TSX components...").start();
  try {
    const glbPath = path.resolve(options.outputDir, "glb");
    const tsxPath = path.resolve(options.outputDir, "tsx");

    const files = await readdir(glbPath);
    const glbFiles = files.filter((file) => file.endsWith(".glb"));

    for (const file of glbFiles) {
      const outputPath = path.resolve(file.replace(".glb", ".tsx"));
      const inputPath = path.resolve(glbPath, file);
      await exec(
        `gltfjsx "${inputPath}" -o "${outputPath}" --types --transform`
      );
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
    console.error(red("Error generating TSX:"), error);
    throw error;
  }
}

type InputFormats = keyof typeof converters;

const converters = {
  GLTF: convertSingleGltf,
  FBX: convertSingleFbx,
  OBJ: convertSingleObj,
};

async function convertModels() {
  const modelType: InputFormats = options.modelType;

  const inputEnding = "." + modelType.toLowerCase();
  const spinner = ora(
    `Converting ${modelType} files to ${options.glb ? "GLB" : "GLTF"}...`
  ).start();

  try {
    const files = await readdir(options.inputDir);
    const gltfFiles = files.filter((file) => file.endsWith(inputEnding));

    for (const file of gltfFiles) {
      await supplyPathTo(converters[modelType], file);
    }

    spinner.stop();
    console.log(green(`✓  ${modelType} conversion completed`));
  } catch (error) {
    spinner.fail(`${modelType} conversion failed`);
    console.error(red("Error converting GLTF:"), error);
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
      console.log("Deleting folder", folderPath);
      await rm(folderPath, { recursive: true, force: true });
    }
  };
}

async function supplyPathTo(
  convertFn: (i: string, o: string) => Promise<void>,
  file: string
) {
  const ending = options.glb ? ".glb" : ".gltf";
  const outputPath = path.resolve(
    options.outputDir,
    ending,
    file.replace("." + options.modelType.toLowerCase(), ending)
  );
  const inputPath = path.resolve(options.inputDir, file);

  await convertFn(inputPath, outputPath);
}

async function convertSingleObj(inputPath: string, outputPath: string) {
  await exec(
    `obj2gltf ${options.glb ? "-b" : ""} -i "${inputPath}" -o "${outputPath}"`
  );
}

async function convertSingleFbx(inputPath: string, outputPath: string) {
  await exec(
    `FBX2glTF-darwin-x64 -i "${inputPath}" -o "${outputPath}" --pbr-metallic-roughness ${
      options.glb ? "-b" : ""
    }`
  );
}

async function convertSingleGltf(inputPath: string, outputPath: string) {
  await exec(
    `gltf-pipeline -i "${inputPath}" -o "${outputPath}" ${
      options.glb ? "-b" : ""
    } `
  );
}

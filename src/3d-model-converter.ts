import { Command } from "commander";
import { prompt } from "inquirer";
import { green, cyan, red } from "chalk";
import { textSync } from "figlet";
import { exec as execSync } from "child_process";
import { promisify } from "util";
import { mkdir, readdir, rmdir } from "fs/promises";
import ora from "ora";
import { lstatSync } from "fs";
import path from "path";
import { exit } from "process";

const exec = promisify(execSync);

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
program.option("--no-tsx", "Don't create .tsx files");
program.option("--no-binary", "Don't create .glb files but .gltf instead");

const options = program.opts();

export const isDirectory = (strPath: string) =>
  lstatSync(strPath) ? lstatSync(strPath).isDirectory() : false;

async function setupOutputDirs() {
  try {
    const tsxPath = path.resolve(options.outputDir, "tsx");
    const glbPath = path.resolve(options.outputDir, "glb");

    const { confirmed } = await prompt([
      {
        type: "confirm",
        name: "confirmed",
        message:
          "Looking good?" +
          "\nInput Dir: " +
          options.inputDir +
          "\nOutput Dir TSX: " +
          tsxPath +
          "\nOutput Dir GLB: " +
          glbPath,
      },
    ]);

    if (!confirmed) {
      exit(0);
    }

    await mkdir(options.outputDir, { recursive: true });

    if (options.tsx) await mkdir(tsxPath, { recursive: true });
    if (options.glb) await mkdir(glbPath, { recursive: true });

    console.log(green("✓ Output directories created"));
  } catch (error) {
    console.error(red("Error creating directories:"), error);
    throw error;
  }
}

async function generateTSXforGLB() {
  const spinner = ora("Generating TSX components...").start();
  try {
    const glbPath = path.resolve(options.outputDir, "glb");

    const files = await readdir(glbPath);
    const glbFiles = files.filter((file) => file.endsWith(".glb"));

    for (const file of glbFiles) {
      const outputPath = path.resolve(
        options.outputDir,
        "tsx",
        file.replace(".glb", ".tsx")
      );
      const inputPath = path.resolve(glbPath, file);
      await exec(`gltfjsx ${inputPath} -o ${outputPath} --types --transform`);
    }

    spinner.succeed("TSX components generated successfully");
  } catch (error) {
    spinner.fail("Failed to generate TSX components");
    console.error(red("Error generating TSX:"), error);
    throw error;
  }
}

async function convertGLTFtoGLB() {
  const spinner = ora("Converting GLTF files to GLB...").start();
  try {
    const files = await readdir(options.inputDir);
    const gltfFiles = files.filter((file) => file.endsWith(".gltf"));

    for (const file of gltfFiles) {
      const outputPath = path.resolve(
        options.outputDir,
        file.replace(".gltf", ".glb")
      );
      const inputPath = path.resolve(options.inputDir, file);

      await exec(`gltf-pipeline -i "${inputPath}" -b -o "${outputPath}"`);
    }

    spinner.succeed("GLTF conversion completed");
  } catch (error) {
    spinner.fail("GLTF conversion failed");
    console.error(red("Error converting GLTF:"), error);
    throw error;
  }
}

async function convertFBXtoGLB() {
  const spinner = ora("Converting FBX files to GLB...").start();
  try {
    const files = await readdir(options.inputDir);
    const fbxFiles = files.filter((file) => file.endsWith(".fbx"));

    for (const file of fbxFiles) {
      const outputPath = path.resolve(
        options.outputDir,
        options.binary ? "glb" : "gltf",
        file.replace(".fbx", ".glb")
      );
      const inputPath = path.resolve(options.inputDir, file);
      await exec(
        `FBX2glTF-darwin-x64 -i "${inputPath}" -o ${outputPath} --pbr-metallic-roughness --binary`
      );
    }

    const paths = await readdir(options.inputDir);
    const fbmFolders = paths.filter((path) => path.endsWith(".fbm"));
    for (const folder of fbmFolders) {
      const folderPath = path.resolve(options.inputDir, folder);
      console.log("Deleting folder", folderPath);
      await rmdir(folderPath);
    }

    spinner.succeed("FBX conversion completed");
  } catch (error) {
    spinner.fail("FBX conversion failed");
    console.error(red("Error converting FBX:"), error);
    throw error;
  }
}

async function convertOBJtoGLB() {
  const spinner = ora("Converting OBJ files to GLB...").start();
  try {
    const files = await readdir(options.inputDir);
    const objFiles = files.filter((file) => file.endsWith(".obj"));

    for (const file of objFiles) {
      const outputPath = path.resolve(
        options.outputDir,
        "glb",
        file.replace(".obj", ".glb")
      );
      const inputPath = path.resolve(options.inputDir, file);

      await exec(`obj2gltf -b -i "${inputPath}" -o "${outputPath}"`);
    }

    spinner.succeed("OBJ conversion completed");
  } catch (error) {
    spinner.fail("OBJ conversion failed");
    console.error(red("Error converting OBJ:"), error);
    throw error;
  }
}

program
  .command("bulk-convert")
  .description("Convert all 3D models from directory in one go.")
  .action(async () => {
    try {
      options.inputDir = options.inputDir || (await promptForInputFolder());
      options.outputDir =
        options.outputDir ||
        path.resolve(options.inputDir, "out") ||
        (await promptForOutputFolder());

      await setupOutputDirs();

      options.modelType = options.modelType || (await promptForModelType());

      switch (options.modelType) {
        case "GLTF":
          await convertGLTFtoGLB();
          break;
        case "FBX":
          await convertFBXtoGLB();
          break;
        case "OBJ":
          await convertOBJtoGLB();
          break;
        default:
          console.error(red("Invalid model type: ", options.modelType));
          exit(1);
      }

      if (options.tsx) await generateTSXforGLB();

      console.log(
        green(
          `✓ Successfully converted and set up ${options.modelType} models from folder "${options.inputDir}" to ${options.outputDir}`
        )
      );
    } catch (error) {
      console.error(red("Conversion process failed:"), error);
    }
  });

async function promptForModelType() {
  const { modelType } = await prompt([
    {
      type: "list",
      name: "modelType",
      message: "Select the type of 3D models to convert:",
      choices: ["GLTF", "FBX", "OBJ"],
    },
  ]);
  return modelType;
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

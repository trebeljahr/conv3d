import { Command } from "commander";
import { prompt } from "inquirer";
import { green, cyan, red } from "chalk";
import { textSync } from "figlet";
import { exec as execSync } from "child_process";
import { promisify } from "util";
import { mkdir, copyFile, readdir } from "fs/promises";
import path from "path";
import ora from "ora";

const exec = promisify(execSync);

const homePath = process.env.HOME || "~";

let GLB_PATH = "";
let TSX_PATH = "";

console.log(cyan(textSync("3D Model Converter", { horizontalLayout: "full" })));

const program = new Command();

program
  .version("1.0.0")
  .description(
    "An interactive CLI tool for converting 3D models to glTF/GLB and generating React components"
  );

program
  .command("config")
  .description("Configure output paths")
  .action(async () => {
    const answers = await prompt([
      {
        type: "input",
        name: "glbPath",
        message: "Enter the GLB output path:",
        default: GLB_PATH,
      },
      {
        type: "input",
        name: "tsxPath",
        message: "Enter the TSX output path:",
        default: TSX_PATH,
      },
    ]);

    GLB_PATH = answers.glbPath;
    TSX_PATH = answers.tsxPath;

    console.log(green("Configuration updated successfully!"));
  });

async function setupDirs() {
  try {
    await mkdir("out/glb", { recursive: true });
    await mkdir("out/tsx", { recursive: true });
    console.log(green("✓ Output directories created"));
  } catch (error) {
    console.error(red("Error creating directories:"), error);
    throw error;
  }
}

async function generateTSXforGLTF() {
  const spinner = ora("Generating TSX components...").start();
  try {
    const files = await readdir("out/glb");
    const glbFiles = files.filter((file) => file.endsWith(".glb"));

    for (const file of glbFiles) {
      await exec(`gltfjsx "out/glb/${file}" -t`);
    }

    const tsxFiles = (await readdir(".")).filter((file) =>
      file.endsWith(".tsx")
    );
    for (const file of tsxFiles) {
      await exec(`mv "${file}" out/tsx/`);
    }

    spinner.succeed("TSX components generated successfully");
  } catch (error) {
    spinner.fail("Failed to generate TSX components");
    console.error(red("Error generating TSX:"), error);
    throw error;
  }
}

async function copyInto(folderName: string) {
  const spinner = ora("Copying files to destination...").start();
  try {
    await mkdir(`${GLB_PATH}/${folderName}`, { recursive: true });
    await mkdir(`${TSX_PATH}/${folderName}`, { recursive: true });

    const tsxFiles = await readdir("out/tsx");
    for (const file of tsxFiles) {
      await copyFile(`out/tsx/${file}`, `${TSX_PATH}/${folderName}/${file}`);
    }

    const glbFiles = await readdir("out/glb");
    for (const file of glbFiles) {
      await copyFile(`out/glb/${file}`, `${GLB_PATH}/${folderName}/${file}`);
    }

    spinner.succeed("Files copied successfully");
  } catch (error) {
    spinner.fail("Failed to copy files");
    console.error(red("Error copying files:"), error);
    throw error;
  }
}

async function convertGLTF() {
  const spinner = ora("Converting GLTF files to GLB...").start();
  try {
    await setupDirs();

    const files = await readdir(".");
    const gltfFiles = files.filter((file) => file.endsWith(".gltf"));

    for (const file of gltfFiles) {
      await exec(
        `gltf-pipeline -i "${file}" -b -o "out/glb/${file.replace(
          ".gltf",
          ".glb"
        )}"`
      );
    }

    await generateTSXforGLTF();
    spinner.succeed("GLTF conversion completed");
  } catch (error) {
    spinner.fail("GLTF conversion failed");
    console.error(red("Error converting GLTF:"), error);
    throw error;
  }
}

async function convertFBX() {
  const spinner = ora("Converting FBX files to GLB...").start();
  try {
    await setupDirs();

    const files = await readdir(".");
    const fbxFiles = files.filter((file) => file.endsWith(".fbx"));

    for (const file of fbxFiles) {
      await exec(
        `FBX2glTF-darwin-x64 -b -i "${file}" -o "out/glb/${file.replace(
          ".fbx",
          ""
        )}"`
      );
    }

    await generateTSXforGLTF();
    spinner.succeed("FBX conversion completed");
  } catch (error) {
    spinner.fail("FBX conversion failed");
    console.error(red("Error converting FBX:"), error);
    throw error;
  }
}

async function convertOBJ() {
  const spinner = ora("Converting OBJ files to GLB...").start();
  try {
    await setupDirs();

    const files = await readdir(".");
    const objFiles = files.filter((file) => file.endsWith(".obj"));

    for (const file of objFiles) {
      await exec(
        `obj2gltf -b -i "${file}" -o "out/glb/${file.replace(".obj", ".glb")}"`
      );
    }

    await generateTSXforGLTF();
    spinner.succeed("OBJ conversion completed");
  } catch (error) {
    spinner.fail("OBJ conversion failed");
    console.error(red("Error converting OBJ:"), error);
    throw error;
  }
}

program
  .command("convert")
  .description("Convert 3D models and set up components")
  .action(async () => {
    try {
      const { modelType } = await prompt([
        {
          type: "list",
          name: "modelType",
          message: "Select the type of 3D models to convert:",
          choices: ["GLTF", "FBX", "OBJ"],
        },
      ]);

      const { folderName } = await prompt([
        {
          type: "input",
          name: "folderName",
          message: "Enter folder name for the output:",
          validate: (input) =>
            input.trim() !== "" ? true : "Folder name cannot be empty",
        },
      ]);

      switch (modelType) {
        case "GLTF":
          await convertGLTF();
          break;
        case "FBX":
          await convertFBX();
          break;
        case "OBJ":
          await convertOBJ();
          break;
      }

      await copyInto(folderName);
      console.log(
        green(
          `✓ Successfully converted and set up ${modelType} models in folder "${folderName}"`
        )
      );
    } catch (error) {
      console.error(red("Conversion process failed:"), error);
    }
  });

program
  .command("clean")
  .description("Clean temporary output directories")
  .action(async () => {
    const spinner = ora("Cleaning output directories...").start();
    try {
      await exec("rm -rf out/");
      spinner.succeed("Output directories cleaned");
    } catch (error) {
      spinner.fail("Failed to clean directories");
      console.error(red("Error cleaning directories:"), error);
    }
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}

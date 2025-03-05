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

      switch (options.modelType) {
        case "GLTF":
          await convertGLTF();
          break;
        case "FBX":
          await convertFBX();
          break;
        case "OBJ":
          await convertOBJ();
          break;
        default:
          console.error(red("Invalid model type: ", options.modelType));
          exit(1);
      }

      if (options.tsx) await generateTSXforGLB();
      else console.log(green("ℹ️ Didn't add .tsx files"));

      console.log(
        green(
          `✅ Successfully converted ${
            options.modelType
          } models from "${options.inputDir.replace(home, "~")}"`
        ),
        green(`\nℹ️ Output saved to "${options.outputDir.replace(home, "~")}"`)
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
    console.log(`ℹ️ Found ${files.length} ${extension} models to convert`);
    console.log(`ℹ️ from input dir: ${options.inputDir.replace(home, "~")}`);

    if (!files.length) {
      console.log(red("Aborting, because there are no models to convert!"));
      exit(0);
    }

    console.log("Will write results to:");
    options.tsx &&
      console.log(`\nFor .tsx files: ${tsxPath.replace(home, "~")}`);
    options.glb &&
      console.log(`\nFor .glb files: ${glbPath.replace(home, "~")}`);
    options.gltf &&
      console.log(`\nFor .gltf files: ${gltfPath.replace(home, "~")}`);

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

    console.log(green("✅ Output directories created"));
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
    console.log(green("✅ TSX components generated"));
  } catch (error) {
    spinner.fail("Failed to generate TSX components");
    console.error(red("Error generating TSX:"), error);
    throw error;
  }
}

async function convertGLTF() {
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

      await exec(
        `gltf-pipeline -i "${inputPath}" -o "${outputPath}" ${
          options.glb ? "-b" : ""
        } `
      );
    }

    spinner.stop();
    console.log(green("✅ GLTF conversion completed"));
  } catch (error) {
    spinner.fail("GLTF conversion failed");
    console.error(red("Error converting GLTF:"), error);
    throw error;
  }
}

async function convertFBX() {
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
        `FBX2glTF-darwin-x64 -i "${inputPath}" -o "${outputPath}" --pbr-metallic-roughness ${
          options.glb ? "--binary" : ""
        }`
      );
    }

    const paths = await readdir(options.inputDir);
    const fbmFolders = paths.filter((path) => path.endsWith(".fbm"));
    for (const folder of fbmFolders) {
      const folderPath = path.resolve(options.inputDir, folder);
      console.log("Deleting folder", folderPath);
      await rm(folderPath, { recursive: true, force: true });
    }

    spinner.stop();
    console.log(green("✅ FBX conversion completed"));
  } catch (error) {
    spinner.fail("FBX conversion failed");
    console.error(red("Error converting FBX:"), error);
    throw error;
  }
}

async function convertOBJ() {
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

      await exec(
        `obj2gltf ${
          options.glb ? "-b" : ""
        } -i "${inputPath}" -o "${outputPath}"`
      );
    }

    spinner.stop();
    console.log(green("✅ OBJ conversion completed"));
  } catch (error) {
    spinner.fail("OBJ conversion failed");
    console.error(red("Error converting OBJ:"), error);
    throw error;
  }
}

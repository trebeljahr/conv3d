import chalk from "chalk";
import inquirer from "inquirer";
import { exit } from "process";

const { prompt } = inquirer;
const { yellow } = chalk;

export async function promptForModelType({
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
  if (numAll === 0) {
    console.error(yellow(`⚠️ No suitable models found in the input directory`));
    exit(1);
  }

  const { modelType } = await prompt<{ modelType: string }>([
    {
      type: "list",
      name: "modelType",
      message: "Select the type of 3D models to convert:",
      choices: [
        { name: `GLTF (${numGLTF} available)`, value: "GLTF" },
        { name: `FBX (${numFBX} available)`, value: "FBX" },
        { name: `OBJ (${numOBJ} available)`, value: "OBJ" },
        { name: `ALL (${numAll} available)`, value: "ALL" },
      ].filter(({ name }) => !name.includes("(0 ")),
    },
  ]);

  return modelType;
}

export async function promptForTsxOutput() {
  const { tsx } = await prompt([
    {
      type: "confirm",
      name: "tsx",
      message: "Generate .tsx files?",
    },
  ]);
  return tsx;
}

export async function promptForOptimizedGlbOutput() {
  const { optimize } = await prompt([
    {
      type: "confirm",
      name: "optimize",
      message: "Optimize output GLB files for web? (recommended)",
    },
  ]);

  return optimize;
}

export async function askForFileOverwrite(filePath: string) {
  const { overwrite } = await prompt([
    {
      type: "confirm",
      name: "overwrite",
      message: "Overwrite the file?" + " " + filePath,
    },
  ]);
  return overwrite;
}

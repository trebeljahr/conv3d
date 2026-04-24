import chalk from "chalk";
import inquirer from "inquirer";
import { exit } from "process";
import { err } from "./log.js";
import { isNonInteractive } from "./program.js";

const { prompt } = inquirer;
const { red } = chalk;

function bailNonInteractive(what: string, hint: string): never {
  err(red(`🚨 Non-interactive mode: ${what} is required but was not provided.\n` + `ℹ️ ${hint}`));
  exit(1);
}

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
}): Promise<string> {
  if (isNonInteractive()) {
    bailNonInteractive(
      "--modelType / -m",
      "Pass -m GLTF | FBX | OBJ | ALL to select which formats to convert.",
    );
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
  if (isNonInteractive()) return true;
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
  if (isNonInteractive()) return true;
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
  if (isNonInteractive()) return false;
  const { overwrite } = await prompt([
    {
      type: "confirm",
      name: "overwrite",
      message: "Overwrite the file?" + " " + filePath,
    },
  ]);
  return overwrite;
}

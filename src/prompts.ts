import inquirer from "inquirer";
import { isNonInteractive } from "./program.js";

const { prompt } = inquirer;

function bailNonInteractive(what: string, hint: string): never {
  // Thrown so the calling command's catch emits the `--json` fatal-error object.
  throw new Error(`Non-interactive mode: ${what} is required but was not provided. ${hint}`);
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
      type: "select",
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

async function promptForBoolean(
  name: string,
  message: string,
  nonInteractiveDefault: boolean,
): Promise<boolean> {
  if (isNonInteractive()) return nonInteractiveDefault;
  const answer = (await prompt([{ type: "confirm", name, message }])) as Record<string, boolean>;
  return !!answer[name];
}

export function promptForTsxOutput(): Promise<boolean> {
  return promptForBoolean("tsx", "Generate .tsx files?", true);
}

export function promptForOptimizedGlbOutput(): Promise<boolean> {
  return promptForBoolean("optimize", "Optimize output GLB files for web? (recommended)", true);
}

export function askForFileOverwrite(filePath: string): Promise<boolean> {
  return promptForBoolean("overwrite", `Overwrite the file? ${filePath}`, false);
}

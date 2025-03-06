import chalk from "chalk";
import { mkdir, lstat } from "fs/promises";
import inquirer from "inquirer";
import { homedir } from "os";
import path from "path";
import { exit } from "process";
import { access, constants } from "fs/promises";

export async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true; // File exists
  } catch {
    return false; // File doesn't exist or can't be accessed
  }
}

const { prompt } = inquirer;
const { green, red } = chalk;

export const home = homedir();

export const isDirectory = async (strPath: string) =>
  (await checkFileExists(strPath))
    ? (await lstat(strPath)).isDirectory()
    : false;

export async function setupOutputDirs(
  options: Record<string, any>,
  numFilesToWrite: number
) {
  try {
    const tsxPath = path.resolve(options.outputDir, "tsx");
    const glbPath = path.resolve(options.outputDir, "glb");
    const optPath = path.resolve(options.outputDir, "glb-for-web");

    if (!options.onlyTsx) {
      console.info(
        `ℹ️ Will write ${numFilesToWrite} .glb file${
          numFilesToWrite > 1 ? "s" : ""
        } to ${glbPath.replace(home, "~")}`
      );
    }

    if (options.tsx) {
      console.info(
        `ℹ️ Will write ${numFilesToWrite} .tsx file${
          numFilesToWrite > 1 ? "s" : ""
        } to ${tsxPath.replace(home, "~")}`
      );
      if (options.optimize) {
        console.info(
          `ℹ️ Will write ${numFilesToWrite} .glb file${
            numFilesToWrite > 1 ? "s" : ""
          } to ${optPath.replace(home, "~")}`
        );
        console.info(`ℹ️ These will be optimized and much smaller!`);
      }
    }

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

    if (options.tsx) {
      await mkdir(tsxPath, { recursive: true });
      await mkdir(optPath, { recursive: true });
    }

    console.info(green("✅ Output directories created"));
  } catch (error) {
    console.error(red("🚨 Error creating directories:"), error);
    throw error;
  }
}

export const outDirPrefix = "_convert-3d-for-web";

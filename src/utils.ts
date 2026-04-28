import { access, constants, lstat, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { exit } from "node:process";
import chalk from "chalk";
import inquirer from "inquirer";
import { err, info } from "./log.js";
import type { OutputDirs } from "./outputDirs.js";
import { isDryRun, isNonInteractive } from "./program.js";

export async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

const { prompt } = inquirer;
const { green, red } = chalk;

export const home = homedir();

export const isDirectory = async (strPath: string) =>
  (await checkFileExists(strPath)) ? (await lstat(strPath)).isDirectory() : false;

export type SetupOptions = {
  tsx?: boolean;
  optimize?: boolean;
  onlyTsx?: boolean;
};

export async function setupOutputDirs(
  dirs: OutputDirs,
  options: SetupOptions,
  numFilesToWrite: number,
) {
  try {
    const pluralize = (n: number, w: string) => (n === 1 ? w : `${w}s`);
    const runsGltfjsx = !!options.tsx || !!options.optimize;

    if (!options.onlyTsx) {
      info(
        `ℹ️ Will write ${numFilesToWrite} ${pluralize(
          numFilesToWrite,
          ".glb file",
        )} to ${dirs.glb.replace(home, "~")}`,
      );
    }

    if (options.tsx) {
      info(
        `ℹ️ Will write ${numFilesToWrite} ${pluralize(
          numFilesToWrite,
          ".tsx file",
        )} to ${dirs.tsx.replace(home, "~")}`,
      );
    }

    if (options.optimize) {
      info(
        `ℹ️ Will write ${numFilesToWrite} optimized ${pluralize(
          numFilesToWrite,
          ".glb file",
        )} to ${dirs.optimized.replace(home, "~")}`,
      );
      info(`ℹ️ These will be optimized and much smaller!`);
    }

    if (!isNonInteractive() && !isDryRun()) {
      const { confirmed } = await prompt([
        {
          type: "confirm",
          name: "confirmed",
          message: "Looking good?",
        },
      ]);
      if (!confirmed) exit(0);
    }

    if (isDryRun()) return;

    await mkdir(dirs.base, { recursive: true });
    if (!options.onlyTsx) {
      await mkdir(dirs.glb, { recursive: true });
    }
    if (runsGltfjsx) {
      // tsx dir is always needed as scratch for gltfjsx; cleaned up if !tsx.
      await mkdir(dirs.tsx, { recursive: true });
    }
    if (options.optimize) {
      await mkdir(dirs.optimized, { recursive: true });
    }

    info(green("✅ Output directories created"));
  } catch (error) {
    err(red("🚨 Error creating directories:"), error);
    throw error;
  }
}

export const outDirPrefix = "_convert-3d-for-web";

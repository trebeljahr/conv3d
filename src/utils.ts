import { green, red } from "chalk";
import { lstatSync } from "fs";
import { mkdir, readdir, rename, rm } from "fs/promises";
import { prompt } from "inquirer";
import ora from "ora";
import { homedir } from "os";
import path from "path";
import { exit } from "process";

export const home = homedir();

export const isDirectory = (strPath: string) =>
  lstatSync(strPath) ? lstatSync(strPath).isDirectory() : false;

export async function moveImprovedGlbFiles(options: Record<string, any>) {
  const tsxPath = path.resolve(options.outputDir, "tsx");
  const improvedGlbPath = path.resolve(options.outputDir, "glb-for-web");

  const results = await readdir(tsxPath);
  const improvedGlbFiles = results.filter((result) => result.endsWith(".glb"));

  for (const result of improvedGlbFiles) {
    const oldPath = path.resolve(tsxPath, result);
    const newPath = path.resolve(improvedGlbPath, result);
    await rename(oldPath, newPath);
  }
}

export async function setupOutputDirs(
  options: Record<string, any>,
  numFilesToWrite: number
) {
  try {
    const tsxPath = path.resolve(options.outputDir, "tsx");
    const glbPath = path.resolve(options.outputDir, "glb");
    const optPath = path.resolve(options.outputDir, "glb-for-web");

    console.info(`ℹ️ Expect to write ${numFilesToWrite} results to:`);
    if (!options.onlyTsx) {
      console.info(`ℹ️ For .glb files: ${glbPath.replace(home, "~")}`);
    }

    if (options.tsx) {
      console.info(`ℹ️ For .tsx files: ${tsxPath.replace(home, "~")}`);
      console.info(
        `ℹ️ For optimized .glb files: ${optPath.replace(home, "~")}`
      );
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

    console.info(green("✓ Output directories created"));
  } catch (error) {
    handleSigint(error);

    console.error(red("🚨 Error creating directories:"), error);
    throw error;
  }
}

export const handleSigint = (error: unknown, spinner?: ora.Ora) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "signal" in error &&
    error.signal === "SIGINT"
  ) {
    spinner?.stopAndPersist({
      symbol: "⏸️",
    });
    console.error(red(`🚨 Cancelled, shutting down...`));
    exit(0);
  }
};

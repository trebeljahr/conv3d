import { green, red } from "chalk";
import { lstatSync } from "fs";
import { mkdir, readdir, rename, rm } from "fs/promises";
import { prompt } from "inquirer";
import { homedir } from "os";
import path from "path";
import { exit } from "process";

export const home = homedir();

export const isDirectory = (strPath: string) =>
  lstatSync(strPath) ? lstatSync(strPath).isDirectory() : false;

export async function setupCleanup(options: Record<string, any>) {
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
      await rm(folderPath, { recursive: true, force: true });
    }

    const tsxPath = path.resolve(options.outputDir, "tsx");
    const improvedGlbPath = path.resolve(options.outputDir, "glb-for-web");

    const results = await readdir(tsxPath);
    const improvedGlbFiles = results.filter((result) =>
      result.endsWith(".glb")
    );

    for (const result of improvedGlbFiles) {
      const oldPath = path.resolve(tsxPath, result);
      const newPath = path.resolve(improvedGlbPath, result);
      await rename(oldPath, newPath);
    }
  };
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
    if (options.glb) {
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
    console.error(red("🚨 Error creating directories:"), error);
    throw error;
  }
}

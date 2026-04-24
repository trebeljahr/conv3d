import path from "path";
import chalk from "chalk";
import { readdir } from "fs/promises";
import { exit } from "process";
import { convertModels } from "../converters.js";
import { err, info, isJson, warn } from "../log.js";
import { resolveOutputDirs } from "../outputDirs.js";
import { globalOptions, isDryRun, program } from "../program.js";
import { isDirectory, outDirPrefix, setupOutputDirs } from "../utils.js";

const { red, yellow } = chalk;

type SubOptionsTsxGenCommand = {
  inputDir?: string;
  recursive: boolean | undefined;
};

program
  .command("tsx-gen")
  .summary("Generate .tsx React components from existing .glb files")
  .description(
    `Take .glb files that are already converted and run gltfjsx on them to
produce React Three Fiber components (.tsx) plus, optionally, web-optimized
.glb files (with --optimize).

Inputs in <inputDir>/_convert-3d-for-web/ are skipped so you can re-run safely.`,
  )
  .argument("[dir]", "Directory containing .glb files to process (alternative to -i)")
  .option("-i, --inputDir <path>", "Directory containing .glb files to process")
  .option("-r, --recursive", "Recurse into subdirectories")
  .addHelpText(
    "after",
    `
Examples:
  $ conv3d tsx-gen ./models
  $ conv3d tsx-gen ./models -r --optimize -y
  $ conv3d tsx-gen ./models -r --force-overwrite -y
  $ conv3d tsx-gen ./models --dry-run --json`,
  )
  .action(async (positional: string | undefined, subOptions: SubOptionsTsxGenCommand) => {
    try {
      info("🚀 Starting TSX generation process...");

      const inputDir = subOptions.inputDir ?? positional;
      if (!inputDir) {
        err(red(`🚨 Please specify an input directory (positionally or with -i)`));
        exit(1);
      }

      const resolvedInputDir = path.resolve(inputDir);

      if (!(await isDirectory(resolvedInputDir))) {
        err(red("🚨 Invalid input directory: " + resolvedInputDir));
        exit(1);
      }

      const files = await readdir(resolvedInputDir, {
        recursive: subOptions.recursive,
      });
      const glbFiles = files.filter(
        (file) => file.endsWith(".glb") && !file.includes(outDirPrefix),
      );

      const outputDirBase = path.resolve(resolvedInputDir, outDirPrefix);
      const dirs = resolveOutputDirs(outputDirBase);

      if (glbFiles.length === 0) {
        warn(yellow(`⚠️ No .glb models found in ${resolvedInputDir}`));
        if (isJson()) {
          process.stdout.write(
            JSON.stringify(
              {
                command: "tsx-gen",
                ok: true,
                inputDir: resolvedInputDir,
                outputDir: dirs.base,
                dryRun: !!isDryRun(),
                tsx: [],
                glbOptimized: [],
                skipped: [],
                errors: [],
              },
              null,
              2,
            ) + "\n",
          );
        }
        exit(0);
      }

      const setupOpts = {
        tsx: true,
        optimize: !!globalOptions.optimize,
        onlyTsx: true,
      };

      // tsx-gen always produces .tsx output.
      globalOptions.tsx = true;

      await setupOutputDirs(dirs, setupOpts, glbFiles.length);

      const r = await convertModels("GLB", glbFiles, resolvedInputDir, dirs);

      const result = {
        command: "tsx-gen" as const,
        ok: r.errors.length === 0,
        inputDir: resolvedInputDir,
        outputDir: dirs.base,
        dryRun: !!isDryRun(),
        tsx: isDryRun() ? r.planned : r.converted,
        glbOptimized: isDryRun() ? r.plannedGlbOptimized : r.glbOptimized,
        skipped: r.skipped,
        errors: r.errors,
      };

      if (isJson()) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      }

      if (r.errors.length > 0) exit(2);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (isJson()) {
        process.stdout.write(
          JSON.stringify({ command: "tsx-gen", ok: false, error: errorMsg }, null, 2) + "\n",
        );
      }
      err(red("🚨 TSX generation failed!"));
      err(red("🚨 " + errorMsg));
      exit(1);
    }
  });

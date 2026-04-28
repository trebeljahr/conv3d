import path from "node:path";
import { exit } from "node:process";
import chalk from "chalk";
import {
  converters,
  convertModels,
  convertSingleFbx,
  convertSingleGltf,
  convertSingleObj,
} from "../converters.js";
import { err, info, isJson } from "../log.js";
import { resolveOutputDirs } from "../outputDirs.js";
import { globalOptions, isDryRun, program } from "../program.js";
import { promptForOptimizedGlbOutput, promptForTsxOutput } from "../prompts.js";
import { isDirectory, outDirPrefix, setupOutputDirs } from "../utils.js";

const { red } = chalk;

type SubOptionsConvertSingle = {
  inputPath?: string;
};

program
  .command("single")
  .summary("Convert a single 3D model file")
  .description(
    `Convert one .fbx / .obj / .gltf file to .glb.

The format is inferred from the file extension. Output is written next to
the source, under <sourceDir>/_convert-3d-for-web/:
  glb/          the converted .glb
  tsx/          React component (only when --tsx)
  glb-for-web/  web-optimized .glb (only when --optimize)

Use --flat or --glb-dir / --tsx-dir / --optimized-dir to change the layout.`,
  )
  .argument("[path]", "Path to the .fbx / .obj / .gltf file (alternative to -i)")
  .option("-i, --inputPath <path>", "Path to the .fbx / .obj / .gltf file")
  .addHelpText(
    "after",
    `
Examples:
  $ conv3d single ./model.fbx
  $ conv3d single ./model.fbx --tsx --optimize -y
  $ conv3d single ./model.obj --no-tsx -y
  $ conv3d single ./model.fbx --tsx --dry-run --json`,
  )
  .action(async (positional: string | undefined, subOptions: SubOptionsConvertSingle) => {
    try {
      const inputPath = subOptions.inputPath ?? positional;
      if (!inputPath) {
        err(red("🚨 Please specify an input path (positionally or with -i)"));
        exit(1);
      }

      const resolvedInputPath = path.resolve(inputPath);

      if (await isDirectory(resolvedInputPath)) {
        err(red("🚨 Input path should point to a file."));
        exit(1);
      }

      info("🚀 Starting conversion process...");

      globalOptions.tsx =
        globalOptions.tsx === undefined ? await promptForTsxOutput() : globalOptions.tsx;

      globalOptions.optimize =
        globalOptions.optimize === undefined
          ? await promptForOptimizedGlbOutput()
          : globalOptions.optimize;

      const extension = path.extname(resolvedInputPath);
      const inferredModelType = extension.toUpperCase().replace(".", "");

      if (!Object.keys(converters).includes(inferredModelType)) {
        err(red("🚨 Invalid input file type: " + inferredModelType));
        err("ℹ️ Please provide a .fbx, .obj, or .gltf file");
        exit(1);
      }

      const inputDir = path.resolve(path.dirname(resolvedInputPath));
      const outputDirBase = path.resolve(inputDir, outDirPrefix);
      const dirs = resolveOutputDirs(outputDirBase);

      await setupOutputDirs(dirs, globalOptions, 1);

      const outputPath = path.resolve(
        dirs.glb,
        path.basename(resolvedInputPath).replace(extension, ".glb"),
      );

      const result = {
        command: "single",
        ok: true,
        inputPath: resolvedInputPath,
        outputDir: dirs.base,
        dryRun: !!isDryRun(),
        modelType: inferredModelType,
        converted: [] as string[],
        tsx: [] as string[],
        glbOptimized: [] as string[],
        skipped: [] as string[],
        errors: [] as { file: string; message: string }[],
      };

      if (isDryRun()) {
        info(`ℹ️ [dry-run] would write ${outputPath}`);
        result.converted = [outputPath];
      } else {
        info("ℹ️ Generating .glb files...");
        try {
          if (inferredModelType === "GLTF") await convertSingleGltf(resolvedInputPath, outputPath);
          if (inferredModelType === "FBX") await convertSingleFbx(resolvedInputPath, outputPath);
          if (inferredModelType === "OBJ") await convertSingleObj(resolvedInputPath, outputPath);
          result.converted = [outputPath];
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          result.errors.push({ file: resolvedInputPath, message });
          throw error;
        }
      }

      if (globalOptions.tsx || globalOptions.optimize) {
        const label =
          globalOptions.tsx && globalOptions.optimize
            ? ".tsx file and optimized .glb"
            : globalOptions.tsx
              ? ".tsx file"
              : "optimized .glb";
        info(`ℹ️ Generating ${label}...`);
        const glbResult = await convertModels("GLB", result.converted, inputDir, dirs);
        result.tsx = isDryRun() ? glbResult.planned : glbResult.converted;
        result.glbOptimized = isDryRun() ? glbResult.plannedGlbOptimized : glbResult.glbOptimized;
        result.skipped.push(...glbResult.skipped);
        result.errors.push(...glbResult.errors);
      } else {
        info("ℹ️ Skipped .tsx and optimization steps, like instructed 🫡");
      }

      result.ok = result.errors.length === 0;

      if (isJson()) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      }

      if (result.errors.length > 0) exit(2);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (isJson()) {
        process.stdout.write(
          JSON.stringify({ command: "single", ok: false, error: errorMsg }, null, 2) + "\n",
        );
      }
      err(red("🚨 Conversion process failed!"));
      err(red("🚨 " + errorMsg));
      exit(1);
    }
  });

import { readdir } from "node:fs/promises";
import path from "node:path";
import { exit } from "node:process";
import chalk from "chalk";
import fg from "fast-glob";
import {
  collectFiles,
  converters,
  convertModels,
  type InputFormats,
  SOURCE_FORMATS,
} from "../converters.js";
import { emitJsonIfRequested, err, info, warn } from "../log.js";
import { resolveOutputDirs } from "../outputDirs.js";
import { type GlobalOptions, globalOptions, isDryRun, program } from "../program.js";
import { promptForModelType } from "../prompts.js";
import { home, isDirectory, outDirPrefix, setupOutputDirs } from "../utils.js";
import { resolveOutputChoices, runGlbStep } from "./shared.js";

const { green, red, yellow } = chalk;

type SubOptionsBulkCommand = {
  inputDir?: string;
  outputDir?: string;
  modelType?: string;
  recursive: boolean | undefined;
};

type OptionsBulkCommand = SubOptionsBulkCommand & GlobalOptions;

function looksLikeGlob(s: string): boolean {
  return /[*?[\]{}]/.test(s);
}

function emitEmptyBulkResult(args: {
  inputDir: string;
  outputDir: string | null;
  modelType: string | null;
}): void {
  emitJsonIfRequested({
    command: "bulk",
    ok: true,
    inputDir: args.inputDir,
    outputDir: args.outputDir,
    dryRun: !!isDryRun(),
    modelType: args.modelType,
    converted: [],
    tsx: [],
    glbOptimized: [],
    skipped: [],
    errors: [],
  });
}

function commonParent(paths: string[]): string {
  if (paths.length === 0) return process.cwd();
  if (paths.length === 1) return path.dirname(paths[0]!);
  const parts = paths.map((p) => path.resolve(p).split(path.sep));
  const shortest = Math.min(...parts.map((p) => p.length));
  const out: string[] = [];
  for (let i = 0; i < shortest; i++) {
    const candidate = parts[0]![i]!;
    if (parts.every((p) => p[i] === candidate)) out.push(candidate);
    else break;
  }
  return out.length ? out.join(path.sep) || path.sep : process.cwd();
}

program
  .command("bulk")
  .summary("Convert every 3D model in a directory (or matching a glob)")
  .description(
    `Convert every supported 3D model (GLTF, FBX, OBJ) found in a directory to .glb.

You can pass a directory, or a glob pattern like "./models/**/*.fbx".
When a glob is used the file list is taken from the matches (no -r needed)
and -m defaults to ALL.

Output is written to <inputDir>/_convert-3d-for-web/ unless -o is passed.
Use --flat or --glb-dir / --tsx-dir / --optimized-dir to change the layout.

When run non-interactively (-y / piped stdin), -m is required (directory mode)
and prompts default to: --tsx, --optimize.`,
  )
  .argument("[input]", "Directory containing source models, or a glob pattern (alternative to -i)")
  .option("-i, --inputDir <path>", "Directory or glob pattern")
  .option(
    "-o, --outputDir <path>",
    "Where to write outputs (default: <inputDir>/_convert-3d-for-web)",
  )
  .option("-m, --modelType <type>", "Which format to convert: GLTF | FBX | OBJ | ALL")
  .option("-r, --recursive", "Recurse into subdirectories")
  .addHelpText(
    "after",
    `
Examples:
  $ conv3d bulk ./models
  $ conv3d bulk ./models -r -m FBX --tsx --optimize -y
  $ conv3d bulk "./assets/**/*.fbx" -o ./public/models --tsx --optimize -y
  $ conv3d bulk ./models --flat -o ./public/models --tsx --optimize -y
  $ conv3d bulk ./models -m ALL --tsx --optimize --dry-run --json`,
  )
  .action(async (positional: string | undefined, subOptions: SubOptionsBulkCommand) => {
    try {
      const rawInput = subOptions.inputDir ?? positional;
      if (!rawInput) {
        err(red("🚨 Please specify an input directory or glob (positionally or with -i)"));
        exit(1);
      }

      // Glob mode when the input contains glob metacharacters.
      let files: string[] = [];
      let inputDir: string;
      if (looksLikeGlob(rawInput)) {
        const matches = (
          await fg(rawInput, {
            onlyFiles: true,
            dot: false,
            absolute: true,
          })
        ).map((p) => path.resolve(p));

        if (matches.length === 0) {
          warn(yellow(`⚠️ Glob matched no files: ${rawInput}`));
          emitEmptyBulkResult({ inputDir: process.cwd(), outputDir: null, modelType: null });
          exit(0);
        }

        inputDir = commonParent(matches);
        files = matches.map((m) => path.relative(inputDir, m));
        // ALL is the natural default for glob input.
        if (!subOptions.modelType) subOptions.modelType = "ALL";
      } else {
        inputDir = path.resolve(rawInput);
        if (!(await isDirectory(inputDir))) {
          err(red("🚨 Invalid input directory: " + inputDir));
          exit(1);
        }
        files = await readdir(inputDir, { recursive: subOptions.recursive });
      }

      subOptions.inputDir = inputDir;
      const outputDirBase = subOptions.outputDir || path.resolve(inputDir, outDirPrefix);
      subOptions.outputDir = path.resolve(outputDirBase);

      const formatMaps = Object.fromEntries(
        await Promise.all(
          SOURCE_FORMATS.map(
            async (fmt) => [fmt, { files: await collectFiles(files, { modelType: fmt }) }] as const,
          ),
        ),
      ) as Record<(typeof SOURCE_FORMATS)[number], { files: string[] }>;
      const formats = Object.entries(formatMaps);

      const numGLTF = formatMaps.GLTF.files.length;
      const numFBX = formatMaps.FBX.files.length;
      const numOBJ = formatMaps.OBJ.files.length;
      const numAll = numGLTF + numFBX + numOBJ;

      if (numAll === 0) {
        warn(yellow(`⚠️ No suitable models found in ${inputDir}`));
        emitEmptyBulkResult({
          inputDir,
          outputDir: subOptions.outputDir,
          modelType: null,
        });
        exit(0);
      }

      info("🚀 Starting conversion process...");

      const normalizedModelType = subOptions.modelType?.toUpperCase().replace(".", "");
      subOptions.modelType =
        normalizedModelType || (await promptForModelType({ numGLTF, numFBX, numOBJ, numAll }));

      await resolveOutputChoices();

      if (
        !Object.keys(converters).includes(subOptions.modelType!) &&
        subOptions.modelType !== "ALL"
      ) {
        err(red("🚨 Invalid model type: " + subOptions.modelType));
        exit(1);
      }

      const options: OptionsBulkCommand = { ...globalOptions, ...subOptions };

      const shouldConvert = (modelType: string) =>
        options.modelType === modelType || options.modelType === "ALL";

      const numExpected = formats.reduce(
        (n, [key, { files }]) => (shouldConvert(key) ? n + files.length : n),
        0,
      );

      if (numExpected === 0) {
        warn(yellow(`⚠️ No ${options.modelType} models found in ${inputDir}`));
        emitEmptyBulkResult({
          inputDir,
          outputDir: subOptions.outputDir,
          modelType: options.modelType ?? null,
        });
        exit(0);
      }

      const dirs = resolveOutputDirs(subOptions.outputDir!);
      await setupOutputDirs(dirs, globalOptions, numExpected);

      const result = {
        command: "bulk" as const,
        ok: true,
        inputDir,
        outputDir: subOptions.outputDir!,
        dryRun: !!isDryRun(),
        modelType: options.modelType,
        converted: [] as string[],
        tsx: [] as string[],
        glbOptimized: [] as string[],
        skipped: [] as string[],
        errors: [] as { file: string; message: string }[],
      };

      const allConverted: string[] = [];
      info("ℹ️ Generating .glb files...");
      for (const [key, { files }] of formats) {
        if (shouldConvert(key)) {
          const r = await convertModels(key as InputFormats, files, inputDir, dirs);
          const done = isDryRun() ? r.planned : r.converted;
          allConverted.push(...done);
          result.converted.push(...done);
          result.skipped.push(...r.skipped);
          result.errors.push(...r.errors);
        }
      }

      await runGlbStep(allConverted, inputDir, dirs, result, { plural: true });

      const inputDirDisplay = inputDir.replace(home, "~");
      const outputDirDisplay = subOptions.outputDir!.replace(home, "~");
      info(
        green(
          `✅ ${
            isDryRun() ? "[dry-run] Would convert" : "Successfully converted"
          } ${result.converted.length}/${numExpected} models from "${inputDirDisplay}"`,
        ),
      );
      info(`ℹ️ Output ${isDryRun() ? "would be saved" : "saved"} to "${outputDirDisplay}"`);

      result.ok = result.errors.length === 0;
      emitJsonIfRequested(result);

      if (result.errors.length > 0) exit(2);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      emitJsonIfRequested({ command: "bulk", ok: false, error: errorMsg });
      err(red("🚨 Conversion process failed!"));
      err(red("🚨 " + errorMsg));
      exit(1);
    }
  });

// Helpers shared by the `single` and `bulk` command handlers.

import { convertModels } from "../converters.js";
import { info } from "../log.js";
import type { OutputDirs } from "../outputDirs.js";
import { globalOptions, isDryRun } from "../program.js";
import { promptForOptimizedGlbOutput, promptForTsxOutput } from "../prompts.js";

// Fill in the tsx / optimize choices from interactive prompts when they were
// not already set via --tsx / --optimize flags. Mutates globalOptions in place
// (both commands read from it downstream).
export async function resolveOutputChoices(): Promise<void> {
  if (globalOptions.tsx === undefined) globalOptions.tsx = await promptForTsxOutput();
  if (globalOptions.optimize === undefined) {
    globalOptions.optimize = await promptForOptimizedGlbOutput();
  }
}

type GlbStepTarget = {
  tsx: string[];
  glbOptimized: string[];
  skipped: string[];
  errors: { file: string; message: string }[];
};

// Run the gltfjsx step (.tsx components and/or optimized .glb) over the
// already-converted .glb files and merge the outcome into `result`. `plural`
// selects the progress-label wording ("file" for single, "files" for bulk) so
// each command keeps its exact original message.
export async function runGlbStep(
  convertedGlbs: string[],
  inputDir: string,
  dirs: OutputDirs,
  result: GlbStepTarget,
  { plural }: { plural: boolean },
): Promise<void> {
  if (!globalOptions.tsx && !globalOptions.optimize) {
    info("ℹ️ Skipped .tsx and optimization steps, like instructed 🫡");
    return;
  }

  const tsxLabel = plural ? ".tsx files" : ".tsx file";
  const optLabel = plural ? "optimized .glb files" : "optimized .glb";
  const label =
    globalOptions.tsx && globalOptions.optimize
      ? `${tsxLabel} and ${optLabel}`
      : globalOptions.tsx
        ? tsxLabel
        : optLabel;
  info(`ℹ️ Generating ${label}...`);

  const glbResult = await convertModels("GLB", convertedGlbs, inputDir, dirs);
  result.tsx = isDryRun() ? glbResult.planned : glbResult.converted;
  result.glbOptimized = isDryRun() ? glbResult.plannedGlbOptimized : glbResult.glbOptimized;
  result.skipped.push(...glbResult.skipped);
  result.errors.push(...glbResult.errors);
}

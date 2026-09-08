import path from "node:path";
import { type GlobalOptions, program } from "./program.js";

export type OutputDirs = {
  base: string;
  glb: string;
  tsx: string;
  optimized: string;
};

// Default subdirectory names under the output base. Override per-key via
// --glb-dir / --tsx-dir / --optimized-dir.
const DEFAULT_GLB_SUBDIR = "glb";
const DEFAULT_TSX_SUBDIR = "tsx";
const DEFAULT_OPTIMIZED_SUBDIR = "glb-for-web";

export function resolveOutputDirs(outputDirBase: string): OutputDirs {
  const opts = program.opts() as GlobalOptions;
  const base = outputDirBase;

  if (opts.flat) {
    return { base, glb: base, tsx: base, optimized: base };
  }

  return {
    base,
    glb: opts.glbDir ? path.resolve(opts.glbDir) : path.resolve(base, DEFAULT_GLB_SUBDIR),
    tsx: opts.tsxDir ? path.resolve(opts.tsxDir) : path.resolve(base, DEFAULT_TSX_SUBDIR),
    optimized: opts.optimizedDir
      ? path.resolve(opts.optimizedDir)
      : path.resolve(base, DEFAULT_OPTIMIZED_SUBDIR),
  };
}

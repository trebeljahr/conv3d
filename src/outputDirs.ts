import path from "node:path";
import { program } from "./program.js";

export type OutputDirs = {
  base: string;
  glb: string;
  tsx: string;
  optimized: string;
};

export function resolveOutputDirs(outputDirBase: string): OutputDirs {
  const opts = program.opts() as {
    flat?: boolean;
    glbDir?: string;
    tsxDir?: string;
    optimizedDir?: string;
  };

  const base = outputDirBase;

  if (opts.flat) {
    return { base, glb: base, tsx: base, optimized: base };
  }

  return {
    base,
    glb: opts.glbDir ? path.resolve(opts.glbDir) : path.resolve(base, "glb"),
    tsx: opts.tsxDir ? path.resolve(opts.tsxDir) : path.resolve(base, "tsx"),
    optimized: opts.optimizedDir
      ? path.resolve(opts.optimizedDir)
      : path.resolve(base, "glb-for-web"),
  };
}

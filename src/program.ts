import { Command } from "commander";

const program = new Command();

program
  .version("1.0.0")
  .description(
    "An interactive CLI tool for converting 3D models to glTF/GLB and generating React components"
  )
  .option("--tsx", "Create .tsx files")
  .option("--no-tsx", "Don't create .tsx files")
  .option("--no-optimize", "Don't create optimized output GLB files");

let globalOptions: GlobalOptions = program.opts();

export type GlobalOptions = {
  tsx: boolean | undefined;
  optimize: boolean;
};

export { program, globalOptions };

import { Command } from "commander";

const program = new Command();

program
  .version("1.0.0")
  .description(
    "An interactive CLI tool for converting 3D models to glTF/GLB and generating React components"
  );

let globalOptions = program.opts();

export { program, globalOptions };

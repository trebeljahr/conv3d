import { Command } from "commander";
import { readFileSync } from "fs";

const program = new Command();

//Reach the package.json file
export function getPackageJson() {
  const path = `${process.cwd()}/package.json`;
  const packageData = JSON.parse(readFileSync(path, "utf8"));
  return packageData;
}
const { name, version, description } = getPackageJson();

program
  .name(name)
  .version(version)
  .description(description)
  .option("--tsx", "Create .tsx files. Per default it will ask for user input.")
  .option("--no-tsx", "Don't create .tsx files")
  .option("--no-optimize", "Don't create optimized output GLB files")
  .usage("[command] [options]");

let globalOptions: GlobalOptions = program.opts();

export type GlobalOptions = {
  tsx: boolean | undefined;
  optimize: boolean;
};

export { program, globalOptions };

import { Command } from "commander";
import { readFileSync } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { readPackageUpSync } from "read-package-up";

const program = new Command();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageData = readPackageUpSync({ cwd: __dirname, normalize: false });
if (!packageData) {
  throw new Error("No package.json found");
}

const { name, version, description } = packageData.packageJson;

if (!name || !version || !description) {
  throw new Error("Missing name, version or description in package.json");
}

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

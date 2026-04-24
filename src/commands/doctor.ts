import { readFileSync } from "fs";
import path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";
import { readPackageUpSync } from "read-package-up";
import { isJson } from "../log.js";
import { program } from "../program.js";

const { green, yellow, gray } = chalk;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type DependencyReport = {
  name: string;
  declared: string;
  installed: string | null;
};

const TRACKED_DEPS = [
  "obj2gltf",
  "gltf-pipeline",
  "fbx2gltf",
  "gltfjsx",
  "commander",
  "inquirer",
  "fast-glob",
];

function readInstalledVersion(name: string, fromDir: string): string | null {
  let dir = fromDir;
  // Walk up looking for a node_modules/<name>/package.json — handles both
  // the local dev case and the globally-installed case.
  for (let i = 0; i < 10; i++) {
    const candidate = path.resolve(dir, "node_modules", name, "package.json");
    try {
      const pkg = JSON.parse(readFileSync(candidate, "utf8"));
      if (typeof pkg.version === "string") return pkg.version;
    } catch {
      // not here, keep walking
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

program
  .command("doctor")
  .summary("Print environment + dependency diagnostics")
  .description(
    `Show the versions of conv3d, Node, the platform, and the bundled 3D
conversion libraries. Useful when filing bug reports or when an agent
needs to know whether the install is healthy.`,
  )
  .addHelpText(
    "after",
    `
Examples:
  $ conv3d doctor
  $ conv3d doctor --json`,
  )
  .action(async () => {
    const pkg = readPackageUpSync({ cwd: __dirname, normalize: false });
    const conv3dVersion = pkg?.packageJson.version ?? "unknown";
    const conv3dRoot = pkg?.path ? path.dirname(pkg.path) : __dirname;

    const declared: Record<string, string> = {
      ...((pkg?.packageJson.dependencies as Record<string, string>) ?? {}),
    };

    const deps: DependencyReport[] = TRACKED_DEPS.map((name) => ({
      name,
      declared: declared[name] ?? "(not declared)",
      installed: readInstalledVersion(name, conv3dRoot),
    }));

    const report = {
      conv3d: conv3dVersion,
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      cwd: process.cwd(),
      installRoot: conv3dRoot,
      dependencies: deps,
    };

    if (isJson()) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      return;
    }

    console.log(`conv3d  ${green(report.conv3d)}`);
    console.log(`node    ${green(report.node)}`);
    console.log(`platform ${gray(report.platform)}`);
    console.log(`cwd     ${gray(report.cwd)}`);
    console.log(`install ${gray(report.installRoot)}`);
    console.log("");
    console.log("dependencies:");
    for (const d of deps) {
      const installed = d.installed ?? yellow("not found");
      console.log(`  ${d.name.padEnd(16)} declared ${gray(d.declared)}  installed ${installed}`);
    }
  });

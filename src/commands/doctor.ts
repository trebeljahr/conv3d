import { readFileSync } from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { readPackageUpSync } from "read-package-up";
import { isJson } from "../log.js";
import { isDryRun, program } from "../program.js";

const { green, yellow, gray } = chalk;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type DependencyReport = {
  name: string;
  declared: string;
  installed: string | null;
};

type DoctorReport = {
  command: "doctor";
  ok: true;
  conv3d: string;
  node: string;
  platform: string;
  cwd: string;
  installRoot: string;
  dryRun: boolean;
  dependencies: DependencyReport[];
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

function formatMarkdownReport(report: DoctorReport): string {
  const lines = [
    "```text",
    "conv3d doctor",
    `conv3d: ${report.conv3d}`,
    `node: ${report.node}`,
    `os/arch: ${report.platform}`,
    "",
    "bundled libraries:",
  ];

  for (const d of report.dependencies) {
    const status = d.installed ? `installed ${d.installed}` : "not found";
    lines.push(`- ${d.name}: declared ${d.declared}; ${status}`);
  }

  lines.push("```");
  return `${lines.join("\n")}\n`;
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
  $ conv3d doctor --json
  $ conv3d doctor --markdown`,
  )
  .option("--markdown", "Emit a fenced text block suitable for pasting into GitHub issues.")
  .action(async (opts: { markdown?: boolean }) => {
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

    const report: DoctorReport = {
      command: "doctor",
      ok: true,
      conv3d: conv3dVersion,
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      cwd: process.cwd(),
      installRoot: conv3dRoot,
      dryRun: !!isDryRun(),
      dependencies: deps,
    };

    if (isJson()) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      return;
    }

    if (opts.markdown) {
      process.stdout.write(formatMarkdownReport(report));
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

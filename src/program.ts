import { cpus } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, Option } from "commander";
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

export function preprocessArgv(argv: string[]): {
  argv: string[];
  deprecatedForceOverwrite: boolean;
} {
  let deprecated = false;
  const next = argv.map((a) => {
    if (a === "--forceOverwrite") {
      deprecated = true;
      return "--force-overwrite";
    }
    return a;
  });
  return { argv: next, deprecatedForceOverwrite: deprecated };
}

export type OverwriteMode = "skip" | "replace" | "ask";

program
  .name(name)
  .version(version)
  .description(
    `${description}

Workflow:
  1. Pick a command: bulk (directory / glob), single (one file), tsx-gen (existing .glb → .tsx), doctor (env info).
  2. Point it at your input — pass a path or glob positionally, or use -i.
  3. Optionally pass --tsx / --optimize to skip interactive prompts.
  4. Pass -y / --yes for fully non-interactive use (safe for scripts and AI agents).
  5. Pass --dry-run to preview what would be written without touching disk.
  6. Pass --json for machine-readable output (implies --quiet).

Output layout (written under <inputDir>/_convert-3d-for-web/ by default):
  glb/          converted .glb files
  tsx/          generated React components (when --tsx)
  glb-for-web/  optimized .glb files (when --optimize)
Override with --flat or --glb-dir / --tsx-dir / --optimized-dir.`,
  )
  .option("--tsx", "Create .tsx React components (otherwise prompts)")
  .option("--no-tsx", "Do not create .tsx files (skips the prompt)")
  .option("--optimize", "Produce web-optimized .glb files via gltfjsx (otherwise prompts)")
  .option("--no-optimize", "Skip the optimized .glb output (skips the prompt)")
  .option(
    "-f, --force-overwrite",
    "Shortcut for --overwrite=replace. Overwrite existing output without asking.",
  )
  .addOption(
    new Option("--overwrite <mode>", "What to do when an output file already exists").choices([
      "skip",
      "replace",
      "ask",
    ]),
  )
  .option(
    "-y, --yes",
    "Run non-interactively: accept all confirmations and skip prompts. Use in scripts, CI, and for AI agents.",
  )
  .option(
    "--non-interactive",
    "Alias for --yes. Also inferred automatically when stdin is not a TTY.",
  )
  .option(
    "--dry-run",
    "Print what would be written without creating or modifying any files. Exit 0 on success.",
  )
  .option(
    "--json",
    "Emit a single JSON result object on stdout. Implies --quiet. Errors still go to stderr as human text.",
  )
  .option("-q, --quiet", "Suppress progress output. Errors are still written to stderr.")
  .option(
    "--flat",
    "Write every output file directly into outputDir (no glb/, tsx/, glb-for-web/ subdirectories).",
  )
  .option("--glb-dir <path>", "Override where converted .glb files are written")
  .option("--tsx-dir <path>", "Override where generated .tsx files are written")
  .option("--optimized-dir <path>", "Override where optimized (web) .glb files are written")
  .option(
    "-c, --concurrency <n>",
    "Number of files to convert in parallel. Defaults to min(cpus, 4); set to 1 for fully sequential.",
    (v) => {
      const n = Number.parseInt(v, 10);
      if (!Number.isFinite(n) || n < 1) {
        throw new Error(`--concurrency must be a positive integer (got "${v}")`);
      }
      return n;
    },
  )
  .option(
    "--resolution <n>",
    "Max texture resolution for --optimize. Default is 1024 (normal maps get max(n, 2048)).",
    (v) => {
      const n = Number.parseInt(v, 10);
      if (!Number.isFinite(n) || n < 1) {
        throw new Error(`--resolution must be a positive integer (got "${v}")`);
      }
      return n;
    },
  )
  .option(
    "--keep-materials",
    "Preserve original materials during --optimize. Skips the palette step that merges untextured materials into a tiny palette texture.",
  )
  .usage("[command] [options]");

program.addHelpText(
  "after",
  `
Examples:
  $ conv3d single ./model.fbx --tsx --optimize -y
  $ conv3d bulk ./models/ --recursive -m FBX --tsx --optimize -y
  $ conv3d bulk "./assets/**/*.fbx" -o ./public/models --tsx --optimize -y
  $ conv3d tsx-gen ./models/ --recursive -y
  $ conv3d bulk ./models/ --flat -o ./public/models --tsx --optimize -y
  $ conv3d doctor --json

Running for AI agents / scripts:
  - Pass -y (or --yes) to disable every interactive prompt.
  - Pass --json for a machine-readable result object on stdout.
  - Pass --dry-run to preview the plan without touching the filesystem.
  - Exit codes: 0 = success, 1 = fatal error, 2 = completed with per-file errors.

Run 'conv3d <command> --help' for per-command options and examples.`,
);

const globalOptions: GlobalOptions = program.opts();

export type GlobalOptions = {
  tsx: boolean | undefined;
  optimize: boolean;
  forceOverwrite: boolean;
  overwrite?: OverwriteMode;
  yes: boolean | undefined;
  nonInteractive: boolean | undefined;
  dryRun: boolean | undefined;
  json: boolean | undefined;
  quiet: boolean | undefined;
  flat?: boolean;
  glbDir?: string;
  tsxDir?: string;
  optimizedDir?: string;
  concurrency?: number;
  resolution?: number;
  keepMaterials?: boolean;
};

export function isNonInteractive(): boolean {
  const opts = program.opts() as GlobalOptions;
  if (opts.yes || opts.nonInteractive) return true;
  if (!process.stdin.isTTY) return true;
  return false;
}

export function isDryRun(): boolean {
  return !!(program.opts() as GlobalOptions).dryRun;
}

export function resolveOverwriteMode(): OverwriteMode {
  const opts = program.opts() as GlobalOptions;
  if (opts.overwrite) return opts.overwrite;
  // TODO(v2): remove --force-overwrite alias; use --overwrite=replace instead.
  if (opts.forceOverwrite) return "replace";
  if (isNonInteractive()) return "skip";
  return "ask";
}

export function resolveConcurrency(): number {
  const opts = program.opts() as GlobalOptions;
  if (opts.concurrency && opts.concurrency > 0) return opts.concurrency;
  // When a user still needs to answer overwrite prompts, serialize so prompts
  // don't interleave. Same if files genuinely need confirmation.
  if (resolveOverwriteMode() === "ask") return 1;
  const available = Math.max(1, cpus().length);
  return Math.min(available, 4);
}

export { globalOptions, program };

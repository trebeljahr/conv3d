#!/usr/bin/env node
import chalk from "chalk";
import { preprocessArgv, program } from "./program.js";

import "./commands/bulk.js";
import "./commands/single.js";
import "./commands/tsxGen.js";
import "./commands/doctor.js";

const { red, yellow } = chalk;

const { argv: normalizedArgv, deprecatedForceOverwrite } = preprocessArgv(process.argv);

function shouldShowBanner(args: string[]): boolean {
  if (!process.stdout.isTTY) return false;
  if (args.length === 0) return true;
  const suppressFlags = ["-h", "--help", "-V", "--version", "--json", "-q", "--quiet"];
  if (args.some((a) => suppressFlags.includes(a))) return false;
  return true;
}

async function maybeShowBanner(args: string[]) {
  if (!shouldShowBanner(args)) return;
  // figlet and lolcatjs are optionalDependencies. If they failed to install
  // on this platform, just skip the banner silently.
  try {
    const [{ default: figlet }, lol] = await Promise.all([import("figlet"), import("lolcatjs")]);
    const asciiBanner = figlet.textSync("conv3D", {
      horizontalLayout: "full",
      font: "Colossal",
      width: process.stdout.columns,
      whitespaceBreak: true,
    });
    lol.fromString(asciiBanner);
  } catch {
    // banner deps unavailable — no-op
  }
}

await maybeShowBanner(normalizedArgv.slice(2));

if (deprecatedForceOverwrite) {
  // TODO(v2.0.0): remove the camelCase --forceOverwrite alias.
  console.error(yellow("⚠️ --forceOverwrite is deprecated; use --force-overwrite (or -f) instead."));
}

process.on("SIGINT", () => {
  console.error(red("\n🚨 Received SIGINT. Exiting program..."));
  process.exit(0);
});

program.parse(normalizedArgv);

if (!normalizedArgv.slice(2).length) {
  program.outputHelp();
}

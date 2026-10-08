import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Keeps README.md in sync with the flags and commands registered via
// Commander. Imports the command modules directly (not dist/conv3d.js) so the
// CLI entry point never parses argv.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, "..", "dist");
const { program } = await import(path.join(DIST, "program.js"));
for (const mod of ["init", "single", "bulk", "tsxGen", "doctor"]) {
  await import(path.join(DIST, "commands", `${mod}.js`));
}

const README = readFileSync(path.resolve(__dirname, "..", "README.md"), "utf8");

function mentions(text) {
  // Token boundary so "--tsx" is not satisfied by "--tsx-dir".
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}(?![\\w-])`).test(README);
}

test("README documents every registered command", () => {
  const names = program.commands.map((c) => c.name());
  assert.deepEqual(names.sort(), ["bulk", "doctor", "init", "single", "tsx-gen"]);
  const missing = names.filter((n) => !mentions(`conv3d ${n}`));
  assert.deepEqual(missing, [], `README is missing commands: ${missing.join(", ")}`);
});

test("README documents every global and per-command long flag", () => {
  const owners = [["global", program], ...program.commands.map((c) => [c.name(), c])];
  const missing = [];
  for (const [owner, cmd] of owners) {
    for (const opt of cmd.options) {
      if (opt.long && !mentions(opt.long)) missing.push(`${owner}: ${opt.long}`);
    }
  }
  assert.deepEqual(missing, [], `README is missing flags:\n  ${missing.join("\n  ")}`);
});

test("README documents the built-in --help and --version flags", () => {
  assert.ok(mentions("--help"));
  assert.ok(mentions("--version"));
});

#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cli = path.resolve(root, "dist", "conv3d.js");
const docsPath = path.resolve(root, "docs", "content", "docs", "agents.mdx");
const commands = ["single", "bulk", "tsx-gen", "doctor"];

function stripJsonComments(jsonc) {
  return jsonc
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/([^:])\/\/.*$/gm, "$1")
    .replace(/,\s*([}\]])/g, "$1");
}

async function readDocumentedSchemas() {
  const docs = await readFile(docsPath, "utf8");
  const schemas = new Map();
  const blockPattern = /```jsonc audit-schema:([a-z-]+)\n([\s\S]*?)```/g;

  for (const match of docs.matchAll(blockPattern)) {
    const [, command, jsonc] = match;
    schemas.set(command, JSON.parse(stripJsonComments(jsonc)));
  }

  const missing = commands.filter((command) => !schemas.has(command));
  if (missing.length > 0) {
    throw new Error(`Missing documented audit schema block(s): ${missing.join(", ")}`);
  }

  return schemas;
}

function sortedKeys(value) {
  return Object.keys(value).sort();
}

function diffKeys(actual, expected) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  return {
    missing: expected.filter((key) => !actualSet.has(key)),
    extra: actual.filter((key) => !expectedSet.has(key)),
  };
}

function assertSameKeys(command, actual, expected, label = command) {
  const actualKeys = sortedKeys(actual);
  const expectedKeys = sortedKeys(expected);
  const { missing, extra } = diffKeys(actualKeys, expectedKeys);

  if (missing.length > 0 || extra.length > 0) {
    const parts = [`${label} schema drift`];
    if (missing.length > 0) parts.push(`missing: ${missing.join(", ")}`);
    if (extra.length > 0) parts.push(`extra: ${extra.join(", ")}`);
    throw new Error(parts.join("; "));
  }
}

function run(command, args, cwd) {
  const result = spawnSync("node", [cli, command, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error(
      `${command} exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${command} did not emit valid JSON: ${error.message}\n${result.stdout}`);
  }
}

function makeFixtures() {
  const dir = mkdtempSync(path.join(tmpdir(), "conv3d-schema-audit-"));
  writeFileSync(path.join(dir, "triangle.obj"), "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");
  writeFileSync(path.join(dir, "triangle.glb"), "");
  return dir;
}

function commandArgs(command, fixturesDir) {
  const common = ["--yes", "--json", "--dry-run"];

  switch (command) {
    case "single":
      return [path.join(fixturesDir, "triangle.obj"), ...common];
    case "bulk":
      return [fixturesDir, "-m", "ALL", ...common];
    case "tsx-gen":
      return [fixturesDir, ...common];
    case "doctor":
      return common;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function checkNestedKeys(command, actual, expected) {
  if (command === "doctor") {
    assertSameKeys(
      command,
      actual.dependencies[0] ?? {},
      expected.dependencies[0] ?? {},
      "doctor dependencies[]",
    );
  }
}

const documentedSchemas = await readDocumentedSchemas();
const fixturesDir = makeFixtures();

try {
  for (const command of commands) {
    const actual = run(command, commandArgs(command, fixturesDir), root);
    const expected = documentedSchemas.get(command);
    assertSameKeys(command, actual, expected);
    checkNestedKeys(command, actual, expected);
    console.log(`${command} OK`);
  }
} finally {
  rmSync(fixturesDir, { recursive: true, force: true });
}

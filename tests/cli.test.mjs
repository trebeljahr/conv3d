import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, "..", "dist", "conv3d.js");

function run(args, opts = {}) {
  return spawnSync("node", [CLI, ...args], {
    encoding: "utf8",
    // stdin piped (not a TTY) triggers non-interactive mode inference.
    stdio: ["pipe", "pipe", "pipe"],
    ...opts,
  });
}

function makeTmp(prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), `conv3d-test-${prefix}-`));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// A minimal-but-valid OBJ file (triangle).
const OBJ_BODY = ["v 0 0 0", "v 1 0 0", "v 0 1 0", "f 1 2 3", ""].join("\n");

test("--help exits 0 and mentions core commands", () => {
  const r = run(["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /conv3d/);
  assert.match(r.stdout, /single/);
  assert.match(r.stdout, /bulk/);
  assert.match(r.stdout, /tsx-gen/);
  assert.match(r.stdout, /doctor/);
});

test("--version exits 0 and prints a version-ish string", () => {
  const r = run(["--version"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+/);
});

test("doctor --json emits valid JSON with expected fields", () => {
  const r = run(["doctor", "--json"]);
  assert.equal(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.equal(typeof parsed.conv3d, "string");
  assert.equal(typeof parsed.node, "string");
  assert.ok(Array.isArray(parsed.dependencies));
  assert.ok(parsed.dependencies.length > 0);
});

test("bulk on empty dir exits 0 with empty JSON result", () => {
  const { dir, cleanup } = makeTmp("empty");
  try {
    const r = run(["bulk", dir, "-m", "ALL", "--no-tsx", "--no-optimize", "-y", "--json"]);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.command, "bulk");
    assert.deepEqual(parsed.converted, []);
    assert.deepEqual(parsed.errors, []);
  } finally {
    cleanup();
  }
});

test("bulk on missing dir exits 1", () => {
  const r = run([
    "bulk",
    "/does/not/exist/hopefully",
    "-m",
    "ALL",
    "--no-tsx",
    "--no-optimize",
    "-y",
    "--json",
  ]);
  assert.equal(r.status, 1);
});

test("single --dry-run --json plans the output without writing", () => {
  const { dir, cleanup } = makeTmp("single-dry");
  try {
    const objPath = path.join(dir, "cube.obj");
    writeFileSync(objPath, OBJ_BODY);
    const r = run(["single", objPath, "--no-tsx", "--no-optimize", "-y", "--dry-run", "--json"]);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.command, "single");
    assert.equal(parsed.dryRun, true);
    assert.equal(parsed.modelType, "OBJ");
    assert.equal(parsed.converted.length, 1);
    assert.match(parsed.converted[0], /cube\.glb$/);
  } finally {
    cleanup();
  }
});

test("bulk with glob expands matches and defaults modelType to ALL", () => {
  const { dir, cleanup } = makeTmp("glob");
  try {
    mkdirSync(path.join(dir, "sub"));
    writeFileSync(path.join(dir, "a.obj"), OBJ_BODY);
    writeFileSync(path.join(dir, "sub", "b.obj"), OBJ_BODY);
    const r = run([
      "bulk",
      path.join(dir, "**/*.obj"),
      "--no-tsx",
      "--no-optimize",
      "-y",
      "--dry-run",
      "--json",
    ]);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.modelType, "ALL");
    assert.equal(parsed.converted.length, 2);
  } finally {
    cleanup();
  }
});

test("bulk --flat writes outputs directly into outputDir (dry-run)", () => {
  const { dir, cleanup } = makeTmp("flat");
  try {
    writeFileSync(path.join(dir, "a.obj"), OBJ_BODY);
    const out = path.join(dir, "out");
    const r = run([
      "bulk",
      dir,
      "-m",
      "OBJ",
      "-o",
      out,
      "--flat",
      "--tsx",
      "--optimize",
      "-y",
      "--dry-run",
      "--json",
    ]);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    for (const p of [...parsed.converted, ...parsed.tsx, ...parsed.glbOptimized]) {
      assert.equal(path.dirname(p), out, `${p} is not directly in ${out}`);
    }
  } finally {
    cleanup();
  }
});

test("deprecated --forceOverwrite still works and prints a warning on stderr", () => {
  const { dir, cleanup } = makeTmp("deprecated");
  try {
    writeFileSync(path.join(dir, "a.obj"), OBJ_BODY);
    const r = run([
      "bulk",
      dir,
      "-m",
      "OBJ",
      "--forceOverwrite",
      "--no-tsx",
      "--no-optimize",
      "-y",
      "--dry-run",
      "--json",
    ]);
    assert.equal(r.status, 0);
    assert.match(r.stderr, /deprecated/i);
    JSON.parse(r.stdout); // stdout is still a clean JSON object
  } finally {
    cleanup();
  }
});

test("invalid --concurrency value exits non-zero", () => {
  const { dir, cleanup } = makeTmp("bad-conc");
  try {
    writeFileSync(path.join(dir, "a.obj"), OBJ_BODY);
    const r = run([
      "bulk",
      dir,
      "-m",
      "OBJ",
      "-c",
      "nonsense",
      "--no-tsx",
      "--no-optimize",
      "-y",
      "--json",
    ]);
    assert.notEqual(r.status, 0);
  } finally {
    cleanup();
  }
});

test("single OBJ actually converts to .glb (live)", () => {
  const { dir, cleanup } = makeTmp("live-single");
  try {
    const objPath = path.join(dir, "cube.obj");
    writeFileSync(objPath, OBJ_BODY);
    const r = run(["single", objPath, "--no-tsx", "--no-optimize", "-y", "--json"]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.errors.length, 0);
    assert.equal(parsed.converted.length, 1);
    // The output must be a real binary GLB (magic = "glTF"), not glTF JSON
    // dressed up with a .glb extension.
    const head = readFileSync(parsed.converted[0]).subarray(0, 4).toString("ascii");
    assert.equal(head, "glTF", `expected GLB magic, got ${JSON.stringify(head)}`);
  } finally {
    cleanup();
  }
});

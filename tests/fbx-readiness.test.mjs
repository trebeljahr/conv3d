import assert from "node:assert/strict";
import { test } from "node:test";
import { explainFbxError, x86Hint } from "../dist/fbxReadiness.js";

test("Apple Silicon without Rosetta gets the Rosetta hint", () => {
  const hint = x86Hint("spawn Unknown system error -86", "darwin", "arm64");
  assert.match(hint, /Rosetta 2/);
  assert.match(hint, /softwareupdate --install-rosetta/);
  assert.match(hint, /troubleshooting#apple-silicon-needs-rosetta-for-fbx$/);
});

test("arm64 Linux loader failures get the x86-64 hint", () => {
  for (const message of [
    "qemu-x86_64: Could not open '/lib64/ld-linux-x86-64.so.2': No such file or directory",
    "spawn /usr/lib/node_modules/conv3d/node_modules/fbx2gltf/bin/Linux/FBX2glTF ENOENT",
  ]) {
    const hint = x86Hint(message, "linux", "arm64");
    assert.match(hint, /x86-64 Linux/, message);
    assert.match(hint, /troubleshooting#linux-arm64-cannot-convert-fbx$/);
  }
});

test("other platforms and other errors get no hint", () => {
  assert.equal(x86Hint("spawn Unknown system error -86", "darwin", "x64"), null);
  assert.equal(x86Hint("ENOENT", "linux", "x64"), null);
  assert.equal(x86Hint("FBX file is corrupt", "darwin", "arm64"), null);
});

test("explainFbxError keeps the original message after the hint", () => {
  const original = new Error("spawn Unknown system error -86");
  const explained = explainFbxError(original);
  if (process.platform === "darwin" && process.arch === "arm64") {
    assert.match(
      explained.message,
      /^FBX conversion needs Rosetta 2.*\(spawn Unknown system error -86\)$/,
    );
  } else {
    assert.equal(explained, original);
  }
});

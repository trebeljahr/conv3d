// FBX conversion runs the bundled FBX2glTF binary, which is x86-64 only.
// On Apple Silicon without Rosetta, and on arm64 Linux, spawning it fails
// with errors that say nothing useful ("spawn Unknown system error -86",
// a qemu loader message, ENOENT). These helpers turn those failures into
// one hint, and let `doctor` say up front whether FBX can run at all.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const TROUBLESHOOTING = "https://conv3d.trebeljahr.com/docs/troubleshooting";

export type FbxReadiness = {
  ready: boolean;
  binary: string | null;
  version: string | null;
  hint: string | null;
};

export function fbxBinaryPath(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const entry = require.resolve("fbx2gltf");
    const ext = os.type() === "Windows_NT" ? ".exe" : "";
    const binary = path.join(path.dirname(entry), "bin", os.type(), `FBX2glTF${ext}`);
    return existsSync(binary) ? binary : null;
  } catch {
    return null;
  }
}

/** The hint for this platform, or null when the failure is not the x86-64 one. */
export function x86Hint(
  message: string,
  platform = process.platform,
  arch = process.arch,
): string | null {
  const badCpu = /Unknown system error -86|Bad CPU type/i.test(message);
  const linuxLoader = /qemu-x86_64|ld-linux-x86-64|ENOENT|ENOEXEC|Exec format error/i.test(message);

  if (platform === "darwin" && arch === "arm64" && badCpu) {
    return `FBX conversion needs Rosetta 2 on Apple Silicon. Run \`softwareupdate --install-rosetta --agree-to-license\`, then retry. See ${TROUBLESHOOTING}#apple-silicon-needs-rosetta-for-fbx`;
  }
  if (platform === "linux" && arch === "arm64" && linuxLoader) {
    return `FBX conversion needs an x86-64 Linux machine or container; arm64 Linux cannot run the bundled FBX2glTF. OBJ and glTF still work. See ${TROUBLESHOOTING}#linux-arm64-cannot-convert-fbx`;
  }
  return null;
}

/** Re-throws an FBX2glTF failure with the platform hint in front, when one applies. */
export function explainFbxError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const hint = x86Hint(message);
  if (!hint) return error instanceof Error ? error : new Error(message);
  return new Error(`${hint} (${message})`);
}

export function checkFbxReadiness(): FbxReadiness {
  const binary = fbxBinaryPath();
  if (!binary) {
    return {
      ready: false,
      binary: null,
      version: null,
      hint: `The bundled FBX2glTF binary is missing for ${os.type()}.`,
    };
  }
  const run = spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 10_000 });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const failure = run.error ? `${run.error.message} ${output}` : run.status === 0 ? null : output;
  if (failure !== null) {
    return { ready: false, binary, version: null, hint: x86Hint(failure) ?? failure.trim() };
  }
  const version = /version\s+(\S+)/i.exec(output)?.[1] ?? null;
  return { ready: true, binary, version, hint: null };
}

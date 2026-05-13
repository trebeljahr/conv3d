#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomInt } from "node:crypto";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MIN_PORT = 3000;
const MAX_PORT = 3999;

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const docsDir = resolve(rootDir, "docs");
const args = process.argv.slice(2);

while (args[0] === "--") {
  args.shift();
}

function hasPortArg(values) {
  return values.some(
    (value) =>
      value === "-p" || value === "--port" || value.startsWith("--port="),
  );
}

function parsePort(value, source) {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${source} must be a valid TCP port, got ${value}`);
  }

  return port;
}

function canListen(port) {
  return new Promise((resolveCanListen) => {
    const server = net.createServer();

    server.unref();
    server.once("error", (error) => {
      resolveCanListen(error.code === "EADDRINUSE" ? false : null);
    });
    server.listen(port, () => {
      server.close(() => resolveCanListen(true));
    });
  });
}

async function pickRandomPort() {
  const tried = new Set();

  while (tried.size < MAX_PORT - MIN_PORT + 1) {
    const port = randomInt(MIN_PORT, MAX_PORT + 1);

    if (tried.has(port)) {
      continue;
    }

    tried.add(port);

    const listenResult = await canListen(port);

    if (listenResult === true) {
      return port;
    }

    if (listenResult === null) {
      return port;
    }
  }

  throw new Error(`No free port found in ${MIN_PORT}-${MAX_PORT}`);
}

let port;

try {
  if (!hasPortArg(args)) {
    port = process.env.PORT
      ? parsePort(process.env.PORT, "PORT")
      : await pickRandomPort();
    args.push("--port", String(port));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (port) {
  console.error(`Starting docs dev server on http://localhost:${port}`);
}

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const child = spawn(command, ["exec", "next", "dev", ...args], {
  cwd: docsDir,
  env: { ...process.env, ...(port ? { PORT: String(port) } : {}) },
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

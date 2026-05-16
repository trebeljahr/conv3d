#!/usr/bin/env node
/*
 * docs-dev — one-command entry point for the docs site.
 *
 * `pnpm dev` from the repo root delegates here. docs/ is not part of a
 * pnpm workspace (the root is a CLI, the docs are a separate Next.js
 * app with its own lockfile), so deps don't get installed by a top-level
 * `pnpm install`. This script auto-installs docs/node_modules the first
 * time, then runs `next dev` — so contributors don't have to remember
 * the two-step setup.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = resolve(repoRoot, 'docs');

function run(cmd, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, {
      cwd: docsDir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('exit', (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      if (code === 0) resolvePromise();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

if (!existsSync(resolve(docsDir, 'node_modules'))) {
  console.log('[docs-dev] installing docs dependencies (first run)…');
  await run('pnpm', ['install']);
}

await run('pnpm', ['dev']);

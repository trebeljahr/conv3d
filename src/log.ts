import type { Ora } from "ora";
import ora from "ora";
import { program } from "./program.js";

type GlobalModeOpts = {
  json?: boolean;
  quiet?: boolean;
};

function opts(): GlobalModeOpts {
  return program.opts() as GlobalModeOpts;
}

export function isJson(): boolean {
  return !!opts().json;
}

export function isQuiet(): boolean {
  return !!opts().quiet || !!opts().json;
}

export function info(...args: unknown[]) {
  if (isQuiet()) return;
  console.info(...(args as [unknown, ...unknown[]]));
}

export function warn(...args: unknown[]) {
  console.warn(...(args as [unknown, ...unknown[]]));
}

export function err(...args: unknown[]) {
  console.error(...(args as [unknown, ...unknown[]]));
}

type SpinnerLike = Pick<Ora, "start" | "stop" | "stopAndPersist"> & {
  text: string;
};

export function createSpinner(text: string): SpinnerLike {
  if (isQuiet()) {
    return {
      text,
      start() {
        return this as unknown as Ora;
      },
      stop() {
        return this as unknown as Ora;
      },
      stopAndPersist() {
        return this as unknown as Ora;
      },
    };
  }
  return ora(text);
}

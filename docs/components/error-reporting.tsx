"use client";

import { useEffect } from "react";
import { startErrorReporting } from "@/lib/error-reporting/reporter";

/** Starts error reporting after mount, in a build with a DSN. See lib/error-reporting/reporter.ts. */
export function ErrorReporting() {
  useEffect(() => {
    void startErrorReporting();
  }, []);
  return null;
}

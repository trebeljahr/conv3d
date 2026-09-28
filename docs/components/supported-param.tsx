"use client";

import { useEffect } from "react";

// ricos.site/donate sends donors back to /?supported=1. Remember when, so a
// future inline ask can stay quiet for 90 days, then drop the param from the URL.
const PARAM = "supported";
const STORAGE_KEY = "donation-supported-at";

export function SupportedParam() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get(PARAM) !== "1") return;

    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // Storage blocked (private mode, disabled site data): nothing to keep.
    }

    url.searchParams.delete(PARAM);
    // null state lets Next.js sync its router with the new URL.
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, []);

  return null;
}

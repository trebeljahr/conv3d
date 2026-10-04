"use client";

import { useEffect } from "react";

/** The site has no editor state. Expired tabs reload the same URL after the retention window. */
export function ReleaseLifetime() {
  useEffect(() => {
    const commit = process.env.NEXT_PUBLIC_BUILD_COMMIT;
    if (!commit || !/^[a-f0-9]{40}$/.test(commit)) return;
    let stopped = false;
    let reloading = false;
    const reload = () => {
      if (reloading) return;
      // A persistent asset/network problem must not create an endless reload loop.
      const key = `conv3d-release-reload:${commit}`;
      try {
        const previous = Number(sessionStorage.getItem(key) || 0);
        if (Date.now() - previous < 60_000) return;
        sessionStorage.setItem(key, String(Date.now()));
      } catch { /* Storage can be disabled; normal navigation still preserves the URL. */ }
      reloading = true;
      window.location.reload();
    };
    const check = async () => {
      try {
        const response = await fetch(`/releases.json?at=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
        if (!response.ok || stopped) return;
        const data = await response.json();
        if (data.schema === 2 && Array.isArray(data.releases) && data.releases.length >= 1 && data.releases.length <= 6 && data.releases.every((id: unknown) => typeof id === "string" && /^[a-f0-9]{40}$/.test(id)) && !data.releases.includes(commit)) reload();
      } catch { /* A transient network failure does not discard an open docs page. */ }
    };
    const resourceError = (event: Event) => {
      const source = event.target;
      if (source instanceof HTMLScriptElement && source.src.includes("/_next/static/")) reload();
    };
    const rejection = (event: PromiseRejectionEvent) => {
      if (event.reason?.name === "ChunkLoadError") reload();
    };
    const focus = () => { void check(); };
    const interval = window.setInterval(check, 60_000);
    window.addEventListener("error", resourceError, true);
    window.addEventListener("unhandledrejection", rejection);
    window.addEventListener("focus", focus);
    void check();
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener("error", resourceError, true);
      window.removeEventListener("unhandledrejection", rejection);
      window.removeEventListener("focus", focus);
    };
  }, []);
  return null;
}

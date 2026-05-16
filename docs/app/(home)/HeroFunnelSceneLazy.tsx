"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const HeroFunnelScene = dynamic(
  () => import("./HeroFunnelScene").then((m) => ({ default: m.HeroFunnelScene })),
  { ssr: false, loading: () => null },
);

// Gate the WebGL hero behind viewport-size + browser-idle so the ~500 KB three.js
// + post-processing chunk never blocks LCP. CSS hides the scene below 720 px;
// matching that here skips the network/parse cost on phones entirely. On larger
// viewports we wait for requestIdleCallback (timeout 2.5 s) before mounting so
// hydration, fonts, and above-the-fold paint settle first.
export function HeroFunnelSceneLazy() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(max-width: 720px)").matches) return;

    const trigger = () => setReady(true);
    const ric = (
      window as typeof window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
        cancelIdleCallback?: (handle: number) => void;
      }
    ).requestIdleCallback;
    const cic = (
      window as typeof window & {
        cancelIdleCallback?: (handle: number) => void;
      }
    ).cancelIdleCallback;

    let handle: number;
    let usedIdle = false;
    if (typeof ric === "function") {
      handle = ric(trigger, { timeout: 2500 });
      usedIdle = true;
    } else {
      handle = window.setTimeout(trigger, 800);
    }

    return () => {
      if (usedIdle && typeof cic === "function") cic(handle);
      else window.clearTimeout(handle);
    };
  }, []);

  if (!ready) return null;
  return <HeroFunnelScene />;
}

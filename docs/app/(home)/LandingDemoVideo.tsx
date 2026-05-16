"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

/**
 * Looping terminal recording of `conv3d` running on a sample pack.
 *
 * - Autoplays muted and inline so iOS Safari permits it.
 * - Honors `prefers-reduced-motion: reduce` by pausing the loop and surfacing
 *   native controls so the viewer can step through it themselves.
 * - WebM is primary; MP4 is the fallback for browsers that don't speak VP9 yet.
 */
export function LandingDemoVideo(): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (reduceMotion) {
      v.pause();
      v.currentTime = 0;
    } else {
      // Re-arm autoplay if the user toggled the OS setting back off.
      v.play().catch(() => {
        /* autoplay blocked — surface controls so they can start it manually */
      });
    }
  }, [reduceMotion]);

  return (
    <video
      ref={videoRef}
      className={styles.demoVideo}
      // Width/height match the rendered recording so the aspect ratio is known
      // before the asset loads — no layout shift, no CLS hit.
      width={960}
      height={540}
      autoPlay={!reduceMotion}
      loop={!reduceMotion}
      muted
      playsInline
      preload="metadata"
      controls={reduceMotion}
      poster="/media/landing-demo-poster.png"
      aria-label="Terminal recording: conv3d doctor reports a healthy install, then conv3d bulk converts 13 FBX files in one command and prints the count via jq"
    >
      <source src="/media/landing-demo.webm" type="video/webm" />
      <source src="/media/landing-demo.mp4" type="video/mp4" />
      {/* Last-ditch fallback for browsers that can't play either codec — the
          animated GIF is a self-contained substitute, no JS or video stack
          required, so we deliberately bypass next/image here. */}
      {/* biome-ignore lint/performance/noImgElement: <video> fallback must be a raw img */}
      <img src="/media/landing-demo.gif" alt="" width={960} height={540} />
    </video>
  );
}

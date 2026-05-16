"use client";

import dynamic from "next/dynamic";
import styles from "./page.module.css";

export const KnightShowcaseSceneLazy = dynamic(
  () => import("./KnightShowcaseScene").then((m) => ({ default: m.KnightShowcaseScene })),
  {
    ssr: false,
    loading: () => (
      <div className={styles.showcaseCanvasFallback} aria-hidden>
        <span className={styles.showcaseCanvasFallbackDot} />
        <span className={styles.showcaseCanvasFallbackLabel}>loading model…</span>
      </div>
    ),
  },
);

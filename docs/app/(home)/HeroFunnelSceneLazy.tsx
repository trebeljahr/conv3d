"use client";

import dynamic from "next/dynamic";

export const HeroFunnelSceneLazy = dynamic(
  () => import("./HeroFunnelScene").then((m) => ({ default: m.HeroFunnelScene })),
  { ssr: false, loading: () => null },
);

import "./global.css";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";

const inter = Inter({ subsets: ["latin"] });
const plausibleDomain =
  process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ??
  process.env.PUBLIC_PLAUSIBLE_DOMAIN ??
  "conv3d.trebeljahr.com";
const plausibleScriptUrl =
  process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL ??
  process.env.PUBLIC_PLAUSIBLE_SCRIPT_URL ??
  "https://plausible.trebeljahr.com/js/script.js";
const shouldLoadPlausible =
  process.env.NODE_ENV === "production" && Boolean(plausibleDomain && plausibleScriptUrl);

export const metadata: Metadata = {
  metadataBase: new URL("https://conv3d.trebeljahr.com"),
  title: {
    default: "conv3d",
    template: "%s · conv3d",
  },
  description:
    "Command-line tool that converts FBX, OBJ, and glTF files into GLB and generates matching React Three Fiber components — interactive or fully scripted.",
  openGraph: {
    type: "website",
    url: "https://conv3d.trebeljahr.com",
    title: "conv3d",
    description:
      "Convert FBX / OBJ / glTF to GLB and generate React Three Fiber components — without a round-trip through Blender.",
    images: ["/img/social-card.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "conv3d",
    description:
      "Convert FBX / OBJ / glTF to GLB and generate React Three Fiber components — without a round-trip through Blender.",
    images: ["/img/social-card.png"],
  },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        {shouldLoadPlausible ? (
          <Script
            src={plausibleScriptUrl}
            data-domain={plausibleDomain}
            strategy="afterInteractive"
          />
        ) : null}
        <RootProvider search={{ enabled: false }}>{children}</RootProvider>
      </body>
    </html>
  );
}

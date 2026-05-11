import "./global.css";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

const inter = Inter({ subsets: ["latin"] });

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
        <RootProvider search={{ enabled: false }}>{children}</RootProvider>
      </body>
    </html>
  );
}

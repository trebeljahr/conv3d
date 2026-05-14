import type { MetadataRoute } from "next";
import { absoluteUrl, lastModifiedForDoc, lastModifiedForFile } from "@/lib/seo";
import { source } from "@/lib/source";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const docs: MetadataRoute.Sitemap = source.generateParams().flatMap(({ slug }) => {
    const page = source.getPage(slug);
    if (!page) return [];

    return [
      {
        url: absoluteUrl(page.url),
        lastModified: lastModifiedForDoc(slug),
        changeFrequency: "weekly",
        priority: page.url === "/docs" ? 0.9 : 0.7,
      },
    ];
  });

  return [
    {
      url: absoluteUrl("/"),
      lastModified: lastModifiedForFile("app/(home)/page.tsx"),
      changeFrequency: "monthly",
      priority: 1,
    },
    ...docs,
  ];
}

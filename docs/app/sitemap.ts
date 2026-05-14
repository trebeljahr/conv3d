import type { MetadataRoute } from "next";
import { source } from "@/lib/source";

const SITE_URL = "https://conv3d.trebeljahr.com";

const absoluteUrl = (pathname: string) => new URL(pathname, SITE_URL).toString();

export default function sitemap(): MetadataRoute.Sitemap {
  const docs: MetadataRoute.Sitemap = source.generateParams().flatMap(({ slug }) => {
    const page = source.getPage(slug);
    if (!page) return [];

    return [
      {
        url: absoluteUrl(page.url),
        changeFrequency: "weekly",
        priority: page.url === "/docs" ? 0.9 : 0.7,
      },
    ];
  });

  return [
    {
      url: absoluteUrl("/"),
      changeFrequency: "monthly",
      priority: 1,
    },
    ...docs,
  ];
}

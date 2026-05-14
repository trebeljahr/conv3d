import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { createRelativeLink } from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMDXComponents } from "@/components/mdx";
import { DEFAULT_SOCIAL_IMAGE, DEFAULT_TWITTER_IMAGE, docDescription } from "@/lib/seo";
import { source } from "@/lib/source";

type PageParams = { slug?: string[] };

export default async function Page(props: { params: Promise<PageParams> }) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: { params: Promise<PageParams> }): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();
  const description = docDescription(page.data.description, page.data.title);

  return {
    title: page.data.title,
    description,
    alternates: {
      canonical: page.url,
    },
    openGraph: {
      type: "article",
      url: page.url,
      title: page.data.title,
      description,
      images: [DEFAULT_SOCIAL_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: page.data.title,
      description,
      images: [DEFAULT_TWITTER_IMAGE],
    },
  };
}

import { DocsBody, DocsDescription, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_SOCIAL_IMAGE, DEFAULT_TWITTER_IMAGE } from "@/lib/seo";

const IMPRINT_EMAIL = "imprint+conv3d@trebeljahr.com";
const DESCRIPTION =
  "Provider information for conv3d and conv3d.trebeljahr.com under § 5 DDG and § 18 (2) MStV.";

export const metadata: Metadata = {
  title: "Imprint",
  description: DESCRIPTION,
  alternates: {
    canonical: "/imprint",
  },
  openGraph: {
    type: "article",
    url: "/imprint",
    title: "Imprint",
    description: DESCRIPTION,
    images: [DEFAULT_SOCIAL_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Imprint",
    description: DESCRIPTION,
    images: [DEFAULT_TWITTER_IMAGE],
  },
};

function Address() {
  return (
    <p>
      Rico Trebeljahr
      <br />
      c/o Block Services
      <br />
      Stuttgarter Str. 106
      <br />
      70736 Fellbach
      <br />
      Germany
    </p>
  );
}

export default function ImprintPage() {
  return (
    <article className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 md:py-16">
      <DocsTitle>Imprint</DocsTitle>
      <DocsDescription>
        Information pursuant to § 5 DDG (German Digital Services Act) and § 18 (2) MStV (Interstate
        Media Treaty).
      </DocsDescription>
      <DocsBody>
        <p>
          See also the <Link href="/docs/privacy">Privacy</Link> page.
        </p>

        <h2>Service Provider</h2>
        <Address />

        <h2>Contact</h2>
        <p>
          Email: <a href={`mailto:${IMPRINT_EMAIL}`}>{IMPRINT_EMAIL}</a>
        </p>

        <h2>Person Responsible for Content (§ 18 (2) MStV)</h2>
        <Address />

        <h2>Liability for Content</h2>
        <p>
          As a service provider, I am responsible for my own content on these pages in accordance
          with § 7 (1) DDG and general laws. However, pursuant to §§ 8 to 10 DDG, I am not obligated
          as a service provider to monitor transmitted or stored third-party information or to
          investigate circumstances that indicate illegal activity.
        </p>
        <p>
          Obligations to remove or block the use of information under general laws remain
          unaffected. However, liability in this regard is only possible from the point in time at
          which a specific legal violation becomes known. Upon becoming aware of such violations, I
          will remove this content immediately.
        </p>

        <h2>Liability for Links</h2>
        <p>
          This site contains links to external websites of third parties over whose content I have
          no influence. Therefore, I cannot assume any liability for these third-party contents. The
          respective provider or operator of the pages is always responsible for the content of the
          linked pages.
        </p>

        <h2>Copyright</h2>
        <p>
          The texts and other content that the site operator created for these pages are subject to
          German copyright law. The source code of the app is published under the MIT licence.
        </p>
      </DocsBody>
    </article>
  );
}

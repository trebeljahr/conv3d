import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";

const config: Config = {
  title: "conv3d",
  tagline:
    "Convert FBX / OBJ / glTF to GLB and generate React Three Fiber components — without a round-trip through Blender.",
  favicon: "img/favicon.ico",

  headTags: [
    {
      tagName: "link",
      attributes: {
        rel: "icon",
        type: "image/svg+xml",
        href: "/img/favicon.svg",
      },
    },
    {
      tagName: "link",
      attributes: {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/img/apple-touch-icon.png",
      },
    },
  ],

  url: "https://conv3d.trebeljahr.com",
  baseUrl: "/",

  organizationName: "trebeljahr",
  projectName: "conv3d",
  trailingSlash: false,

  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          routeBasePath: "/docs",
          editUrl: "https://github.com/trebeljahr/conv3d/edit/main/docs/",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/social-card.png",
    colorMode: {
      defaultMode: "dark",
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "conv3d",
      logo: {
        alt: "conv3d logo",
        src: "img/logo.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Docs",
        },
        {
          to: "/docs/getting-started",
          label: "Get started",
          position: "left",
        },
        {
          href: "https://www.npmjs.com/package/conv3d",
          label: "npm",
          position: "right",
        },
        {
          href: "https://github.com/trebeljahr/conv3d",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Getting Started", to: "/docs/getting-started" },
            { label: "Commands", to: "/docs/commands" },
            { label: "Agents & scripting", to: "/docs/agents" },
          ],
        },
        {
          title: "Project",
          items: [
            { label: "GitHub", href: "https://github.com/trebeljahr/conv3d" },
            { label: "npm", href: "https://www.npmjs.com/package/conv3d" },
            { label: "Issues", href: "https://github.com/trebeljahr/conv3d/issues" },
          ],
        },
      ],
      copyright: `MIT-licensed. Source on <a href="https://github.com/trebeljahr/conv3d">GitHub</a>.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "json", "yaml", "diff"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;

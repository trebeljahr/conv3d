import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: "conv3d",
    },
    links: [
      {
        text: "Docs",
        url: "/docs",
        active: "nested-url",
      },
      {
        text: "Get started",
        url: "/docs/getting-started",
      },
      {
        text: "npm",
        url: "https://www.npmjs.com/package/conv3d",
        external: true,
      },
    ],
    githubUrl: "https://github.com/trebeljahr/conv3d",
  };
}

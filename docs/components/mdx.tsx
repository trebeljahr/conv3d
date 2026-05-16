import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  // Cast — installing @react-three/fiber augments JSX.IntrinsicElements with three.js
  // helpers like `createCanvasElement` typed as `Component<never>`, which trips the strict
  // `NestedMDXComponents` index-signature check. The runtime shape is still valid.
  return {
    ...defaultMdxComponents,
    ...components,
  } as MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}

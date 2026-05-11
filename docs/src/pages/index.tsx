import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import type { ReactNode } from "react";
import styles from "./index.module.css";

type FileRow = { name: string; before: number; after: number };

const heroFiles: FileRow[] = [
  { name: "Knight.fbx", before: 31.2, after: 2.1 },
  { name: "Barbarian.fbx", before: 28.4, after: 1.8 },
  { name: "Wizard.fbx", before: 26.8, after: 1.9 },
  { name: "Archer.fbx", before: 24.1, after: 1.6 },
  { name: "Rogue.fbx", before: 22.6, after: 1.4 },
];

const heroTotal = { before: 286, after: 21, count: 12 };

const HERO_MAX = Math.max(...heroFiles.map((f) => f.before));

const fmt = (mb: number) => (mb >= 100 ? `${mb.toFixed(0)} MB` : `${mb.toFixed(1)} MB`);
const pct = (b: number, a: number) => `${Math.round((1 - a / b) * 100)}%`;

function Hero() {
  return (
    <header className={styles.hero}>
      <div className={styles.heroInner}>
        <h1 className={styles.heroTitle}>
          Game-ready 3D, <span className={styles.heroAccent}>web-ready size</span>.
        </h1>
        <p className={styles.heroTagline}>
          conv3d converts <code className={styles.heroCode}>.fbx</code>,{" "}
          <code className={styles.heroCode}>.obj</code>, and{" "}
          <code className={styles.heroCode}>.glTF</code> into compact{" "}
          <code className={styles.heroCode}>.glb</code> — typically{" "}
          <strong className={styles.heroStrong}>90% smaller</strong> — and writes the React Three
          Fiber component to use them with.
        </p>
        <div className={styles.heroCtas}>
          <Link className={styles.ctaPrimary} to="/docs/getting-started">
            Get started →
          </Link>
          <Link className={styles.ctaSecondary} href="https://github.com/trebeljahr/conv3d">
            View on GitHub
          </Link>
        </div>

        <div className={styles.chart} aria-label="File size comparison: FBX vs optimized GLB">
          <div className={styles.chartHead}>
            <div className={styles.chartHeadLeft}>
              <span className={styles.chartHeadKbd}>./asset-pack/</span>
              <span className={styles.chartHeadSub}>{heroTotal.count} models · one command</span>
            </div>
            <div className={styles.chartLegend}>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.legendBefore}`} /> .fbx
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.legendAfter}`} /> .glb
              </span>
            </div>
          </div>

          <div className={styles.chartBody}>
            {heroFiles.map((f) => (
              <div key={f.name} className={styles.chartRow}>
                <span className={styles.chartFile}>{f.name}</span>
                <div className={styles.chartTrack}>
                  <div
                    className={styles.barBefore}
                    style={{ width: `${(f.before / HERO_MAX) * 100}%` }}
                  />
                  <span className={styles.barLabelBefore}>{fmt(f.before)}</span>
                </div>
                <div className={styles.chartTrack}>
                  <div
                    className={styles.barAfter}
                    style={{ width: `${(f.after / HERO_MAX) * 100}%` }}
                  />
                  <span className={styles.barLabelAfter}>{fmt(f.after)}</span>
                </div>
                <span className={styles.chartPct}>−{pct(f.before, f.after)}</span>
              </div>
            ))}
            <div className={styles.chartEllipsis}>+ {heroTotal.count - heroFiles.length} more</div>
          </div>

          <div className={styles.chartTotal}>
            <span className={styles.chartTotalLabel}>Total</span>
            <span className={styles.chartTotalBefore}>{fmt(heroTotal.before)}</span>
            <span className={styles.chartTotalArrow} aria-hidden>
              →
            </span>
            <span className={styles.chartTotalAfter}>{fmt(heroTotal.after)}</span>
            <span className={styles.chartTotalPct}>−{pct(heroTotal.before, heroTotal.after)}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

const shrinks = [
  {
    title: "Textures",
    label: "KTX2 + clamp",
    headline: "~80% smaller",
    body: "Textures are downsampled to 1024 px and re-encoded as KTX2 — the GPU decodes them directly, and they take roughly a fifth of the PNG bytes.",
  },
  {
    title: "Meshes",
    label: "Draco compression",
    headline: "~80% smaller",
    body: "Vertex buffers are quantized and Draco-compressed. The browser decodes them straight onto the GPU, no JS-side decode pass.",
  },
  {
    title: "Materials",
    label: "Palette merge",
    headline: "fewer draw calls",
    body: "Untextured materials get merged into a single tiny palette texture. Same look, one draw call per model instead of one per material.",
  },
];

function Shrink() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionInner}>
        <h2 className={styles.sectionTitle}>Three things that get smaller.</h2>
        <p className={styles.sectionLede}>
          The savings stack. A typical character model lands between 85% and 95% smaller than its
          source FBX — game-asset sized files, web-asset sized payloads.
        </p>
        <div className={styles.shrinkGrid}>
          {shrinks.map((s) => (
            <article key={s.title} className={styles.shrinkCard}>
              <div className={styles.shrinkHead}>
                <h3 className={styles.shrinkTitle}>{s.title}</h3>
                <span className={styles.shrinkHeadline}>{s.headline}</span>
              </div>
              <div className={styles.shrinkLabel}>{s.label}</div>
              <p className={styles.shrinkBody}>{s.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ComponentShowcase() {
  return (
    <section className={`${styles.section} ${styles.sectionAlt}`}>
      <div className={styles.sectionInner}>
        <h2 className={styles.sectionTitle}>You also get the component.</h2>
        <p className={styles.sectionLede}>
          Pass <code className={styles.ledeCode}>--tsx</code> and conv3d emits a typed React Three
          Fiber component for every model. Drop it into your scene; mesh nodes, materials, and
          preload are wired up for you.
        </p>

        <div className={styles.flow}>
          <div className={styles.flowInput}>
            <div className={styles.fileChip}>
              <span className={styles.fileChipIcon} aria-hidden>
                ▣
              </span>
              <div>
                <div className={styles.fileChipName}>Knight.fbx</div>
                <div className={styles.fileChipMeta}>31.2 MB · 14k tris</div>
              </div>
            </div>
            <div className={styles.fileChip}>
              <span className={styles.fileChipIcon} aria-hidden>
                ▣
              </span>
              <div>
                <div className={styles.fileChipName}>Knight.glb</div>
                <div className={styles.fileChipMeta}>2.1 MB · web-optimized</div>
              </div>
            </div>
          </div>

          <div className={styles.flowArrow} aria-hidden>
            <svg viewBox="0 0 32 32" width="28" height="28">
              <path
                d="M6 16 H24 M18 10 L24 16 L18 22"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </div>

          <div className={styles.codeFrame}>
            <div className={styles.codeFrameHead}>
              <span className={styles.codeFrameTab}>Knight.tsx</span>
              <span className={styles.codeFrameSub}>generated by conv3d</span>
            </div>
            <pre className={styles.codeFrameBody}>
              <code>
                <span className={styles.tokComment}>{`// auto-generated — re-runs are safe`}</span>
                {"\n"}
                <span className={styles.tokKeyword}>import</span>
                {" { "}
                <span className={styles.tokSymbol}>useGLTF</span>
                {" } "}
                <span className={styles.tokKeyword}>from</span>{" "}
                <span className={styles.tokString}>"@react-three/drei"</span>
                {";\n"}
                <span className={styles.tokKeyword}>import type</span>
                {" { "}
                <span className={styles.tokType}>JSX</span>
                {" } "}
                <span className={styles.tokKeyword}>from</span>{" "}
                <span className={styles.tokString}>"react"</span>
                {";\n\n"}
                <span className={styles.tokKeyword}>export function</span>{" "}
                <span className={styles.tokFunc}>Knight</span>
                {"(props: JSX."}
                <span className={styles.tokType}>IntrinsicElements</span>
                {"["}
                <span className={styles.tokString}>"group"</span>
                {"]) {\n  "}
                <span className={styles.tokKeyword}>const</span>
                {" { nodes, materials } = "}
                <span className={styles.tokSymbol}>useGLTF</span>
                {"("}
                <span className={styles.tokString}>"/models/knight.glb"</span>
                {");\n  "}
                <span className={styles.tokKeyword}>return</span>
                {" (\n    "}
                <span className={styles.tokTag}>{"<group"}</span>
                {" {..."}
                <span className={styles.tokSymbol}>props</span>
                {"} "}
                <span className={styles.tokAttr}>dispose</span>
                {"={"}
                <span className={styles.tokKeyword}>null</span>
                {"}"}
                <span className={styles.tokTag}>{">"}</span>
                {"\n      "}
                <span className={styles.tokTag}>{"<mesh"}</span>{" "}
                <span className={styles.tokAttr}>geometry</span>
                {"={nodes.Body.geometry} "}
                <span className={styles.tokAttr}>material</span>
                {"={materials.Armor} "}
                <span className={styles.tokTag}>{"/>"}</span>
                {"\n      "}
                <span className={styles.tokTag}>{"<mesh"}</span>{" "}
                <span className={styles.tokAttr}>geometry</span>
                {"={nodes.Helmet.geometry} "}
                <span className={styles.tokAttr}>material</span>
                {"={materials.Metal} "}
                <span className={styles.tokTag}>{"/>"}</span>
                {"\n    "}
                <span className={styles.tokTag}>{"</group>"}</span>
                {"\n  );\n}\n\n"}
                <span className={styles.tokSymbol}>useGLTF</span>
                {"."}
                <span className={styles.tokSymbol}>preload</span>
                {"("}
                <span className={styles.tokString}>"/models/knight.glb"</span>
                {");"}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className={styles.finalCta}>
      <div className={styles.sectionInner}>
        <h2 className={styles.finalTitle}>Try it on your asset pack.</h2>
        <p className={styles.finalLede}>
          Point conv3d at a folder of FBX, OBJ, or glTF files. A few seconds later you have a
          web-optimized <code>.glb</code> for each, plus a typed component to import them with.
        </p>
        <pre className={styles.finalCmd}>
          <code>
            <span className={styles.finalPrompt}>$</span> npx conv3d bulk ./models --tsx --optimize
            -y
          </code>
        </pre>
        <div className={styles.heroCtas}>
          <Link className={styles.ctaPrimary} to="/docs/getting-started">
            Read the docs →
          </Link>
          <Link className={styles.ctaSecondary} href="https://github.com/trebeljahr/conv3d">
            Star on GitHub
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="Convert FBX, OBJ, and glTF files into compact GLB — typically 90% smaller — and get a typed React Three Fiber component for each."
    >
      <main className={styles.main}>
        <Hero />
        <Shrink />
        <ComponentShowcase />
        <FinalCta />
      </main>
    </Layout>
  );
}

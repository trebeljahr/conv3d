import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import type { ReactNode } from "react";
import styles from "./index.module.css";

function Hero() {
  return (
    <header className={styles.hero}>
      <div className={styles.heroInner}>
        <p className={styles.eyebrow}>
          <span className={styles.eyebrowDot} aria-hidden /> npm i -g conv3d &nbsp;·&nbsp; v1.0.5
        </p>
        <h1 className={styles.heroTitle}>
          From <code className={styles.inlineCode}>.fbx</code> to a typed
          <br />
          React Three Fiber component.
        </h1>
        <p className={styles.heroTagline}>
          Command-line converter for 3D models. Drop FBX, OBJ, or glTF in — get optimized GLB files
          and ready-to-import <code className={styles.inlineCodeSmall}>.tsx</code> components out.
          No Blender round-trip. Safe to call from scripts and AI agents.
        </p>
        <div className={styles.heroCtas}>
          <Link className={styles.ctaPrimary} to="/docs/getting-started">
            Get started →
          </Link>
          <Link className={styles.ctaSecondary} href="https://github.com/trebeljahr/conv3d">
            View on GitHub
          </Link>
        </div>

        <div className={styles.terminal} aria-label="Example terminal session">
          <div className={styles.terminalBar}>
            <span className={styles.dot} data-color="red" />
            <span className={styles.dot} data-color="amber" />
            <span className={styles.dot} data-color="green" />
            <span className={styles.terminalTitle}>~/projects/game</span>
          </div>
          <pre className={styles.terminalBody}>
            <code>
              <span className={styles.prompt}>$</span>{" "}
              <span className={styles.cmd}>
                conv3d bulk ./raw-assets -m FBX --tsx --optimize -y
              </span>
              {"\n\n"}
              <span className={styles.muted}>Found 12 .fbx files in ./raw-assets</span>
              {"\n"}
              <span className={styles.ok}>✓</span>{" "}
              <span className={styles.muted}>barbarian.fbx → barbarian.glb</span>
              {"\n"}
              <span className={styles.ok}>✓</span>{" "}
              <span className={styles.muted}>✨ Recovered 4 external texture(s)</span>
              {"\n"}
              <span className={styles.ok}>✓</span>{" "}
              <span className={styles.muted}>rogue.fbx → rogue.glb + rogue.tsx</span>
              {"\n"}
              <span className={styles.ok}>✓</span>{" "}
              <span className={styles.muted}>knight.fbx → knight.glb + knight-transformed.glb</span>
              {"\n"}
              <span className={styles.dim}>… 9 more</span>
              {"\n\n"}
              <span className={styles.success}>
                → 12 glb · 12 tsx · 12 web-glb (avg 87% smaller)
              </span>
            </code>
          </pre>
        </div>
      </div>
    </header>
  );
}

type Pillar = {
  title: string;
  body: string;
  bullets: string[];
};

const pillars: Pillar[] = [
  {
    title: "Convert",
    body: "FBX, OBJ, glTF — directories, single files, or glob patterns. Always lands as a clean .glb.",
    bullets: [
      "obj2gltf + gltf-pipeline + fbx2gltf under the hood",
      "Parallel by default (min(cpus, 4)) — tunable with -c",
      "Globs accepted directly: ./assets/**/*.fbx",
    ],
  },
  {
    title: "Generate",
    body: "Drop converted GLBs straight into a React Three Fiber project as typed .tsx components.",
    bullets: [
      "Powered by gltfjsx — typed props, instancing, named meshes",
      "Skip the prompt with --tsx (or --no-tsx)",
      "Re-run over existing .glb files with conv3d tsx-gen",
    ],
  },
  {
    title: "Optimize",
    body: "A second .glb pass produces a web-ready, palette-merged, texture-clamped version of every model.",
    bullets: [
      "Default 1024 texture clamp (normals get max(n, 2048))",
      "Independent of --tsx — emit one, the other, or both",
      "--keep-materials preserves originals when needed",
    ],
  },
];

function Pillars() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionInner}>
        <h2 className={styles.sectionTitle}>One command. Three artefacts. Web-ready.</h2>
        <p className={styles.sectionLede}>
          conv3d takes the asset pipeline that normally lives between Blender, gltf-pipeline,
          gltfjsx, and a handful of npm scripts — and folds it into a single CLI.
        </p>
        <div className={styles.pillarGrid}>
          {pillars.map((p) => (
            <article key={p.title} className={styles.pillarCard}>
              <h3 className={styles.pillarTitle}>{p.title}</h3>
              <p className={styles.pillarBody}>{p.body}</p>
              <ul className={styles.pillarList}>
                {p.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Workflow() {
  const steps = [
    {
      num: "01",
      cmd: "conv3d single",
      title: "One file, quickly",
      body: "Point it at a model, optionally pass --tsx / --optimize. Interactive prompts fill in anything you didn't decide upfront.",
    },
    {
      num: "02",
      cmd: "conv3d bulk",
      title: "A folder or a glob",
      body: "Recurse into a directory or expand a glob pattern. Outputs land in <inputDir>/_convert-3d-for-web/ — or wherever -o sends them.",
    },
    {
      num: "03",
      cmd: "conv3d tsx-gen",
      title: "Components from existing GLBs",
      body: "Already have .glb files? Skip conversion — just generate React components (and optional web-optimized .glb) over what's there.",
    },
    {
      num: "04",
      cmd: "conv3d doctor",
      title: "Verify the install",
      body: "Read-only environment check: Node version, OS, bundled lib versions. --json for agents debugging an install.",
    },
  ];

  return (
    <section className={`${styles.section} ${styles.sectionAlt}`}>
      <div className={styles.sectionInner}>
        <h2 className={styles.sectionTitle}>Four commands to know.</h2>
        <p className={styles.sectionLede}>
          conv3d's surface area is small on purpose. Every command works interactively or fully
          non-interactively — pass <code className={styles.inlineCodeSmall}>-y</code> to skip every
          prompt.
        </p>
        <ol className={styles.steps}>
          {steps.map((s) => (
            <li key={s.num} className={styles.step}>
              <div className={styles.stepNum}>{s.num}</div>
              <div className={styles.stepBody}>
                <code className={styles.stepCmd}>{s.cmd}</code>
                <h3 className={styles.stepTitle}>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const formatGroups: { label: string; items: string[] }[] = [
  { label: "Input", items: [".fbx", ".obj", ".gltf"] },
  { label: "Output", items: [".glb", ".tsx", "web-optimized .glb"] },
  { label: "Selection", items: ["File", "Directory", "Glob pattern"] },
  { label: "Modes", items: ["Interactive", "--yes", "--dry-run", "--json"] },
  {
    label: "Under the hood",
    items: ["obj2gltf", "gltf-pipeline", "fbx2gltf", "gltfjsx"],
  },
  { label: "Runtime", items: ["Node 24+", "macOS", "Linux"] },
];

function Formats() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionInner}>
        <h2 className={styles.sectionTitle}>Talks to the formats you already have.</h2>
        <p className={styles.sectionLede}>
          Wraps the best-of-breed converters in one consistent CLI — flags, output layout, exit
          codes, JSON schema, all unified.
        </p>
        <div className={styles.formats}>
          {formatGroups.map((g) => (
            <div key={g.label} className={styles.formatGroup}>
              <div className={styles.formatLabel}>{g.label}</div>
              <ul className={styles.formatList}>
                {g.items.map((i) => (
                  <li key={i} className={styles.formatChip}>
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Philosophy() {
  return (
    <section className={`${styles.section} ${styles.sectionAlt}`}>
      <div className={styles.sectionInner}>
        <blockquote className={styles.quote}>
          <p>
            Your assets, your project, your pipeline. conv3d is the converter that knows how to be a
            good citizen in a script — and then gets out of the way.
          </p>
        </blockquote>
        <div className={styles.principles}>
          <div>
            <h4>Interactive when you want it</h4>
            <p>
              Prompts guide the first run; flags skip every prompt when you've made up your mind.
              Same binary, both modes.
            </p>
          </div>
          <div>
            <h4>Safe for agents</h4>
            <p>
              <code>--json</code>, <code>--dry-run</code>, and stable exit codes (0 / 1 / 2). Stdout
              is the result; stderr is the chatter.
            </p>
          </div>
          <div>
            <h4>Texture recovery</h4>
            <p>
              Detects 1×1 magenta placeholders left behind by <code>fbx2gltf</code> and swaps them
              with the matching texture from the FBX's directory. No more solid-color models.
            </p>
          </div>
          <div>
            <h4>Predictable output</h4>
            <p>
              Sub-trees <code>glb/</code>, <code>tsx/</code>, <code>glb-for-web/</code> by default —
              or <code>--flat</code> and <code>--*-dir</code> overrides when your project says
              otherwise.
            </p>
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
        <h2 className={styles.finalTitle}>Skip the Blender round-trip.</h2>
        <p className={styles.finalLede}>
          conv3d is MIT-licensed and runs on Node 24+. Try it without installing.
        </p>
        <pre className={styles.finalCmd}>
          <code>
            <span className={styles.prompt}>$</span> npx conv3d bulk ./models --tsx --optimize -y
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
      description="Command-line tool that converts FBX, OBJ, and glTF files into GLB and generates matching React Three Fiber components — interactive or fully scripted."
    >
      <main className={styles.main}>
        <Hero />
        <Pillars />
        <Workflow />
        <Formats />
        <Philosophy />
        <FinalCta />
      </main>
    </Layout>
  );
}

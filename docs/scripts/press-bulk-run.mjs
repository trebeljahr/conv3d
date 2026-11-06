#!/usr/bin/env node
// Builds the inputs of the social preview cards from one real bulk run over
// the whole KayKit Adventurers pack (6 characters + 31 props, 37 FBX):
//
//   conv3d bulk ./kaykit-adventurers -r --tsx --optimize -y
//
// Writes to docs/marketing/social-preview/renders/:
//   round 2 (--only r2)
//   terminal-dark.webp, terminal-light.webp  last screen of that run (vhs), two themes
//   pack-before.webp, pack-after.webp        every model of the pack in the same grid:
//                                            FBX2glTF alone vs the run's glb/ output
//   barbarian-before.webp, -after.webp       the same pair, one model, larger
//   round 3 (--only r3)
//   grid-after.webp                          18 of the run's GLBs in a 6-column grid
//   mage-fbx.webp, mage-before.webp          Mage.fbx itself (FBXLoader, its own
//                                            texture) and FBX2glTF alone
//
//   pnpm build                               # repo root: dist/conv3d.js
//   cd docs && pnpm press:bulk [--only r2|r3] && pnpm press:social
//
// Needs the KayKit pack (see _press-lib.mjs), on Apple Silicon Rosetta for
// FBX2glTF, and vhs for the round-2 terminal screens. Without r2 the bulk run
// runs without vhs. Works in /tmp/conv3d-bulk. SKIP_TERMINAL=1 reuses the
// last run there and only redoes the renders.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join } from "node:path";
import { chromium } from "@playwright/test";
import {
  bundle,
  DOCS_DIR,
  KAYKIT_FBX_DIR,
  REPO_ROOT,
  requireKaykit,
  run,
  SCRIPTS_DIR,
  serveDirs,
} from "./_press-lib.mjs";

const OUT_DIR = join(DOCS_DIR, "marketing", "social-preview", "renders");
const WORK = "/tmp/conv3d-bulk";
const PACK = join(WORK, "kaykit-adventurers");
const COMMAND = "conv3d bulk ./kaykit-adventurers -r --tsx --optimize -y";
const CHARACTERS = ["Barbarian", "Knight", "Mage", "Ranger", "Rogue", "Rogue_Hooded"];

// Terminal themes in the card palettes (the docs site's near-black and teal).
const THEMES = {
  dark: {
    name: "conv3d-dark",
    background: "#0d171b",
    foreground: "#e6f2f1",
    cursor: "#2dd4bf",
    selection: "#1d2c30",
    black: "#0a1014",
    red: "#f87171",
    green: "#5eead4",
    yellow: "#fde68a",
    blue: "#7dd3fc",
    magenta: "#f0abfc",
    cyan: "#2dd4bf",
    white: "#e6f2f1",
    brightBlack: "#6f828a",
    brightRed: "#fca5a5",
    brightGreen: "#99f6e4",
    brightYellow: "#fef3c7",
    brightBlue: "#bae6fd",
    brightMagenta: "#f5d0fe",
    brightCyan: "#5eead4",
    brightWhite: "#ffffff",
  },
  light: {
    name: "conv3d-light",
    background: "#ffffff",
    foreground: "#1b2a30",
    cursor: "#0d9488",
    selection: "#ccfbf1",
    black: "#1b2a30",
    red: "#b91c1c",
    green: "#0f766e",
    yellow: "#a16207",
    blue: "#1d4ed8",
    magenta: "#a21caf",
    cyan: "#0e7490",
    white: "#e6ecee",
    brightBlack: "#5b6f76",
    brightRed: "#dc2626",
    brightGreen: "#0d9488",
    brightYellow: "#ca8a04",
    brightBlue: "#2563eb",
    brightMagenta: "#c026d3",
    brightCyan: "#0891b2",
    brightWhite: "#0a1014",
  },
};
const terminalPng = (theme) => join(WORK, `terminal-${theme}.png`);

const onlyIdx = process.argv.indexOf("--only");
const rounds = onlyIdx > -1 ? process.argv[onlyIdx + 1].split(",") : ["r2", "r3"];
const record = rounds.includes("r2");

requireKaykit();
mkdirSync(OUT_DIR, { recursive: true });
const reuse =
  process.env.SKIP_TERMINAL &&
  existsSync(join(WORK, "plain")) &&
  (!record || Object.keys(THEMES).every((t) => existsSync(terminalPng(t))));

if (!reuse) {
  rmSync(WORK, { recursive: true, force: true });
  // The pack's characters/fbx and assets/fbx folders, each with the texture
  // PNGs that sit next to the FBX files in the download.
  const sources = {
    characters: KAYKIT_FBX_DIR,
    assets: join(KAYKIT_FBX_DIR, "..", "..", "assets", "fbx"),
  };
  for (const [sub, dir] of Object.entries(sources)) {
    mkdirSync(join(PACK, sub), { recursive: true });
    for (const f of readdirSync(dir)) {
      if (/\.(fbx|png)$/i.test(f)) cpSync(join(dir, f), join(PACK, sub, f));
    }
  }

  // 1. The bulk run, recorded by vhs once per theme. Each recording starts
  //    from a pack without output, so both show a full run. Round 3 needs
  //    only the output files, so without r2 the same command runs once, bare.
  if (!record) {
    run("node", [join(REPO_ROOT, "dist", "conv3d.js"), ...COMMAND.split(" ").slice(1)], {
      cwd: WORK,
    });
  }
  for (const [theme, colors] of Object.entries(record ? THEMES : {})) {
    const tape = join(WORK, `terminal-${theme}.tape`);
    writeFileSync(
      tape,
      `Output "${WORK}/terminal-${theme}.mp4"
Set Shell bash
Set FontSize 32
Set Width 2000
Set Height 760
Set Padding 36
Set TypingSpeed 20ms
Set Theme ${JSON.stringify(colors)}
Set WindowBar Colorful
Set WindowBarSize 48
Set BorderRadius 12
Set Framerate 10
Hide
Type "source ${join(SCRIPTS_DIR, "_demo-setup.sh")} && cd ${WORK} && rm -rf ${PACK}/_convert-3d-for-web && clear"
Enter
Sleep 1s
Show
Type "${COMMAND}"
Enter
Wait+Line@120s /^\\$ ?$/
Sleep 1500ms
Screenshot "${terminalPng(theme)}"
Sleep 500ms
`,
    );
    // vhs now and then exits without writing the screenshot; one retry.
    for (let attempt = 0; attempt < 2 && !existsSync(terminalPng(theme)); attempt++) {
      run("vhs", [tape], { cwd: WORK });
    }
    if (!existsSync(terminalPng(theme))) throw new Error(`vhs wrote no ${terminalPng(theme)}`);
  }

  // 2. "Before": the FBX2glTF binary conv3d ships with, with the flags conv3d
  //    passes and no post-processing, on the same files.
  const fbx2gltfBin = join(
    createRequire(join(REPO_ROOT, "package.json")).resolve("fbx2gltf/package.json"),
    "..",
    "bin",
    process.platform === "darwin" ? "Darwin" : "Linux",
    "FBX2glTF",
  );
  mkdirSync(join(WORK, "plain"));
  for (const sub of ["characters", "assets"]) {
    for (const f of readdirSync(join(PACK, sub)).filter((n) => n.endsWith(".fbx"))) {
      run(
        fbx2gltfBin,
        [
          "--binary",
          "--pbr-metallic-roughness",
          "--input",
          join(PACK, sub, f),
          "--output",
          join(WORK, "plain", basename(f, ".fbx")),
        ],
        { stdio: "ignore" },
      );
    }
  }
}

const props = readdirSync(join(PACK, "assets"))
  .filter((f) => f.endsWith(".fbx"))
  .map((f) => basename(f, ".fbx"))
  .sort();
console.log(`pack: ${CHARACTERS.length} characters + ${props.length} props`);

// 3. Renders. Sheet pixels are 2x their size on a card.
//    Round 2: one layout for both pack sheets, the six characters in the top
//    row, the 31 props below in 8 columns.
const SHEET_W = 1280;
const CHAR_W = SHEET_W / CHARACTERS.length;
const CHAR_H = 230;
const PROP_COLS = 8;
const PROP_W = SHEET_W / PROP_COLS;
const PROP_H = 150;
const SHEET_H = CHAR_H + Math.ceil(props.length / PROP_COLS) * PROP_H;
const character = (url, x, y, w, h) => ({ url, x, y, w, h, yaw: 0.35, fill: 0.86 });
const prop = (url, x, y, w, h, fill = 0.78) => ({ url, x, y, w, h, yaw: 0.6, pitch: 0.3, fill });
function cells(file) {
  const out = CHARACTERS.map((name, i) =>
    character(`/work/${file(name)}`, Math.round(i * CHAR_W), 0, Math.round(CHAR_W), CHAR_H),
  );
  props.forEach((name, i) => {
    out.push(
      prop(
        `/work/${file(name)}`,
        Math.round((i % PROP_COLS) * PROP_W),
        CHAR_H + Math.floor(i / PROP_COLS) * PROP_H,
        Math.round(PROP_W),
        PROP_H,
      ),
    );
  });
  return out;
}
const before = (name) => `plain/${name}.glb`;
const after = (name) => `kaykit-adventurers/_convert-3d-for-web/glb/${name}.glb`;
const source = (name) => `kaykit-adventurers/characters/${name}.fbx`;
const hero = (file) => [
  { url: `/work/${file("Barbarian")}`, x: 0, y: 0, w: 640, h: 600, fill: 0.9 },
];

//    Round 3: 18 of the run's GLBs in 6 columns, the six characters (Mage
//    first) above two rows of props, and Mage.fbx before and after FBX2glTF.
const GRID_CHARACTERS = ["Mage", ...CHARACTERS.filter((c) => c !== "Mage")];
const GRID_PROPS = [
  [
    "axe_2handed",
    "shield_round_color",
    "mug_full",
    "spellbook_open",
    "bow_withString",
    "smokebomb",
  ],
  [
    "quiver",
    "shield_spikes_color",
    "sword_2handed_color",
    "arrow_bow_bundle",
    "staff",
    "shield_square_color",
  ],
];
const GRID_W = 1400;
const GRID_COL_W = GRID_W / 6;
const GRID_CHAR_H = 320;
const GRID_PROP_H = 250;
const GRID_H = GRID_CHAR_H + GRID_PROPS.length * GRID_PROP_H;
function grid(file) {
  const col = (i) => [Math.round(i * GRID_COL_W), Math.round(GRID_COL_W)];
  const out = GRID_CHARACTERS.map((name, i) => {
    const [x, w] = col(i);
    return character(`/work/${file(name)}`, x, 0, w, GRID_CHAR_H);
  });
  GRID_PROPS.forEach((row, r) => {
    row.forEach((name, i) => {
      const [x, w] = col(i);
      // Props a little smaller than in round 2, so they do not outsize the characters.
      out.push(prop(`/work/${file(name)}`, x, GRID_CHAR_H + r * GRID_PROP_H, w, GRID_PROP_H, 0.66));
    });
  });
  return out;
}
const MAGE_W = 400;
const MAGE_H = 440;
const mage = (file) => [
  { url: `/work/${file("Mage")}`, x: 0, y: 0, w: MAGE_W, h: MAGE_H, yaw: 0.35, fill: 0.92 },
];

writeFileSync(
  join(WORK, "index.html"),
  `<!doctype html><meta charset="utf-8"><script type="module" src="/work/tiles.js"></script>`,
);
await bundle(join(SCRIPTS_DIR, "_press-tiles.js"), join(WORK, "tiles.js"));
const server = await serveDirs({ "/work/": WORK, "/": WORK });
const write = (file, dataUrl) => {
  writeFileSync(join(OUT_DIR, file), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log(`wrote marketing/social-preview/renders/${file}`);
};
try {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.error(err));
  await page.goto(`${server.url}/index.html`);
  await page.waitForFunction(() => window.__ready, null, { timeout: 60_000 });
  for (const theme of Object.keys(record ? THEMES : {})) {
    write(
      `terminal-${theme}.webp`,
      await page.evaluate((u) => window.toWebp(u), `/work/terminal-${theme}.png`),
    );
  }
  const jobs = [
    ["r2", "pack-before.webp", SHEET_W, SHEET_H, cells(before)],
    ["r2", "pack-after.webp", SHEET_W, SHEET_H, cells(after)],
    ["r2", "barbarian-before.webp", 640, 600, hero(before)],
    ["r2", "barbarian-after.webp", 640, 600, hero(after)],
    ["r3", "grid-after.webp", GRID_W, GRID_H, grid(after)],
    ["r3", "mage-fbx.webp", MAGE_W, MAGE_H, mage(source)],
    ["r3", "mage-before.webp", MAGE_W, MAGE_H, mage(before)],
  ];
  for (const [round, file, w, h, list] of jobs) {
    if (!rounds.includes(round)) continue;
    write(
      file,
      await page.evaluate(([w, h, list]) => window.renderSheet(w, h, list), [w, h, list]),
    );
  }
  await browser.close();
} finally {
  server.close();
}

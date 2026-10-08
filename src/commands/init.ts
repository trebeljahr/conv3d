import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { exit } from "node:process";
import chalk from "chalk";
import inquirer from "inquirer";
import { err, fail, info, isJson } from "../log.js";
import { isDryRun, isNonInteractive, program } from "../program.js";
import { checkFileExists, home } from "../utils.js";

const { green, red, yellow } = chalk;
const { prompt } = inquirer;

type InitOptions = {
  targetDir?: string;
  yes?: boolean;
  nonInteractive?: boolean;
  overwrite?: "skip" | "replace" | "ask";
  forceOverwrite?: boolean;
};

type ScaffoldFile = {
  path: string;
  content: string;
};

function hookTemplate() {
  return `import { useGLTF } from "@react-three/drei";
import type { Group } from "three";

export function useGltfModel(name: string): Group {
  const gltf = useGLTF(\`/models/\${name}.glb\`);
  return gltf.scene;
}

export function preloadGltfModel(name: string) {
  useGLTF.preload(\`/models/\${name}.glb\`);
}
`;
}

function readmeTemplate() {
  return `# conv3d model pipeline

Drop source assets into \`models/\`, then convert them into web-ready GLB files:

\`\`\`bash
conv3d bulk ./models -r -m ALL --flat -o ./public/models --tsx --optimize -y
\`\`\`

React Three Fiber can load the generated files from \`/models/<name>.glb\`.
The sample \`useGltfModel.ts\` hook shows a minimal \`@react-three/drei\`
\`useGLTF\` wrapper you can copy into your app.
`;
}

function scaffoldFiles(targetDir: string): ScaffoldFile[] {
  return [
    {
      path: path.join(targetDir, "useGltfModel.ts"),
      content: hookTemplate(),
    },
    {
      path: path.join(targetDir, "README.md"),
      content: readmeTemplate(),
    },
  ];
}

async function shouldWriteFile(filePath: string, opts: InitOptions): Promise<boolean> {
  if (!(await checkFileExists(filePath))) return true;
  if (opts.forceOverwrite || opts.overwrite === "replace" || opts.yes) return true;
  if (opts.overwrite === "skip" || isNonInteractive()) return false;

  const { overwrite } = await prompt<{ overwrite: boolean }>([
    {
      type: "confirm",
      name: "overwrite",
      message: `Overwrite ${filePath.replace(home, "~")}?`,
      default: false,
    },
  ]);

  return overwrite;
}

program
  .command("init")
  .summary("Scaffold a conv3d model pipeline")
  .description(
    `Create a small model-conversion workspace:
  models/          source FBX/OBJ/glTF files go here
  public/models/   web-ready .glb files are written here
  useGltfModel.ts  minimal React Three Fiber useGLTF hook
  README.md        copy-paste conv3d bulk command`,
  )
  .argument("[target]", "Directory to scaffold (alternative to -t)")
  .option("-t, --targetDir <path>", "Directory to scaffold")
  .addHelpText(
    "after",
    `
Examples:
  $ conv3d init ./my-app
  $ conv3d init --yes ./my-app
  $ conv3d init ./my-app --json`,
  )
  .action(async (positional: string | undefined, subOptions: InitOptions) => {
    const target = subOptions.targetDir ?? positional;
    if (!target) {
      fail("init", "Please specify a target directory (positionally or with -t)");
    }

    const opts = { ...program.opts<InitOptions>(), ...subOptions };
    const targetDir = path.resolve(target);
    const dirs = [path.join(targetDir, "models"), path.join(targetDir, "public", "models")];
    const files = scaffoldFiles(targetDir);
    const result = {
      command: "init" as const,
      ok: true,
      targetDir,
      dryRun: !!isDryRun(),
      directories: dirs,
      created: [] as string[],
      skipped: [] as string[],
      errors: [] as { file: string; message: string }[],
    };

    try {
      info(`ℹ️ Scaffolding conv3d workspace in ${targetDir.replace(home, "~")}`);

      if (!isDryRun()) {
        for (const dir of dirs) {
          await mkdir(dir, { recursive: true });
        }
      }

      for (const file of files) {
        const write = isDryRun() ? true : await shouldWriteFile(file.path, opts);
        if (!write) {
          result.skipped.push(file.path);
          continue;
        }

        if (!isDryRun()) {
          await writeFile(file.path, file.content, "utf8");
        }
        result.created.push(file.path);
      }

      const action = isDryRun() ? "Would scaffold" : "Scaffolded";
      info(green(`✅ ${action} ${targetDir.replace(home, "~")}`));
      if (result.skipped.length > 0) {
        info(yellow(`ℹ️ Skipped ${result.skipped.length} existing file(s)`));
      }

      if (isJson()) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.ok = false;
      result.errors.push({ file: targetDir, message: errorMsg });
      if (isJson()) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      }
      err(red("🚨 Init failed!"));
      err(red("🚨 " + errorMsg));
      exit(1);
    }
  });

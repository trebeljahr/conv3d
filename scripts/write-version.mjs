import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [directory, commit] = process.argv.slice(2);
if (!directory || !/^[a-f0-9]{40}$/.test(commit ?? "")) {
  throw new Error("Release identity requires an output directory and a full commit SHA.");
}
mkdirSync(directory, { recursive: true });
writeFileSync(join(directory, "version.json"), `${JSON.stringify({ commit })}\n`);

// Static exports need the same identity in the served HTML: a separate
// version file alone cannot detect an old page cached by an intermediary.
if (process.argv[4] === "--stamp-html") {
  let pages = 0;
  function stamp(root) {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const path = join(root, entry.name);
      if (entry.isDirectory()) stamp(path);
      else if (entry.isFile() && entry.name.endsWith(".html")) {
        let html = readFileSync(path, "utf8");
        if (!/<\/head>/i.test(html)) throw new Error("An exported HTML page has no head.");
        html = html.replace(/<meta\s+name="build-sha"\s+content="[^"]*"\s*\/?>/gi, "");
        writeFileSync(
          path,
          html.replace(/<\/head>/i, `<meta name="build-sha" content="${commit}"></head>`),
        );
        pages += 1;
      }
    }
  }
  stamp(directory);
  if (pages === 0) throw new Error("No exported HTML pages received a release identity.");
}

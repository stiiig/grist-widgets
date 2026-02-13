import fs from "fs";
import path from "path";

const repoRoot = process.cwd();
const sha = process.env.GITHUB_SHA || process.env.WIDGET_VERSION || "dev";
const version = sha.slice(0, 7);

const outDir = path.join(repoRoot, "out");
const targetDir = path.join(outDir, "widgets");
const PLACEHOLDER = "__WIDGET_VERSION__";

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...walk(p));
    else files.push(p);
  }
  return files;
}

if (!fs.existsSync(targetDir)) {
  console.log(`[inject-version-out] ${targetDir} not found; skipping.`);
  process.exit(0);
}

const htmlFiles = walk(targetDir).filter((f) => f.endsWith(".html"));

let touched = 0;
for (const file of htmlFiles) {
  const raw = fs.readFileSync(file, "utf8");
  if (!raw.includes(PLACEHOLDER)) continue;

  const next = raw.split(PLACEHOLDER).join(version);
  fs.writeFileSync(file, next, "utf8");
  touched++;
  console.log(`[inject-version-out] ${path.relative(repoRoot, file)} <- ${version}`);
}

console.log(`[inject-version-out] Done. Updated ${touched} file(s).`);
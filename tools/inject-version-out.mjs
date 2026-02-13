import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, "out");
const targetDir = path.join(outDir, "widgets");

const PLACEHOLDER_SHA = "__WIDGET_VERSION__";
const PLACEHOLDER_TIME = "__WIDGET_TIME__";

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

function getSha7() {
  const sha = process.env.GITHUB_SHA || process.env.WIDGET_VERSION || "dev";
  return sha.slice(0, 7);
}

function getCommitUnixSeconds() {
  // En CI, on a le repo checkout, donc git marche.
  // On récupère le timestamp du dernier commit (celui du build) via git.
  try {
    const out = execSync("git log -1 --format=%ct", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    const n = Number(out);
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    // ignore
  }
  return Math.floor(Date.now() / 1000);
}

function formatHHMMParis(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  const fmt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  // fr-FR peut donner "22:41"
  return fmt.format(d);
}

if (!fs.existsSync(targetDir)) {
  console.log(`[inject-version-out] ${targetDir} not found; skipping.`);
  process.exit(0);
}

const sha7 = getSha7();
const hhmm = formatHHMMParis(getCommitUnixSeconds());

const htmlFiles = walk(targetDir).filter((f) => f.endsWith(".html"));

let touched = 0;
for (const file of htmlFiles) {
  let raw = fs.readFileSync(file, "utf8");
  const hasSha = raw.includes(PLACEHOLDER_SHA);
  const hasTime = raw.includes(PLACEHOLDER_TIME);
  if (!hasSha && !hasTime) continue;

  raw = raw.split(PLACEHOLDER_SHA).join(sha7);
  raw = raw.split(PLACEHOLDER_TIME).join(hhmm);

  fs.writeFileSync(file, raw, "utf8");
  touched++;
  console.log(`[inject-version-out] ${path.relative(repoRoot, file)} <- ${sha7} @ ${hhmm}`);
}

console.log(`[inject-version-out] Done. Updated ${touched} file(s).`);
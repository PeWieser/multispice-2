// Schriften vendoren (nur Node-Builtins, keine Deps):
// BunnyFonts primär, Google Fonts nur als Backup. Schreibt woff2 nach
// public/fonts/ + @font-face nach src/app/fonts.css. Offline-tolerant:
// ohne Netz und ohne vorhandene Dateien bleibt der System-Fallback (Exit 0).
// Nutzung: npm run fonts  (läuft automatisch vor jedem Build)
import { get } from "node:https";
import { createWriteStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FONT_DIR = join(ROOT, "public", "fonts");
const CSS_OUT = join(ROOT, "src", "app", "fonts.css");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const QUERIES = [
  { slug: "inter", family: "Inter", css2: "family=Inter:wght@100..900" },
  { slug: "jetbrains-mono", family: "JetBrains Mono", css2: "family=JetBrains+Mono:wght@100..800" },
];
const PROVIDERS = [
  { name: "BunnyFonts", base: "https://fonts.bunny.net/css2" },
  { name: "Google Fonts", base: "https://fonts.googleapis.com/css2" },
];

function fetchText(url) {
  return new Promise((resolve, reject) => {
    get(url, { headers: { "User-Agent": UA } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let s = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (s += c));
      res.on("end", () => resolve(s));
    }).on("error", reject);
  });
}

function fetchFile(url, dest) {
  return new Promise((resolve, reject) => {
    get(url, { headers: { "User-Agent": UA } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const out = createWriteStream(dest);
      res.pipe(out);
      out.on("finish", () => resolve());
      out.on("error", reject);
    }).on("error", reject);
  });
}

/** Nur latin-Blöcke behalten (css2 markiert sie mit `slash-star latin star-slash`). */
function latinBlocks(css) {
  const parts = css.split(/\/\* ([a-z-]+) \*\//);
  // parts: [pre, name1, block1, name2, block2, ...]
  const kept = [];
  for (let i = 1; i + 1 < parts.length; i += 2) {
    if (parts[i] === "latin") kept.push(parts[i + 1]);
  }
  if (!kept.length) return [css]; // Format unbekannt — lieber alles nehmen.
  return kept;
}

const faces = [];
let usedProvider = "";
for (const q of QUERIES) {
  let css = "";
  for (const p of PROVIDERS) {
    try {
      css = await fetchText(`${p.base}?${q.css2}&display=swap`);
      usedProvider = usedProvider || p.name;
      if (p.name !== usedProvider) usedProvider += `+${p.name}`;
      console.log(`fonts: ${q.family} von ${p.name}`);
      break;
    } catch (err) {
      console.log(`fonts: ${q.family} via ${p.name} fehlgeschlagen (${err.message})`);
    }
  }
  if (!css) {
    console.log(`fonts: WARNUNG ohne Netz — vorhandene Dateien bleiben, sonst System-Fallback.`);
    process.exit(0);
  }
  mkdirSync(FONT_DIR, { recursive: true });
  const blocks = latinBlocks(css);
  let n = 0;
  for (const block of blocks) {
    const urls = [...block.matchAll(/url\((https:[^)]+\.woff2)\)/g)].map((m) => m[1]);
    let out = block;
    for (const u of urls) {
      const name = blocks.length > 1 || urls.length > 1 ? `${q.slug}-latin-${n++}.woff2` : `${q.slug}-latin.woff2`;
      const dest = join(FONT_DIR, name);
      await fetchFile(u, dest);
      out = out.replace(u, `/fonts/${name}`);
    }
    if (urls.length) faces.push(out);
  }
}

// Alte, nicht mehr referenzierte Dateien aufräumen (nur unsere Slugs).
if (existsSync(FONT_DIR)) {
  const { readdirSync } = await import("node:fs");
  const joined = faces.join("\n");
  for (const f of readdirSync(FONT_DIR)) {
    if (f.endsWith(".woff2") && (f.startsWith("inter-") || f.startsWith("jetbrains-mono-")) && !joined.includes(f)) {
      unlinkSync(join(FONT_DIR, f));
    }
  }
}

writeFileSync(
  CSS_OUT,
  `/* Generiert von scripts/fetch-fonts.mjs — Quelle: ${usedProvider || "unbekannt"}.\n` +
    ` * NICHT VON HAND EDITIEREN (nur dieser Kopf + :root sind stabil). */\n` +
    `:root {\n  --font-inter: "Inter";\n  --font-jetbrains: "JetBrains Mono";\n}\n` +
    faces.join("\n") +
    "\n",
);
console.log(`fonts: ${faces.length} @font-face-Blöcke nach src/app/fonts.css`);

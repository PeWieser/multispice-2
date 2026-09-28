#!/usr/bin/env node
// Static export build for hosts without a Node runtime (Cloudflare Pages, GitHub Pages, S3, …).
//
//   Cloudflare Pages:  build command  `node scripts/build-static.mjs`
//                      output dir     `out`
//
// What it does:
//   1. moves src/app/api aside — a static export must not contain (dynamic) route handlers
//   2. swaps next.config.ts for an `output: "export"` config
//   3. runs `next build` with NEXT_PUBLIC_STORAGE_MODE=local, so the app persists projects
//      in browser localStorage instead of calling the database API
//   4. restores the original tree afterwards (also on failure / Ctrl-C)
//
// The editor, simulator, instruments and grapher are pure client code and are unaffected.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const api = join(root, "src", "app", "api");
const apiBackup = join(root, ".static-build-api-backup");
const cfg = join(root, "next.config.ts");
const cfgBackup = join(root, ".static-build-next-config");

let restored = false;
function restore() {
  if (restored) return;
  restored = true;
  if (existsSync(apiBackup)) {
    rmSync(api, { recursive: true, force: true });
    renameSync(apiBackup, api);
  }
  if (existsSync(cfgBackup)) {
    rmSync(cfg, { force: true });
    renameSync(cfgBackup, cfg);
  }
}
process.on("exit", restore);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { restore(); process.exit(130); });

const originalCfg = readFileSync(cfg, "utf8");
if (originalCfg.includes("Temporary config written by scripts/build-static.mjs")) {
  console.error("[build-static] next.config.ts is already a generated static-build config — a previous run did not restore it. Aborting instead of nesting configs.");
  process.exit(1);
}
writeFileSync(cfgBackup, originalCfg); // restored by restore() on exit (also on failure / Ctrl-C)
writeFileSync(
  cfg,
  `import type { NextConfig } from "next";

// Temporary config written by scripts/build-static.mjs — static hosting build.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
`,
);

if (existsSync(api)) renameSync(api, apiBackup);
console.log("[build-static] API routes excluded, output mode: export, storage: local");

try {
  const res = spawnSync("npx", ["next", "build"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NEXT_PUBLIC_STORAGE_MODE: "local", NODE_ENV: "production" },
  });
  restore();
  if (res.status !== 0) {
    console.error("[build-static] build failed");
    process.exit(res.status ?? 1);
  }
} catch (e) {
  restore();
  throw e;
}

const out = join(root, "out");
const index = join(out, "index.html");
if (!existsSync(index)) {
  console.error("[build-static] expected out/index.html but it is missing");
  process.exit(1);
}
console.log(`[build-static] done — deploy the contents of ${out}`);

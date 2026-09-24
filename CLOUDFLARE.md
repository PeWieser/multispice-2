# CircuitLab Studio — Deployment Guide (Cloudflare)

## Inhalt

1. [Übersicht](#1-übersicht)
2. [Option A: Cloudflare Pages (ohne Datenbank)](#2-option-a-cloudflare-pages-ohne-datenbank)
3. [Option B: Cloudflare Pages + D1-Datenbank](#3-option-b-cloudflare-pages--d1-datenbank)
4. [Option C: Cloudflare Workers (Full SSR)](#4-option-c-cloudflare-workers-full-ssr)
5. [Umgebungsvariablen](#5-umgebungsvariablen)
6. [CI/CD-Pipeline](#6-cicd-pipeline)
7. [Eigene Domain](#7-eigene-domain)
8. [Kosten](#8-kosten)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Übersicht

CircuitLab Studio ist eine Next.js 16-App. Es gibt drei Deployment-Strategien auf Cloudflare:

| Strategie | Datenbank | SSR | Build | Kosten |
|---|---|---|---|---|
| **A: Pages (Statisch)** | LokalerStorage | ❌ | `next export` | Kostenlos |
| **B: Pages + D1** | Cloudflare D1 | ❌ | `next export` | Kostenlos |
| **C: Workers** | D1 / Neon / PlanetScale | ✅ | `@cloudflare/next-on-pages` | $5/Mo |

> **Empfehlung:** Option A für sofort loslegen, Option B für Persistenz, Option C für volle SSR.

---

## 2. Option A: Cloudflare Pages (ohne Datenbank)

Die schnellste Variante: Simulation läuft vollständig im Browser, Projekte werden im localStorage gespeichert.

### 2.1 Build vorbereiten

```bash
# next.config.ts: Statischen Export aktivieren
# → next.config.ts anpassen (siehe unten)

npm run build
```

**`next.config.ts` anpassen:**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Pfad-Prefix falls nötig (z.B. bei /circuitlab/)
  // basePath: "/circuitlab",
  images: {
    unoptimized: true, // Cloudflare Pages hat kein Next.js Image Optimization
  },
};

export default nextConfig;
```

**`src/db/index.ts` — DB-Import absichern:**

```ts
// Nur laden wenn DATABASE_URL gesetzt ist
export const db = process.env.DATABASE_URL
  ? (() => {
      const { drizzle } = require("drizzle-orm/node-postgres");
      const { Pool } = require("pg");
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      return drizzle(pool);
    })()
  : null;
```

**API-Routes deaktivieren (statischer Export):**

API-Routes (`/api/*`) werden bei `output: "export"` nicht mit exportiert. Die App muss im Client-Modus laufen:
- Simulation: Direkt im Browser (die Simulations-Engine ist bereits browser-seitig)
- Projekte: localStorage statt Datenbank
- Favoriten: localStorage

### 2.2 localStorage-Fallback einbauen

Erstelle `src/lib/storage.ts`:

```ts
"use client";

const KEY = "circuitlab_project";

export function saveLocal(doc: unknown) {
  try {
    localStorage.setItem(KEY, JSON.stringify(doc));
  } catch {
    // Quota exceeded
  }
}

export function loadLocal<T>(): T | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveFavorites(favs: string[]) {
  localStorage.setItem("circuitlab_favs", JSON.stringify(favs));
}

export function loadFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem("circuitlab_favs") ?? "[]");
  } catch {
    return [];
  }
}
```

Im `editor.ts` Store die DB-Aufrufe durch localStorage-Fallbacks ersetzen:

```ts
// In saveProject:
if (typeof window !== "undefined" && !process.env.NEXT_PUBLIC_DATABASE_URL) {
  saveLocal(doc);
  return;
}
```

### 2.3 Auf Cloudflare Pages deployen

```bash
# 1. Repo auf GitHub pushen
git add -A && git commit -m "feat: static export" && git push

# 2. Cloudflare Dashboard → Pages → Create a project
#    - Framework preset: Next.js (Static HTML Export)
#    - Build command: npm run build
#    - Build output directory: out
#    - Node.js version: 22

# 3. Oder via Wrangler CLI:
npx wrangler pages project create circuitlab-studio --production-branch main
npx wrangler pages deploy out --project-name=circuitlab-studio
```

### 2.4 Lokal testen

```bash
npm run build
npx serve out -p 3001
# → http://localhost:3001
```

---

## 3. Option B: Cloudflare Pages + D1-Datenbank

Behält den statischen Export, nutzt aber Cloudflare D1 (SQLite) für Projekte.

### 3.1 D1-Datenbank erstellen

```bash
# Wrangler installieren
npm install -g wrangler

# D1-Datenbank erstellen
wrangler d1 create circuitlab-db
# → Gibt database_id aus — notieren!
```

### 3.2 Schema migrieren

**`wrangler.toml` erstellen:**

```toml
name = "circuitlab-studio"
compatibility_date = "2025-01-01"

[[d1_databases]]
binding = "DB"
database_name = "circuitlab-db"
database_id = "DEINE_DATABASE_ID"
```

**`schema.sql` erstellen (Drizzle → SQL):**

```sql
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS schematics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  doc TEXT NOT NULL,  -- JSON als TEXT in D1
  settings TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_id TEXT NOT NULL UNIQUE,
  used_at TEXT NOT NULL DEFAULT (datetime('now')),
  use_count INTEGER NOT NULL DEFAULT 1,
  pinned INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS custom_parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Eigene Bauteile',
  spice TEXT NOT NULL DEFAULT '',
  definition TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS simulation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schematic_id INTEGER REFERENCES schematics(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  params TEXT NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL DEFAULT '{}',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

```bash
wrangler d1 execute circuitlab-db --file=./schema.sql
```

### 3.3 D1 API-Functions

Für den statischen Export werden API-Calls als Cloudflare Pages Functions implementiert (in `functions/api/`):

**`functions/api/projects.ts`:**

```ts
interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const projects = await context.env.DB.prepare(
    "SELECT * FROM projects ORDER BY updated_at DESC"
  ).all();
  return Response.json({ projects: projects.results });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const body = await context.request.json();
  const result = await context.env.DB.prepare(
    "INSERT INTO projects (name, description) VALUES (?, ?) RETURNING *"
  ).bind(body.name ?? "Neues Projekt", body.description ?? "").first();
  return Response.json({ project: result }, { status: 201 });
};
```

### 3.4 Client: D1-API nutzen

```ts
const API_BASE = "/api"; // oder https://deine-api.pages.dev/api

export async function saveToCloud(doc: unknown, name: string) {
  const res = await fetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, doc }),
  });
  return res.json();
}
```

### 3.5 Deployen

```bash
# Build + Functions werden zusammen deployed
npm run build
npx wrangler pages deploy out --project-name=circuitlab-studio
```

---

## 4. Option C: Cloudflare Workers (Full SSR)

Für volle SSR-Fähigkeit (Next.js App Router mit Server Components).

### 4.1 @cloudflare/next-on-pages verwenden

```bash
npm install -D @cloudflare/next-on-pages
```

**`wrangler.toml`:**

```toml
name = "circuitlab-studio"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "circuitlab-db"
database_id = "DEINE_DATABASE_ID"

[vars]
DATABASE_URL = "DEINE_DB_URL"
```

### 4.2 DB-Anbindung für Workers

Workers können D1 direkt nutzen oder über externe DB (Neon, PlanetScale, Turso):

**`src/db/index.ts` (Workers-Version):**

```ts
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

// Cloudflare Workers: D1 Binding
export function getDb(env: { DB: D1Database }) {
  return drizzle(env.DB, { schema });
}
```

### 4.3 Build und Deploy

```bash
# Build für Cloudflare Workers
npx @cloudflare/next-on-pages

# Deploy
npx wrangler pages deploy .vercel/output/static --project-name=circuitlab-studio
```

### 4.4 GitHub Actions CI/CD

```yaml
# .github/workflows/deploy.yml
name: Deploy to Cloudflare Pages
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy out --project-name=circuitlab-studio
```

---

## 5. Umgebungsvariablen

| Variable | Option A | Option B | Option C | Beschreibung |
|---|---|---|---|---|
| `DATABASE_URL` | — | — | D1 oder extern | PostgreSQL-Verbindung |
| `NEXT_PUBLIC_APP_URL` | Optional | Optional | Optional | Eigene Domain |
| `CLOUDFLARE_API_TOKEN` | — | CI/CD | CI/CD | Wrangler-Deploy-Token |

In Cloudflare Pages: **Settings → Environment Variables** setzen.

---

## 6. CI/CD Pipeline

### Minimaler Workflow

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          command: pages deploy out --project-name=circuitlab
```

### Preview Deployments

Cloudflare Pages erstellt automatisch Preview-URLs für jeden PR:

```
https://<hash>.circuitlab-studio.pages.dev
```

---

## 7. Eigene Domain

```
Cloudflare Dashboard → Pages → circuitlab-studio → Custom domains
→ "circuitlab.example.com" hinzufügen
→ DNS: CNAME circuitlab-studio.pages.dev
```

SSL wird automatisch von Cloudflare bereitgestellt.

---

## 8. Kosten

| | Free | Pro ($20/Mo) |
|---|---|---|
| Bandbreite | Unbegrenzt | Unbegrenzt |
| Builds | 500/Monat | 5.000/Monat |
| D1 (Speicher) | 5 GB | 50 GB |
| D1 (Lesen) | 5 Mio./Tag | 25 Mio./Tag |
| Workers | 100k Req/Tag | 10 Mio./Req/Mo |
| Custom Domains | ✅ | ✅ |
| Preview Deploys | ✅ | ✅ |

**Für die meisten Nutzer reicht der Free-Tier.**

---

## 9. Troubleshooting

### Build schlägt fehl

```bash
# Next.js Version prüfen
npx next --version

# Node.js Version (mind. 22)
node --version

# Build mit Debug-Logs
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

### D1-Verbindung fehlt

```bash
# D1 testen
wrangler d1 execute circuitlab-db --command "SELECT 1"
```

### Canvas-Rendering langsam

- Statische Assets: `/_next/static/` wird automatisch gecached
- Service Worker hinzufügen für Offline-Fähigkeit (PWA)
- `next.config.ts`: `compress: true` für Gzip

### CORS-Probleme bei API-Calls

```ts
// functions/api/_middleware.ts
export const onRequest: PagesFunction = async (context) => {
  const response = await context.next();
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
};
```

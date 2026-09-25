# Multispice — Deployment (Cloudflare Pages)

Standard und einzige unterstützte Strategie: **statischer Export**.
`npm run build` erzeugt `out/` — reines HTML/CSS/JS, ohne Server, ohne
Umgebungsvariablen. Die Simulation läuft im Browser, Projekte liegen in
localStorage.

## 1 · Deploy via Dashboard (empfohlen)

1. Repo auf GitHub pushen.
2. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**
3. Repo wählen, dann:
   - Framework preset: **Next.js (Static HTML Export)**
   - Build command: `npm run build`
   - Build output directory: `out`
   - Node.js version: **22** (steht zusätzlich in `.node-version`)
4. **Save and Deploy** — fertig. Jeder Push auf den Production-Branch
   deployed neu, jeder Pull Request bekommt eine Preview-URL.

## 2 · Deploy via CLI

```bash
npm run build
npx wrangler pages deploy out --project-name=circuitlab-studio
```

## 3 · Lokal testen

```bash
npm run build
npx serve out -p 3001
# → http://localhost:3001
```

## 4 · Eigene Domain

Pages-Projekt → **Custom domains** → Domain hinzufügen (z. B.
`circuitlab.example.com`) → DNS zeigt auf `*.pages.dev`. SSL kommt
automatisch von Cloudflare.

## 5 · Caching

`public/_headers` (wird nach `out/_headers` kopiert):

- `/_next/static/*` → `Cache-Control: public, max-age=31536000, immutable`
  (Dateinamen enthalten Content-Hashes, ewig cachebar)
- `/` → `Cache-Control: no-cache` (HTML immer frisch, kein veralteter Stand
  nach Deploy)

## 6 · Kosten

Der Free-Tier reicht: unbegrenzte Bandbreite, 500 Builds/Monat,
Custom Domains, Preview Deployments.

## 7 · Troubleshooting

**Build schlägt fehl:**

```bash
node --version   # muss 22.x sein (siehe .node-version)
rm -rf .next out && npm run build
```

**Alte Version nach Deploy:** harten Reload (Strg+Shift+R) — mit `/`-Header
aus §5 sollte das nicht vorkommen; prüfe, ob `out/_headers` deployed wurde.

**localStorage voll / Privatmodus:** Speichern meldet ehrlich einen Fehler in
der Konsole; Weg: Projekt als JSON exportieren (Datei → Export Projekt).

## 8 · Zukunftspfad: Cloud-Persistenz (bewusst nicht umgesetzt)

Der Server-Code (API-Routen, Postgres/Drizzle) wurde ersatzlos entfernt
(siehe DESIGN.md, Eintrag 2026-09-24). Falls später echte Cloud-Projekte
nötig werden, ist der Weg: **Pages Functions** (`functions/api/*`) +
**Cloudflare D1** (SQLite) — der statische Export bleibt dabei unverändert
bestehen, nur `src/lib/storage.ts` bekommt ein Cloud-Backend daneben.
Kein Code dafür im Repo, bis ein Nutzer ihn braucht (§1: Nein sagen).

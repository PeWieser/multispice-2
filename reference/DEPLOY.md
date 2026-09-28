# CircuitBench auf Cloudflare Pages deployen (ohne Backend / ohne Datenbank)

CircuitBench läuft **komplett im Browser**: Zeichnen, Connectivity-Resolver, MNA-Solver,
Instrumente und Grapher sind clientseitig. Projekte werden in **IndexedDB** (Fallback:
localStorage) gespeichert. Für den Betrieb wird deshalb weder ein Node-Server noch eine
Datenbank gebraucht.

Der statische Export erzeugt ein vollständiges, selbständiges Bundle in `out/`:

```
npm run build:static      # → out/  (≈ 1.6 MB)
```

Enthalten: `index.html`, JS/CSS-Bundles (`_next/`), Bilder (`images/`) und `api/health`
als statische JSON-Datei. Keine Serverfunktionen, keine Runtime-Umgebung.

---

## 1. Variante A — Git-Integration (empfohlen)

Repo bei GitHub/GitLab pushen, dann in Cloudflare:

**Workers & Pages → Create → Pages → Connect to Git**

| Einstellung | Wert |
| --- | --- |
| Framework preset | `Next.js` (oder *None*) |
| Build command | `npm run build:static` |
| Build output directory | `out` |
| Root directory | `/` |
| Node version (Env-Var) | `NODE_VERSION` = `22` |

Der Buildbefehl setzt intern `NEXT_OUTPUT=export`, wodurch `next.config.ts` auf
`output: "export"` umschaltet. Danach „Save and Deploy“ — jede Push auf den
Produktionsbranch deployt automatisch, Pull Requests erhalten Preview-URLs.

> Das Projekt braucht **keine** Umgebungsvariablen. `DATABASE_URL` wird im statischen
> Build nicht gelesen und kann leer bleiben.

## 2. Variante B — Wrangler CLI (direkt von der Kommandozeile)

```bash
npm ci
npm run build:static
npx wrangler login
npm run deploy          # = build:static + wrangler pages deploy out
```

Erstes Mal fragt Wrangler nach dem Projektnamen (`circuitbench`). Danach:
`https://circuitbench.pages.dev`.

Nur hochladen, ohne vorher zu bauen:

```bash
npx wrangler pages deploy out --project-name circuitbench
```

## 3. Variante C — Direct Upload (ohne Git, ohne CLI)

```bash
npm ci && npm run build:static
```

**Workers & Pages → Create → Pages → Upload assets** und den Inhalt des Ordners
`out/` hochziehen (Drag & Drop). Cloudflare packt die Dateien 1:1 auf das CDN.

## 4. Lokal gegen testen

Damit die Produktionsumgebung exakt nachgebildet wird (echte Pages-Header,
korrektes Caching, `_headers`-Support):

```bash
npx wrangler pages dev out --port 8788
```

Alternativ genügt ein statischer Server:

```bash
npx serve out
```

Kontrolle: `curl localhost:8788/api/health` liefert
`{"ok":true,"persistence":"browser (IndexedDB)","database":false,...}`.

---

## 5. Was sich ohne Backend ändert

| Funktion | Vorher (Postgres) | Jetzt (Cloudflare Pages) |
| --- | --- | --- |
| Projekt speichern | `PUT /api/projects/:id` | IndexedDB-Record + Snapshot in `versions` |
| Projekt öffnen | `GET /api/projects/:id` | IndexedDB |
| Projektliste | `GET /api/projects` | IndexedDB-Index nach `updatedAt` |
| Versionen/Snapshots | `project_versions`-Tabelle | Object-Store `versions` |
| Autosave / Crash-Recovery | localStorage + Server | localStorage, Restore-Dialog beim Start |
| Austausch | — | `File ▸ Export Project JSON` / Import, SPICE-Netlist-Export |

Alle Daten liegen pro Origin (Domain) im Browser. Konsequenzen:

* Projekte sind **geräte- und browsergebunden**. Für den Transfer zwischen Rechnern das
  Projekt als JSON exportieren (`File ▸ Export Project JSON`) und wieder importieren —
  das Dateiformat ist versioniert und stabil.
* Browser dürfen IndexedDB unter Speicherdruck räumen. Ein „Save“ (Ctrl+S) schreibt
  zusätzlich einen versionierten Snapshot; wer sicher gehen will, exportiert zusätzlich
  die JSON-Datei.
* Private/Inkognito-Fenster löschen ihren Speicher beim Schließen.

## 6. Optionale Zusätze für Pages

**`public/_headers`** (wird mit nach `out/` kopiert) — härtere Caching-Regeln:

```
/_next/static/*
  Cache-Control: public, max-age=31536000, immutable

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

**Custom Domain:** Pages-Projekt → *Custom domains* → CNAME auf
`<projekt>.pages.dev`. TLS macht Cloudflare automatisch.

**SPA-Fallback:** nicht nötig. Die App ist eine einzelne Route (`/`), und der Export
nutzt `trailingSlash: true`, sodass `out/index.html` direkt ausgeliefert wird.

## 7. Wenn später doch ein Backend gewünscht ist

Die Architektur trennt Persistenz hinter einem Adapter
(`src/lib/persistence/storage.ts`):

```ts
export interface StorageAdapter {
  list(): Promise<ProjectRecord[]>;
  get(id: string): Promise<ProjectRecord | null>;
  save(rec, snapshotLabel): Promise<ProjectRecord>;
  remove(id: string): Promise<void>;
  versions(id: string): Promise<VersionSummary[]>;
  restore(projectId, versionId): Promise<ProjectRecord | null>;
}
```

* Standard: `localStore` (IndexedDB).
* `NEXT_PUBLIC_CIRCUITBENCH_BACKEND=remote` aktiviert `HttpStore`
  (`/api/projects`).

Für eine serverseitige Variante ohne klassische Datenbank bietet sich auf Cloudflare
**Workers Static Assets + D1** oder **KV** an: App Router-Routen unter `src/app/api/*`
wieder ergänzen und das Projekt dann als *Workers*-Projekt (nicht als reine
Static-Pages) deployen — dann läuft `next build` mit `@opennextjs/cloudflare` und die
Routen werden zu Functions. Solange die Routen fehlen, bleibt der reine
Static-Export der einfachste und günstigste Weg.

## 8. Troubleshooting

| Symptom | Ursache / Lösung |
| --- | --- |
| Build bricht mit „`force-dynamic` … not supported with output: export“ | Es existiert wieder eine dynamische Route unter `src/app/api/**` mit `export const dynamic = "force-dynamic"`. Für den Static-Export entfernen oder durch `force-static` ersetzen. |
| `out/` bleibt leer | Es wurde `npm run build` statt `npm run build:static` ausgeführt. |
| „Save“ schlägt fehl, Meldung „document kept as autosave copy“ | Kein IndexedDB-Zugriff (z. B. Blocked Site-Setting). Speicherberechtigung erteilen — der Stand liegt sicher in localStorage. |
| Ältere Projekte tauchen nicht auf | IndexedDB ist pro Domain — die App muss unter derselben Origin geöffnet werden, in der gespeichert wurde. |
| Node-Fehler im Build | `NODE_VERSION=22` als Umgebungsvariable setzen (Next 16 benötigt Node ≥ 20). |

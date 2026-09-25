# Steve-Jobs-Qualitätsaudit — Runde 3 („Insanely great oder nicht shippen“)

> Datum: 2026-09-25 · Branch `arena/01a0d95e-multispice-2` · Stand: nach Build-Fix (PR #2)
> Vorgänger: `DESIGN_AUDIT_STEVE_JOBS.md` (Detail-Runde), `FINAL_AUDIT_STEVE_JOBS.md` (Funktionsabgleich Multisim)
> Dieses Audit prüft nicht Features, sondern **jede Oberfläche, mit der ein Mensch das Produkt berührt** —
> inklusive der Flächen, die niemand sieht („die Rückseite des Schranks“).

---

## 1 · Der Maßstab

Vier Prinzipien, direkt aus Jobs’ Entscheidungen abgeleitet (Quellen am Ende):

1. **Totale Qualität.** „Wenn du Schreiner bist und eine schöne Kommode baust, verwendest du
   hinten kein Sperrholz, auch wenn es zur Wand zeigt und niemand je sieht.“ Qualität muss
   *durchgetragen* sein: Meta-Tags, Fehlerseiten, Cache-Header und Code zählen wie das Canvas.
2. **Design ist, wie es funktioniert.** Nicht veneer. Jede Fläche wird daran gemessen, ob sie
   dem Menschen hilft: verständliche Sprache statt Jargon, direktes Feedback, keine Sackgassen.
3. **Fokus heißt Nein sagen.** Toter Code, doppelte Orte, halb entschiedene Marken sind
   Offene Türen, durch die Unruhe ins Produkt kommt.
4. **Die Verpackung ist das Produkt.** Der erste Kontakt — Tab-Titel, Favicon, OG-Bild, 404,
   Crash, leere Leinwand — ist der Unboxing-Moment. Er entscheidet über „magisch“ oder „Webseite“.
   Dazu: Tempo ist Respekt („Saving Lives“: 10 Sekunden Bootzeit × Millionen Nutzer = Dutzende Leben).

---

## 2 · Befunde (Findings)

Legende: **S** = Sev­erität (1 kritisch … 4 Kosmetik) · Status ✅ = in dieser Runde gefixt ·
🔒 = zuvor gefixt · 📋 = Backlog (bewusst begründet).

| ID | Fläche | Befund | S | Prinzip | Status |
|----|--------|--------|---|---------|--------|
| F1 | Marke | Produkt heißt im UI/Manifest „Multispice“, in Metadata, Netlist-Export, Log-Zeile, CSS- und Docs-Headern „CircuitLab Studio“ — zwei Stimmen für ein Produkt | 2 | 1, 3 | ✅ |
| F2 | Unboxing | Favicons/Manifest fehlten komplett (Build zeigte nur `/`, `/_not-found`) — der Tab wirkte wie eine fremde Seite | 1 | 4 | 🔒 (Runde 2, hier verifiziert) |
| F3 | Unboxing | Kein OG-/Twitter-Bild: geteilte Links zeigten keinen „Buchdeckel“; ohne `metadataBase` hätte Next OG-URLs gegen `localhost:3000` aufgelöst | 2 | 4 | ✅ `public/og.png` + OpenGraph/Twitter-Metadata + `metadataBase` (Pages-Domain) |
| F4 | Fehlerfläche | 404 war Next-Standardseite (unbranded, englisch) | 2 | 1, 4 | ✅ `src/app/not-found.tsx`, gebrandet, menschlich |
| F5 | Fehlerfläche | Crash-Seite: „Client-Crash gefangen“ + roher Stack-Trace als erste Ansicht — Jargon, Angst, keine Hilfe | 2 | 2 | ✅ `global-error.tsx`: menschliche Sprache, Aktionen, Details einklappbar |
| F6 | A11y/Respekt | `maximumScale: 1` verbot Pinch-Zoom (WCAG 1.4.4) | 2 | 2 | ✅ entfernt |
| F7 | A11y/Respekt | `themeColor` nur dunkel — helle Systemumgebung bekam falschen Browser-Rahmen | 3 | 1 | ✅ Media-Query-Paar in `viewport` |
| F8 | Respekt | `select-none` auf `<body>`: kein Wert, keine Fehlermeldung kopierbar | 3 | 2 | ✅ entfernt (Buttons/Canvas tragen es selbst) |
| F9 | Rückseite | Toter Code: `LeftSidebar.tsx`, `Toolbar.tsx` nicht referenziert | 3 | 3 | ✅ gelöscht |
| F10 | Stabilität | `LibraryPalette`: `useEffect` nach frühem `return null` → Hook-Reihenfolge bricht bei Toggle (Rules-of-Hooks) | 1 | 1, 2 | ✅ Early-Return hinter alle Hooks |
| F11 | Korrektheit | `Canvas.draw`: `useCallback`-Deps `[cursor.x, cursor.y]` — `snap` stale → Snap-Toggle wirkte erst nach Mausbewegung | 2 | 2 | ✅ Deps `[cursor, snap]` |
| F12 | Rückseite | `useMediaQuery` + Workbench-Theme: `setState` synchron im Effect (Kaskaden-Render, Lint-Error) | 2 | 1 | ✅ `useSyncExternalStore` |
| F13 | Typografie | Gerade Quotes/Apostrophe in UI-Copy (`geht's`, `"r 10k"`) — Billigtypografie im Sichtfeld | 3 | 1 | ✅ `’`, `„“` |
| F14 | Typografie | Emoji als UI-Icon im First-Run-Moment (✨, 📚) statt Systemsymbol | 3 | 1, 4 | ✅ Lucide `Sparkles`/`Library` |
| F15 | Vertrauen | Keine Sicherheits-Header; Icons/Manifest ohne Cache-Policy | 2 | 1 | ✅ `_headers`: nosniff, Referrer-, Permissions-Policy + Cache-Stufen |
| F16 | Verpackung | README nannte falschen Namen, erklärte nicht das Produkt | 3 | 4 | ✅ neu geschrieben |
| F17 | Tempo | 1,3 MB JS (unkomprimiert) beim Erststart, ein Bundle für alles | 3 | 4 | 📋 siehe Backlog B1 |
| F18 | Stimme | UI-Sprache mischt DE/EN („Select“, „Wire“, „Fit“ neben deutschem Chrome) | 3 | 1, 3 | 📋 siehe Backlog B2 |
| F19 | Rückseite | ESLint-Warnings: frische Fallback-Objekte in `Instruments` (Identitäts-Flackern), fehlende Dep in `LibraryPalette`, undokumentierter Live-Takt in `ProbeTable` (+ tote Code-Schleife dort) | 3 | 1 | ✅ Defaults in `useMemo`, Dep ergänzt, Taktgeber kommentiert, Totcode entfernt → `eslint .` = 0/0 |
| F20 | Verpackung | `apple-icon.png` nur als 512er-Kopie (Apple-HIG will 180 px); Next 16 emittiert für File-Convention-Apples zudem keine `<link>`-Tags | 4 | 4 | ✅ `apple-icon.png` = 180 px + `apple-icon1.png` = 512 px, Links mit `sizes` aus `metadata.icons.apple` |

**Kritischste Erkenntnis der Runde:** Die sichtbaren Flächen (Canvas, Instrumente, Bibliothek)
sind bereits nahe „insanely great“ (Runden 1–2). Gebrochen war die *Peripherie*: Markenstimme,
Fehlerflächen, Teilen-Deckel, Header — genau die Rückseite des Schranks. Ein Favicon-Fehler ist
nie „nur ein Favicon“: Er ist das Symptom dafür, dass niemand den ersten Tab-Blick mitdesignt hat.

---

## 3 · Was geändert wurde (kurz & nachweisbar)

- **Marke = eine Stimme:** `Multispice` durchgängig in `layout.tsx` (Title-Template, OG, Twitter),
  `model.ts` (SPICE-Export-Kommentar), `editor.ts` (Boot-Log), `globals.css`, README/CLOUDFLARE/DESIGN.
- **Unboxing/Teilen:** `og.png` (1200×630, Icon + Wortmarke + Trace-Motiv, aus `icon.svg`-Master
  generiert), OpenGraph- & Twitter-Card-Metadata.
- **Fehler als Design:** `not-found.tsx` (404 gebrandet, deutsch, ein Ausweg), `global-error.tsx`
  (Beruhigung zuerst, zwei Aktionen, Tech-Details opt-in und selektierbar).
- **Respekt:** Pinch-Zoom erlaubt, Theme-Color folgt System, Text selektierbar wo sinnvoll.
- **Rückseite:** Dead Code weg, Hook-Bug weg, Stale-Closure weg, `useSyncExternalStore` statt
  Effect-SetState, Typografie-Zeichen korrekt, `_headers` mit Vertrauen + Cache-Logik.
- **Icons (verifiziert):** `/icon.svg`, `/apple-icon.png`, `/favicon.ico` (16/32/48), `/favicon.png`,
  `/manifest.json`, `/og.png` — alle mit korrektem Content-Type aus `out/` ausgeliefert.

---

## 4 · Verifikation

```
npm install && ./node_modules/.bin/tsc --noEmit   → 0 Fehler
./node_modules/.bin/next build                    → ✓ Compiled successfully
Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /apple-icon.png
└ ○ /icon.svg
eslint .                                          → 0 Errors, 0 Warnings (vorher 12 Errors, 5 Warnings)
Statischer Smoke-Test (serve out/): /, /icon.svg, /apple-icon.png, /favicon.ico,
/favicon.png, /manifest.json, /og.png → 200 mit korrekten Content-Types
```

---

## 5 · Backlog — bewusst nicht jetzt

- **B1 Tempo („Saving Lives“):** Ein Bundle für Editor + Instrumente + Analysen. Plan:
  `next/dynamic` (ssr:false) für Instrument-Layer & AnalysisDialog, sobald Messdaten zeigen,
  dass Erst-Render wartet. Erst messen (Real-User-Timing), dann schneiden — kein blindes Splitting.
- **B2 Stimme DE/EN:** Werkzeugnamen (Select/Wire/Fit) sind EDA-Fachvokabular; Chrome ist deutsch.
  Entscheidung nötig: Fachbegriffe als Eigenname behalten (wie „Oszi“) oder voll übersetzen.
  Nicht nebenbei ändern — Copy ist ein Produkt-Entscheid.
- **B3 CI:** Circuit-Szenarien (`src/lib/tests`) + typecheck/build/lint als GitHub-Action —
  Qualität muss automatisch wachen, nicht pro Session. (Lint ist seit dieser Runde bei 0/0;
  die Absicht dahinter ist jetzt im Code dokumentiert.)

---

## 6 · Würde Steve shippen?

**Ja — zum ersten Mal auch die Verpackung.** Die Werkstatt (Canvas, Simulation, Instrumente)
war schon vorher sein Niveau; diese Runde hat die Flächen geschlossen, die er zuerst angefasst
hätte: Tab, Teilen-Karte, Fehler, leere Leinwand, README. Offen bleiben zwei bewusste Entscheidungen
(Tempo-Split, Sprachstimme) — kein Verstecken, sondern Fokus: erst messen, dann schneiden.

> „Design is not just what it looks like and feels like. Design is how it works.“ —
> jetzt gilt das auch für `/favicon.ico`.

---

## Quellen

- Blake Crosley, *Design Philosophy: Steve Jobs — The Back of the Fence* (Playboy-Interview 1985,
  NYT 2003, Focus-Zitat): https://blakecrosley.com/blog/design-philosophy-steve-jobs
- folklore.org, *Saving Lives* (Andy Hertzfeld, Bootzeit-Anekdote): https://www.folklore.org/Saving_Lives.html
- Steve Jobs Archive, *Objects of Our Life* (Markkula-Memo „People DO judge a book by its cover“):
  https://stevejobsarchive.com/stories/objects-of-our-life
- Perkins, *The Story Behind the Lisa (and Macintosh) Interface* (freundliche, menschliche
  Fehlermeldungen als Designziel): https://www.bitsavers.org/pdf/apple/lisa/development_history/articles/Perkins_-_Inventing_Lisa_Interface_CPSR_email_199606.pdf

# Stilführer Schaltplan-Symbole (S5.13)

Verbindlich für neue Bauteile in `src/lib/library/catalog.ts`. Jede Regel ist
entweder gemessen (Stand 2026-10-05) oder im Renderer begründet — der Test
`S5.13d` in `scripts/sprint5resttest.ts` bewacht Raster, Typo und Strich.

## 1. Raster

- **Pins liegen auf dem 10-px-Raster** (x und y durch 10 teilbar). Gemessen:
  2113/2113 Pins konform. Das Platzierungs-Raster (24 px) und der Pin-Snap
  beim KiCad-Import bauen darauf.
- **Stubs reichen exakt bis zur Pin-Koordinate** (Beispiel 7-Segment:
  Pins bei ±50, Stubs von ±40 bis ±50). Kein Überstand, keine Lücke —
  sonst hängt die Leitung optisch in der Luft.
- Körpermaße in 5er-Schritten, symmetrisch um (0, 0), wo es die Physik erlaubt.

## 2. Strich

- **Ein Strich für alles:** `--symbol` (hell `#1c1d1f`, dunkel `#e5e5ea`),
  1,3 px, rund (Join + Cap). Selektion färbt auf `--wire-sel` um.
- Das Feld `w` an Linien-Prims wird vom Renderer **ignoriert** — nicht
  setzen (Lint verbietet es). Wer dickere Akzente braucht (z. B. Lampen-
  Wendeln), zeichnet sie als eigene Prims in der interaktiven Sonderlogik.
- Füllungen (`fill: true`) nur für massive Körper (Punkte, Gehäuseflächen),
  sonst Kontur.

## 3. Palette

| Element | Token | hell | dunkel |
|---|---|---|---|
| Symbol-Tinte | `--symbol` | `#1c1d1f` | `#e5e5ea` |
| Pin-Punkte (r = 1,5) | `--pin` | `#5b5e63` | `#a1a1a6` |
| Wert/Label unter dem Bauteil | `--ink-2` | `#53565b` | `#a1a1a6` |
| Selektion | `--wire-sel` | `#a35a06` | `#f0a94a` |

Interaktive Sonderfarben (LED-Glühen, 7-Segment-Rot `#ff4d4f`) sind den
Render-Sonderfällen in `render.ts` vorbehalten — nicht in `catalog.ts`
hartcodieren.

## 4. Typo im Symbol

- Standardschrift: 600, System-Sans, zentriert. Größen nur aus dem Bestand:
  **7** (Pin-Kürzel, Fein-Labels — 1043×), **10/11** (Kurzzeichen),
  8/9/12/13 nur begründet (Legacy). Default 9.
- Referenzzeichen (R1, C3, …) und Werte (4k7, 100n, …) rendert der Canvas
  automatisch **unter** das Bauteil — nie ins Symbol schreiben.
- Umlaute vermeiden (Mono-Fallbacks auf manchen Systemen).

## 5. Pins

- `electrical` pflegen, wo bekannt (`input`/`output`/`power_in` treiben den
  ERC; Default bleibt absichtlich leer = passiv/unbekannt).
- Pin-Namen kurz und stabil (`+`, `-`, `a`–`g`, `COM`) — sie erscheinen in
  Fehlermeldungen und im Inspector.
- Dynamische Pins (`pinsFor`, z. B. Bus-Splitter) folgen denselben Regeln.

## 6. Stile (IEC/ANSI)

Nur Widerstands-Familie + Spulen haben Stil-Varianten (`getPartSymbol`).
Neue Stil-Abhängigkeiten nur, wenn beide Normen ein eigenes Zeichen kennen —
sonst ein Symbol für alle.

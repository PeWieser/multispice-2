# Layout „Luft & Ruhe“ — Plan und Kernumsetzung

Stand: 2026-10-13. Ziel: Die App wirkt ruhiger, ohne Funktionen zu verlieren.
Regel: Eine Sprache pro Muster — wer ein zweites Muster erfindet, löscht das erste.

## Befund (Audit)

1. **Mikro-Typo als Standard**: `text-2xs` (11 px) steht 320× im Code — Fließtext,
   Labels und Meta sprechen fast alle gleich leise. Keine Hierarchie, keine Ruhe.
2. **Drei Hover-Sprachen** für dasselbe Muster (Zeilen-Hover): 5 % (`.tree-row`),
   6 %, 8 %, 10 % (inline `color-mix`) plus flächig `hover:bg-surface-2`.
3. **Neun identische Abschnittsköpfe** im Inspector (inline-Literal), dazu ein
   zehnter in der Bibliothek — gleiche Zeilen, zehn Definitionen.
4. **Rahmen in Textfarbe**: nacktes `border` (= `currentColor`) an Canvas-Pill
   und Part-Editor-Karten — härter als jede Haarlinie.
5. **Drei Chrome-Raster**: Strip `px-3.5`, Tabs `px-2`, Footer `px-2.5`, Inspector-Kopf
   `px-2` gegen `p-3`-Rumpf — nichts fluchtet.
6. **Zwei Sprachen**: „Zoom to error“ / „Zoom“ im sonst deutschen Prüf-Tab.

## Kernumsetzung (dieser Commit)

- `.section-head` (neu, `globals.css`): eine Kopfsprache — Kapitälichen 11 px,
  semibold, Laufweite, Luft oben/unten. Inspector 9× + Bibliothek 1× migriert.
- `ui/Field.tsx`: Checkbox- und Slider-Labels sprechen `text-xs` wie `FieldLabel`
  (Werte/Beisätze bleiben `2xs` — Meta bleibt Meta).
- **Ein Zeilen-Hover**: alles Neutrale → `.tree-row` (Strip, Bibliothek 7×,
  ProbeTable, StatusBar 2×, Sheet-Kontextmenü 3×, Seitennavigator).
- **Haarlinien**: Canvas-Pill + Part-Editor-Karten 2× (`border-hairline`).
- **Ein Chrome-Raster**: Strip, Tabs, Footer, Inspector-Kopf → `px-3` (12 px).
- **Haus-Komponenten**: Bibliotheks-Parameterkarte → `.panel`, externe Links →
  `.btn`; Prüf-Tab-Buttons ohne Größen-Overrides.
- **Deutsch**: „Zum Fehler“ / „Zeigen“.

## Offen (Folge-Arbeit, bewusst nicht in diesem Schnitt)

- **Typo-Leiter**: `text-2xs` als Fließtext-Standard in Dialogen/Karten auf `xs/sm`
  heben — braucht Sichtprüfung pro Fläche (Blind-Edit zu riskant). Dazu gehören
  auch die Listen-Köpfe der Bibliothek (4×, Navigations-Kontext, bewusst eigener
  Rhythmus statt `.section-head`).
- **Radius**: `rounded-md/lg` vs. semantische Token (`control/field/panel/window`)
  angleichen — visuell fast identisch, reine Code-Ruhe.
- **Instrumenten-Skins** (`oszi2`/`fg2`, Hardcoded-Hex): Absicht (Hardware-Look),
  nicht anfassen.
- **PDF/Druck**: druckt die aktive Seite; Mehrseiten-Druck (alle Seiten hinter-
  einander) fehlt noch.
- **Hinweis-Boxen**: keine neuen; Bestand bei Berührung entfernen (stehende Regel).

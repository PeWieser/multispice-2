# Library UX – Recherche & Plan (Ziel 1)

## Ist-Zustand (LibraryPalette.tsx)

- Floating Palette, drag+resize, 3 Tabs: Alle / Favoriten / Zuletzt
- Suche: `searchParts(query)` – einfache String-Suche über name/category/tags
- Tree: `buildCategoryTree(PARTS)` rekursiv, jede Node hat parts + children
- PartRow: zeigt Ref Badge (z.B. R, C), Name, Kategorie/Mount, Star Favorit
- Kein Symbol-Preview, keine Beschreibung, kein Datasheet Link, keine Icons außer Ref-Text
- Kein Grid-View, keine Kategorie-Icons, keine Filter, keine Keyboard-Navigation über Pfeiltasten
- Performance: 402 Parts, Tree Rendering O(n), Suche O(n) – ok, aber keine Virtualisierung

## Recherche – Was machen andere EDA Tools gut?

### KiCad, EasyEDA, Flux, Multisim, Altium, Fritzing
- **Kategorisierung mit Icons + Farben**: Passives gelb, Dioden orange, Transistoren blau, ICs violett, Power rot, Quellen grün, Connectors grau. Mensch erkennt Farbe+Form 200ms schneller als Text (Pre-attentive processing).
- **Such-UX**: 
  - Fuzzy search (Fuse.js) mit Gewichtung: name 0.5, tags 0.3, description 0.2, category 0.1
  - Instant results, Highlight matched chars, keyboard ↑↓ Enter
  - Recent search history, autocomplete Chips (z.B. "resistor 10k", "nmos sot23")
  - Filter Chips: THT/SMD, Mount, Category, Manufacturer
- **Preview**: 
  - Kleines Canvas 64x64 das Symbol mit `drawPrim` rendert (gleiche Pipeline wie Schematic)
  - Rechts daneben: Name, Beschreibung (1-2 Sätze), Key Params (R=10k, V=5V), Footprint, Tags
  - Datasheet Link Button → öffnet in neuem Tab
  - "In Schaltplan platzieren" Button + Drag Preview
- **Datasheet Linking**:
  - Option A: Statische Map `DATASHEETS: Record<partId, {url, manufacturer}>` für wichtige ICs (NE555, LM741, 2N3904 etc) – handcurated, zuverlässig
  - Option B: Generische Suche: `https://www.octopart.com/search?q=${partId}` oder `https://alldatasheet.com` – immer vorhanden, aber nicht direkt PDF
  - Option C: Kombination – wenn curated URL vorhanden, nutze die, sonst fallback zu Octopart/Alldatasheet Such-URL
  - Für MOSFETs/Transistoren: Link zu Hersteller (Infineon, TI) + generisch
- **Handcrafted Icons**:
  - Idee: Für jede Top-Kategorie ein handgezeichnetes 16px Icon (SVG) – nicht generisch lucide, sondern EDA-spezifisch:
    - Resistor: Zickzack in 3 Strichen, leicht hand-drawn
    - Capacitor: zwei parallele Linien mit leichtem Gap
    - Inductor: 3 Bögen
    - Diode: Dreieck + Linie
    - Transistor: Kreis mit Pfeil
    - MOSFET: 3 Linien + Pfeil
    - OpAmp: Dreieck
    - 555: Rechteck mit 8 Pins angedeutet
    - Power: Blitz
    - Ground: 3 Linien
  - Farben: Kategorie-Farbe als Hintergrund des Icons (z.B. `bg-amber-500/20 text-amber-400` für Passives)
  - Vorteil: Scanability – Nutzer sieht im Augenwinkel "blaues Dreieck = OpAmp", nicht nur Text
- **Layout**:
  - List vs Grid Toggle: List = kompakt, Grid = 2 Spalten mit großen Symbol-Previews (für visuelle Suche)
  - Sticky Kategorie-Header, Collapsible Sections
  - Breadcrumb: "Passives > Resistors > 10k"
  - Quick Filters: "Nur THT", "Nur ICs"

## Geplanter Neubau – Library V2

### Datenmodell Erweiterung (`catalog.ts`)

```ts
interface PartDef {
  // bestehend...
  description?: string; // 1-2 Sätze, z.B. "NPN bipolar transistor, 40V 200mA"
  datasheet?: string;   // curated URL
  manufacturer?: string;
  color?: string;       // Kategorie-Farbe für Icon
  icon?: "resistor" | "capacitor" | ... // handcrafted icon key
}
```

- Für 402 Parts: description für Top 50 handcurated, Rest generiert aus params (z.B. "10kΩ resistor, 0.25W")
- DATASHEET_MAP: ca. 80 Einträge für ICs, MOSFETs, Dioden, Transistoren
- Beispiel: `ne555: {url: "https://www.ti.com/lit/ds/symlink/ne555.pdf", manufacturer: "TI"}`

### UI Komponenten

**1. Suchleiste neu:**
- Input mit Icon, Clear Button, Shortcut Hint ("/" fokussiert Suche)
- Unter Input: Filter Chips Row (Alle, Passiv, Aktiv, IC, Power, Favorit) – horizontal scrollable auf Mobile
- Live Suche mit debounce 120ms, Fuse.js für Fuzzy
- Keyboard Nav: ↑↓ navigiert, Enter platziert, Esc cleared

**2. Kategorie-Navigation:**
- Linke Spalte (oder Top auf Mobile): Kategorie-Baum mit Icons + Farben
- Jede Kategorie: Icon + Name + Count (z.B. "Transistors (32)")
- Active State: farbiger Hintergrund, fetter Text
- Auf Mobile: Horizontal scrollable Pills statt Baum

**3. Part Liste:**
- `PartRowV2`:
  - Links: 40x40 Symbol Preview Canvas (rendert `part.symbol` mit 0.8 scale)
  - Mitte: Name (fett), Beschreibung (muted 11px, 2 Zeilen max), Tags (kleine Pills)
  - Rechts: Ref Badge + Favorit Star + Platzieren Button (nur on Hover)
  - Hover: zeigt größere Preview Tooltip (96x96) + Datasheet Button
- Grid View: 2-3 Spalten, jede Karte zeigt großes Symbol + Name + Ref

**4. Detail Panel (rechte Seite der Palette oder Drawer):**
- Wenn Part selektiert (Hover oder Click):
  - Großes Symbol Preview 120x120
  - Name, Kategorie Breadcrumb, Beschreibung
  - Params Tabelle (editierbare Defaults?)
  - Footprint, Mount
  - Datasheet Link: Button "📄 Datenblatt (TI)" + Fallback "🔍 Octopart Suche"
  - Actions: "Platzieren (Enter)", "Favorit", "Kopieren"
  - Related Parts: "Ähnliche Teile" (z.B. andere NPN Transistoren)

**5. Handcrafted Icons – Umsetzung:**
- Erstelle `src/lib/library/icons.tsx` mit SVG Komponenten für jede Kategorie (ca. 15 Icons)
- Jedes Icon: 16x16 viewBox, stroke 1.5, hand-drawn leicht unperfekt (z.B. `stroke-linecap="round"`, kleine Jitter)
- Farben via CSS Variable, nicht hardcoded
- In PartRow: Icon Hintergrund farbcodiert, Icon selbst in Kategorie-Farbe

### Performance
- Virtualisierung mit `react-window` für Liste >100 Items
- Symbol Preview Canvas: memoisiert, nur einmal rendern pro Part, als DataURL cache

### Human Design Checks
- Hit Targets: Row Höhe min 44px auf Mobile (Apple HIG)
- Kein Verschwinden bei leicht daneben tippen: Hover Preview hat 200ms Delay + bleibt 300ms nach Leave
- Lesbarkeit: Beschreibung max 2 Zeilen, `line-clamp`, 11px muted, Name 12px semibold
- Kein Flackern: Suche debounced, keine Layout Shifts (feste Höhe)
- Undo: Favorit Toggle hat Undo Toast "Favorit entfernt – Rückgängig"

### Offene Fragen für dich (bitte wählen)

**Q1 – Datasheet Strategie:**
- A) Nur curated Links für Top 80 + Fallback Octopart (wenig Arbeit, 90% Abdeckung)
- B) Für alle 402 Parts generische Octopart/Alldatasheet Suche (100% Abdeckung, aber weniger präzise)
- C) Beides + zusätzlich User kann eigenen Link hinzufügen (persistiert in localStorage)

**Q2 – Icon Stil:**
- A) Minimal handcrafted (wie oben, 1.5px Strich, leicht unperfekt, farbcodiert)
- B) Gefüllte farbige Icons (wie Fritzing – sehr bunt, schneller erkennbar, aber mehr visuelles Rauschen)
- C) Hybrid: Kategorie-Icon handcrafted + kleines farbiges Dot für Mount (THT=gelb, SMD=blau)

**Q3 – Layout:**
- A) Palette bleibt floating, aber mit Detail Panel rechts daneben (Desktop: 2-Spalten in Palette)
- B) Palette wird zum Side-Drawer (wie jetzt, aber breiter, mit Preview)
- C) Ganz neue Library Seite (Vollbild, wie EasyEDA) – mehr Platz, aber Modalität bricht Flow

**Q4 – Suche:**
- A) Nur Textsuche + Filter Chips (einfach)
- B) + Fuzzy + Tag Autocomplete (mächtiger, etwas komplexer)
- C) + Command Palette Style (Cmd+K öffnet Library, "/" fokussiert Suche, "r 10k" sucht resistor 10k – wie VS Code)

---

**Mein Vorschlag:** Q1=A+C, Q2=A, Q3=A, Q4=C – schnell, visuell, power-user freundlich.


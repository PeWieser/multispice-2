/**
 * Eine Quelle für alle Tastenkürzel. Die Kurzbefehl-Übersicht (?) und die
 * Werkzeug-Tooltips lesen von hier. Apple-Glyphen sind die Quellform;
 * `adaptShortcut` übersetzt sie für Windows/Linux (Strg, Alt, Umschalt).
 */
export type Shortcut = { label: string; keys: string[]; note?: string };
export type ShortcutGroup = { title: string; items: Shortcut[] };

export const TOOL_KEYS = {
  select: "Esc",
  wire: "W",
  erase: "E",
  junction: "J",
  label: "L",
  text: "T",
  pan: "H",
} as const;

export const SHORTCUTS: ShortcutGroup[] = [
  {
    title: "Werkzeuge",
    items: [
      { label: "Auswahl", keys: [TOOL_KEYS.select] },
      { label: "Stift (Netz zeichnen)", keys: [TOOL_KEYS.wire] },
      { label: "Radiergummi", keys: [TOOL_KEYS.erase] },
      { label: "Knotenpunkt", keys: [TOOL_KEYS.junction] },
      { label: "Netzname", keys: [TOOL_KEYS.label] },
      { label: "Notiz", keys: [TOOL_KEYS.text] },
      { label: "Hand (verschieben)", keys: [TOOL_KEYS.pan] },
      { label: "Spannungs-Probe", keys: ["V"], note: "dann klicken" },
      { label: "Strom-Probe", keys: ["A"], note: "dann klicken" },
    ],
  },
  {
    title: "Bearbeiten",
    items: [
      { label: "Drehen", keys: ["R", "⇧R"] },
      { label: "Spiegeln", keys: ["M"] },
      { label: "Duplizieren", keys: ["⌘D"] },
      { label: "Alles auswählen", keys: ["⌘A"] },
      { label: "Löschen", keys: ["Entf"] },
      { label: "Rückgängig", keys: ["⌘Z"] },
      { label: "Wiederholen", keys: ["⇧⌘Z"] },
    ],
  },
  {
    title: "Ansicht & Simulation",
    items: [
      { label: "Bibliothek", keys: ["⌘K"] },
      { label: "Alles einpassen", keys: ["F"] },
      { label: "Raster / Fangen", keys: ["G", "⇧G"] },
      { label: "Zoomen / Schwenken", keys: ["Rad", "⇧Rad"] },
      { label: "Simulation starten / pausieren", keys: ["Leertaste"] },
      { label: "Kurzbefehle", keys: ["?"] },
    ],
  },
  {
    title: "Platzieren & Esc-Kette",
    items: [
      { label: "Ghost bewegen", keys: ["←", "→", "↑", "↓"], note: "mit ⇧ 5-fach" },
      { label: "Bauteil platzieren", keys: ["Enter"], note: "mit ⇧ weiter platzieren" },
      { label: "Esc-Kette", keys: ["Esc"], note: "Overlay → Messleitung → Auswahl → Werkzeug" },
    ],
  },
  {
    title: "Maus & Touch",
    items: [
      { label: "Leitung verschieben", keys: [], note: "Anfasser ziehen, Doppelklick löscht" },
      { label: "Netz hervorheben", keys: [], note: "über Leitung fahren" },
      { label: "Kontextmenü", keys: [], note: "Rechtsklick / lang halten" },
      { label: "Touch-Zoom", keys: [], note: "zwei Finger" },
    ],
  },
];

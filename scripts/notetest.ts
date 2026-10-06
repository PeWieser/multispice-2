/**
 * S5.22b: Notizzettel-Markup — Parsen, HTML-Roundtrip, Kartengrenzen.
 * Läuft ohne DOM (reine String-/Mathe-Funktionen).
 */
import { NOTE_CARD_SIZES, NOTE_FONT_DEFAULT, NOTE_FONT_STACK, NOTE_FONT_STEPS, NOTE_H, NOTE_PAD_X, NOTE_TOP_PAD, NOTE_W, clampNoteScroll, htmlToMarkup, markupToHtml, nearestFontStep, noteCardSize, noteEditorPadSide, noteEditorPadTop, noteFirstBaseline, noteLineH, parseNoteRuns } from "../src/lib/notes/markup";
import { getNoteBounds } from "../src/components/Canvas/hitTest";
import { readFileSync } from "node:fs";

let failed = 0;
function check(name: string, ok: boolean, info = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` – ${info}` : ""}`);
  if (!ok) failed++;
}

/* 1 · Parsen */
{
  const r = parseNoteRuns("**fett** und *kursiv* und __unter__");
  check("drei Stile → drei Läufe + Text", r.length === 1 && r[0].length === 5, JSON.stringify(r[0].map((x) => x.t)));
  check("fett-Flags", r[0][0].b && !r[0][0].i && !r[0][0].u);
  check("kursiv-Flags", r[0][2].i && !r[0][2].b);
  check("unterstrichen-Flags", r[0][4].u && !r[0][4].b);
  check("Normaltext dazwischen", r[0][1].t === " und " && !r[0][1].b && !r[0][1].i);
  const m = parseNoteRuns("a\nb");
  check("Zeilenumbruch", m.length === 2 && m[0][0].t === "a" && m[1][0].t === "b");
  const e = parseNoteRuns("2\\*3 und \\__x\\__");
  check("Maskierung", e[0].length === 1 && e[0][0].t === "2*3 und __x__", e[0][0]?.t);
  const u = parseNoteRuns("offen **fett");
  check("ungeschlossen bleibt an", u[0].length === 2 && u[0][1].b);
}

/* 2 · Roundtrip Markup → HTML → Markup */
for (const m of [
  "**fett** normal",
  "*kursiv* und __unter__",
  "***fett-kursiv***",
  "Zeile1\nZeile2 mit **fett**",
  "einfach nur Text",
]) {
  const back = htmlToMarkup(markupToHtml(m));
  check(`Roundtrip ${JSON.stringify(m)}`, back === m, JSON.stringify(back));
}

/* 3 · Editor-HTML (contentEditable-Formen) */
{
  check("div-Zeilen", htmlToMarkup("<div>eins</div><div>zwei</div>") === "eins\nzwei");
  check("br-Zeilen", htmlToMarkup("eins<br>zwei") === "eins\nzwei");
  check("b/i/u-Tags", htmlToMarkup("<div><b>f</b> <i>k</i> <u>u</u></div>") === "**f** *k* __u__");
  check(
    "Verschachtelung",
    htmlToMarkup("<div><b><i>x</i></b></div>") === "***x***",
    htmlToMarkup("<div><b><i>x</i></b></div>"),
  );
  check("strong/em-Aliase", htmlToMarkup("<div><strong>s</strong><em>e</em></div>") === "**s***e*");
  check("Fremd-Tags fallen weg", htmlToMarkup('<div><span style="x">t</span></div>') === "t");
  check("leerer Editor", htmlToMarkup("<div><br></div>") === "");
}

/* 4 · Einheitskarte (S5.23: jeder Zettel gleich groß, Text scrollt innen) */
{
  check("Kartenbreite 232", NOTE_W === 232);
  check("Kartenhöhe 150", NOTE_H === 150);
  const big = { id: "n", x: 0, y: 100, text: `${"wort ".repeat(60)}\n${"zeile\n".repeat(30)}` };
  const b = getNoteBounds(big as never);
  check("lange Notiz: volle Karte", b.w === NOTE_W && b.h === NOTE_H, `${b.w}×${b.h}`);
  const small = { id: "n", x: 0, y: 100, text: "kurz" };
  const s2 = getNoteBounds(small as never);
  check("kurze Notiz: gleiche Karte", s2.w === NOTE_W && s2.h === NOTE_H, `${s2.w}×${s2.h}`);
  const empty = { id: "n", x: 5, y: 100, text: "" };
  const e2 = getNoteBounds(empty as never);
  check("leere Notiz: gleiche Karte, Anker bleibt", e2.w === NOTE_W && e2.h === NOTE_H && e2.x === 5 && e2.y === 82);
}

/* 5 · Schriftstufen + Scroll-Arithmetik (S5.23) */
{
  check("drei Stufen", NOTE_FONT_STEPS.length === 3, NOTE_FONT_STEPS.join("/"));
  check("Standard ist Mittel", NOTE_FONT_DEFAULT === 12);
  check("klein rundet auf 9", nearestFontStep(8) === 9 && nearestFontStep(10) === 9);
  check("mittel rundet auf 12", nearestFontStep(11) === 12 && nearestFontStep(13) === 12);
  check("groß rundet auf 16", nearestFontStep(15) === 16 && nearestFontStep(20) === 16);
  check("ohne Überlauf kein Scroll", clampNoteScroll(50, 100, 150) === 0);
  check("Scroll klemmt oben", clampNoteScroll(-30, 300, 150) === 0);
  check("Scroll klemmt unten", clampNoteScroll(999, 300, 150) === 150);
  check("Scroll mittig bleibt", clampNoteScroll(60, 300, 150) === 60);
}

/* 6 · Verdrahtung (statische Regressions-Wächter) */
{
  const canvas = readFileSync("src/components/Canvas.tsx", "utf8");
  const inline = readFileSync("src/components/InlineEditor.tsx", "utf8");
  const editor = readFileSync("src/components/NoteEditor.tsx", "utf8");
  check(
    "Tastaturschutz im Notizeditor",
    canvas.includes("isContentEditable) return;"),
    "sonst feuern Canvas-Kürzel beim Tippen"
  );
  check(
    "kein kind:text mehr",
    !inline.includes('| "text"') && !canvas.includes('kind: "text"'),
    "Notizen laufen über den Direkteditor"
  );
  check(
    "neue leere Notiz wird verworfen",
    canvas.includes("wasNew && !markup.trim()"),
    "kein leerer Zettel nach Esc"
  );
  check(
    "Editor committed Markup",
    editor.includes("onCommit(htmlToMarkup(") && editor.includes("contentEditable"),
    "Direkteditor auf dem Zettel"
  );
  check(
    "Rad scrollt den Zettel",
    canvas.includes("noteMaxScrollRef.current.get(hit.id)") && canvas.includes("hitTestNote(st.doc, { x: mx /"),
    "statt zu zoomen"
  );
  check(
    "kein Auslassungs-… mehr",
    !canvas.includes('t: "…"'),
    "Überlauf scrollt statt zu kappen"
  );
  check(
    "drei Schriftstufen im Editor",
    editor.includes("NOTE_FONT_STEPS.map") && editor.includes("aria-pressed={size === s}"),
    "S/M/L-Auswahl"
  );
  check(
    "kein Eselsohr mehr",
    !canvas.includes("Umgeknickte Ecke") && !editor.includes("Umgeknickte Ecke"),
    "glatte Karte"
  );
  check(
    "leere Notiz bleibt leer",
    !canvas.includes('t: "Notiz"'),
    "kein Platzhalter"
  );
  check(
    "Geist-Vorschau ist Einheitskarte",
    canvas.includes("paperGhost") && !canvas.includes("Notiz platzieren"),
    "WYSIWYG beim Platzieren"
  );
  check(
    "kein Auswahlrahmen beim Ziehen",
    canvas.includes("selection.includes(note.id) && !"),
    "Rahmen kehrt beim Loslassen zurück"
  );
  check(
    "Leiste sitzt intelligent",
    editor.includes("placeAbove") && editor.includes("barLeft"),
    "oben wenn möglich, sonst unten, waagrecht geklemmt"
  );
  check(
    "Vorschau ohne Diagonal-Retrace",
    !canvas.includes("i < preview.length") && canvas.includes("previewNetPath(ref, []"),
    "nur das lose Ende läuft gestrichelt"
  );
}

/* 7 · S5.27: Eine Metrik für Ansicht + Editor (WYSIWYG-Regressions-Wächter) */
{
  check("Karten-Metrik", NOTE_PAD_X === 10 && NOTE_TOP_PAD === 9);
  check("Zeilenrhythmus", noteLineH(9) === 14 && noteLineH(12) === 17 && noteLineH(16) === 21);
  check(
    "erste Grundlinie",
    noteFirstBaseline(12) === NOTE_TOP_PAD + noteLineH(12) - 4 && noteFirstBaseline(12) === 22,
    "topPad + lineH − 4"
  );
  check("Umbruchbreite 212", NOTE_W - 2 * NOTE_PAD_X === 212);
  check("Editor-Seitenabstand", noteEditorPadSide(1, 1) === 9 && noteEditorPadSide(2, 2) === 18);
  const pt = noteEditorPadTop(12, 1, 1);
  check("Editor-Oberabstand ≈ 8.54", Math.abs(pt - 8.54) < 0.01, String(pt));
  const canvasSrc = readFileSync("src/components/Canvas.tsx", "utf8");
  const editorSrc = readFileSync("src/components/NoteEditor.tsx", "utf8");
  check(
    "Canvas nutzt Metrik",
    canvasSrc.includes("noteFirstBaseline(sz)") && canvasSrc.includes("noteLineH(sz)") && canvasSrc.includes("NOTE_FONT_STACK")
  );
  check(
    "Editor nutzt Metrik",
    editorSrc.includes("noteLineH(size)") &&
      editorSrc.includes("noteEditorPadTop(size, zoom, borderW)") &&
      editorSrc.includes("NOTE_FONT_STACK")
  );
  check("keine Alles-Auswahl", editorSrc.includes("collapse(false)") && !editorSrc.includes("Alles wählen"));
  check(
    "Caret an Klickstelle",
    editorSrc.includes("caretRangeFromPoint") && canvasSrc.includes("caret: { x: e.clientX, y: e.clientY }")
  );
  check("kein Rahmen beim Ziehen", canvasSrc.includes("Während des Ziehens gar kein Rahmen"));
  check(
    "Unmount committed",
    editorSrc.includes("commit();") && canvasSrc.includes("prev.id === id ? null : prev"),
    "Zettelwechsel verliert nichts"
  );
}

/* 8 · S5.28: Drei Blattgrößen, One-Shot-Platzierung, deutlichere Elektronen */
{
  check(
    "Blattmaße S/M/L",
    NOTE_CARD_SIZES.s.w === 170 && NOTE_CARD_SIZES.s.h === 110 &&
      NOTE_CARD_SIZES.m.w === NOTE_W && NOTE_CARD_SIZES.m.h === NOTE_H &&
      NOTE_CARD_SIZES.l.w === 310 && NOTE_CARD_SIZES.l.h === 200,
    "M ist der bisherige Zettel"
  );
  check(
    "Größenauflösung mit M-Fallback",
    noteCardSize(undefined) === NOTE_CARD_SIZES.m &&
      noteCardSize("x") === NOTE_CARD_SIZES.m &&
      noteCardSize("s") === NOTE_CARD_SIZES.s &&
      noteCardSize("l") === NOTE_CARD_SIZES.l
  );
  const b = (card: unknown) => getNoteBounds({ id: "n", x: 10, y: 50, text: "", card } as never);
  check("Bounds je Größe", b("s").w === 170 && b("s").h === 110 && b(undefined).w === 232 && b("l").w === 310 && b("l").h === 200);
  check("Kartenanker oben-links", b("l").x === 10 && b("l").y === 32);
  check(
    "Umbruchbreiten 150/212/290",
    [noteCardSize("s").w, noteCardSize("m").w, noteCardSize("l").w].map((w) => w - 2 * NOTE_PAD_X).join(",") === "150,212,290"
  );
  const canvasSrc = readFileSync("src/components/Canvas.tsx", "utf8");
  check("One-Shot-Platzierung", canvasSrc.includes("keine neue Notiz") && canvasSrc.includes("if (editingNote && !existingNote)"));
  check("Blattgrößen-Button", canvasSrc.includes("Karte:") && canvasSrc.includes("Blattgröße wechseln (M → L → S)"));
  check(
    "Elektronen präsenter",
    canvasSrc.includes("const rDot = 2.4 * iz;") &&
      canvasSrc.includes("Math.min(0.78, Math.max(0.40") &&
      canvasSrc.includes('isDarkCanvas() ? "rgba(255, 255, 255, 0.55)"')
  );
}

console.log(failed === 0 ? "\nNotiz-Prüfungen: alle bestanden." : `\nNotiz-Prüfungen: ${failed} FEHLER`);
if (failed) process.exit(1);

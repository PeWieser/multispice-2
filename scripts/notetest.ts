/**
 * S5.22b: Notizzettel-Markup — Parsen, HTML-Roundtrip, Kartengrenzen.
 * Läuft ohne DOM (reine String-/Mathe-Funktionen).
 */
import { NOTE_FONT_DEFAULT, NOTE_FONT_STEPS, NOTE_H, NOTE_W, clampNoteScroll, htmlToMarkup, markupToHtml, nearestFontStep, parseNoteRuns } from "../src/lib/notes/markup";
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
  check("Standard ist Mittel", NOTE_FONT_DEFAULT === 11);
  check("klein rundet auf 9", nearestFontStep(8) === 9 && nearestFontStep(10) === 9);
  check("mittel rundet auf 11", nearestFontStep(11) === 11 && nearestFontStep(12) === 11);
  check("groß rundet auf 14", nearestFontStep(13) === 14 && nearestFontStep(20) === 14);
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
}

console.log(failed === 0 ? "\nNotiz-Prüfungen: alle bestanden." : `\nNotiz-Prüfungen: ${failed} FEHLER`);
if (failed) process.exit(1);

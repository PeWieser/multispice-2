/**
 * S5.26: Echte Schalter-Modelle (SPDT/DPST/DPDT/Dreh/DIP), Relais-Wechsler,
 * Poti-Schieber-Geometrie und Pin-Label-Regel. Läuft ohne DOM.
 */
import { PART_MAP } from "../src/lib/library/catalog";
import { runOperatingPoint } from "../src/lib/sim/analyses";
import type { Netlist } from "../src/lib/sim/engine";
import {
  POT_SLIDER,
  potSliderPosFromLocalY,
  potSliderYFromPos,
  switchControlTargets,
  switchPreviewPrims,
  switchReadClosed,
  switchReadDip,
  switchReadPos,
  switchToggle,
} from "../src/lib/interactive/switches";
import { readFileSync } from "node:fs";
import { showPinLabel } from "../src/components/Canvas/render";
import { dipLeverAt, findPotSliderAt, instanceLocalPoint } from "../src/components/Canvas/hitTest";
import { instanceBounds, rotatePoint } from "../src/lib/schematic/model";

let failed = 0;
function check(name: string, ok: boolean, info = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` – ${info}` : ""}`);
  if (!ok) failed++;
}
function checkNear(name: string, actual: number, expected: number, tol: number) {
  check(name, Math.abs(actual - expected) <= tol, `got ${actual.toPrecision(6)}, want ~${expected}`);
}

const devs = (partId: string, params: Record<string, unknown>, nets: string[]) =>
  PART_MAP[partId].toDevices({ id: "S9", params: params as never } as never, nets);
const nl = (devices: Netlist["devices"]): Netlist => ({ devices });
const vdc = (id: string, p: string, m: string, dc: number): Netlist["devices"][number] =>
  ({ id, type: "V", nodes: [p, m], params: {}, source: { kind: "dc", dc } }) as never;
const res = (id: string, p: string, m: string, r: number): Netlist["devices"][number] =>
  ({ id, type: "R", nodes: [p, m], params: { r } }) as never;

/* 1 · Katalog: Pins */
{
  const ids = ["switch_spst", "pushbutton", "switch_spdt", "switch_dpst", "switch_dpdt",
    "switch_rotary_3", "switch_rotary_4", "switch_rotary_6", "switch_rotary_8", "switch_dip_4", "switch_dip_8"];
  check("alle 11 Schaltertypen vorhanden", ids.every((id) => Boolean(PART_MAP[id])));
  const want: Record<string, number> = { switch_spst: 2, pushbutton: 2, switch_spdt: 3, switch_dpst: 4, switch_dpdt: 6,
    switch_rotary_3: 4, switch_rotary_4: 5, switch_rotary_6: 7, switch_rotary_8: 9, switch_dip_4: 8, switch_dip_8: 16 };
  check("Pinzahlen", ids.every((id) => PART_MAP[id].pins.length === want[id]),
    ids.map((id) => `${id}=${PART_MAP[id].pins.length}`).join(" "));
  check("alle Pins auf 10er-Raster", ids.every((id) => PART_MAP[id].pins.every((p) => p.x % 10 === 0 && p.y % 10 === 0)));
  check("Pin-Koordinaten je Typ eindeutig", ids.every((id) => {
    const s = new Set(PART_MAP[id].pins.map((p) => `${p.x},${p.y}`));
    return s.size === PART_MAP[id].pins.length;
  }));
  check("SPDT-Namen", PART_MAP.switch_spdt.pins.map((p) => p.name).join(",") === "COM,NO,NC");
  check("DPST-Namen", PART_MAP.switch_dpst.pins.map((p) => p.name).join(",") === "1A,1B,2A,2B");
  check("DPDT-Namen", PART_MAP.switch_dpdt.pins.map((p) => p.name).join(",") === "COM1,NO1,NC1,COM2,NO2,NC2");
  check("Dreh-8: COM + 8 Abgriffe aufsteigend",
    PART_MAP.switch_rotary_8.pins[0].name === "COM"
    && PART_MAP.switch_rotary_8.pins.slice(1).every((p, k) => p.name === String(k + 1) && p.x === 30)
    && PART_MAP.switch_rotary_8.pins.slice(1).every((p, k, a) => k === 0 || p.y > a[k - 1].y));
  check("DIP-4-Nummerierung links 1..4", [0, 2, 4, 6].every((i, k) => PART_MAP.switch_dip_4.pins[i].name === String(k + 1) && PART_MAP.switch_dip_4.pins[i].x === -20));
  check("DIP-4-Nummerierung rechts 8..5", [1, 3, 5, 7].every((i, k) => PART_MAP.switch_dip_4.pins[i].name === String(8 - k) && PART_MAP.switch_dip_4.pins[i].x === 20));
  check("DIP-8: 16 Pins, links 1..8", PART_MAP.switch_dip_8.pins.filter((p) => p.x < 0).map((p) => p.name).join(",") === "1,2,3,4,5,6,7,8");
}

/* 2 · Katalog: Symbole (nur Statik, je Typ eigenständig) */
{
  const sym = (id: string) => JSON.stringify(PART_MAP[id].symbol);
  check("alle Symbole nicht-leer", ["switch_spst", "pushbutton", "switch_spdt", "switch_dpst", "switch_dpdt",
    "switch_rotary_3", "switch_rotary_8", "switch_dip_4", "switch_dip_8"].every((id) => PART_MAP[id].symbol.length > 0));
  check("SPDT≠DPST≠DPDT", sym("switch_spdt") !== sym("switch_dpst") && sym("switch_spdt") !== sym("switch_dpdt") && sym("switch_dpst") !== sym("switch_dpdt"));
  check("Dreh-3≠Dreh-8, DIP-4≠DIP-8", sym("switch_rotary_3") !== sym("switch_rotary_8") && sym("switch_dip_4") !== sym("switch_dip_8"));
  check("kein statischer Hebel-Pfad mehr in Fakes", !sym("switch_dpdt").includes("-12,-2,14,-14"));
  const b = (id: string) => instanceBounds({ id: "x", partId: id, x: 0, y: 0, rot: 0, params: {} } as never);
  check("Poti-Bbox enthält Schieber (x bis 50)", b("potentiometer").x + b("potentiometer").w === 50, JSON.stringify(b("potentiometer")));
  check("SPDT-Bbox 60×44 (inkl. Punkt-Radien)", b("switch_spdt").w === 60 && b("switch_spdt").h === 44, JSON.stringify(b("switch_spdt")));
  check("DPDT-Bbox 60×64 (inkl. Punkt-Radien)", b("switch_dpdt").w === 60 && b("switch_dpdt").h === 64, JSON.stringify(b("switch_dpdt")));
}

/* 3 · Modelle: toDevices */
{
  const s0 = devs("switch_spdt", { closed: false }, ["a", "b", "c"]);
  check("SPDT: 2 Geräte", s0.length === 2);
  check("SPDT Ruhe: NO offen, NC zu",
    s0[0].id === "S9" && (s0[0].params as { closed: number }).closed === 0
    && s0[1].id === "S9_nc" && (s0[1].params as { closed: number }).closed === 1);
  check("SPDT-Knoten COM-NO / COM-NC", s0[0].nodes.join(",") === "a,b" && s0[1].nodes.join(",") === "a,c");
  const s1 = devs("switch_spdt", { closed: true }, ["a", "b", "c"]);
  check("SPDT umgelegt: NO zu, NC offen",
    (s1[0].params as { closed: number }).closed === 1 && (s1[1].params as { closed: number }).closed === 0);
  const d = devs("switch_dpst", { closed: true }, ["a", "b", "c", "e"]);
  check("DPST: 2 Geräte, beide zu", d.length === 2 && d[1].id === "S9_p2"
    && (d[0].params as { closed: number }).closed === 1 && (d[1].params as { closed: number }).closed === 1);
  check("DPST-Knoten", d[0].nodes.join(",") === "a,b" && d[1].nodes.join(",") === "c,e");
  const dd = devs("switch_dpdt", { closed: false }, ["a", "b", "c", "e", "f", "g"]);
  check("DPDT: 4 Geräte mit Komplement",
    dd.length === 4 && dd.map((x) => x.id).join(",") === "S9,S9_p1nc,S9_p2,S9_p2nc"
    && (dd[0].params as { closed: number }).closed === 0 && (dd[1].params as { closed: number }).closed === 1
    && (dd[2].params as { closed: number }).closed === 0 && (dd[3].params as { closed: number }).closed === 1);
  const r = devs("switch_rotary_4", { pos: 2 }, ["c", "t1", "t2", "t3", "t4"]);
  check("Dreh-4: 4 Geräte, nur Abgriff 2 zu",
    r.length === 4 && r.map((x) => x.id).join(",") === "S9_t1,S9_t2,S9_t3,S9_t4"
    && r.map((x) => (x.params as { closed: number }).closed).join(",") === "0,1,0,0");
  check("Dreh-Knoten COM→Abgriff", r[1].nodes.join(",") === "c,t2");
  const dip = devs("switch_dip_4", { closed2: true }, ["l1", "r1", "l2", "r2", "l3", "r3", "l4", "r4"]);
  check("DIP-4: 4 Geräte, nur Hebel 2 zu",
    dip.length === 4 && dip.map((x) => x.id).join(",") === "S9_sw1,S9_sw2,S9_sw3,S9_sw4"
    && dip.map((x) => (x.params as { closed: number }).closed).join(",") === "0,1,0,0");
  check("DIP-Knoten links→rechts", dip[1].nodes.join(",") === "l2,r2");
  const rel = devs("relay", {}, ["cp", "cm", "a", "b", "c"]);
  check("Relais: Spule + NO + NC invertiert",
    rel.length === 3 && rel[0].type === "R" && rel[1].type === "VSWITCH" && rel[2].type === "VSWITCH"
    && (rel[2].params as { invert: number }).invert === 1 && rel[2].nodes.slice(0, 2).join(",") === "a,c");
  check("Relais 5/12V-Varianten vollständig",
    ["relay_spst_5v", "relay_spst_12v", "relay_spdt_5v", "relay_spdt_12v", "relay_dpdt_5v", "relay_dpdt_12v"]
      .every((id) => Boolean(PART_MAP[id]))
    && devs("relay_spdt_5v", {}, ["cp", "cm", "a", "b", "c"]).length === 3
    && devs("relay_dpdt_5v", {}, ["cp", "cm", "a", "b", "c", "e", "f", "g"]).length === 5
    && devs("relay_spst_5v", {}, ["cp", "cm", "a", "b"]).length === 2);
}

/* 4 · Echte Läufe: Schalter schalten, Wechsler wechseln, Relais ziehen an */
{
  const sw = (closed: boolean) => nl([
    ...devs("switch_spdt", { closed }, ["a", "b", "c"]) as Netlist["devices"],
    vdc("V1", "a", "0", 5), res("R1", "b", "0", 1000), res("R2", "c", "0", 1000),
  ]);
  const rest = runOperatingPoint(sw(false), {});
  checkNear("SPDT Ruhe: NC=5V", rest.nodes["c"] ?? NaN, 5, 0.05);
  checkNear("SPDT Ruhe: NO=0V", rest.nodes["b"] ?? NaN, 0, 0.01);
  const work = runOperatingPoint(sw(true), {});
  checkNear("SPDT umgelegt: NO=5V", work.nodes["b"] ?? NaN, 5, 0.05);
  checkNear("SPDT umgelegt: NC=0V", work.nodes["c"] ?? NaN, 0, 0.01);

  const rot = nl([
    ...devs("switch_rotary_4", { pos: 2 }, ["c", "t1", "t2", "t3", "t4"]) as Netlist["devices"],
    vdc("V1", "c", "0", 5),
    res("R1", "t1", "0", 1000), res("R2", "t2", "0", 1000), res("R3", "t3", "0", 1000), res("R4", "t4", "0", 1000),
  ]);
  const ro = runOperatingPoint(rot, {});
  checkNear("Dreh Stellung 2: Abgriff 2=5V", ro.nodes["t2"] ?? NaN, 5, 0.05);
  checkNear("Dreh Stellung 2: Abgriff 1/3=0V", (ro.nodes["t1"] ?? 9) + (ro.nodes["t3"] ?? 9), 0, 0.02);

  const dip = nl([
    ...devs("switch_dip_4", { closed2: true }, ["l1", "r1", "l2", "r2", "l3", "r3", "l4", "r4"]) as Netlist["devices"],
    vdc("V1", "l2", "0", 5), res("R2", "r2", "0", 1000), res("R1", "r1", "0", 1000),
  ]);
  const dp = runOperatingPoint(dip, {});
  checkNear("DIP Hebel 2: rechts=5V", dp.nodes["r2"] ?? NaN, 5, 0.05);
  checkNear("DIP Hebel 1 offen: rechts=0V", dp.nodes["r1"] ?? NaN, 0, 0.01);

  const relay = (coilV: number) => nl([
    ...devs("relay", {}, ["cp", "0", "a", "b", "c"]) as Netlist["devices"],
    vdc("VC", "cp", "0", coilV), vdc("V1", "a", "0", 5), res("R1", "b", "0", 1000), res("R2", "c", "0", 1000),
  ]);
  const r0 = runOperatingPoint(relay(0), {});
  checkNear("Relais Ruhe: NC=5V", r0.nodes["c"] ?? NaN, 5, 0.05);
  checkNear("Relais Ruhe: NO=0V", r0.nodes["b"] ?? NaN, 0, 0.01);
  const r5 = runOperatingPoint(relay(5), {});
  checkNear("Relais angezogen: NO=5V", r5.nodes["b"] ?? NaN, 5, 0.05);
  checkNear("Relais angezogen: NC=0V", r5.nodes["c"] ?? NaN, 0, 0.01);
}

/* 5 · Interaktions-Helfer: eine Wahrheit für Klick/Taste/Inspektor */
{
  const inst = (partId: string, params: Record<string, unknown>) =>
    ({ id: "S1", label: "S1", partId, params, x: 0, y: 0 }) as never;
  check("Fan-out SPDT", JSON.stringify(switchControlTargets("switch_spdt", "S1", "closed", 1))
    === JSON.stringify({ S1: 1, S1_nc: 0 }));
  check("Fan-out DPDT", JSON.stringify(switchControlTargets("switch_dpdt", "S1", "closed", 0))
    === JSON.stringify({ S1: 0, S1_p1nc: 1, S1_p2: 0, S1_p2nc: 1 }));
  check("Fan-out Dreh", JSON.stringify(switchControlTargets("switch_rotary_3", "S1", "pos", 3))
    === JSON.stringify({ S1_t1: 0, S1_t2: 0, S1_t3: 1 }));
  check("Fan-out DIP", JSON.stringify(switchControlTargets("switch_dip_8", "S1", "closed5", 1)) === JSON.stringify({ S1_sw5: 1 }));
  check("Fan-out fremd → null", switchControlTargets("potentiometer", "R1", "pos", 0.5) === null
    && switchControlTargets("switch_spst", "S1", "pos", 1) === null);
  const t1 = switchToggle("switch_spst", inst("switch_spst", { closed: false }), {});
  check("SPST-Klick schließt + Log", t1 !== null && t1.targets.S1 === 1 && t1.log === "geschlossen");
  const t2 = switchToggle("switch_spdt", inst("switch_spdt", { closed: false }), {});
  check("SPDT-Klick legt auf NO um", t2 !== null && t2.targets.S1 === 1 && (t2.targets as Record<string, number>).S1_nc === 0 && t2.log === "auf NO umgelegt");
  const t3 = switchToggle("switch_rotary_3", inst("switch_rotary_3", { pos: 3 }), {});
  check("Dreh läuft weiter + wrappt (3→1)", t3 !== null && t3.log === "Stellung 1" && (t3.targets as Record<string, number>).S1_t1 === 1);
  const t5 = switchToggle("switch_dip_4", inst("switch_dip_4", {}), {});
  check("DIP-Taste schließt alle Hebel", t5 !== null && t5.log === "alle geschlossen"
    && [1, 2, 3, 4].every((k) => (t5.targets as Record<string, number>)[`S1_sw${k}`] === 1));
  const t6 = switchToggle("switch_dip_4", inst("switch_dip_4", { closed1: true, closed2: true, closed3: true, closed4: true }), {});
  check("DIP-Taste öffnet alle (wenn alle zu)", t6 !== null && t6.log === "alle geöffnet"
    && [1, 2, 3, 4].every((k) => (t6.targets as Record<string, number>)[`S1_sw${k}`] === 0));
  const t4 = switchToggle("switch_dip_4", inst("switch_dip_4", { closed2: true }), {}, 2);
  check("DIP-Klick öffnet Hebel 2", t4 !== null && (t4.targets as Record<string, number>).S1_sw2 === 0 && t4.log === "Schalter 2 geöffnet");
  check("Positions-Lesung aus Controls", switchReadPos("switch_rotary_4", inst("switch_rotary_4", { pos: 1 }), { S1_t3: 1 }) === 3);
  check("DIP-Lesung aus Controls", switchReadDip(inst("switch_dip_4", {}), { S1_sw4: 1 }, 4) === true);
  check("closed-Lesung mit Label-Fallback", switchReadClosed({ id: "S1", label: "T1", params: {} } as never, { T1: 1 }) === true);
}

/* 6 · Schieber-Geometrie */
{
  check("Knopf oben=1, unten=0", potSliderYFromPos(1) === POT_SLIDER.yTop && potSliderYFromPos(0) === POT_SLIDER.yBot);
  check("Mitte=0", potSliderYFromPos(0.5) === 0);
  check("Klemmung 0.01/0.99", potSliderPosFromLocalY(999) === 0.01 && potSliderPosFromLocalY(-999) === 0.99);
  const rt = potSliderPosFromLocalY(potSliderYFromPos(0.37));
  check("Roundtrip", Math.abs(rt - 0.37) < 1e-9, String(rt));
  check("Schieber rechts vom Symbol", POT_SLIDER.x - POT_SLIDER.hitHalfW > 30);
}

/* 7 · Pin-Label-Regel */
{
  check("benannt → ja", showPinLabel("CH1") && showPinLabel("COM") && showPinLabel("COIL+") && showPinLabel("1A"));
  check("numerisch/leer → nein", !showPinLabel("12") && !showPinLabel("1") && !showPinLabel("") && !showPinLabel("  ") && !showPinLabel(undefined));
}

/* 8 · Hit-Geometrie (Rotation/Spiegelung inklusive) */
{
  let ok = true;
  for (const rot of [0, 90, 180, 270] as const) {
    for (const mirror of [false, true]) {
      const inst = { id: "P1", partId: "potentiometer", x: 100, y: 50, rot, mirror, params: {} } as never;
      const w = rotatePoint(43, 0, rot, mirror);
      const l = instanceLocalPoint(inst, { x: 100 + w.x, y: 50 + w.y });
      if (Math.abs(l.x - 43) > 1e-9 || Math.abs(l.y) > 1e-9) ok = false;
    }
  }
  check("Welt→Lokal ist exakt invers (alle Rot/Spiegel)", ok);
  const doc = (instances: unknown[]) => ({ instances }) as never;
  const pot0 = { id: "P1", partId: "potentiometer", x: 0, y: 0, rot: 0, mirror: false, params: { pos: 0.5 } };
  check("Schieber trifft, Korpus nicht", findPotSliderAt(doc([pot0]), { x: 43, y: 0 })?.id === "P1"
    && findPotSliderAt(doc([pot0]), { x: 0, y: 0 }) === null);
  const pot90 = { ...pot0, rot: 90 };
  check("Schieber rotiert mit (90° → unten)", findPotSliderAt(doc([pot90]), { x: 0, y: 43 })?.id === "P1"
    && findPotSliderAt(doc([pot90]), { x: 43, y: 0 }) === null);
  const dip = { id: "D1", partId: "switch_dip_4", x: 0, y: 0, rot: 0, mirror: false, params: {} };
  check("DIP-Reihen", dipLeverAt("switch_dip_4", dip as never, { x: 0, y: -10 }) === 2
    && dipLeverAt("switch_dip_4", dip as never, { x: 0, y: 19 }) === 4
    && dipLeverAt("switch_dip_4", dip as never, { x: -8, y: -20 }) === 1);
}

/* 9 · S5.29: Vorschau-Hebel, Taster-Stößel, Drop-Position */
{
  const lines = (id: string) => switchPreviewPrims(PART_MAP[id]).filter((p) => p.t === "line")
    .map((p) => (p.t === "line" ? p.pts.join(",") : ""));
  check("Vorschau SPST: ein Hebel", JSON.stringify(lines("switch_spst")) === JSON.stringify(["-14,0,12,-12"]));
  const pb = switchPreviewPrims(PART_MAP.pushbutton);
  const cap = pb[2];
  check("Vorschau Taster: Hebel + Stiel + Kappe",
    pb.length === 3 && lines("pushbutton").join("|") === "-14,0,12,-12|12,-12,12,-17"
    && cap.t === "circle" && cap.fill === false && cap.x === 12 && cap.y === -20 && cap.r === 3);
  check("Vorschau SPDT: Ruhelage an NC", JSON.stringify(lines("switch_spdt")) === JSON.stringify(["-14,0,14,20"]));
  check("Vorschau DPST: zwei offene Hebel",
    JSON.stringify(lines("switch_dpst")) === JSON.stringify(["-14,-20,12,-32", "-14,20,12,8"]));
  check("Vorschau DPDT: Ruhelage an NC",
    JSON.stringify(lines("switch_dpdt")) === JSON.stringify(["-14,-20,14,-10", "-14,20,14,10"]));
  check("Vorschau Dreh: Zeiger auf Abgriff 1",
    JSON.stringify(lines("switch_rotary_4")) === JSON.stringify(["-14,0,16,-30"])
    && JSON.stringify(lines("switch_rotary_8")) === JSON.stringify(["-14,0,16,-40"]));
  const dip4 = switchPreviewPrims(PART_MAP.switch_dip_4);
  const dip8 = switchPreviewPrims(PART_MAP.switch_dip_8);
  check("Vorschau DIP: je Reihe ein offener Hebel",
    dip4.length === 4 && dip8.length === 8
    && JSON.stringify(lines("switch_dip_4")[0]) === JSON.stringify("-8,-20,6,-25"));
  check("Vorschau Relais: Ruhelage (Wechsler an NC)",
    JSON.stringify(lines("relay")) === JSON.stringify(["10,20,26,0"])
    && JSON.stringify(lines("relay_spst_5v")) === JSON.stringify(["10,20,26,-14"])
    && JSON.stringify(lines("relay_dpdt_12v")) === JSON.stringify(["10,-20,26,-10", "10,20,26,10"]));
  check("Vorschau: Nicht-Schalter bleibt leer",
    switchPreviewPrims(PART_MAP.resistor).length === 0 && switchPreviewPrims(PART_MAP.vdc).length === 0);
  const renderSrc = readFileSync("src/components/Canvas/render.ts", "utf8");
  check("Overlay Taster: Stößel (Stiel + Kappe über dem Hebel)",
    renderSrc.includes("lever(sx, top, sx, top - 5)") && renderSrc.includes("ctx.arc(sx, top - 8, 3, 0, Math.PI * 2)")
    && !renderSrc.includes("closed ? -5 : -12, 4,"));
  const canvasSrc = readFileSync("src/components/Canvas.tsx", "utf8");
  check("Drop: W133 nutzt toWorld (exakte Umkehr von toScreen)",
    !canvasSrc.includes("(e.clientX - r.left - st.view.x)")
    && (canvasSrc.match(/snap\(toWorld\(e\.clientX, e\.clientY\)\)/g) ?? []).length >= 4);
}

console.log(failed === 0 ? "\nSchalter-Prüfungen: alle bestanden." : `\nSchalter-Prüfungen: ${failed} FEHLER`);
if (failed) process.exit(1);

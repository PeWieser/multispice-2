/* S5.32: IC-Modell-Tests — Wahrheitstabellen aller neuen Digital-Modelle,
 * Pinzahl-Register-Check (kein Modell treibt außer Yu) sowie
 * Engine-Integration der Analog-Ausgänge (volts).
 * Run: tsx scripts/icmodeltest.ts (Teil von npm test). */
import { evalDigital, DIGITAL_MODEL_PINS, DigitalDeviceLike, DigitalPort } from "../src/lib/sim/digital";
import { Netlist } from "../src/lib/sim/engine";
import { runOperatingPoint } from "../src/lib/sim/analyses";

let failed = 0;
const check = (name: string, cond: boolean, info = "") => {
  if (cond) console.log(`PASS ${name}${info ? " – " + info : ""}`);
  else { console.log(`FAIL ${name}${info ? " – " + info : ""}`); failed++; }
};

type Mem = Record<string, number>;
const ev = (model: string, volts: number[], params: Record<string, number> = {}, mem: Mem = {}, vdd = 5, vth = 2.5, time = 0): DigitalPort[] => {
  const dev: DigitalDeviceLike = { id: "T", type: "DIGITAL", nodes: volts.map((_, i) => "n" + i), params, model };
  return evalDigital(dev, { time, dt: 1e-6, pinVoltages: volts, vdd, vth, mem });
};
const lvl = (ports: DigitalPort[], pin: number): number | undefined => ports.find((p) => p.pin === pin)?.level;
const vlt = (ports: DigitalPort[], pin: number): number | undefined => ports.find((p) => p.pin === pin)?.volts;
const L = (b: number): number => (b ? 5 : 0); // Logikpegel in Volt
const bits = (val: number, n: number): number[] => Array.from({ length: n }, (_, i) => L((val >> i) & 1));

/* A1 · Fehlende Gatter-Labels (fielen in default = AND) */
{
  check("nand8: alles 1 → 0", lvl(ev("nand8", Array(8).fill(5).concat([0])), 8) === 0);
  check("nand8: ein Eingang 0 → 1", lvl(ev("nand8", [5, 5, 0, 5, 5, 5, 5, 5, 0]), 8) === 1);
  check("nor4: alles 0 → 1", lvl(ev("nor4", [0, 0, 0, 0, 0]), 4) === 1);
  check("nor4: ein Eingang 1 → 0", lvl(ev("nor4", [0, 5, 0, 0, 0]), 4) === 0);
}

/* A2 · Schmitt-NAND + Tri-State */
{
  const mem: Mem = {};
  check("nand2s: 1·1 → 0", lvl(ev("nand2s", [5, 5, 0], {}, mem), 2) === 0);
  const mem2: Mem = {};
  ev("nand2s", [0, 5, 0], {}, mem2);
  check("nand2s: Hysterese hält (2 V im Band) → 1", lvl(ev("nand2s", [2, 5, 0], {}, mem2), 2) === 1);
  check("nand2s: 4 V schaltet → 0", lvl(ev("nand2s", [4, 5, 0], {}, mem2), 2) === 0);
  check("tbuf: OE=1 → durch", lvl(ev("tbuf", [5, 5, 0]), 2) === 1);
  check("tbuf: OE=0 → hi-Z", lvl(ev("tbuf", [5, 0, 0]), 2) === -1);
  check("tbuf: oeLow (74125): /OE=0 → durch", lvl(ev("tbuf", [5, 0, 0], { oeLow: 1 }), 2) === 1);
  check("tbuf: oeLow (74125): /OE=1 → hi-Z", lvl(ev("tbuf", [5, 5, 0], { oeLow: 1 }), 2) === -1);
}

/* A3 · 74165 PISO */
{
  const mem: Mem = {};
  const P = bits(0xa5, 8); // 10100101
  let r = ev("piso8", [...P, 0, 0, 0, 0, 0], {}, mem); // SHLD=L: laden
  check("piso8: lädt parallel (Q=Bit7=1)", lvl(r, 11) === 1 && lvl(r, 12) === 0);
  ev("piso8", [...P, 0, 5, 0, 0, 0], {}, mem); // SHLD=H, CLK=0
  r = ev("piso8", [...P, 5, 5, 0, 0, 0], {}, mem); // CLK↑, SER=0
  check("piso8: schiebt (Q=altes Bit6=0)", lvl(r, 11) === 0, `Q=${lvl(r, 11)}`);
}

/* A4 · 74244 / 74373 / 74273 */
{
  const I = bits(0x96, 8);
  let r = ev("buf8", [...I, 0, 0, ...Array(8).fill(0)]);
  check("buf8: transparent", [10, 11, 12, 13, 14, 15, 16, 17].every((p, i) => lvl(r, p) === ((0x96 >> i) & 1)));
  r = ev("buf8", [...I, 5, 0, ...Array(8).fill(0)]);
  check("buf8: /OE1 sperrt Y0–3", [10, 11, 12, 13].every((p) => lvl(r, p) === -1) && lvl(r, 14) === ((0x96 >> 4) & 1));
  const mem: Mem = {};
  r = ev("latch8", [...bits(0x3c, 8), 5, 0, ...Array(8).fill(0)], {}, mem);
  check("latch8: LE=1 folgt", lvl(r, 10) === 0 && lvl(r, 13) === 1);
  r = ev("latch8", [...bits(0xff, 8), 0, 0, ...Array(8).fill(0)], {}, mem);
  check("latch8: LE=0 hält", [10, 11, 12, 13, 14, 15, 16, 17].every((p, i) => lvl(r, p) === ((0x3c >> i) & 1)));
  r = ev("latch8", [...bits(0x3c, 8), 0, 5, ...Array(8).fill(0)], {}, mem);
  check("latch8: /OE sperrt", lvl(r, 10) === -1);
  const mem2: Mem = {};
  ev("ff8", [...bits(0x81, 8), 0, 5, ...Array(8).fill(0)], {}, mem2);
  r = ev("ff8", [...bits(0x81, 8), 5, 5, ...Array(8).fill(0)], {}, mem2);
  check("ff8: CLK übernimmt", lvl(r, 10) === 1 && lvl(r, 17) === 1 && lvl(r, 11) === 0);
  r = ev("ff8", [...bits(0x81, 8), 0, 0, ...Array(8).fill(0)], {}, mem2);
  check("ff8: /CLR löscht", [10, 11, 12, 13, 14, 15, 16, 17].every((p) => lvl(r, p) === 0));
}

/* A5 · 74245 Transceiver */
{
  const A = bits(0xa5, 8), B = bits(0x5a, 8);
  let r = ev("transceiver8", [...A, ...B, 5, 0]);
  check("245: DIR=H: B=A", [8, 9, 10, 11, 12, 13, 14, 15].every((p, i) => lvl(r, p) === ((0xa5 >> i) & 1)));
  check("245: DIR=H: A-Seite Z", lvl(r, 0) === -1);
  r = ev("transceiver8", [...A, ...B, 0, 0]);
  check("245: DIR=L: A=B", [0, 1, 2, 3, 4, 5, 6, 7].every((p, i) => lvl(r, p) === ((0x5a >> i) & 1)));
  r = ev("transceiver8", [...A, ...B, 5, 5]);
  check("245: /OE sperrt alles", lvl(r, 0) === -1 && lvl(r, 8) === -1);
}

/* A6 · Addierer + Komparator */
{
  let r = ev("add4", [...bits(9, 4), ...bits(9, 4), 5, 0, 0, 0, 0, 0]);
  check("add4: 9+9+1=19 (S=3, COUT)", lvl(r, 9) === 1 && lvl(r, 10) === 1 && lvl(r, 11) === 0 && lvl(r, 13) === 1);
  r = ev("add4", [...bits(5, 4), ...bits(3, 4), 0, 0, 0, 0, 0, 0]);
  check("add4: 5+3=8", lvl(r, 12) === 1 && lvl(r, 13) === 0);
  r = ev("magcomp4", [...bits(9, 4), ...bits(5, 4), 0, 0, 0, 0, 0, 0]);
  check("7485: 9>5", lvl(r, 11) === 1 && lvl(r, 12) === 0 && lvl(r, 13) === 0);
  r = ev("magcomp4", [...bits(5, 4), ...bits(9, 4), 0, 0, 0, 0, 0, 0]);
  check("7485: 5<9", lvl(r, 13) === 1 && lvl(r, 11) === 0);
  r = ev("magcomp4", [...bits(7, 4), ...bits(7, 4), 0, 5, 0, 0, 0, 0]);
  check("7485: gleich → Kaskade", lvl(r, 12) === 1 && lvl(r, 11) === 0 && lvl(r, 13) === 0);
}

/* A7 · BCD-Dekoder + 7-Segment */
{
  let r = ev("bcddec", [...bits(3, 4), ...Array(10).fill(0)]); // 4028 aktiv-high
  check("4028: BCD 3 → Y3", lvl(r, 7) === 1 && lvl(r, 6) === 0 && lvl(r, 8) === 0);
  r = ev("bcddec", [...bits(3, 4), ...Array(10).fill(0)], { low: 1 }); // 7442
  check("7442: BCD 3 → /Y3", lvl(r, 7) === 0 && lvl(r, 6) === 1);
  r = ev("bcddec", [...bits(12, 4), ...Array(10).fill(0)], { low: 1 });
  check("7442: ungültiges BCD → alles aus", [4, 5, 6, 7, 8, 9, 10, 11, 12, 13].every((p) => lvl(r, p) === 1));
  r = ev("bcddec", [...bits(3, 4), ...Array(10).fill(0)], { low: 1, oc: 1 });
  check("7442: oc=1 → inaktiv = hi-Z", lvl(r, 7) === 0 && lvl(r, 6) === -1);
  // 7447: „2" = 0x5b → a,b,d,e,g an (aktiv-low = 0), c,f aus
  r = ev("bcd7segLow", [...bits(2, 4), 5, 5, 5, ...Array(7).fill(0)]);
  check("7447: Ziffer 2", lvl(r, 7) === 0 && lvl(r, 8) === 0 && lvl(r, 9) === 1 && lvl(r, 12) === 1 && lvl(r, 13) === 0);
  r = ev("bcd7segLow", [...bits(2, 4), 0, 5, 5, ...Array(7).fill(0)]);
  check("7447: LT zündet alles", [7, 8, 9, 10, 11, 12, 13].every((p) => lvl(r, p) === 0));
  r = ev("bcd7segLow", [...bits(0, 4), 5, 0, 5, ...Array(7).fill(0)]);
  check("7447: RBI blankt Null", [7, 8, 9, 10, 11, 12, 13].every((p) => lvl(r, p) === 1));
  r = ev("bcd7segLow", [...bits(5, 4), 5, 5, 0, ...Array(7).fill(0)]);
  check("7447: BI löscht", [7, 8, 9, 10, 11, 12, 13].every((p) => lvl(r, p) === 1));
  // 4511: „5" = 0x6d → a,c,d,f,g
  const mem: Mem = {};
  r = ev("bcd7segLatch", [...bits(5, 4), 0, 5, 5, ...Array(7).fill(0)], {}, mem);
  check("4511: folgt bei LE=L", lvl(r, 7) === 1 && lvl(r, 8) === 0 && lvl(r, 9) === 1 && lvl(r, 13) === 1);
  r = ev("bcd7segLatch", [...bits(3, 4), 5, 5, 5, ...Array(7).fill(0)], {}, mem);
  check("4511: LE=H hält", lvl(r, 7) === 1 && lvl(r, 8) === 0 && lvl(r, 9) === 1);
  r = ev("bcd7segLatch", [...bits(3, 4), 5, 5, 0, ...Array(7).fill(0)], {}, mem);
  check("4511: /LT zündet", [7, 8, 9, 10, 11, 12, 13].every((p) => lvl(r, p) === 1));
  r = ev("bcd7segLatch", [...bits(0xb, 4), 0, 5, 5, ...Array(7).fill(0)], {}, {});
  check("4511: A–F blank", [7, 8, 9, 10, 11, 12, 13].every((p) => lvl(r, p) === 0));
}

/* A8 · Priority-Encoder + 74595 */
{
  const allHi = Array(8).fill(5);
  let r = ev("encoder83", [5, 5, 5, 5, 5, 0, 5, 5, 0, 0, 0, 0, 0, 0]); // /I5 aktiv
  check("74148: /I5 → Code ~5", lvl(r, 9) === 0 && lvl(r, 10) === 1 && lvl(r, 11) === 0 && lvl(r, 12) === 0 && lvl(r, 13) === 1);
  r = ev("encoder83", [5, 5, 5, 0, 5, 5, 0, 5, 0, 0, 0, 0, 0, 0]); // /I3 + /I6 → /I6 gewinnt
  check("74148: Priorität (6 vor 3)", lvl(r, 9) === 1 && lvl(r, 10) === 0 && lvl(r, 11) === 0);
  r = ev("encoder83", [...allHi, 0, 0, 0, 0, 0, 0]);
  check("74148: kein Eingang → EO", lvl(r, 12) === 1 && lvl(r, 13) === 0);
  r = ev("encoder83", [5, 5, 5, 5, 5, 0, 5, 5, 5, 0, 0, 0, 0, 0]);
  check("74148: /EI sperrt", lvl(r, 9) === 1 && lvl(r, 12) === 1 && lvl(r, 13) === 1);
  const mem: Mem = {};
  ev("shift8latch", [0, 0, 0, 0, 0, ...Array(9).fill(0)], {}, mem); // /SRCLR
  for (let k = 0; k < 8; k++) { // 8× SER=1 schieben
    ev("shift8latch", [5, 0, 0, 5, 0, ...Array(9).fill(0)], {}, mem);
    ev("shift8latch", [5, 5, 0, 5, 0, ...Array(9).fill(0)], {}, mem);
  }
  check("595: schiebt 0xFF (QH'=1)", lvl(ev("shift8latch", [5, 0, 0, 5, 0, ...Array(9).fill(0)], {}, mem), 13) === 1);
  ev("shift8latch", [5, 0, 0, 5, 0, ...Array(9).fill(0)], {}, mem);
  r = ev("shift8latch", [5, 0, 5, 5, 0, ...Array(9).fill(0)], {}, mem); // RCLK↑
  check("595: RCLK übernimmt", [5, 6, 7, 8, 9, 10, 11, 12].every((p) => lvl(r, p) === 1));
  r = ev("shift8latch", [5, 0, 0, 5, 5, ...Array(9).fill(0)], {}, mem);
  check("595: /OE sperrt", lvl(r, 5) === -1);
}

/* A9 · Zähler + 4543 */
{
  const mem: Mem = {};
  let r = ev("counter4ud", [...bits(12, 4), 0, 5, 5, 5, 0, 0, 0, 0], {}, mem);
  check("updn: LOAD 12", lvl(r, 11) === 1 && lvl(r, 10) === 1 && lvl(r, 9) === 0);
  ev("counter4ud", [...bits(12, 4), 0, 0, 5, 5, 0, 0, 0, 0], {}, mem);
  r = ev("counter4ud", [...bits(12, 4), 5, 0, 5, 5, 0, 0, 0, 0], {}, mem);
  check("updn: aufwärts → 13", lvl(r, 8) === 1 && lvl(r, 11) === 1);
  ev("counter4ud", [...bits(12, 4), 0, 0, 0, 5, 0, 0, 0, 0], {}, mem);
  r = ev("counter4ud", [...bits(12, 4), 5, 0, 0, 5, 0, 0, 0, 0], {}, mem);
  check("updn: abwärts → 12", lvl(r, 8) === 0 && lvl(r, 11) === 1);
  const mem2: Mem = {};
  ev("counter8dec", [0, 5, 0, ...Array(9).fill(0)], {}, mem2);
  r = ev("counter8dec", [0, 0, 0, ...Array(9).fill(0)], {}, mem2);
  check("4022: RST → Q0, COUT=1", lvl(r, 3) === 1 && lvl(r, 4) === 0 && lvl(r, 11) === 1);
  for (let k = 0; k < 3; k++) {
    ev("counter8dec", [0, 0, 0, ...Array(9).fill(0)], {}, mem2);
    r = ev("counter8dec", [5, 0, 0, ...Array(9).fill(0)], {}, mem2);
  }
  check("4022: 3 Takte → Q3 one-hot", lvl(r, 6) === 1 && lvl(r, 3) === 0 && lvl(r, 7) === 0);
  ev("counter8dec", [0, 0, 5, ...Array(9).fill(0)], {}, mem2);
  r = ev("counter8dec", [5, 0, 5, ...Array(9).fill(0)], {}, mem2);
  check("4022: INH sperrt", lvl(r, 6) === 1);
  const mem3: Mem = {};
  r = ev("bcd7segLcd", [...bits(4, 4), 0, 0, 0, ...Array(7).fill(0)], {}, mem3); // LD=L: folgen
  check("4543: folgt bei LD=L (4=0x66)", lvl(r, 7) === 0 && lvl(r, 8) === 1 && lvl(r, 9) === 1);
  r = ev("bcd7segLcd", [...bits(7, 4), 5, 0, 0, ...Array(7).fill(0)], {}, mem3); // LD=H: halten
  check("4543: LD=H hält", lvl(r, 7) === 0 && lvl(r, 8) === 1);
  r = ev("bcd7segLcd", [...bits(4, 4), 0, 5, 0, ...Array(7).fill(0)], {}, {});
  check("4543: PH invertiert", lvl(r, 7) === 1 && lvl(r, 8) === 0);
}

/* A10 · MUXe + Analogschalter (inkl. Analog-Modus) */
{
  const I = [0, 0, 0, 3.3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  let r = ev("mux16", [...I, 5, 0, 0, 0, 0, 0]); // S=1? nein: S0=1 → sel=1
  check("4067: digital sel=1 → I1=0", lvl(r, 20) === 0);
  r = ev("mux16", [...I, 5, 5, 0, 0, 0, 0], { analog: 1 }); // sel=3
  check("4067: analog gibt 3,3 V weiter", Math.abs((vlt(r, 20) ?? -1) - 3.3) < 1e-9 && lvl(r, 20) === 1);
  r = ev("mux16", [...I, 5, 5, 0, 0, 0, 5], { analog: 1 });
  check("4067: /EN sperrt", lvl(r, 20) === -1);
  r = ev("mux4dual", [1.1, 0, 0, 0, 0, 0, 2.2, 0, 0, 5, 0, 0, 0]); // S=2
  check("4052: COMA=IA2, COMB=IB2 (analog)", Math.abs((vlt(r, 10) ?? -1) - 0) < 1e-9 && Math.abs((vlt(r, 11) ?? -1) - 2.2) < 1e-9);
  r = ev("mux2triple", [0, 4.4, 0, 0, 3.3, 0, 5, 0, 0, 0, 0, 0, 0]); // SA=1,SB=0,SC=0
  check("4053: 3× analog", Math.abs((vlt(r, 9) ?? -9) - 4.4) < 1e-9 && Math.abs((vlt(r, 10) ?? -9) - 0) < 1e-9 && Math.abs((vlt(r, 11) ?? -9) - 3.3) < 1e-9);
  r = ev("mux8", [0, 0, 0, 3.3, 0, 0, 0, 0, 5, 5, 0, 0], { analog: 1 });
  check("4051: analog 3,3 V", Math.abs((vlt(r, 11) ?? -1) - 3.3) < 1e-9);
  r = ev("mux8", [0, 0, 0, 3.3, 0, 0, 0, 0, 5, 5, 0, 0]);
  check("74151: digital Pegel, kein volts", lvl(r, 11) === 1 && vlt(r, 11) === undefined);
  r = ev("switch4", [1.7, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  check("4066: ein → 1,7 V", Math.abs((vlt(r, 1) ?? -1) - 1.7) < 1e-9);
  check("4066: aus → hi-Z", lvl(r, 4) === -1);
}

/* A11 · DAC, H-Brücke, ULN, MAX232 */
{
  const r = ev("dac8", [...bits(0x80, 8), 0], { vref: 5 });
  check("dac8: 0x80 → 128/255·Vref", Math.abs((vlt(r, 8) ?? -1) - (128 / 255) * 5) < 1e-9);
  const r2 = ev("dac8", [...bits(0xff, 8), 0], { vref: 5 });
  check("dac8: 0xFF → 5 V", Math.abs((vlt(r2, 8) ?? -1) - 5) < 1e-9);
  let h = ev("hbridge", [5, 0, 5, 0, 0], { vs: 12 });
  check("L293: vorwärts (10,6/0,35 V)", Math.abs((vlt(h, 3) ?? -1) - 10.6) < 1e-9 && Math.abs((vlt(h, 4) ?? -1) - 0.35) < 1e-9);
  h = ev("hbridge", [5, 5, 5, 0, 0], { vs: 12 });
  check("L293: Bremse (beide hoch)", Math.abs((vlt(h, 3) ?? -1) - 10.6) < 1e-9 && Math.abs((vlt(h, 4) ?? -1) - 10.6) < 1e-9);
  h = ev("hbridge", [5, 0, 0, 0, 0], { vs: 12 });
  check("L293: EN=L → Z", lvl(h, 3) === -1 && lvl(h, 4) === -1);
  const u = ev("uln2003", [5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  check("ULN2003: ein → ~1 V, aus → Z", Math.abs((vlt(u, 7) ?? -1) - 1.0) < 1e-9 && lvl(u, 8) === -1);
  const u8 = ev("uln2803", [...Array(7).fill(0), 5, ...Array(8).fill(0)]);
  check("ULN2803: 8 Kanäle", Math.abs((vlt(u8, 15) ?? -1) - 1.0) < 1e-9);
  const m = ev("max232", [5, 0, -9, 9, 0, 0, 0, 0]);
  check("MAX232: Treiber invertiert ±9 V", vlt(m, 4) === -9 && vlt(m, 5) === 9);
  check("MAX232: Empfänger invertiert TTL", lvl(m, 6) === 1 && lvl(m, 7) === 0);
}

/* A12 · Register: jedes Modell läuft mit exakt seiner Pinzahl, kein Pin außer Yu */
{
  let okCount = 0, rangeFails: string[] = [];
  for (const [model, count] of Object.entries(DIGITAL_MODEL_PINS)) {
    try {
      const ports = ev(model, Array(count).fill(0), {}, {}, 5, 2.5);
      if (!ports.length) { rangeFails.push(`${model}: keine Ports`); continue; }
      const bad = ports.filter((p) => p.pin < 0 || p.pin >= count);
      if (bad.length) rangeFails.push(`${model}: Pin ${bad.map((p) => p.pin).join(",")} bei ${count}`);
      else okCount++;
    } catch (e) {
      rangeFails.push(`${model}: wirft (${(e as Error).message})`);
    }
  }
  check(`Register: ${okCount}/${Object.keys(DIGITAL_MODEL_PINS).length} Modelle sauber`, rangeFails.length === 0, rangeFails.join("; "));
}

/* A13 · S5.33 Reparatur-Modelle */
{
  const m1: Mem = {};
  ev("dffn", [5, 0, 5, 5, 0, 0], {}, m1);
  let r = ev("dffn", [5, 5, 5, 5, 0, 0], {}, m1);
  check("7474: CLK übernimmt", lvl(r, 4) === 1 && lvl(r, 5) === 0);
  r = ev("dffn", [5, 0, 0, 5, 0, 0], {}, m1);
  check("7474: /RST löscht", lvl(r, 4) === 0);
  r = ev("dffn", [0, 0, 5, 0, 0, 0], {}, m1);
  check("7474: /SET setzt", lvl(r, 4) === 1);
  const m2: Mem = {};
  ev("jkffn", [5, 5, 0, 5, 5, 0, 0], {}, m2);
  r = ev("jkffn", [5, 5, 5, 5, 5, 0, 0], {}, m2);
  check("7476: J=K=1 toggelt", lvl(r, 5) === 1);
  r = ev("jkffn", [0, 0, 0, 0, 5, 0, 0], {}, m2);
  check("7476: /RST löscht", lvl(r, 5) === 0);
}
{
  const m: Mem = {};
  ev("shift8dual", [5, 5, 0, 5, ...Array(8).fill(0)], {}, m);
  for (let k = 0; k < 8; k++) {
    ev("shift8dual", [5, 5, 0, 5, ...Array(8).fill(0)], {}, m);
    ev("shift8dual", [5, 5, 5, 5, ...Array(8).fill(0)], {}, m);
  }
  const r = ev("shift8dual", [5, 5, 0, 5, ...Array(8).fill(0)], {}, m);
  check("74164: 8× (A·B)=1 → 0xFF", [4, 5, 6, 7, 8, 9, 10, 11].every((p) => lvl(r, p) === 1));
  const r2 = ev("shift8dual", [5, 5, 0, 0, ...Array(8).fill(0)], {}, m);
  check("74164: /CLR löscht", [4, 5, 6, 7, 8, 9, 10, 11].every((p) => lvl(r2, p) === 0));
  const m4: Mem = {};
  ev("shift8dual", [5, 5, 0, 5, ...Array(8).fill(0)], {}, m4);
  ev("shift8dual", [5, 5, 5, 5, ...Array(8).fill(0)], {}, m4); // reg=1
  ev("shift8dual", [5, 0, 0, 5, ...Array(8).fill(0)], {}, m4);
  const r4 = ev("shift8dual", [5, 0, 5, 5, ...Array(8).fill(0)], {}, m4); // A·/B=0 → reg=2
  check("74164: A·/B schiebt 0", lvl(r4, 4) === 0 && lvl(r4, 5) === 1);
}
{
  const m: Mem = {};
  for (let k = 0; k < 4; k++) {
    ev("shift4", [0, 5, 0, 0, 0, 0, 0], {}, m);
    ev("shift4", [5, 5, 0, 0, 0, 0, 0], {}, m);
  }
  const r = ev("shift4", [0, 5, 0, 0, 0, 0, 0], {}, m);
  check("4015: 4 Takte → 0xF", [3, 4, 5, 6].every((p) => lvl(r, p) === 1));
  const m18: Mem = {};
  for (let k = 0; k < 17; k++) {
    ev("shift18", [0, 5, 0], {}, m18);
    ev("shift18", [5, 5, 0], {}, m18);
  }
  check("4006: nach 17 Takten noch 0", lvl(ev("shift18", [0, 5, 0], {}, m18), 2) === 0);
  ev("shift18", [5, 5, 0], {}, m18);
  check("4006: nach 18 Takten 1", lvl(ev("shift18", [0, 5, 0], {}, m18), 2) === 1);
  const m64: Mem = {};
  for (let k = 0; k < 64; k++) {
    ev("shift64", [0, 5, 0], {}, m64);
    ev("shift64", [5, 5, 0], {}, m64);
  }
  check("4031: nach 64 Takten 1", lvl(ev("shift64", [0, 5, 0], {}, m64), 2) === 1);
}
{
  const m: Mem = {};
  ev("counter7", [0, 5, ...Array(7).fill(0)], {}, m);
  ev("counter7", [5, 0, ...Array(7).fill(0)], {}, m);
  const r = ev("counter7", [0, 0, ...Array(7).fill(0)], {}, m); // fallend → zählt
  check("4024: fallende Flanke zählt", lvl(r, 2) === 1);
  const r2 = ev("counter7", [5, 0, ...Array(7).fill(0)], {}, m); // steigend → hält
  check("4024: steigende hält", lvl(r2, 2) === 1 && lvl(r2, 3) === 0);
}
{
  const m: Mem = {};
  let r = ev("counter10dec", [0, 5, 0, ...Array(11).fill(0)], {}, m);
  check("4017: RST → Q0, COUT=1", lvl(r, 3) === 1 && lvl(r, 13) === 1);
  for (let k = 0; k < 5; k++) {
    ev("counter10dec", [0, 0, 0, ...Array(11).fill(0)], {}, m);
    r = ev("counter10dec", [5, 0, 0, ...Array(11).fill(0)], {}, m);
  }
  check("4017: nach 5 Takten Q5, COUT=0", lvl(r, 8) === 1 && lvl(r, 3) === 0 && lvl(r, 13) === 0);
  ev("counter10dec", [0, 0, 5, ...Array(11).fill(0)], {}, m);
  r = ev("counter10dec", [5, 0, 5, ...Array(11).fill(0)], {}, m);
  check("4017: INH sperrt", lvl(r, 8) === 1);
}
{
  const m: Mem = {};
  ev("counter4020", [0, 5, ...Array(12).fill(0)], {}, m);
  ev("counter4020", [5, 0, ...Array(12).fill(0)], {}, m);
  let r = ev("counter4020", [0, 0, ...Array(12).fill(0)], {}, m);
  check("4020: 1 Takt → Q0", lvl(r, 2) === 1);
  for (let k = 0; k < 7; k++) { // total 8 Takte
    ev("counter4020", [5, 0, ...Array(12).fill(0)], {}, m);
    r = ev("counter4020", [0, 0, ...Array(12).fill(0)], {}, m);
  }
  check("4020: 8 Takte → Q3 (Pin 3), Q0 aus", lvl(r, 3) === 1 && lvl(r, 2) === 0);
  const m60: Mem = {};
  ev("counter4060", [0, 5, ...Array(10).fill(0)], {}, m60);
  for (let k = 0; k < 8; k++) {
    ev("counter4060", [5, 0, ...Array(10).fill(0)], {}, m60);
    r = ev("counter4060", [0, 0, ...Array(10).fill(0)], {}, m60);
  }
  check("4060: 8 Takte → Q3 (Pin 2)", lvl(r, 2) === 1);
  for (let k = 0; k < 8; k++) {
    ev("counter4060", [5, 0, ...Array(10).fill(0)], {}, m60);
    r = ev("counter4060", [0, 0, ...Array(10).fill(0)], {}, m60);
  }
  check("4060: 16 Takte → Q4 (Pin 3)", lvl(r, 3) === 1 && lvl(r, 2) === 0);
}
{
  const m: Mem = {};
  let r = ev("johnson4018", [0, 0, 0, 5, ...bits(0x15, 5), ...Array(5).fill(0)], {}, m);
  check("4018: PE lädt JAM", [9, 10, 11, 12, 13].every((p, i) => lvl(r, p) === ((0x15 >> i) & 1)));
  r = ev("johnson4018", [0, 0, 5, 0, ...bits(0, 5), ...Array(5).fill(0)], {}, m);
  r = ev("johnson4018", [5, 0, 5, 0, ...bits(0, 5), ...Array(5).fill(0)], {}, m);
  check("4018: CLK schiebt DATA→Q0", lvl(r, 9) === 1 && lvl(r, 10) === 1);
  const m26: Mem = {};
  r = ev("dec4026", [0, 5, 0, 5, 0, ...Array(7).fill(0)], {}, m26);
  check("4026: RST → 0 (0x3f), COUT=1", lvl(r, 5) === 1 && lvl(r, 4) === 1);
  for (let k = 0; k < 9; k++) {
    ev("dec4026", [0, 0, 0, 5, 0, ...Array(7).fill(0)], {}, m26);
    r = ev("dec4026", [5, 0, 0, 5, 0, ...Array(7).fill(0)], {}, m26);
  }
  check("4026: 9 Takte → 9 (0x6f), COUT=0", lvl(r, 5) === 1 && lvl(r, 9) === 0 && lvl(r, 4) === 0);
  r = ev("dec4026", [0, 0, 0, 0, 0, ...Array(7).fill(0)], {}, m26);
  check("4026: DEI=L blankt", [5, 6, 7, 8, 9, 10, 11].every((p) => lvl(r, p) === 0));
}
{
  const m: Mem = {};
  let r = ev("ud4029", [...bits(5, 4), 0, 0, 5, 5, 0, 0, 0, 0], {}, m);
  check("4029: /PE lädt 5", lvl(r, 8) === 1 && lvl(r, 10) === 1);
  ev("ud4029", [...bits(5, 4), 0, 5, 5, 5, 0, 0, 0, 0], {}, m);
  r = ev("ud4029", [...bits(5, 4), 5, 5, 5, 5, 0, 0, 0, 0], {}, m);
  check("4029: binär aufwärts → 6", lvl(r, 9) === 1 && lvl(r, 10) === 1 && lvl(r, 8) === 0);
  const mb: Mem = {};
  ev("ud4029", [...bits(9, 4), 0, 0, 5, 0, 0, 0, 0, 0], {}, mb);
  ev("ud4029", [...bits(9, 4), 0, 5, 5, 0, 0, 0, 0, 0], {}, mb);
  r = ev("ud4029", [...bits(9, 4), 5, 5, 5, 0, 0, 0, 0, 0], {}, mb);
  check("4029: BCD 9+1 → 0", [8, 9, 10, 11].every((p) => lvl(r, p) === 0));
  const m193: Mem = {};
  ev("ud193", [...bits(3, 4), 5, 5, 0, 0, 0, 0, 0], {}, m193);
  ev("ud193", [...bits(3, 4), 0, 5, 5, 0, 0, 0, 0], {}, m193);
  r = ev("ud193", [...bits(3, 4), 5, 5, 5, 0, 0, 0, 0], {}, m193);
  check("40193: CPU↑ → 4", lvl(r, 9) === 1 && lvl(r, 7) === 0);
  ev("ud193", [...bits(3, 4), 5, 0, 5, 0, 0, 0, 0], {}, m193);
  r = ev("ud193", [...bits(3, 4), 5, 5, 5, 0, 0, 0, 0], {}, m193);
  check("40193: CPD↑ → 3", lvl(r, 7) === 1 && lvl(r, 8) === 1 && lvl(r, 9) === 0);
}
{
  const m: Mem = {};
  let r = ev("reg4034", [...bits(0xa5, 8), 0, 0, 5, ...Array(8).fill(0)], {}, m);
  check("4034: PS lädt", [11, 12, 13, 14, 15, 16, 17, 18].every((p, i) => lvl(r, p) === ((0xa5 >> i) & 1)));
  const m35: Mem = {};
  ev("sr4035", [...bits(0xc, 4), 0, 5, 0, 0, 0, 0, 0, 0], {}, m35);
  ev("sr4035", [...bits(0xc, 4), 0, 0, 5, 0, 0, 0, 0, 0], {}, m35);
  r = ev("sr4035", [...bits(0xc, 4), 5, 0, 5, 0, 0, 0, 0, 0], {}, m35);
  check("4035: J·/K schiebt 1", lvl(r, 8) === 1);
  const m94: Mem = {};
  ev("bidir194", [...bits(0, 4), 5, 5, 0, 0, 0, 0, 0, 0, 0, 0], {}, m94);
  r = ev("bidir194", [...bits(0xc, 4), 5, 5, 0, 5, 0, 0, 0, 0, 0, 0], {}, m94);
  r = ev("bidir194", [...bits(0xc, 4), 5, 5, 5, 5, 0, 0, 0, 0, 0, 0], {}, m94);
  check("40194: S=11 lädt", lvl(r, 12) === 1 && lvl(r, 13) === 1 && lvl(r, 10) === 0);
  const m95: Mem = {};
  r = ev("sr40195", [...bits(0x5, 4), 0, 5, 0, 0, 0, 0, 0], {}, m95);
  check("40195: PS lädt", lvl(r, 7) === 1 && lvl(r, 9) === 1 && lvl(r, 8) === 0);
}
{
  const m: Mem = {};
  let r = ev("latch4042", [5, 0, 0, 0, 5, 5, 0, 0, 0, 0], {}, m);
  check("4042: CLK=POL folgt", lvl(r, 6) === 1);
  r = ev("latch4042", [0, 0, 0, 0, 0, 5, 0, 0, 0, 0], {}, m);
  check("4042: CLK≠POL hält", lvl(r, 6) === 1);
  const m43: Mem = {};
  r = ev("latch43", [5, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0], {}, m43);
  check("4043: S setzt", lvl(r, 9) === 1);
  r = ev("latch43", [0, 5, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0], {}, m43);
  check("4043: R löscht", lvl(r, 9) === 0);
  r = ev("latch43", [5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], {}, m43);
  check("4043: OE=L → hi-Z", lvl(r, 9) === -1);
  const r44 = ev("latch43", [0, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0], { low: 1 }, {});
  check("4044: /S setzt (low=1)", lvl(r44, 9) === 1);
  const m76: Mem = {};
  ev("reg4076", [5, 0, 5, 0, 0, 5, 0, 0, 0, 0], {}, m76);
  r = ev("reg4076", [5, 0, 5, 0, 5, 5, 0, 0, 0, 0], {}, m76);
  check("4076: CLK übernimmt", lvl(r, 6) === 1 && lvl(r, 8) === 1 && lvl(r, 7) === 0);
  r = ev("reg4076", [5, 0, 5, 0, 0, 0, 0, 0, 0, 0], {}, m76);
  check("4076: OE=L → hi-Z", lvl(r, 6) === -1);
}
{
  const m: Mem = {};
  for (let k = 0; k < 8; k++) {
    ev("sr4094", [5, 0, 0, 5, ...Array(9).fill(0)], {}, m);
    ev("sr4094", [5, 5, 0, 5, ...Array(9).fill(0)], {}, m);
  }
  ev("sr4094", [5, 0, 0, 5, ...Array(9).fill(0)], {}, m);
  const r = ev("sr4094", [5, 0, 5, 5, ...Array(9).fill(0)], {}, m);
  check("4094: STR übernimmt 0xFF", [4, 5, 6, 7, 8, 9, 10, 11].every((p) => lvl(r, p) === 1) && lvl(r, 12) === 1);
  const r2 = ev("sr4094", [5, 0, 0, 0, ...Array(9).fill(0)], {}, m);
  check("4094: OE=L → hi-Z", lvl(r2, 4) === -1);
}
{
  const m: Mem = {};
  let r = ev("mux4512", [0, 0, 0, 5, 0, 0, 0, 0, 5, 5, 0, 0, 0, 0], {}, m);
  check("4512: sel=3 → I3", lvl(r, 13) === 1);
  r = ev("mux4512", [0, 0, 0, 5, 0, 0, 0, 0, 5, 0, 0, 5, 0, 0], {}, m);
  check("4512: STR hält", lvl(r, 13) === 1);
  r = ev("mux4512", [0, 0, 0, 5, 0, 0, 0, 0, 5, 5, 0, 0, 5, 0], {}, m);
  check("4512: INH → 0", lvl(r, 13) === 0);
  const m14: Mem = {};
  r = ev("dec4514", [...bits(5, 4), 0, 0, ...Array(16).fill(0)], {}, m14);
  check("4514: A=5 → Y5", lvl(r, 11) === 1 && lvl(r, 10) === 0);
  r = ev("dec4514", [...bits(9, 4), 5, 0, ...Array(16).fill(0)], {}, m14);
  check("4514: STR hält", lvl(r, 11) === 1 && lvl(r, 15) === 0);
  r = ev("dec4514", [...bits(5, 4), 0, 5, ...Array(16).fill(0)], {}, m14);
  check("4514: INH löscht", [6, 7, 8, 9, 10, 11].every((p) => lvl(r, p) === 0));
  const r15 = ev("dec4514", [...bits(5, 4), 0, 0, ...Array(16).fill(0)], { low: 1 }, {});
  check("4515: aktiv-low", lvl(r15, 11) === 0 && lvl(r15, 10) === 1);
}
{
  const m: Mem = {};
  const r = ev("piso4014", [...bits(0xa5, 8), 0, 5, 0, 0, 0, 0], {}, m);
  check("4014: PS lädt (Q8/Q7/Q6 = 1/0/1)", lvl(r, 13) === 1 && lvl(r, 12) === 0 && lvl(r, 11) === 1);
}
{
  const r = ev("nor8", [5, 5, 5, 5, 5, 5, 5, 5, 0]);
  check("nor8: alles 1 → 0", lvl(r, 8) === 0);
  const r2 = ev("nor8", [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  check("nor8: alles 0 → 1", lvl(r2, 8) === 1);
  const m: Mem = {};
  ev("pll4046", [0, 0, 0, 0, 2.5, 0, 0], { fmax: 1000 }, m, 5, 2.5, 0);
  let p = ev("pll4046", [5, 0, 0, 0, 2.5, 0, 0], { fmax: 1000 }, m, 5, 2.5, 0.00025);
  check("4046: VCO 500 Hz (Ph 0,125 → 1)", lvl(p, 5) === 1);
  p = ev("pll4046", [5, 0, 0, 0, 2.5, 0, 0], { fmax: 1000 }, m, 5, 2.5, 0.00125);
  check("4046: VCO-Ph 0,625 → 0", lvl(p, 5) === 0);
  check("4046: PC1 = XOR", lvl(p, 2) === 1);
  const m2: Mem = {};
  ev("pll4046", [0, 0, 0, 0, 0, 0, 0], {}, m2, 5, 2.5, 0);
  p = ev("pll4046", [5, 0, 0, 0, 0, 0, 0], {}, m2, 5, 2.5, 0);
  check("4046: PC2 setzt bei SIG↑", lvl(p, 3) === 1);
  p = ev("pll4046", [5, 5, 0, 0, 0, 0, 0], {}, m2, 5, 2.5, 0);
  check("4046: PC2 löscht bei COMP↑", lvl(p, 3) === 0);
}

/* ---- Teil B: Engine-Integration (echte OP-Simulation) ---- */
const nl = (devices: Netlist["devices"]): Netlist => ({ devices });
const V = (id: string, net: string, dc: number) => ({ id, type: "V", nodes: [net, "0"], params: {}, source: { kind: "dc", dc } }) as Netlist["devices"][number];
const R = (id: string, net: string, r: number) => ({ id, type: "R", nodes: [net, "0"], params: { r } }) as Netlist["devices"][number];
const D = (id: string, model: string, nodes: string[], params: Record<string, number> = {}) =>
  ({ id, type: "DIGITAL", nodes, model, params }) as Netlist["devices"][number];
const close = (a: number, b: number, tol = 0.05): boolean => Math.abs(a - b) <= tol;

/* B1 · DAC0808: 0x80 → 2,5 V am Knoten */
{
  const devs: Netlist["devices"] = [V("V7", "d7", 5)];
  for (let i = 0; i < 7; i++) devs.push(V("V" + i, "d" + i, 0));
  devs.push(D("U1", "dac8", ["d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "out"], { vref: 5, vdd: 5, rout: 100 }));
  devs.push(R("RL", "out", 10000));
  const res = runOperatingPoint(nl(devs), {});
  check("OP dac8: OUT=2,5 V", res.ok && close(res.nodes["out"] ?? NaN, 2.5), `OUT=${(res.nodes["out"] ?? NaN).toFixed(3)}`);
}

/* B2 · 4051 analog: 2,2 V durch den MUX */
{
  const res = runOperatingPoint(nl([
    V("VI", "i3", 2.2), V("S0", "s0", 5), V("S1", "s1", 5), V("S2", "s2", 0),
    D("U1", "mux8", ["i0", "i1", "i2", "i3", "i4", "i5", "i6", "i7", "s0", "s1", "s2", "com"], { analog: 1, vdd: 5, rout: 100 }),
    R("RL", "com", 10000),
  ]), {});
  check("OP 4051: COM=2,2 V", res.ok && close(res.nodes["com"] ?? NaN, 2.2), `COM=${(res.nodes["com"] ?? NaN).toFixed(3)}`);
}

/* B3 · H-Brücke an 12 V */
{
  const res = runOperatingPoint(nl([
    V("VI1", "in1", 5), V("VI2", "in2", 0), V("VE", "en", 5),
    D("U1", "hbridge", ["in1", "in2", "en", "o1", "o2"], { vs: 12, vdd: 5, rout: 10 }),
    R("R1", "o1", 10000), R("R2", "o2", 10000),
  ]), {});
  check("OP L293: 10,6/0,35 V", res.ok && close(res.nodes["o1"] ?? NaN, 10.6) && close(res.nodes["o2"] ?? NaN, 0.35),
    `O1=${(res.nodes["o1"] ?? NaN).toFixed(2)} O2=${(res.nodes["o2"] ?? NaN).toFixed(2)}`);
}

/* B4 · Transceiver beide Richtungen */
{
  const fwd = runOperatingPoint(nl([
    V("VA", "a0", 5), V("VD", "dir", 5), V("VO", "oe", 0),
    D("U1", "transceiver8", ["a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "b0", "b1", "b2", "b3", "b4", "b5", "b6", "b7", "dir", "oe"], { vdd: 5, rout: 50 }),
    R("RL", "b0", 10000),
  ]), {});
  check("OP 245: A→B", fwd.ok && close(fwd.nodes["b0"] ?? NaN, 5), `B0=${(fwd.nodes["b0"] ?? NaN).toFixed(2)}`);
  const rev = runOperatingPoint(nl([
    V("VB", "b3", 5), V("VD", "dir", 0), V("VO", "oe", 0),
    D("U1", "transceiver8", ["a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "b0", "b1", "b2", "b3", "b4", "b5", "b6", "b7", "dir", "oe"], { vdd: 5, rout: 50 }),
    R("RL", "a3", 10000),
  ]), {});
  check("OP 245: B→A", rev.ok && close(rev.nodes["a3"] ?? NaN, 5), `A3=${(rev.nodes["a3"] ?? NaN).toFixed(2)}`);
}

/* B5 · ULN2003 mit Pull-up (beweist echtes hi-Z) */
{
  const res2 = runOperatingPoint(nl([
    V("VI0", "i0", 5), V("VI1", "i1", 0), V("VP", "vp", 5),
    D("U1", "uln2003", ["i0", "i1", "i2", "i3", "i4", "i5", "i6", "o0", "o1", "o2", "o3", "o4", "o5", "o6"], { vdd: 5, rout: 50 }),
    { id: "RP", type: "R", nodes: ["o1", "vp"], params: { r: 4700 } } as Netlist["devices"][number],
    R("RL", "o0", 10000),
  ]), {});
  check("OP ULN: ein→1 V, aus+Pull-up→5 V", res2.ok && close(res2.nodes["o0"] ?? NaN, 1.0) && close(res2.nodes["o1"] ?? NaN, 5.0),
    `O0=${(res2.nodes["o0"] ?? NaN).toFixed(2)} O1=${(res2.nodes["o1"] ?? NaN).toFixed(2)}`);
}

/* B6 · 4066 analog + MAX232-Treiber */
{
  const s = runOperatingPoint(nl([
    V("VI", "i0", 1.7), V("VC", "c0", 5),
    D("U1", "switch4", ["i0", "o0", "c0", "i1", "o1", "c1", "i2", "o2", "c2", "i3", "o3", "c3"], { vdd: 5, rout: 100 }),
    R("RL", "o0", 10000),
  ]), {});
  check("OP 4066: 1,7 V durch", s.ok && close(s.nodes["o0"] ?? NaN, 1.7), `O0=${(s.nodes["o0"] ?? NaN).toFixed(3)}`);
  const m = runOperatingPoint(nl([
    V("VT", "t1", 5),
    D("U1", "max232", ["t1", "t2", "r1", "r2", "to1", "to2", "ro1", "ro2"], { vdd: 5, rout: 100 }),
    R("RL", "to1", 10000),
  ]), {});
  check("OP MAX232: T1OUT=−9 V (am 10-k-Teiler)", m.ok && close(m.nodes["to1"] ?? NaN, (-9 * 10000) / 10100, 0.02), `TO1=${(m.nodes["to1"] ?? NaN).toFixed(2)}`);
}

console.log(failed === 0 ? "\nIC-Modell-Prüfungen: alle bestanden." : `\nIC-Modell-Prüfungen: ${failed} FEHLER`);
if (failed) process.exit(1);

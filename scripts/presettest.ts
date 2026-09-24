/* Validates that every built-in preset produces a solvable netlist. */
import { PRESETS } from "../src/lib/schematic/tools";
import { buildNets } from "../src/lib/schematic/model";
import { runOperatingPoint, runTransient } from "../src/lib/sim/analyses";

for (const preset of PRESETS) {
  const doc = preset.build();
  const built = buildNets(doc);
  const op = runOperatingPoint(built.netlist, {});
  const nets = Object.keys(op.nodes).filter((n) => n !== "0");
  const tran = runTransient(built.netlist, {}, { stopTime: 0.02, stepTime: 2e-5, maxPoints: 1200 }, nets.slice(0, 4));
  const ranges = nets.slice(0, 4).map((n) => {
    const s = tran.signals[n] ?? [];
    const min = s.length ? Math.min(...s) : 0;
    const max = s.length ? Math.max(...s) : 0;
    return `${n}:${min.toFixed(2)}..${max.toFixed(2)}`;
  });
  console.log(
    `${op.ok && tran.ok ? "PASS" : "FAIL"} ${preset.id.padEnd(16)} devices=${String(built.netlist.devices.length).padStart(3)} nets=${String(built.nets.length).padStart(3)} op=${op.ok} tran=${tran.ok} ${tran.message ?? ""} | ${ranges.join(" ")}`,
  );
  if (built.errors.length) console.log("   errors:", built.errors.join("; "));
}

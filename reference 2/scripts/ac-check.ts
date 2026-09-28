import { exampleRC } from "../src/lib/cb/examples";
import { runAC } from "../src/lib/cb/analyses";
const p = exampleRC();
const r = runAC(p, { fstart: 10, fstop: 1e6, scale: "dec", points: 10, source: "V1" });
const i = r.x.findIndex((f) => f >= 1591);
console.log("f", r.x[i].toFixed(0), "VDB(OUT)", r.signals["VDB(OUT)"][i].toFixed(2), "VP", r.signals["VP(OUT)"][i].toFixed(1));

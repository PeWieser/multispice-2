import { runTests } from "../src/lib/cb/tests";
const r = runTests();
for (const t of r) console.log(`${t.ok ? "PASS" : "FAIL"}  ${t.name}  — ${t.detail}`);
const failed = r.filter((t) => !t.ok).length;
console.log(`${r.length - failed}/${r.length} passed`);
process.exit(failed ? 1 : 0);

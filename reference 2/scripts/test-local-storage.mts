// Verifies the browser-storage backend (local mode) round-trip using a localStorage shim.
class Shim {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
(globalThis as Record<string, unknown>).localStorage = new Shim();
process.env.NEXT_PUBLIC_STORAGE_MODE = "local";

const store = await import("../src/lib/cb/storage");
const { exampleOpAmp } = await import("../src/lib/cb/examples");

const p = exampleOpAmp();
const id = await store.createProject("T", p);
const saved = structuredClone(p);
const r = p.components.find((c) => c.type === "R")!;
r.props.value = "47k";
await store.updateProject(id, "T2", p);

const list = await store.listProjects();
const back = (await store.getProject(id))!;
const versions = back.versions;
const restored = await store.getVersion(id, versions[0].id);
const val = (x: typeof p) => x!.components.find((c) => c.type === "R")!.props.value;

const checks: [string, boolean][] = [
  ["mode is local", store.mode === "local"],
  ["one project listed", list.length === 1 && list[0].id === id],
  ["name updated", back.name === "T2"],
  ["current state has new value", val(back.data) === "47k"],
  ["version snapshot kept previous state", !!restored && val(restored) === "10k"],
  ["snapshot equals original project", JSON.stringify(restored) === JSON.stringify(saved)],
];
await store.deleteProject(id);
checks.push(["delete removes project", (await store.listProjects()).length === 0]);

for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
const failed = checks.filter(([, ok]) => !ok).length;
console.log(`${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);

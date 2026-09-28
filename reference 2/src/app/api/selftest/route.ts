import { runTests } from "@/lib/cb/tests";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { exampleRC } from "@/lib/cb/examples";
import { migrateProject } from "@/lib/cb/types";

export const dynamic = "force-dynamic";

const canon = (v: unknown): string => Array.isArray(v) ? `[${v.map(canon).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v as object).sort().map((k) => JSON.stringify(k) + ":" + canon((v as Record<string, unknown>)[k])).join(",")}}` : JSON.stringify(v);

export async function GET() {
  const results = runTests();
  // DB persistence round-trip: save, reopen, compare
  try {
    const p = exampleRC();
    const [row] = await db.insert(projects).values({ name: "__selftest__", data: p }).returning({ id: projects.id });
    const [back] = await db.select().from(projects).where(eq(projects.id, row.id));
    await db.delete(projects).where(eq(projects.id, row.id));
    const q = migrateProject(back.data);
    const ok = canon(q.components) === canon(p.components) && canon(q.wires) === canon(p.wires) && canon(q.probes) === canon(p.probes) && canon(q.sim) === canon(p.sim);
    results.push({ name: "7b Persistence via PostgreSQL (save/close/reopen)", ok, detail: ok ? "identical" : "mismatch" });
  } catch (e) {
    results.push({ name: "7b Persistence via PostgreSQL", ok: false, detail: (e as Error).message });
  }
  return Response.json({ passed: results.filter((r) => r.ok).length, total: results.length, results });
}

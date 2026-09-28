import { db } from "@/db";
import { projects, projectVersions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [row] = await db.select().from(projects).where(eq(projects.id, Number(id)));
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  const versions = await db
    .select({ id: projectVersions.id, note: projectVersions.note, createdAt: projectVersions.createdAt })
    .from(projectVersions)
    .where(eq(projectVersions.projectId, row.id))
    .orderBy(desc(projectVersions.createdAt))
    .limit(30);
  return Response.json({ ...row, versions });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const pid = Number(id);
  const [old] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!old) return Response.json({ error: "not found" }, { status: 404 });
  // keep previous state as a version
  await db.insert(projectVersions).values({ projectId: pid, data: old.data, note: body?.note ?? "save" });
  await db
    .update(projects)
    .set({ name: String(body?.name ?? old.name), data: body?.data ?? old.data, updatedAt: new Date() })
    .where(eq(projects.id, pid));
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await db.delete(projectVersions).where(eq(projectVersions.projectId, Number(id)));
  await db.delete(projects).where(eq(projects.id, Number(id)));
  return Response.json({ ok: true });
}

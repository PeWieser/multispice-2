import { db } from "@/db";
import { projects, schematics } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const pid = Number(id);
  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  if (!project) return Response.json({ error: "Projekt nicht gefunden" }, { status: 404 });
  const docs = await db.select().from(schematics).where(eq(schematics.projectId, pid));
  return Response.json({ project, schematics: docs });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const pid = Number(id);
  const body = await req.json().catch(() => ({}));
  if (body.name || body.description !== undefined) {
    await db
      .update(projects)
      .set({
        ...(body.name ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, pid));
  }
  if (body.doc) {
    const existing = await db.select().from(schematics).where(eq(schematics.projectId, pid));
    if (existing.length) {
      await db
        .update(schematics)
        .set({ doc: body.doc, name: body.doc.name ?? existing[0].name, settings: body.settings ?? existing[0].settings, updatedAt: new Date() })
        .where(eq(schematics.id, existing[0].id));
    } else {
      await db.insert(schematics).values({ projectId: pid, name: body.doc.name ?? "Schaltplan", doc: body.doc, settings: body.settings ?? {} });
    }
    await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, pid));
  }
  const [project] = await db.select().from(projects).where(eq(projects.id, pid));
  const docs = await db.select().from(schematics).where(eq(schematics.projectId, pid));
  return Response.json({ project, schematics: docs });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await db.delete(projects).where(eq(projects.id, Number(id)));
  return Response.json({ ok: true });
}

import { db } from "@/db";
import { projects, schematics } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(projects).orderBy(desc(projects.updatedAt));
  const withSchematics = await Promise.all(
    rows.map(async (p) => {
      const sch = await db
        .select({ id: schematics.id, name: schematics.name, updatedAt: schematics.updatedAt })
        .from(schematics)
        .where(eq(schematics.projectId, p.id));
      return { ...p, schematics: sch };
    }),
  );
  return Response.json({ projects: withSchematics });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name: string = body.name ?? "Neues Projekt";
  const description: string = body.description ?? "";
  const doc = body.doc ?? { id: "sch", name, instances: [], wires: [], labels: [], notes: [] };
  const [project] = await db.insert(projects).values({ name, description }).returning();
  const [schematic] = await db
    .insert(schematics)
    .values({ projectId: project.id, name: doc.name ?? name, doc, settings: body.settings ?? {} })
    .returning();
  return Response.json({ project, schematic }, { status: 201 });
}

import { db } from "@/db";
import { projects } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({ id: projects.id, name: projects.name, updatedAt: projects.updatedAt })
    .from(projects)
    .orderBy(desc(projects.updatedAt))
    .limit(50);
  return Response.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const name = String(body?.name ?? "Untitled");
  const data = body?.data ?? {};
  const [row] = await db
    .insert(projects)
    .values({ name, data, schemaVersion: Number(data?.schemaVersion ?? 1) })
    .returning({ id: projects.id });
  return Response.json(row);
}

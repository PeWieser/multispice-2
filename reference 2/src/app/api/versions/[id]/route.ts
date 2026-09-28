import { db } from "@/db";
import { projectVersions } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [row] = await db.select().from(projectVersions).where(eq(projectVersions.id, Number(id)));
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(row);
}

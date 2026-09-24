import { db } from "@/db";
import { customParts, favorites } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const favs = await db.select().from(favorites).orderBy(desc(favorites.usedAt)).limit(40);
  const custom = await db.select().from(customParts).orderBy(desc(customParts.createdAt)).limit(100);
  return Response.json({ favorites: favs, customParts: custom });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.action === "use" && body.partId) {
    await db
      .insert(favorites)
      .values({ partId: body.partId })
      .onConflictDoUpdate({
        target: favorites.partId,
        set: { usedAt: new Date(), useCount: sql`${favorites.useCount} + 1` },
      });
  } else if (body.action === "pin" && body.partId) {
    await db
      .insert(favorites)
      .values({ partId: body.partId, pinned: 1 })
      .onConflictDoUpdate({ target: favorites.partId, set: { pinned: body.pinned ? 1 : 0 } });
  } else if (body.action === "custom" && body.partId) {
    await db.insert(customParts).values({
      partId: body.partId,
      name: body.name ?? body.partId,
      category: body.category ?? "Eigene Bauteile",
      spice: body.spice ?? "",
      definition: body.definition ?? {},
    });
  } else {
    return Response.json({ error: "Unbekannte Aktion" }, { status: 400 });
  }
  const favs = await db.select().from(favorites).orderBy(desc(favorites.usedAt)).limit(40);
  return Response.json({ favorites: favs });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const partId = searchParams.get("partId");
  if (partId) await db.delete(favorites).where(eq(favorites.partId, partId));
  return Response.json({ ok: true });
}

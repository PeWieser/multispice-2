/**
 * Health endpoint.
 *
 * The deployment target for CircuitBench is a purely static host (Cloudflare
 * Pages), so this handler must be statically renderable: no `force-dynamic`,
 * no dynamic APIs, and a database probe that is skipped entirely when no
 * `DATABASE_URL` is configured.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json({
    ok: true,
    app: "CircuitBench",
    persistence: "browser (IndexedDB)",
    database: false,
    mode: process.env.NEXT_OUTPUT === "export" ? "static-export" : "server",
  });
}

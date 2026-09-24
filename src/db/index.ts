import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

// Nur laden wenn DATABASE_URL gesetzt ist
export const db = process.env.DATABASE_URL
  ? (() => {
      const { drizzle } = require("drizzle-orm/node-postgres");
      const { Pool } = require("pg");
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      return drizzle(pool);
    })()
  : null;

import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { qistSql?: postgres.Sql };
// `prepare: false` keeps the client compatible with transaction-mode poolers
// (Neon / Supabase pooled URLs); serverless instances each hold a small pool.
const client =
  globalForDb.qistSql ??
  postgres(url, { max: Number(process.env.DATABASE_POOL_MAX) || (process.env.VERCEL ? 3 : 10), prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.qistSql = client;

export const db = drizzle(client, { schema, casing: "snake_case" });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };

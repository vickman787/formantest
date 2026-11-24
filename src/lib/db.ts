import { Pool } from "pg";
import { SCHEMA_SQL } from "./schema-sql";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set — Forma refuses to run without a durable store.");
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

let schemaEnsured = false;

/** Create tables if missing. Safe to call on every boot. */
export async function ensureSchema(): Promise<void> {
  if (schemaEnsured) return;
  await getPool().query(SCHEMA_SQL);
  // Lightweight migration for DBs created before the nonce message column.
  await getPool().query("ALTER TABLE nonces ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT ''");
  schemaEnsured = true;
}

export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const time = Date.now().toString(36);
  return `${prefix}_${time}${rand}`;
}

import fs from "node:fs";
import pool from "#db/client";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", ""]);

// Reads schema.sql and applies it, dropping and recreating every table.
// Shared by the reset script and the vitest suite's clean-database setup.
//
// Refuses to run against a non-local host unless ALLOW_REMOTE_SCHEMA_RESET=1:
// dropping every table on a hosted database (staging, production) must be a
// deliberate act, never a side effect of `npm test` or `npm run db:reset`.
export function applySchema() {
  const host = new URL(process.env.DATABASE_URL ?? "postgresql://").hostname;
  if (!LOCAL_HOSTS.has(host) && process.env.ALLOW_REMOTE_SCHEMA_RESET !== "1") {
    throw new Error(
      `Refusing to drop and recreate the schema on remote host "${host}". ` +
        `If you really mean to reset that database, re-run with ` +
        `ALLOW_REMOTE_SCHEMA_RESET=1 in the environment.`
    );
  }
  const sql = fs.readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
  return pool.query(sql);
}

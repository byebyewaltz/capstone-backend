import fs from "node:fs";
import pool from "#db/client";

// Reads schema.sql and applies it, dropping and recreating every table.
// Shared by the reset script and the vitest suite's clean-database setup.
export function applySchema() {
  const sql = fs.readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
  return pool.query(sql);
}

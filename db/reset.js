import "dotenv/config";
import fs from "node:fs";
import pool from "#db/client";

await pool.query(fs.readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
console.log("Schema applied.");
await pool.end();

import pool from "#db/client";
import { applySchema } from "#db/schema";

async function main() {
  await applySchema();
  console.log("Schema applied.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

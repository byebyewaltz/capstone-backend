import "dotenv/config";
import pg from "pg";

// A single shared pool. Connection details come from the environment so the
// same code runs against a local socket, Docker, or a managed instance.
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const query = (text, params) => pool.query(text, params);

// Most queries want either every row or just the first one — these save each
// caller from destructuring pg's result object.
export const all = async (text, params) => (await query(text, params)).rows;
export const first = async (text, params) => (await query(text, params)).rows[0];

// Runs fn inside BEGIN/COMMIT on one dedicated connection, rolling back and
// rethrowing if it throws. fn receives the client to issue its queries on.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export default pool;

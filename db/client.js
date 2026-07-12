import "dotenv/config";
import pg from "pg";

// A single shared pool. Connection details come from the environment so the
// same code runs against a local socket, Docker, or a managed instance.
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
}); 

export const query = (text, params) => pool.query(text, params);
export const getClient = () => pool.connect();
export default pool; 

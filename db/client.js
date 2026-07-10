import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export const query = (text, params) => pool.query(text, params);
export const rows = async (text, params) => (await query(text, params)).rows;
export const one = async (text, params) => (await query(text, params)).rows[0];
export const getClient = () => pool.connect();
export default pool;

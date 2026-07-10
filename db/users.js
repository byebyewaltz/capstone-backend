import bcrypt from "bcryptjs";
import { query, one } from "#db/client";

const SAFE = "id, name, email, color, created_at";

export const createUser = async ({ name, email, password, color }) =>
  one(`INSERT INTO users (name, email, password_hash, color)
       VALUES ($1, $2, $3, COALESCE($4, '#C4623D')) RETURNING ${SAFE}`,
    [name, email.toLowerCase(), await bcrypt.hash(password, 10), color]);

export const getUserByEmail = (email) =>
  one(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase()]);

export const getUserById = (id) =>
  one(`SELECT ${SAFE} FROM users WHERE id = $1`, [id]);

export const verifyPassword = (user, password) =>
  bcrypt.compare(password, user.password_hash);

export const deleteUser = async (id) =>
  (await query(`DELETE FROM users WHERE id = $1`, [id])).rowCount > 0;

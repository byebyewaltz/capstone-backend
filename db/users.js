import bcrypt from "bcryptjs";
import { query } from "#db/client";

const SAFE = "id, name, email, color, created_at";

export async function createUser({ name, email, password, color }) {
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, color)
     VALUES ($1, $2, $3, COALESCE($4, '#C4623D'))
     RETURNING ${SAFE}`,
    [name, email.toLowerCase(), hash, color]
  );
  return rows[0];
}

export async function getUserByEmail(email) {
  const { rows } = await query(`SELECT * FROM users WHERE email = $1`, [
    email.toLowerCase(),
  ]);
  return rows[0];
}

export async function getUserById(id) {
  const { rows } = await query(`SELECT ${SAFE} FROM users WHERE id = $1`, [id]);
  return rows[0];
}

export async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.password_hash);
}

// Hard-deletes the account. FK rules SET NULL on authored content and CASCADE
// on the user's memberships and notifications, so this is a clean removal.
export async function deleteUser(id) {
  const { rowCount } = await query(`DELETE FROM users WHERE id = $1`, [id]);
  return rowCount > 0;
}

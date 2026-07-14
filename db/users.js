import bcrypt from "bcryptjs";
import { first, affected } from "#db/client";

const SAFE = "id, name, email, color, created_at";

export async function createUser({ name, email, password, color }) {
  const hash = await bcrypt.hash(password, 10);
  return first(
    `INSERT INTO users (name, email, password_hash, color)
     VALUES ($1, $2, $3, COALESCE($4, '#C4623D'))
     RETURNING ${SAFE}`,
    [name, email.toLowerCase(), hash, color]
  );
}

export function getUserByEmail(email) {
  return first(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase()]);
}

export function getUserById(id) {
  return first(`SELECT ${SAFE} FROM users WHERE id = $1`, [id]);
}

export function verifyPassword(user, password) {
  return bcrypt.compare(password, user.password_hash);
}

// Hard-deletes the account. FK rules SET NULL on authored content and CASCADE
// on the user's memberships and notifications, so this is a clean removal.
export async function deleteUser(id) {
  return (await affected(`DELETE FROM users WHERE id = $1`, [id])) > 0;
}

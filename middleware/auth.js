import jwt from "jsonwebtoken";
import { h } from "#middleware/errorHandler";
import { getUserById } from "#db/users";
import { getMembership } from "#db/orgs";

const SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const RANK = { viewer: 0, member: 1, admin: 2, owner: 3 };

export const signToken = (id) => jwt.sign({ id }, SECRET, { expiresIn: "7d" });

// 401 unless a valid Bearer token maps to an existing user; sets req.user.
export const requireUser = h(async (req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  try { req.user = token && (await getUserById(jwt.verify(token, SECRET).id)); } catch { /* fall through */ }
  if (!req.user) return res.status(401).json({ error: "A valid token is required." });
  next();
});

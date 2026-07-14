// Load the environment before reading JWT_SECRET: this module is evaluated
// during import hoisting, before any caller's dotenv.config() line runs.
import "dotenv/config";
import jwt from "jsonwebtoken";
import asyncHandler from "#middleware/asyncHandler";
import { getUserById } from "#db/users";
import { getMembership } from "#db/orgs";

if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET must be set in production.");
}
const SECRET = process.env.JWT_SECRET ?? "dev-only-insecure-secret";

/* Roles ordered by privilege. requireRole(min) admits min and everything
   above it, so requireRole("member") admits member, admin, and owner. */
const RANK = { viewer: 0, member: 1, admin: 2, owner: 3 };

export function signToken(userId) {
  return jwt.sign({ id: userId }, SECRET, { expiresIn: "7d" });
}

// Resolves the bearer token to a live account on every request. A token for a
// deleted account is refused — deleting the account invalidates the token.
export const requireUser = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "A bearer token is required." });

  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }

  const user = await getUserById(payload.id);
  if (!user) return res.status(401).json({ error: "Account no longer exists." });

  req.user = user;
  next();
});

// Mounted as router.use("/:orgId", requireOrgMember): every route under an
// org id requires membership in that org, and the membership rides along on
// req.membership so role guards don't query again.
export const requireOrgMember = asyncHandler(async (req, res, next) => {
  const membership = await getMembership(Number(req.params.orgId), req.user.id);
  if (!membership) {
    return res.status(403).json({ error: "You are not a member of this organization." });
  }
  req.membership = membership;
  next();
});

export function requireRole(minimum) {
  return (req, res, next) => {
    if (!req.membership || RANK[req.membership.role] < RANK[minimum]) {
      return res.status(403).json({ error: `This action requires the ${minimum} role.` });
    }
    next();
  };
}

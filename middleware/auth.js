import jwt from "jsonwebtoken";
import { getUserById } from "#db/users";
import { getMembership } from "#db/orgs";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const RANK = { viewer: 0, member: 1, admin: 2, owner: 3 };

export function signToken(userId) {
  return jwt.sign({ sub: userId }, SECRET, { expiresIn: "7d" });
}

// Verifies the bearer token and attaches req.user. 401 on any failure.
export async function requireUser(req, res, next) {
  try {
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Authentication required." });
    const payload = jwt.verify(token, SECRET);
    const user = await getUserById(payload.sub);
    if (!user) return res.status(401).json({ error: "Account no longer exists." });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

// Resolves the caller's membership in the :orgId route param and attaches it.
// 403 if the caller is not a member of that org.
export async function requireOrgMember(req, res, next) {
  const orgId = Number(req.params.orgId);
  const membership = await getMembership(orgId, req.user.id);
  if (!membership) {
    return res.status(403).json({ error: "You are not a member of this organization." });
  }
  req.membership = membership;
  next();
}

// Gate an action behind a minimum role. Assumes requireOrgMember ran first.
export function requireRole(minRole) {
  return (req, res, next) => {
    if (!req.membership) {
      return res.status(403).json({ error: "Organization context required." });
    }
    if (RANK[req.membership.role] < RANK[minRole]) {
      return res.status(403).json({
        error: `This action requires the ${minRole} role or higher.`,
      });
    }
    next();
  };
}

export { RANK };

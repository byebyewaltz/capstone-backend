import express from "express";
import requireBody from "#middleware/requireBody";
import { requireUser, signToken } from "#middleware/auth";
import {
  createUser, getUserByEmail, verifyPassword, deleteUser,
} from "#db/users";
import { getSharedOrg, getOrCreateDefaultOrg, addMember } from "#db/orgs";

const router = express.Router();

// POST /auth/register
// New accounts are enrolled in the shared workspace, so nobody lands in the app
// without an organization context. On an empty database there is nothing to
// join, so the first account founds its own and owns it.
router.post("/register", requireBody("name", "email", "password"), async (req, res, next) => {
  try {
    const { name, email, password, color } = req.body;
    const user = await createUser({ name, email, password, color });

    const shared = await getSharedOrg();
    let org, role;
    if (shared) {
      org = shared;
      role = "member";
    } else {
      ({ org } = await getOrCreateDefaultOrg(user.id));
      role = "owner";
    }
    await addMember({ orgId: org.id, userId: user.id, role });

    const token = signToken(user.id);
    res.status(201).json({ user, token, org });
  } catch (err) {
    next(err); // 23505 -> 409 handled centrally for duplicate email
  }
});

// POST /auth/login
router.post("/login", requireBody("email", "password"), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const account = await getUserByEmail(email);
    if (!account || !(await verifyPassword(account, password))) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }
    const { password_hash, ...user } = account;
    res.json({ user, token: signToken(user.id) });
  } catch (err) {
    next(err);
  }
});

// GET /auth/me
router.get("/me", requireUser, (req, res) => {
  res.json({ user: req.user });
});

// DELETE /auth/me — permanently removes the caller's own account.
router.delete("/me", requireUser, async (req, res, next) => {
  try {
    const ok = await deleteUser(req.user.id);
    if (!ok) return res.status(404).json({ error: "Account not found." });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;

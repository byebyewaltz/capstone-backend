import express from "express";
import requireBody from "#middleware/requireBody";
import { requireUser, signToken } from "#middleware/auth";
import {
  createUser, getUserByEmail, verifyPassword, deleteUser,
} from "#db/users";
import { getOrCreateDefaultOrg, addMember } from "#db/orgs";

const router = express.Router();

// POST /auth/register
// New accounts join the default workspace, so nobody ever lands in the app
// without an organization context. The very first account on a fresh database
// founds that workspace and owns it; everyone after joins as a member.
router.post("/register", requireBody("name", "email", "password"), async (req, res, next) => {
  try {
    const { name, email, password, color } = req.body;
    const user = await createUser({ name, email, password, color });

    const { org, founded } = await getOrCreateDefaultOrg(user.id);
    await addMember({ orgId: org.id, userId: user.id, role: founded ? "owner" : "member" });

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

import express from "express";
import requireBody from "#middleware/requireBody";
import { requireUser, requireOrgMember, requireRole } from "#middleware/auth";
import {
  getOrgById, createOrg, listOrgsForUser, getOrCreateDefaultOrg, listMembers,
  listAssignableDirectory, getMembershipById, addMember, setRole, removeMember, deleteOrg,
} from "#db/orgs";
import { getUserByEmail, getUserById } from "#db/users";
import projectsRouter from "#routes/projects";

const router = express.Router();

// Everything below requires a logged-in user.
router.use(requireUser);

// GET /orgs — every organization the caller belongs to, with their role.
// If an account somehow has no membership (created before auto-enrolment, or
// its last membership was revoked), adopt it into the default workspace rather
// than stranding the user in an app with no context.
router.get("/", async (req, res, next) => {
  try {
    let mine = await listOrgsForUser(req.user.id);
    if (mine.length === 0) {
      const { org, founded } = await getOrCreateDefaultOrg(req.user.id);
      await addMember({ orgId: org.id, userId: req.user.id, role: founded ? "owner" : "member" });
      mine = await listOrgsForUser(req.user.id);
    }
    res.json(mine);
  } catch (err) { next(err); }
});

// POST /orgs — any authenticated user can start an org (becomes owner).
router.post("/", requireBody("name", "slug"), async (req, res, next) => {
  try {
    const org = await createOrg({
      name: req.body.name, slug: req.body.slug, createdBy: req.user.id,
    });
    res.status(201).json(org);
  } catch (err) { next(err); } // 23505 -> 409 for a duplicate slug
});

router.param("orgId", async (req, res, next, id) => {
  try {
    const org = await getOrgById(Number(id));
    if (!org) return res.status(404).json({ error: "Organization not found." });
    req.org = org;
    next();
  } catch (err) { next(err); }
});

// All :orgId routes require the caller to be a member of that org.
router.use("/:orgId", requireOrgMember);

router.get("/:orgId", (req, res) =>
  res.json({ ...req.org, role: req.membership.role }));

// DELETE /orgs/:orgId — owners only. Deletion is irreversible and takes every
// project, task, and membership with it, so the caller must type the org's
// name to confirm, and may not delete the only org they belong to (nobody
// should strand themselves without a workspace).
router.delete("/:orgId", requireRole("owner"), requireBody("confirm"),
  async (req, res, next) => {
    try {
      if (req.body.confirm !== req.org.name) {
        return res.status(400).json({
          error: "Confirmation text must match the organization name exactly.",
        });
      }
      const mine = await listOrgsForUser(req.user.id);
      if (mine.length <= 1) {
        return res.status(409).json({ error: "You cannot delete your only organization." });
      }
      const destroyed = await deleteOrg(req.org.id);
      res.json({ deleted: true, destroyed });
    } catch (err) { next(err); }
  });

/* ------------------------------ members ---------------------------------- */
router.get("/:orgId/members", async (req, res, next) => {
  try {
    res.json(await listMembers(req.org.id));
  } catch (err) { next(err); }
});

// GET /orgs/:orgId/assignable — the directory used to populate assignee
// pickers. Admin-only: rank-and-file members see names on tasks, but only
// admins may enumerate the whole roster.
router.get("/:orgId/assignable", requireRole("admin"), async (req, res, next) => {
  try {
    res.json(await listAssignableDirectory(req.org.id));
  } catch (err) { next(err); }
});

// Add a member by email or user id — admins and up. There is exactly one
// owner per org (seated at creation), so the owner role can never be granted.
router.post("/:orgId/members", requireRole("admin"), async (req, res, next) => {
  try {
    const { email, userId, role } = req.body ?? {};
    if (role === "owner") {
      return res.status(403).json({ error: "The owner role cannot be granted." });
    }
    if (!email && !userId) {
      return res.status(400).json({ error: "Provide the new member's email or userId." });
    }
    const user = email
      ? await getUserByEmail(email)
      : await getUserById(Number(userId));
    if (!user) return res.status(404).json({ error: "No user with that email." });
    const member = await addMember({ orgId: req.org.id, userId: user.id, role });
    res.status(201).json(member);
  } catch (err) { next(err); } // 23505 -> 409 if already a member
});

// Change a role — admins and up. Cannot alter an owner.
router.patch("/:orgId/members/:memberId", requireRole("admin"),
  requireBody("role"), async (req, res, next) => {
    try {
      const target = await getMembershipById(Number(req.params.memberId));
      if (!target || target.org_id !== req.org.id) {
        return res.status(404).json({ error: "Membership not found." });
      }
      if (target.role === "owner") {
        return res.status(403).json({ error: "An owner's role cannot be changed." });
      }
      res.json(await setRole(target.id, req.body.role));
    } catch (err) { next(err); }
  });

// Remove a member — admins and up. Cannot remove an owner.
router.delete("/:orgId/members/:memberId", requireRole("admin"),
  async (req, res, next) => {
    try {
      const target = await getMembershipById(Number(req.params.memberId));
      if (!target || target.org_id !== req.org.id) {
        return res.status(404).json({ error: "Membership not found." });
      }
      if (target.role === "owner") {
        return res.status(403).json({ error: "An owner cannot be removed." });
      }
      await removeMember(target.id);
      res.json({ deleted: true });
    } catch (err) { next(err); }
  });

// Nested project routes (which themselves nest tasks).
router.use("/:orgId/projects", projectsRouter);

export default router;

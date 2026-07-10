import express from "express";
import requireBody from "#middleware/requireBody";
import { requireUser, requireOrgMember, requireRole } from "#middleware/auth";
import {
  getOrgById, createOrg, listOrgsForUser, getOrCreateDefaultOrg, listMembers,
  listAssignableUsers, getMembershipById, addMember, setRole, removeMember,
  orgFootprint, deleteOrg, countOrgsForUser, getMembership,
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
      // Safe adoption: reuses an org this user founded, or mints them a
      // personal one. Never joins them to someone else's workspace.
      const { org } = await getOrCreateDefaultOrg(req.user.id);
      const existing = await getMembership(org.id, req.user.id);
      if (!existing) {
        await addMember({ orgId: org.id, userId: req.user.id, role: "owner" });
      }
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

// GET /orgs/:orgId/footprint — what a delete would destroy. Owner-only, since
// only an owner can act on it.
router.get("/:orgId/footprint", requireRole("owner"), async (req, res, next) => {
  try {
    res.json(await orgFootprint(req.org.id));
  } catch (err) { next(err); }
});

// DELETE /orgs/:orgId — destroys the organization and everything in it.
// Owner-only, irreversible, and guarded three ways:
//   • the caller must type the organization's exact name to confirm
//   • you cannot delete the only organization you belong to
//   • cascade removes projects, tasks, comments, files, and memberships
router.delete("/:orgId", requireRole("owner"), async (req, res, next) => {
  try {
    const confirm = req.body?.confirm;
    if (confirm !== req.org.name) {
      return res.status(400).json({
        error: `Type the organization name exactly to confirm: "${req.org.name}".`,
      });
    }

    // Refuse to strand the owner without a workspace.
    const remaining = await countOrgsForUser(req.user.id);
    if (remaining <= 1) {
      return res.status(409).json({
        error: "This is your only organization. Create another before deleting this one.",
      });
    }

    const footprint = await orgFootprint(req.org.id);
    const deleted = await deleteOrg(req.org.id);
    res.json({ deleted: { id: deleted.id, name: deleted.name }, destroyed: footprint });
  } catch (err) { next(err); }
});

/* ------------------------------ members ---------------------------------- */
router.get("/:orgId/members", async (req, res, next) => {
  try {
    res.json(await listMembers(req.org.id));
  } catch (err) { next(err); }
});

// GET /orgs/:orgId/assignable — the account directory, for the "assign someone
// to this organization" picker. Admin-only: a viewer must not be able to
// enumerate every account on the instance.
router.get("/:orgId/assignable", requireRole("admin"), async (req, res, next) => {
  try {
    res.json(await listAssignableUsers(req.org.id));
  } catch (err) { next(err); }
});

// Assign someone to this organization — admins and up. Accepts either a
// userId (from the assignable-users picker) or an email address.
router.post("/:orgId/members", requireRole("admin"), async (req, res, next) => {
  try {
    const { userId, email, role } = req.body || {};
    if (!userId && !email) {
      return res.status(400).json({ error: "Provide a userId or an email." });
    }
    const user = userId
      ? await getUserById(Number(userId))
      : await getUserByEmail(email);
    if (!user) return res.status(404).json({ error: "No account matches that person." });

    // Never let an assignment mint an owner; ownership is founding-only.
    if (role === "owner") {
      return res.status(403).json({ error: "An organization can only have its founding owner." });
    }
    const member = await addMember({ orgId: req.org.id, userId: user.id, role });
    res.status(201).json({ ...member, name: user.name, email: user.email });
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

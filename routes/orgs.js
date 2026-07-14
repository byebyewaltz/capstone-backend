import express from "express";
import requireBody from "#middleware/requireBody";
import asyncHandler from "#middleware/asyncHandler";
import { resourceParam, loadResource } from "#middleware/loadResource";
import { requireUser, requireOrgMember, requireRole } from "#middleware/auth";
import {
  getOrgById, createOrg, listOrgsForUser, enrollInDefaultOrg, listMembers,
  listAssignableDirectory, getMembershipById, addMember, setRole, removeMember, deleteOrg,
} from "#db/orgs";
import { getUserByEmail, getUserById } from "#db/users";
import { weeklyActivity, monthlyGrowth, calendarActivity } from "#db/tasks";
import projectsRouter from "#routes/projects";

const router = express.Router();

// Everything below requires a logged-in user.
router.use(requireUser);

// GET /orgs — every organization the caller belongs to, with their role.
// If an account somehow has no membership (created before auto-enrolment, or
// its last membership was revoked), adopt it into the default workspace rather
// than stranding the user in an app with no context.
router.get("/", asyncHandler(async (req, res) => {
  let mine = await listOrgsForUser(req.user.id);
  if (mine.length === 0) {
    await enrollInDefaultOrg(req.user.id);
    mine = await listOrgsForUser(req.user.id);
  }
  res.json(mine);
}));

// POST /orgs — any authenticated user can start an org (becomes owner).
router.post("/", requireBody("name", "slug"), asyncHandler(async (req, res) => {
  const org = await createOrg({
    name: req.body.name, slug: req.body.slug, createdBy: req.user.id,
  });
  res.status(201).json(org);
})); // 23505 -> 409 for a duplicate slug

router.param("orgId", resourceParam({
  fetch: getOrgById, as: "org", notFound: "Organization not found.",
}));

// All :orgId routes require the caller to be a member of that org.
router.use("/:orgId", requireOrgMember);

router.get("/:orgId", (req, res) =>
  res.json({ ...req.org, role: req.membership.role }));

// DELETE /orgs/:orgId — owners only. Deletion is irreversible and takes every
// project, task, and membership with it, so the caller must type the org's
// name to confirm, and may not delete the only org they belong to (nobody
// should strand themselves without a workspace).
router.delete("/:orgId", requireRole("owner"), requireBody("confirm"),
  asyncHandler(async (req, res) => {
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
  }));

/* ------------------------------ members ---------------------------------- */
router.get("/:orgId/members", asyncHandler(async (req, res) => {
  res.json(await listMembers(req.org.id));
}));

// GET /orgs/:orgId/assignable — the directory used to populate assignee
// pickers. Admin-only: rank-and-file members see names on tasks, but only
// admins may enumerate the whole roster.
router.get("/:orgId/assignable", requireRole("admin"), asyncHandler(async (req, res) => {
  res.json(await listAssignableDirectory(req.org.id));
}));

// Add a member by email or user id — admins and up. There is exactly one
// owner per org (seated at creation), so the owner role can never be granted.
router.post("/:orgId/members", requireRole("admin"), asyncHandler(async (req, res) => {
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
  if (!user) {
    return res.status(404).json({
      error: email ? "No account with that email." : "No account with that user id.",
    });
  }
  const member = await addMember({ orgId: req.org.id, userId: user.id, role });
  res.status(201).json(member);
})); // 23505 -> 409 if already a member

// Loads :memberId scoped to the current org. Sits after the role guard in
// each chain so a role failure still wins over a 404.
const loadMember = loadResource("memberId", {
  fetch: getMembershipById, as: "member", notFound: "Membership not found.",
  belongsTo: (member, req) => member.org_id === req.org.id,
});

// Change a role — admins and up. Cannot alter an owner.
router.patch("/:orgId/members/:memberId", requireRole("admin"),
  requireBody("role"), loadMember, asyncHandler(async (req, res) => {
    if (req.member.role === "owner") {
      return res.status(403).json({ error: "An owner's role cannot be changed." });
    }
    res.json(await setRole(req.member.id, req.body.role));
  }));

// Remove a member — admins and up. Cannot remove an owner.
router.delete("/:orgId/members/:memberId", requireRole("admin"),
  loadMember, asyncHandler(async (req, res) => {
    if (req.member.role === "owner") {
      return res.status(403).json({ error: "An owner cannot be removed." });
    }
    await removeMember(req.member.id);
    res.json({ deleted: true });
  }));

/* ------------------------------ analytics --------------------------------- */
// GET /orgs/:orgId/analytics/weekly — task creation/completion for each of
// the last 7 days, for the dashboard's weekly chart.
router.get("/:orgId/analytics/weekly", asyncHandler(async (req, res) => {
  res.json(await weeklyActivity(req.org.id));
}));

// GET /orgs/:orgId/analytics/monthly — cumulative task totals for the last
// 6 months, for the dashboard's monthly growth chart.
router.get("/:orgId/analytics/monthly", asyncHandler(async (req, res) => {
  res.json(await monthlyGrowth(req.org.id));
}));

// GET /orgs/:orgId/analytics/calendar?month=YYYY-MM — due-date density for
// one month (defaults to the current month), for the dashboard's calendar.
router.get("/:orgId/analytics/calendar", asyncHandler(async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || "")
    ? req.query.month
    : new Date().toISOString().slice(0, 7);
  res.json(await calendarActivity(req.org.id, `${month}-01`));
}));

// Nested project routes (which themselves nest tasks).
router.use("/:orgId/projects", projectsRouter);

export default router;

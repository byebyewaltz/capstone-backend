import { query, rows, one } from "#db/client";

export const getOrgById = (id) =>
  one(`SELECT * FROM organizations WHERE id = $1`, [id]);

// The oldest org is the shared workspace new accounts join.
export const getSharedOrg = () =>
  one(`SELECT * FROM organizations ORDER BY id LIMIT 1`);

// Creating an org also seats the creator as its founding owner.
export const createOrg = async ({ name, slug, createdBy }) => {
  const org = await one(
    `INSERT INTO organizations (name, slug, created_by) VALUES ($1,$2,$3) RETURNING *`,
    [name, slug, createdBy ?? null]);
  if (createdBy) await addMember({ orgId: org.id, userId: createdBy, role: "owner" });
  return org;
};

// A personal workspace for accounts with no memberships; idempotent.
export const getOrCreateDefaultOrg = async (userId) => {
  const existing = await one(
    `SELECT * FROM organizations WHERE created_by = $1 ORDER BY id LIMIT 1`, [userId]);
  if (existing) return { org: existing, created: false };
  const user = await one(`SELECT name FROM users WHERE id = $1`, [userId]);
  const base = (user?.name ?? "workspace").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "workspace";
  const org = await createOrg({
    name: `${user?.name ?? "My"}'s Workspace`, slug: `${base}-${userId}`, createdBy: userId });
  return { org, created: true };
};

export const listOrgsForUser = (userId) =>
  rows(`SELECT o.*, m.role FROM organizations o
          JOIN memberships m ON m.org_id = o.id
         WHERE m.user_id = $1 ORDER BY o.id`, [userId]);

export const countOrgsForUser = async (userId) =>
  Number((await one(`SELECT count(*) FROM memberships WHERE user_id = $1`, [userId])).count);

export const deleteOrg = (id) =>
  one(`DELETE FROM organizations WHERE id = $1 RETURNING id, name`, [id]);

// Everything a delete would destroy, for the confirmation screen.
export const orgFootprint = (orgId) =>
  one(`SELECT
         (SELECT count(*)::int FROM memberships WHERE org_id = $1)  AS members,
         (SELECT count(*)::int FROM projects WHERE org_id = $1)     AS projects,
         (SELECT count(*)::int FROM tasks t
            JOIN projects p ON p.id = t.project_id WHERE p.org_id = $1) AS tasks,
         (SELECT count(*)::int FROM comments cm JOIN tasks t ON t.id = cm.task_id
            JOIN projects p ON p.id = t.project_id WHERE p.org_id = $1) AS comments,
         (SELECT count(*)::int FROM attachments a JOIN tasks t ON t.id = a.task_id
            JOIN projects p ON p.id = t.project_id WHERE p.org_id = $1) AS attachments`,
    [orgId]);

/* memberships */
export const addMember = ({ orgId, userId, role }) =>
  one(`INSERT INTO memberships (org_id, user_id, role)
       VALUES ($1, $2, COALESCE($3, 'member')::member_role)
       ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role
       RETURNING *`, [orgId, userId, role ?? null]);

export const getMembership = (orgId, userId) =>
  one(`SELECT * FROM memberships WHERE org_id = $1 AND user_id = $2`, [orgId, userId]);

export const getMembershipById = (id) =>
  one(`SELECT * FROM memberships WHERE id = $1`, [id]);

export const setRole = (id, role) =>
  one(`UPDATE memberships SET role = $2 WHERE id = $1 RETURNING *`, [id, role]);

export const removeMember = async (id) =>
  (await query(`DELETE FROM memberships WHERE id = $1`, [id])).rowCount > 0;

export const listMembers = (orgId) =>
  rows(`SELECT m.id, m.role, u.id AS user_id, u.name, u.email, u.color
          FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.org_id = $1
         ORDER BY array_position(ARRAY['owner','admin','member','viewer']::member_role[], m.role), u.name`,
    [orgId]);

export const listAssignableUsers = (orgId) =>
  rows(`SELECT u.id, u.name, u.email, u.color
          FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.org_id = $1 ORDER BY u.name`, [orgId]);

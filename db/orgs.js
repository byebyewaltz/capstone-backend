import { query, first, all, withTransaction } from "#db/client";

export function getOrgById(id) {
  return first(`SELECT * FROM organizations WHERE id = $1`, [id]);
}

// Creating an org and seating its owner is one atomic act — an org must never
// exist without exactly one owner.
export function createOrg({ name, slug, createdBy }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO organizations (name, slug, created_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [name, slug, createdBy]
    );
    await client.query(
      `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [rows[0].id, createdBy]
    );
    return rows[0];
  }); // 23505 (duplicate slug) maps to 409 centrally
}

export function listOrgsForUser(userId) {
  return all(
    `SELECT o.*, m.role
       FROM organizations o
       JOIN memberships m ON m.org_id = o.id
      WHERE m.user_id = $1
      ORDER BY o.id`,
    [userId]
  );
}

// The default workspace is simply the oldest organization. On a fresh
// database the first caller founds it.
async function getOrCreateDefaultOrg(userId) {
  const existing = await first(`SELECT * FROM organizations ORDER BY id LIMIT 1`);
  if (existing) return { org: existing, founded: false };

  const created = await first(
    `INSERT INTO organizations (name, slug, created_by)
     VALUES ('Default Workspace', 'default', $1) RETURNING *`,
    [userId]
  );
  return { org: created, founded: true };
}

// Seats the user in the default workspace: the founder of a fresh database
// owns it, everyone after joins as a member. Shared by registration and by
// the membership-adoption path in GET /orgs.
export async function enrollInDefaultOrg(userId) {
  const { org, founded } = await getOrCreateDefaultOrg(userId);
  await addMember({ orgId: org.id, userId, role: founded ? "owner" : "member" });
  return org;
}

/* ------------------------------ members ---------------------------------- */
export function listMembers(orgId) {
  return all(
    `SELECT m.id, m.org_id, m.user_id, m.role, u.name, u.email, u.color
       FROM memberships m
       JOIN users u ON u.id = m.user_id
      WHERE m.org_id = $1
      ORDER BY m.id`,
    [orgId]
  );
}

// Every user in the system, annotated with whether they already belong to
// this org — the assignee/invite pickers need the full roster to offer
// accounts that aren't members yet.
export function listAssignableDirectory(orgId) {
  return all(
    `SELECT u.id, u.name, u.email, u.color, (m.id IS NOT NULL) AS is_member
       FROM users u
       LEFT JOIN memberships m ON m.user_id = u.id AND m.org_id = $1
      ORDER BY u.name`,
    [orgId]
  );
}

export function getMembership(orgId, userId) {
  return first(
    `SELECT * FROM memberships WHERE org_id = $1 AND user_id = $2`,
    [orgId, userId]
  );
}

export function getMembershipById(id) {
  return first(`SELECT * FROM memberships WHERE id = $1`, [id]);
}

export function addMember({ orgId, userId, role }) {
  return first(
    `INSERT INTO memberships (org_id, user_id, role)
     VALUES ($1, $2, COALESCE($3, 'member')::member_role)
     RETURNING *`,
    [orgId, userId, role ?? null]
  );
}

export function setRole(membershipId, role) {
  return first(
    `UPDATE memberships SET role = $2 WHERE id = $1 RETURNING *`,
    [membershipId, role]
  );
}

export async function removeMember(membershipId) {
  const { rowCount } = await query(`DELETE FROM memberships WHERE id = $1`, [membershipId]);
  return rowCount > 0;
}

/* ------------------------------ deletion --------------------------------- */
// Measures the org's footprint, then lets ON DELETE CASCADE take everything
// down. The counts are returned so the caller can report what was destroyed.
export async function deleteOrg(id) {
  const destroyed = await first(
    `SELECT
       (SELECT count(*)::int FROM projects WHERE org_id = $1)                     AS projects,
       (SELECT count(*)::int FROM tasks t
          JOIN projects p ON p.id = t.project_id WHERE p.org_id = $1)             AS tasks,
       (SELECT count(*)::int FROM memberships WHERE org_id = $1)                  AS members`,
    [id]
  );
  await query(`DELETE FROM organizations WHERE id = $1`, [id]);
  return destroyed;
}

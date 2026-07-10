import { query } from "#db/client";

export async function getOrgById(id) {
  const { rows } = await query(`SELECT * FROM organizations WHERE id = $1`, [id]);
  return rows[0];
}

// A workspace for someone who belongs to none.
//
// This must never hand an account membership in an organization it was not
// invited to. Organizations are deletable, so "the oldest surviving org" is not
// a safe default — it may be another user's private workspace. Instead:
//   • reuse an organization this user founded, if one still exists
//   • otherwise create a personal workspace they own
//
// The seeded/shared workspace is still joined at registration time (see
// routes/auth.js), which is an explicit enrolment, not a silent adoption.
export async function getOrCreateDefaultOrg(founderId) {
  // Did this person already found an organization? Reuse it.
  const owned = await query(
    `SELECT o.* FROM organizations o
       JOIN memberships m ON m.org_id = o.id AND m.user_id = $1
      WHERE m.role = 'owner'
      ORDER BY o.id LIMIT 1`,
    [founderId]
  );
  if (owned.rows[0]) return { org: owned.rows[0], founded: false };

  // Otherwise mint one for them alone. The slug must be unique, so derive it
  // from the user id rather than a fixed literal.
  const slug = `workspace-${founderId}`;
  const created = await query(
    `INSERT INTO organizations (name, slug, created_by)
     VALUES ('My Workspace', $2, $1)
     ON CONFLICT (slug) DO NOTHING
     RETURNING *`,
    [founderId, slug]
  );
  if (created.rows[0]) return { org: created.rows[0], founded: true };

  // A concurrent request won the race; read back what it created.
  const again = await query(`SELECT * FROM organizations WHERE slug = $1`, [slug]);
  return { org: again.rows[0], founded: false };
}

// The shared workspace new registrations are enrolled into: the oldest
// organization, or null on a brand-new database. Distinct from adoption —
// registration is an explicit join, not a silent rescue.
export async function getSharedOrg() {
  const { rows } = await query(`SELECT * FROM organizations ORDER BY id LIMIT 1`);
  return rows[0] || null;
}

// Every org the user belongs to, with their role in each. Powers the switcher.
export async function listOrgsForUser(userId) {
  const { rows } = await query(
    `SELECT o.*, m.role
       FROM organizations o
       JOIN memberships m ON m.org_id = o.id
      WHERE m.user_id = $1
      ORDER BY o.created_at`,
    [userId]
  );
  return rows;
}

// Creates the org and makes the creator its owner in one transaction-like pair.
export async function createOrg({ name, slug, createdBy }) {
  const { rows } = await query(
    `INSERT INTO organizations (name, slug, created_by)
     VALUES ($1, $2, $3) RETURNING *`,
    [name, slug, createdBy]
  );
  const org = rows[0];
  await query(
    `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [org.id, createdBy]
  );
  return org;
}

export async function listMembers(orgId) {
  const { rows } = await query(
    `SELECT m.id, m.role, u.id AS user_id, u.name, u.email, u.color
       FROM memberships m
       JOIN users u ON u.id = m.user_id
      WHERE m.org_id = $1
      ORDER BY
        CASE m.role
          WHEN 'owner'  THEN 0 WHEN 'admin' THEN 1
          WHEN 'member' THEN 2 ELSE 3 END,
        u.name`,
    [orgId]
  );
  return rows;
}

// Directory of accounts an admin can assign into an organization, annotated
// with whether they are already in it. Exposes name/email only — never hashes.
export async function listAssignableUsers(orgId) {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.color,
            (m.id IS NOT NULL) AS is_member,
            m.role
       FROM users u
       LEFT JOIN memberships m ON m.user_id = u.id AND m.org_id = $1
      ORDER BY (m.id IS NOT NULL) DESC, u.name`,
    [orgId]
  );
  return rows;
}

// What a delete would destroy. Shown to the owner before they confirm, and
// returned afterwards so the client can report exactly what went.
export async function orgFootprint(orgId) {
  const { rows } = await query(
    `SELECT
       (SELECT count(*)::int FROM projects WHERE org_id = $1) AS projects,
       (SELECT count(*)::int FROM memberships WHERE org_id = $1) AS members,
       (SELECT count(*)::int FROM tasks t
          JOIN projects p ON p.id = t.project_id WHERE p.org_id = $1) AS tasks,
       (SELECT count(*)::int FROM comments c
          JOIN tasks t ON t.id = c.task_id
          JOIN projects p ON p.id = t.project_id WHERE p.org_id = $1) AS comments,
       (SELECT count(*)::int FROM attachments a
          JOIN tasks t ON t.id = a.task_id
          JOIN projects p ON p.id = t.project_id WHERE p.org_id = $1) AS attachments`,
    [orgId]
  );
  return rows[0];
}

// Deleting an organization cascades to memberships, projects, columns, tasks,
// comments, attachments, and task-linked notifications. There is no undo, so
// the route layer gates this on ownership and a typed name confirmation.
export async function deleteOrg(orgId) {
  const { rows } = await query(
    `DELETE FROM organizations WHERE id = $1 RETURNING *`, [orgId]
  );
  return rows[0];
}

// How many organizations a user belongs to. Used to refuse deleting the last
// one, which would strand them in an app with no workspace context.
export async function countOrgsForUser(userId) {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM memberships WHERE user_id = $1`, [userId]
  );
  return rows[0].n;
}

export async function getMembership(orgId, userId) {
  const { rows } = await query(
    `SELECT * FROM memberships WHERE org_id = $1 AND user_id = $2`,
    [orgId, userId]
  );
  return rows[0];
}

export async function getMembershipById(id) {
  const { rows } = await query(`SELECT * FROM memberships WHERE id = $1`, [id]);
  return rows[0];
}

export async function addMember({ orgId, userId, role }) {
  const { rows } = await query(
    `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3::member_role)
     RETURNING *`,
    [orgId, userId, role || "member"]
  );
  return rows[0];
}

export async function setRole(membershipId, role) {
  const { rows } = await query(
    `UPDATE memberships SET role = $2::member_role WHERE id = $1 RETURNING *`,
    [membershipId, role]
  );
  return rows[0];
}

export async function removeMember(membershipId) {
  const { rowCount } = await query(`DELETE FROM memberships WHERE id = $1`, [
    membershipId,
  ]);
  return rowCount > 0;
}

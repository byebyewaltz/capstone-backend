import { query, getClient } from "#db/client";

export async function getOrgById(id) {
  const { rows } = await query(`SELECT * FROM organizations WHERE id = $1`, [id]);
  return rows[0];
}

// Creating an org and seating its owner is one atomic act — an org must never
// exist without exactly one owner.
export async function createOrg({ name, slug, createdBy }) {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO organizations (name, slug, created_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [name, slug, createdBy]
    );
    await client.query(
      `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [rows[0].id, createdBy]
    );
    await client.query("COMMIT");
    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err; // 23505 (duplicate slug) maps to 409 centrally
  } finally {
    client.release();
  }
}

export async function listOrgsForUser(userId) {
  const { rows } = await query(
    `SELECT o.*, m.role
       FROM organizations o
       JOIN memberships m ON m.org_id = o.id
      WHERE m.user_id = $1
      ORDER BY o.id`,
    [userId]
  );
  return rows;
}

// The default workspace is simply the oldest organization. On a fresh
// database the first caller founds it (and registration seats them as owner).
export async function getOrCreateDefaultOrg(userId) {
  const { rows } = await query(`SELECT * FROM organizations ORDER BY id LIMIT 1`);
  if (rows[0]) return { org: rows[0], founded: false };

  const { rows: created } = await query(
    `INSERT INTO organizations (name, slug, created_by)
     VALUES ('Default Workspace', 'default', $1) RETURNING *`,
    [userId]
  );
  return { org: created[0], founded: true };
}

/* ------------------------------ members ---------------------------------- */
export async function listMembers(orgId) {
  const { rows } = await query(
    `SELECT m.id, m.org_id, m.user_id, m.role, u.name, u.email, u.color
       FROM memberships m
       JOIN users u ON u.id = m.user_id
      WHERE m.org_id = $1
      ORDER BY m.id`,
    [orgId]
  );
  return rows;
}

// Every user in the system, annotated with whether they already belong to
// this org — the assignee/invite pickers need the full roster to offer
// accounts that aren't members yet.
export async function listAssignableDirectory(orgId) {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.color, (m.id IS NOT NULL) AS is_member
       FROM users u
       LEFT JOIN memberships m ON m.user_id = u.id AND m.org_id = $1
      ORDER BY u.name`,
    [orgId]
  );
  return rows;
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
    `INSERT INTO memberships (org_id, user_id, role)
     VALUES ($1, $2, COALESCE($3, 'member')::member_role)
     RETURNING *`,
    [orgId, userId, role ?? null]
  );
  return rows[0];
}

export async function setRole(membershipId, role) {
  const { rows } = await query(
    `UPDATE memberships SET role = $2 WHERE id = $1 RETURNING *`,
    [membershipId, role]
  );
  return rows[0];
}

export async function removeMember(membershipId) {
  const { rowCount } = await query(`DELETE FROM memberships WHERE id = $1`, [membershipId]);
  return rowCount > 0;
}

/* ------------------------------ deletion --------------------------------- */
// Measures the org's footprint, then lets ON DELETE CASCADE take everything
// down. The counts are returned so the caller can report what was destroyed.
export async function deleteOrg(id) {
  const { rows } = await query(
    `SELECT
       (SELECT count(*)::int FROM projects WHERE org_id = $1)                     AS projects,
       (SELECT count(*)::int FROM tasks t
          JOIN projects p ON p.id = t.project_id WHERE p.org_id = $1)             AS tasks,
       (SELECT count(*)::int FROM memberships WHERE org_id = $1)                  AS members`,
    [id]
  );
  await query(`DELETE FROM organizations WHERE id = $1`, [id]);
  return rows[0];
}

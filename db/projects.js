import { query, getClient } from "#db/client";

export async function getProjectById(id) {
  const { rows } = await query(`SELECT * FROM projects WHERE id = $1`, [id]);
  return rows[0];
}

export async function listProjectsForOrg(orgId) {
  const { rows } = await query(
    `SELECT * FROM projects WHERE org_id = $1 ORDER BY id`,
    [orgId]
  );
  return rows;
}

// Every board starts life with the same three columns; the project and its
// columns are created atomically so no board is ever half-built.
const DEFAULT_COLUMNS = ["Backlog", "In Progress", "Done"];

export async function createProject({ orgId, name, key, color }) {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO projects (org_id, name, key, color)
       VALUES ($1, $2, upper($3), COALESCE($4, '#5B7B9A'))
       RETURNING *`,
      [orgId, name, key, color ?? null]
    );
    const project = rows[0];
    for (let i = 0; i < DEFAULT_COLUMNS.length; i++) {
      await client.query(
        `INSERT INTO columns (project_id, name, position) VALUES ($1, $2, $3)`,
        [project.id, DEFAULT_COLUMNS[i], i]
      );
    }
    await client.query("COMMIT");
    return project;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err; // 23505 (duplicate key within org) maps to 409 centrally
  } finally {
    client.release();
  }
}

export async function listColumns(projectId) {
  const { rows } = await query(
    `SELECT * FROM columns WHERE project_id = $1 ORDER BY position, id`,
    [projectId]
  );
  return rows;
}

export async function getColumnById(id) {
  const { rows } = await query(`SELECT * FROM columns WHERE id = $1`, [id]);
  return rows[0];
}

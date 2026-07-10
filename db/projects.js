import { query } from "#db/client";

export async function getProjectById(id) {
  const { rows } = await query(`SELECT * FROM projects WHERE id = $1`, [id]);
  return rows[0];
}

export async function listProjectsForOrg(orgId) {
  const { rows } = await query(
    `SELECT * FROM projects WHERE org_id = $1 ORDER BY created_at`,
    [orgId]
  );
  return rows;
}

// Creating a project seeds a default three-column board.
export async function createProject({ orgId, name, key, color }) {
  const { rows } = await query(
    `INSERT INTO projects (org_id, name, key, color)
     VALUES ($1, $2, $3, COALESCE($4, '#5B7B9A')) RETURNING *`,
    [orgId, name, key.toUpperCase(), color]
  );
  const project = rows[0];
  const defaults = ["Backlog", "In Progress", "Done"];
  for (let i = 0; i < defaults.length; i++) {
    await query(
      `INSERT INTO columns (project_id, name, position) VALUES ($1, $2, $3)`,
      [project.id, defaults[i], i]
    );
  }
  return project;
}

export async function listColumns(projectId) {
  const { rows } = await query(
    `SELECT * FROM columns WHERE project_id = $1 ORDER BY position`,
    [projectId]
  );
  return rows;
}

export async function getColumnById(id) {
  const { rows } = await query(`SELECT * FROM columns WHERE id = $1`, [id]);
  return rows[0];
}

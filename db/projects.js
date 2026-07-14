import { first, all, withTransaction } from "#db/client";

export function getProjectById(id) {
  return first(`SELECT * FROM projects WHERE id = $1`, [id]);
}

export function listProjectsForOrg(orgId) {
  return all(`SELECT * FROM projects WHERE org_id = $1 ORDER BY id`, [orgId]);
}

// Every board starts life with the same three columns; the project and its
// columns are created atomically so no board is ever half-built.
const DEFAULT_COLUMNS = ["Backlog", "In Progress", "Done"];

export function createProject({ orgId, name, key, color }) {
  return withTransaction(async (client) => {
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
    return project;
  }); // 23505 (duplicate key within org) maps to 409 centrally
}

export function listColumns(projectId) {
  return all(
    `SELECT * FROM columns WHERE project_id = $1 ORDER BY position, id`,
    [projectId]
  );
}

export function getColumnById(id) {
  return first(`SELECT * FROM columns WHERE id = $1`, [id]);
}

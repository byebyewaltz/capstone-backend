import { rows, one } from "#db/client";

const DEFAULT_COLUMNS = ["Backlog", "In Progress", "Done"];

// New projects start with the default board columns.
export const createProject = async ({ orgId, name, key, color }) => {
  const project = await one(
    `INSERT INTO projects (org_id, name, key, color)
     VALUES ($1, $2, upper($3), COALESCE($4, '#5B7B9A')) RETURNING *`,
    [orgId, name, key, color ?? null]);
  for (const [i, col] of DEFAULT_COLUMNS.entries())
    await one(`INSERT INTO columns (project_id, name, position) VALUES ($1,$2,$3) RETURNING id`,
      [project.id, col, i]);
  return project;
};

export const getProjectById = (id) =>
  one(`SELECT * FROM projects WHERE id = $1`, [id]);

export const listProjectsForOrg = (orgId) =>
  rows(`SELECT p.*, count(t.id)::int AS task_count
          FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
         WHERE p.org_id = $1 GROUP BY p.id ORDER BY p.id`, [orgId]);

export const listColumns = (projectId) =>
  rows(`SELECT * FROM columns WHERE project_id = $1 ORDER BY position, id`, [projectId]);

export const getColumnById = (id) =>
  one(`SELECT * FROM columns WHERE id = $1`, [id]);

import { query, rows, one } from "#db/client";

const WITH_ASSIGNEE = `SELECT t.*, u.name AS assignee_name, u.color AS assignee_color
                         FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id`;

export const getTaskById = (id) => one(`${WITH_ASSIGNEE} WHERE t.id = $1`, [id]);

export const listTasks = (projectId, { priority, assigneeId } = {}) =>
  rows(`${WITH_ASSIGNEE}
         WHERE t.project_id = $1
           AND ($2::task_priority IS NULL OR t.priority = $2)
           AND ($3::int IS NULL OR t.assignee_id = $3)
         ORDER BY t.column_id, t.position, t.id`,
    [projectId, priority ?? null, assigneeId ?? null]);

// Appended to the bottom of its column.
export const createTask = async ({ projectId, columnId, title, description, priority, assigneeId, dueDate, createdBy }) => {
  const { id } = await one(
    `INSERT INTO tasks (project_id, column_id, title, description, priority, assignee_id, due_date, created_by, position)
     VALUES ($1, $2, $3, COALESCE($4, ''), COALESCE($5, 'medium')::task_priority, $6, $7, $8,
             (SELECT COALESCE(MAX(position), -1) + 1 FROM tasks WHERE column_id = $2))
     RETURNING id`,
    [projectId, columnId, title, description ?? null, priority ?? null,
     assigneeId ?? null, dueDate ?? null, createdBy ?? null]);
  return getTaskById(id);
};

// patch keys are trusted column names mapped by the route layer.
export const updateTask = async (id, patch) => {
  const keys = Object.keys(patch);
  if (keys.length) {
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
    await query(`UPDATE tasks SET ${sets}, updated_at = now() WHERE id = $1`,
      [id, ...Object.values(patch)]);
  }
  return getTaskById(id);
};

// Close the gap left behind, open one at the destination, then land there.
export const moveTask = async (id, toColumnId, toPosition) => {
  const task = await one(`SELECT column_id, position FROM tasks WHERE id = $1`, [id]);
  await query(`UPDATE tasks SET position = position - 1 WHERE column_id = $1 AND position > $2`,
    [task.column_id, task.position]);
  await query(`UPDATE tasks SET position = position + 1
                WHERE column_id = $1 AND position >= $2 AND id <> $3`,
    [toColumnId, toPosition, id]);
  await query(`UPDATE tasks SET column_id = $2, position = $3, updated_at = now() WHERE id = $1`,
    [id, toColumnId, toPosition]);
  return getTaskById(id);
};

export const deleteTask = async (id) =>
  (await query(`DELETE FROM tasks WHERE id = $1`, [id])).rowCount > 0;

// Per-project rollup across the whole org.
export const projectAnalytics = (orgId) =>
  rows(`SELECT p.id, p.key, p.name, p.color,
               count(t.id)::int AS total,
               count(*) FILTER (WHERE c.name = 'Done')::int AS done,
               count(*) FILTER (WHERE c.name <> 'Done' AND t.due_date < CURRENT_DATE)::int AS overdue,
               count(*) FILTER (WHERE c.name <> 'Done' AND t.priority IN ('high','urgent'))::int AS high_priority
          FROM projects p
          LEFT JOIN tasks t ON t.project_id = p.id
          LEFT JOIN columns c ON c.id = t.column_id
         WHERE p.org_id = $1 GROUP BY p.id ORDER BY p.id`, [orgId]);

export const searchTasks = (orgId, q) =>
  rows(`SELECT t.*, p.key AS project_key, p.name AS project_name
          FROM tasks t JOIN projects p ON p.id = t.project_id
         WHERE p.org_id = $1 AND (t.title ILIKE $2 OR t.description ILIKE $2)
         ORDER BY t.updated_at DESC LIMIT 50`, [orgId, `%${q}%`]);

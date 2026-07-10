import pool, { query } from "#db/client";

export async function getTaskById(id) {
  const { rows } = await query(`SELECT * FROM tasks WHERE id = $1`, [id]);
  return rows[0];
}

// Board read: all tasks for a project, with optional priority/assignee filters.
export async function listTasks(projectId, { priority, assigneeId } = {}) {
  const clauses = ["project_id = $1"];
  const params = [projectId];
  if (priority) {
    params.push(priority);
    clauses.push(`priority = $${params.length}`);
  }
  if (assigneeId) {
    params.push(assigneeId);
    clauses.push(`assignee_id = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT * FROM tasks WHERE ${clauses.join(" AND ")}
     ORDER BY column_id, position`,
    params
  );
  return rows;
}

export async function createTask({
  projectId, columnId, title, description, priority, assigneeId, dueDate, createdBy,
}) {
  const { rows: [{ next }] } = await query(
    `SELECT COALESCE(MAX(position) + 1, 0) AS next FROM tasks WHERE column_id = $1`,
    [columnId]
  );
  const { rows } = await query(
    `INSERT INTO tasks
       (project_id, column_id, title, description, priority, assignee_id, due_date, position, created_by)
     VALUES ($1, $2, $3, COALESCE($4,''), COALESCE($5,'medium')::task_priority, $6, $7, $8, $9)
     RETURNING *`,
    [projectId, columnId, title, description, priority, assigneeId, dueDate || null, next, createdBy]
  );
  return rows[0];
}

const EDITABLE = ["title", "description", "priority", "assignee_id", "due_date", "column_id"];
const ENUM_COLS = { priority: "task_priority" };

export async function updateTask(id, patch) {
  const sets = [];
  const params = [id];
  for (const key of EDITABLE) {
    if (key in patch) {
      params.push(patch[key]);
      const cast = ENUM_COLS[key] ? `::${ENUM_COLS[key]}` : "";
      sets.push(`${key} = $${params.length}${cast}`);
    }
  }
  if (sets.length === 0) return getTaskById(id);
  sets.push(`updated_at = now()`);
  const { rows } = await query(
    `UPDATE tasks SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
    params
  );
  return rows[0];
}

// Move a task to a column at a target position, closing the gap in the old
// column and opening one in the new. Wrapped in a transaction so the board
// never reads a half-applied reorder.
export async function moveTask(id, toColumnId, toPosition) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [task] } = await client.query(
      `SELECT * FROM tasks WHERE id = $1 FOR UPDATE`, [id]
    );
    if (!task) { await client.query("ROLLBACK"); return null; }

    const fromColumn = task.column_id;
    const fromPos = task.position;

    if (fromColumn === toColumnId) {
      if (toPosition > fromPos) {
        await client.query(
          `UPDATE tasks SET position = position - 1
             WHERE column_id = $1 AND position > $2 AND position <= $3`,
          [toColumnId, fromPos, toPosition]
        );
      } else if (toPosition < fromPos) {
        await client.query(
          `UPDATE tasks SET position = position + 1
             WHERE column_id = $1 AND position >= $2 AND position < $3`,
          [toColumnId, toPosition, fromPos]
        );
      }
    } else {
      // close gap in old column
      await client.query(
        `UPDATE tasks SET position = position - 1
           WHERE column_id = $1 AND position > $2`,
        [fromColumn, fromPos]
      );
      // open gap in new column
      await client.query(
        `UPDATE tasks SET position = position + 1
           WHERE column_id = $1 AND position >= $2`,
        [toColumnId, toPosition]
      );
    }

    const { rows: [moved] } = await client.query(
      `UPDATE tasks SET column_id = $2, position = $3, updated_at = now()
         WHERE id = $1 RETURNING *`,
      [id, toColumnId, toPosition]
    );
    await client.query("COMMIT");
    return moved;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteTask(id) {
  const { rowCount } = await query(`DELETE FROM tasks WHERE id = $1`, [id]);
  return rowCount > 0;
}

// Dashboard analytics: counts by status (column name) and by priority,
// plus overdue and completion, computed in SQL.
export async function projectAnalytics(orgId) {
  const byStatus = await query(
    `SELECT c.name, COUNT(t.id)::int AS value
       FROM projects p
       JOIN columns c ON c.project_id = p.id
       LEFT JOIN tasks t ON t.column_id = c.id
      WHERE p.org_id = $1
      GROUP BY c.name
      ORDER BY value DESC`,
    [orgId]
  );
  const byPriority = await query(
    `SELECT t.priority AS name, COUNT(*)::int AS value
       FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE p.org_id = $1
      GROUP BY t.priority`,
    [orgId]
  );
  const totals = await query(
    `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE lower(c.name) = 'done')::int AS completed,
        COUNT(*) FILTER (
          WHERE t.due_date < CURRENT_DATE AND lower(c.name) <> 'done'
        )::int AS overdue
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       JOIN columns c ON c.id = t.column_id
      WHERE p.org_id = $1`,
    [orgId]
  );
  return {
    byStatus: byStatus.rows,
    byPriority: byPriority.rows,
    totals: totals.rows[0],
  };
}

// Cross-project text search over title and description.
export async function searchTasks(orgId, term) {
  const { rows } = await query(
    `SELECT t.*, p.key AS project_key
       FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE p.org_id = $1
        AND (t.title ILIKE $2 OR t.description ILIKE $2)
      ORDER BY t.updated_at DESC
      LIMIT 20`,
    [orgId, `%${term}%`]
  );
  return rows;
}

import { query, getClient } from "#db/client";

export async function getTaskById(id) {
  const { rows } = await query(`SELECT * FROM tasks WHERE id = $1`, [id]);
  return rows[0];
}

export async function listTasks(projectId, { priority, assigneeId } = {}) {
  const conditions = ["project_id = $1"];
  const params = [projectId];
  if (priority) {
    params.push(priority);
    conditions.push(`priority = $${params.length}`);
  }
  if (assigneeId !== undefined) {
    params.push(assigneeId);
    conditions.push(`assignee_id = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT * FROM tasks WHERE ${conditions.join(" AND ")}
      ORDER BY column_id, position`,
    params
  );
  return rows;
}

// New tasks land at the bottom of their column.
export async function createTask({
  projectId, columnId, title, description, priority, assigneeId, dueDate, createdBy,
}) {
  const { rows } = await query(
    `INSERT INTO tasks
       (project_id, column_id, title, description, priority,
        assignee_id, due_date, position, created_by)
     VALUES ($1, $2, $3, COALESCE($4, ''),
             COALESCE($5, 'medium')::task_priority, $6, $7,
             (SELECT COALESCE(MAX(position) + 1, 0) FROM tasks WHERE column_id = $2),
             $8)
     RETURNING *`,
    [projectId, columnId, title, description ?? null, priority ?? null,
     assigneeId ?? null, dueDate ?? null, createdBy]
  );
  return rows[0];
}

// Applies a partial update. Keys are already column names (the route maps
// camelCase input); anything outside the whitelist is ignored.
const PATCHABLE = ["title", "description", "priority", "assignee_id", "due_date", "column_id"];

export async function updateTask(id, patch) {
  const keys = Object.keys(patch).filter((k) => PATCHABLE.includes(k));
  if (keys.length === 0) return getTaskById(id);

  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const { rows } = await query(
    `UPDATE tasks SET ${sets.join(", ")}, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [id, ...keys.map((k) => patch[k])]
  );
  return rows[0];
}

// Drag-and-drop. The whole reorder is one transaction: close the gap in the
// source column, open one at the target position, and drop the task in. Both
// columns keep contiguous positions 0..n-1 with no gaps or duplicates.
export async function moveTask(id, toColumnId, toPosition) {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM tasks WHERE id = $1 FOR UPDATE`, [id]
    );
    const task = rows[0];

    await client.query(
      `UPDATE tasks SET position = position - 1
        WHERE column_id = $1 AND position > $2`,
      [task.column_id, task.position]
    );

    const { rows: [{ n }] } = await client.query(
      `SELECT count(*)::int AS n FROM tasks WHERE column_id = $1 AND id <> $2`,
      [toColumnId, id]
    );
    const position = Math.max(0, Math.min(toPosition, n));

    await client.query(
      `UPDATE tasks SET position = position + 1
        WHERE column_id = $1 AND position >= $2 AND id <> $3`,
      [toColumnId, position, id]
    );
    const { rows: updated } = await client.query(
      `UPDATE tasks SET column_id = $1, position = $2, updated_at = now()
        WHERE id = $3 RETURNING *`,
      [toColumnId, position, id]
    );

    await client.query("COMMIT");
    return updated[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Deleting a task closes the gap it leaves so column positions stay contiguous.
export async function deleteTask(id) {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `DELETE FROM tasks WHERE id = $1 RETURNING column_id, position`, [id]
    );
    if (rows[0]) {
      await client.query(
        `UPDATE tasks SET position = position - 1
          WHERE column_id = $1 AND position > $2`,
        [rows[0].column_id, rows[0].position]
      );
    }
    await client.query("COMMIT");
    return Boolean(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* --------------------------- search & analytics --------------------------- */
export async function searchTasks(orgId, q) {
  const { rows } = await query(
    `SELECT t.*, p.key AS project_key, p.name AS project_name
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
      WHERE p.org_id = $1
        AND (t.title ILIKE '%' || $2 || '%' OR t.description ILIKE '%' || $2 || '%')
      ORDER BY t.id`,
    [orgId, q]
  );
  return rows;
}

// Org-wide board analytics.
//   byStatus    — task counts per column name (columns merge across boards)
//   byPriority  — task counts per priority level
//   totals      — total / completed (in a Done column) / overdue (past due,
//                 not Done)
//   perProject  — { id, key, name, total, done } for each board
export async function projectAnalytics(orgId) {
  const [byStatus, byPriority, totals, perProject] = await Promise.all([
    query(
      `SELECT c.name, count(t.id)::int AS count
         FROM columns c
         JOIN projects p ON p.id = c.project_id
         LEFT JOIN tasks t ON t.column_id = c.id
        WHERE p.org_id = $1
        GROUP BY c.name
        ORDER BY min(c.position)`,
      [orgId]
    ),
    query(
      `SELECT t.priority::text AS name, count(*)::int AS count
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
        WHERE p.org_id = $1
        GROUP BY t.priority
        ORDER BY t.priority`,
      [orgId]
    ),
    query(
      `SELECT count(t.id)::int AS total,
              (count(t.id) FILTER (WHERE c.name = 'Done'))::int AS completed,
              (count(t.id) FILTER (WHERE t.due_date < CURRENT_DATE
                                     AND c.name <> 'Done'))::int AS overdue
         FROM tasks t
         JOIN columns c ON c.id = t.column_id
         JOIN projects p ON p.id = t.project_id
        WHERE p.org_id = $1`,
      [orgId]
    ),
    query(
      `SELECT p.id, p.key, p.name,
              count(t.id)::int AS total,
              (count(t.id) FILTER (WHERE c.name = 'Done'))::int AS done
         FROM projects p
         LEFT JOIN tasks t ON t.project_id = p.id
         LEFT JOIN columns c ON c.id = t.column_id
        WHERE p.org_id = $1
        GROUP BY p.id
        ORDER BY p.id`,
      [orgId]
    ),
  ]);

  return {
    byStatus: byStatus.rows,
    byPriority: byPriority.rows,
    totals: totals.rows[0],
    perProject: perProject.rows,
  };
}

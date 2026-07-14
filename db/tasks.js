import { query, first, all, withTransaction } from "#db/client";

export function getTaskById(id) {
  return first(`SELECT * FROM tasks WHERE id = $1`, [id]);
}

export function listTasks(projectId, { priority, assigneeId } = {}) {
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
  return all(
    `SELECT * FROM tasks WHERE ${conditions.join(" AND ")}
      ORDER BY column_id, position`,
    params
  );
}

// New tasks land at the bottom of their column.
export function createTask({
  projectId, columnId, title, description, priority, assigneeId, dueDate, createdBy,
}) {
  return first(
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
}

// Applies a partial update. Keys are already column names (the route maps
// camelCase input); anything outside the whitelist is ignored.
const PATCHABLE = ["title", "description", "priority", "assignee_id", "due_date", "column_id"];

export function updateTask(id, patch) {
  const keys = Object.keys(patch).filter((k) => PATCHABLE.includes(k));
  if (keys.length === 0) return getTaskById(id);

  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  return first(
    `UPDATE tasks SET ${sets.join(", ")}, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [id, ...keys.map((k) => patch[k])]
  );
}

// Shifts every task sitting past `position` in a column up one slot, closing
// the gap a task leaves when it moves away or is deleted — columns keep
// contiguous positions 0..n-1. Runs on the caller's transaction client.
function closeGap(client, columnId, position) {
  return client.query(
    `UPDATE tasks SET position = position - 1
      WHERE column_id = $1 AND position > $2`,
    [columnId, position]
  );
}

// Drag-and-drop. The whole reorder is one transaction: close the gap in the
// source column, open one at the target position, and drop the task in. Both
// columns keep contiguous positions 0..n-1 with no gaps or duplicates.
export function moveTask(id, toColumnId, toPosition) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM tasks WHERE id = $1 FOR UPDATE`, [id]
    );
    const task = rows[0];

    await closeGap(client, task.column_id, task.position);

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

    return updated[0];
  });
}

// Deleting a task closes the gap it leaves so column positions stay contiguous.
export function deleteTask(id) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `DELETE FROM tasks WHERE id = $1 RETURNING column_id, position`, [id]
    );
    if (rows[0]) {
      await closeGap(client, rows[0].column_id, rows[0].position);
    }
    return Boolean(rows[0]);
  });
}

/* --------------------------- search & analytics --------------------------- */
export function searchTasks(orgId, q) {
  return all(
    `SELECT t.*, p.key AS project_key, p.name AS project_name
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
      WHERE p.org_id = $1
        AND (t.title ILIKE '%' || $2 || '%' OR t.description ILIKE '%' || $2 || '%')
      ORDER BY t.id`,
    [orgId, q]
  );
}

// Org-wide board analytics.
//   byStatus    — task counts per column name (columns merge across boards)
//   byPriority  — task counts per priority level
//   totals      — total / completed (in a Done column) / overdue (past due,
//                 not Done)
//   perProject  — { id, key, name, total, done } for each board
export async function projectAnalytics(orgId) {
  const [byStatus, byPriority, totals, perProject] = await Promise.all([
    all(
      `SELECT c.name, count(t.id)::int AS count
         FROM columns c
         JOIN projects p ON p.id = c.project_id
         LEFT JOIN tasks t ON t.column_id = c.id
        WHERE p.org_id = $1
        GROUP BY c.name
        ORDER BY min(c.position)`,
      [orgId]
    ),
    all(
      `SELECT t.priority::text AS name, count(*)::int AS count
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
        WHERE p.org_id = $1
        GROUP BY t.priority
        ORDER BY t.priority`,
      [orgId]
    ),
    first(
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
    all(
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

  return { byStatus, byPriority, totals, perProject };
}

// Task creation vs. completion for each of the last 7 days. The schema keeps
// no status-change history, so "completed" means currently sitting in a Done
// column and last touched that day — a snapshot proxy, not a true completion
// timestamp.
export function weeklyActivity(orgId) {
  return all(
    `WITH days AS (
       SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day')::date AS day
     )
     SELECT to_char(d.day, 'Dy')                 AS day,
            d.day                                AS date,
            COALESCE(created.n, 0)::int          AS created,
            COALESCE(completed.n, 0)::int        AS completed
       FROM days d
       LEFT JOIN (
         SELECT t.created_at::date AS day, count(*) AS n
           FROM tasks t JOIN projects p ON p.id = t.project_id
          WHERE p.org_id = $1 AND t.created_at >= CURRENT_DATE - INTERVAL '6 days'
          GROUP BY 1
       ) created ON created.day = d.day
       LEFT JOIN (
         SELECT t.updated_at::date AS day, count(*) AS n
           FROM tasks t
           JOIN projects p ON p.id = t.project_id
           JOIN columns c ON c.id = t.column_id
          WHERE p.org_id = $1 AND c.name = 'Done' AND t.updated_at >= CURRENT_DATE - INTERVAL '6 days'
          GROUP BY 1
       ) completed ON completed.day = d.day
      ORDER BY d.day`,
    [orgId]
  );
}

// Cumulative task count as of each month-end for the last 6 months, split
// into total created vs. those currently Done — a growth trend, not a replay
// of history (same snapshot-proxy caveat as weeklyActivity).
export function monthlyGrowth(orgId) {
  return all(
    `WITH months AS (
       SELECT generate_series(
         date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
         date_trunc('month', CURRENT_DATE),
         INTERVAL '1 month'
       )::date AS month_start
     )
     SELECT to_char(m.month_start, 'Mon')                                AS month,
            m.month_start                                                AS date,
            (SELECT count(*)::int FROM tasks t
               JOIN projects p ON p.id = t.project_id
              WHERE p.org_id = $1
                AND t.created_at < m.month_start + INTERVAL '1 month')    AS total,
            (SELECT count(*)::int FROM tasks t
               JOIN projects p ON p.id = t.project_id
               JOIN columns c ON c.id = t.column_id
              WHERE p.org_id = $1 AND c.name = 'Done'
                AND t.created_at < m.month_start + INTERVAL '1 month')    AS completed
       FROM months m
      ORDER BY m.month_start`,
    [orgId]
  );
}

// Due-date density for one calendar month (monthStart is the first-of-month
// date) — powers the dashboard's calendar view.
export function calendarActivity(orgId, monthStart) {
  return all(
    `SELECT t.due_date::date                                       AS date,
            count(*)::int                                          AS count,
            bool_or(c.name <> 'Done' AND t.due_date < CURRENT_DATE) AS overdue
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       JOIN columns c ON c.id = t.column_id
      WHERE p.org_id = $1
        AND t.due_date >= $2::date
        AND t.due_date <  ($2::date + INTERVAL '1 month')
      GROUP BY t.due_date
      ORDER BY t.due_date`,
    [orgId, monthStart]
  );
}

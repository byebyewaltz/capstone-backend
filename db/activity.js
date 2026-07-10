import { query } from "#db/client";

/* ----------------------------- comments ---------------------------------- */
export async function listComments(taskId) {
  const { rows } = await query(
    `SELECT cm.id, cm.body, cm.created_at,
            u.id AS user_id, u.name, u.color
       FROM comments cm
       LEFT JOIN users u ON u.id = cm.user_id
      WHERE cm.task_id = $1
      ORDER BY cm.created_at`,
    [taskId]
  );
  return rows;
}

export async function addComment({ taskId, userId, body }) {
  const { rows } = await query(
    `INSERT INTO comments (task_id, user_id, body) VALUES ($1, $2, $3)
     RETURNING *`,
    [taskId, userId, body]
  );
  return rows[0];
}

/* --------------------------- attachments --------------------------------- */
export async function listAttachments(taskId) {
  const { rows } = await query(
    `SELECT * FROM attachments WHERE task_id = $1 ORDER BY created_at`,
    [taskId]
  );
  return rows;
}

export async function addAttachment({ taskId, userId, filename, sizeBytes }) {
  const { rows } = await query(
    `INSERT INTO attachments (task_id, user_id, filename, size_bytes)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [taskId, userId, filename, sizeBytes || 0]
  );
  return rows[0];
}

export async function getAttachmentById(id) {
  const { rows } = await query(`SELECT * FROM attachments WHERE id = $1`, [id]);
  return rows[0];
}

export async function deleteAttachment(id) {
  const { rowCount } = await query(`DELETE FROM attachments WHERE id = $1`, [id]);
  return rowCount > 0;
}

/* -------------------------- notifications -------------------------------- */
export async function listNotifications(userId) {
  // Join to tasks so the client can open a notification's task directly,
  // without scanning every project to find which board it lives on.
  //
  // Task-linked rows are also filtered against current membership: a person
  // removed from an organization (or who was never in it) must not keep seeing
  // notifications that carry task titles and project ids out of that org.
  // Org-less rows (task_id IS NULL) are always the recipient's own.
  const { rows } = await query(
    `SELECT n.*, t.project_id
       FROM notifications n
       LEFT JOIN tasks t ON t.id = n.task_id
       LEFT JOIN projects p ON p.id = t.project_id
      WHERE n.user_id = $1
        AND (
          n.task_id IS NULL
          OR EXISTS (
            SELECT 1 FROM memberships m
             WHERE m.user_id = $1 AND m.org_id = p.org_id
          )
        )
      ORDER BY n.created_at DESC LIMIT 50`,
    [userId]
  );
  return rows;
}

export async function createNotification({ userId, body, taskId }) {
  const { rows } = await query(
    `INSERT INTO notifications (user_id, body, task_id) VALUES ($1, $2, $3)
     RETURNING *`,
    [userId, body, taskId || null]
  );
  return rows[0];
}

export async function markRead(id) {
  const { rows } = await query(
    `UPDATE notifications SET is_read = true WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0];
}

export async function markAllRead(userId) {
  await query(
    `UPDATE notifications SET is_read = true WHERE user_id = $1`,
    [userId]
  );
}

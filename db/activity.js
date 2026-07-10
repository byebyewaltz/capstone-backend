import { query, rows, one } from "#db/client";

/* comments */
export const listComments = (taskId) =>
  rows(`SELECT cm.id, cm.body, cm.created_at, u.id AS user_id, u.name, u.color
          FROM comments cm LEFT JOIN users u ON u.id = cm.user_id
         WHERE cm.task_id = $1 ORDER BY cm.created_at`, [taskId]);

export const addComment = ({ taskId, userId, body }) =>
  one(`INSERT INTO comments (task_id, user_id, body) VALUES ($1,$2,$3) RETURNING *`,
    [taskId, userId, body]);

/* attachments */
export const listAttachments = (taskId) =>
  rows(`SELECT * FROM attachments WHERE task_id = $1 ORDER BY created_at`, [taskId]);

export const addAttachment = ({ taskId, userId, filename, sizeBytes }) =>
  one(`INSERT INTO attachments (task_id, user_id, filename, size_bytes)
       VALUES ($1,$2,$3,$4) RETURNING *`, [taskId, userId, filename, sizeBytes || 0]);

export const getAttachmentById = (id) =>
  one(`SELECT * FROM attachments WHERE id = $1`, [id]);

export const deleteAttachment = async (id) =>
  (await query(`DELETE FROM attachments WHERE id = $1`, [id])).rowCount > 0;

/* notifications */
// Task-linked rows are filtered against current membership so a person removed
// from an org stops seeing its task titles; org-less rows are always their own.
export const listNotifications = (userId) =>
  rows(`SELECT n.*, t.project_id
          FROM notifications n
          LEFT JOIN tasks t ON t.id = n.task_id
          LEFT JOIN projects p ON p.id = t.project_id
         WHERE n.user_id = $1 AND (n.task_id IS NULL OR EXISTS
           (SELECT 1 FROM memberships m WHERE m.user_id = $1 AND m.org_id = p.org_id))
         ORDER BY n.created_at DESC LIMIT 50`, [userId]);

export const createNotification = ({ userId, body, taskId }) =>
  one(`INSERT INTO notifications (user_id, body, task_id) VALUES ($1,$2,$3) RETURNING *`,
    [userId, body, taskId || null]);

export const markRead = (id) =>
  one(`UPDATE notifications SET is_read = true WHERE id = $1 RETURNING *`, [id]);

export const markAllRead = (userId) =>
  query(`UPDATE notifications SET is_read = true WHERE user_id = $1`, [userId]);

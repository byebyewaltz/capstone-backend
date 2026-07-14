import { first, all, affected } from "#db/client";

/* ---------------- comments ---------------- */

export const listComments = (taskId) =>
  all(
    `SELECT c.id, c.body, c.created_at,
            u.id user_id, u.name, u.color
       FROM comments c
       LEFT JOIN users u ON u.id = c.user_id
      WHERE c.task_id=$1
      ORDER BY c.created_at`,
    [taskId]
  );

export const addComment = ({ taskId, userId, body }) =>
  first(
    `INSERT INTO comments(task_id,user_id,body)
     VALUES($1,$2,$3)
     RETURNING *`,
    [taskId, userId, body.trim()]
  );


/* ---------------- attachments ---------------- */

export const listAttachments = (taskId) =>
  all(
    `SELECT id,task_id,user_id,filename,size_bytes,created_at
       FROM attachments
      WHERE task_id=$1
      ORDER BY created_at`,
    [taskId]
  );

export const addAttachment = ({ taskId, userId, filename, sizeBytes = 0 }) =>
  first(
    `INSERT INTO attachments
      (task_id,user_id,filename,size_bytes)
     VALUES($1,$2,$3,$4)
     RETURNING *`,
    [taskId, userId, filename, sizeBytes]
  );

export const getAttachmentById = (id) =>
  first(`SELECT * FROM attachments WHERE id=$1`, [id]);

export const deleteAttachment = async (id) =>
  (await affected(
    `DELETE FROM attachments WHERE id=$1`,
    [id]
  )) > 0;


/* ---------------- notifications ---------------- */

export const listNotifications = (userId) =>
  all(
    `SELECT n.*, t.project_id
       FROM notifications n
       LEFT JOIN tasks t ON t.id=n.task_id
       LEFT JOIN projects p ON p.id=t.project_id
      WHERE n.user_id=$1
        AND (
          n.task_id IS NULL
          OR EXISTS (
            SELECT 1
              FROM memberships m
             WHERE m.user_id=$1
               AND m.org_id=p.org_id
          )
        )
      ORDER BY n.created_at DESC,n.id DESC
      LIMIT 50`,
    [userId]
  );


export const createNotification = ({ userId, body, taskId = null }) =>
  first(
    `INSERT INTO notifications(user_id,body,task_id)
     VALUES($1,$2,$3)
     RETURNING *`,
    [userId, body, taskId]
  );

export const getNotificationById = (id) =>
  first(`SELECT * FROM notifications WHERE id=$1`, [id]);

export const markRead = (id, userId) =>
  first(
    `UPDATE notifications
        SET is_read=true
      WHERE id=$1 AND user_id=$2
      RETURNING *`,
    [id, userId]
  );

export const markAllRead = (userId) =>
  affected(
    `UPDATE notifications
        SET is_read=true
      WHERE user_id=$1`,
    [userId]
  );

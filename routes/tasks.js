import express from "express";
import requireBody from "#middleware/requireBody";
import asyncHandler from "#middleware/asyncHandler";
import { resourceParam, loadResource } from "#middleware/loadResource";
import { requireRole } from "#middleware/auth";
import { resolveAssignee, resolveColumn } from "#lib/validate";
import { notify, notifyAssigned } from "#lib/notifications";
import { ymd } from "#lib/dates";
import {
  getTaskById, createTask, updateTask, moveTask, deleteTask, listTasks,
  TASK_PATCH_FIELDS,
} from "#db/tasks";
import {
  listComments, addComment, listAttachments, addAttachment,
  getAttachmentById, deleteAttachment,
} from "#db/activity";

// mergeParams so :orgId and :projectId from the parent chain are visible here.
const router = express.Router({ mergeParams: true });

// Centralized 404 + record attachment for any :taskId route.
router.param("taskId", resourceParam({
  fetch: getTaskById, as: "task", notFound: "Task not found.",
  belongsTo: (task, req) => task.project_id === Number(req.params.projectId),
}));

// GET /orgs/:orgId/projects/:projectId/tasks?priority=&assigneeId=
router.get("/", asyncHandler(async (req, res) => {
  const tasks = await listTasks(Number(req.params.projectId), {
    priority: req.query.priority,
    assigneeId: req.query.assigneeId ? Number(req.query.assigneeId) : undefined,
  });
  res.json(tasks);
}));

// POST tasks — members and up.
router.post("/", requireRole("member"), requireBody("title", "columnId"),
  asyncHandler(async (req, res) => {
    const { title, columnId, description, priority, assigneeId, dueDate } = req.body;
    await resolveColumn(columnId, req.params.projectId,
      "Column does not belong to this project.");
    const assignee = await resolveAssignee(req.params.orgId, assigneeId);
    const task = await createTask({
      projectId: Number(req.params.projectId),
      columnId: Number(columnId),
      title, description, priority,
      assigneeId: assignee,
      dueDate,
      createdBy: req.user.id,
    });
    // Notify the assignee if someone else assigned them.
    await notifyAssigned(req.user, task);
    res.status(201).json(task);
  }));

router.get("/:taskId", (req, res) => res.json(req.task));

// PATCH task — edit fields. Maps camelCase input to column names.
router.patch("/:taskId", requireRole("member"), asyncHandler(async (req, res) => {
  const patch = {};
  for (const [k, col] of Object.entries(TASK_PATCH_FIELDS)) {
    if (k in req.body) patch[col] = req.body[k] === "" ? null : req.body[k];
  }
  // Reassignment must stay inside the organization.
  if ("assignee_id" in patch) {
    patch.assignee_id = await resolveAssignee(req.params.orgId, patch.assignee_id);
  }
  const before = req.task;
  const updated = await updateTask(req.task.id, patch);

  // Notify on meaningful changes, never notifying the actor about their own edit.
  // resolveAssignee already normalized patch.assignee_id to a number or null.
  const reassigned =
    "assignee_id" in patch && patch.assignee_id !== before.assignee_id;

  if (reassigned) {
    // The new owner hears they've been given the task.
    await notifyAssigned(req.user, updated);
    // The previous owner hears it moved off their plate.
    await notify(req.user, before.assignee_id,
      `${req.user.name} reassigned “${updated.title}”`, updated.id);
  } else {
    // Describe what actually changed, so the notification is worth reading.
    const changes = [];
    if ("priority" in patch && patch.priority !== before.priority)
      changes.push(`priority → ${patch.priority}`);
    if ("due_date" in patch && ymd(patch.due_date) !== ymd(before.due_date))
      changes.push(patch.due_date ? `due ${patch.due_date}` : "due date cleared");
    if ("title" in patch && patch.title !== before.title) changes.push("title");
    if ("description" in patch && patch.description !== before.description) changes.push("description");

    if (changes.length) {
      await notify(req.user, updated.assignee_id,
        `${req.user.name} updated “${before.title}” (${changes.join(", ")})`, updated.id);
    }
  }
  res.json(updated);
}));

// POST move — drag-and-drop endpoint. Transactional reorder in the query layer.
router.post("/:taskId/move", requireRole("member"),
  requireBody("toColumnId", "toPosition"), asyncHandler(async (req, res) => {
    const { toColumnId, toPosition } = req.body;
    const column = await resolveColumn(toColumnId, req.task.project_id,
      "Target column is not in this project.");
    const moved = await moveTask(req.task.id, Number(toColumnId), Number(toPosition));
    // A column change is a status change — worth telling the assignee about.
    if (moved.column_id !== req.task.column_id) {
      await notify(req.user, moved.assignee_id,
        `${req.user.name} moved “${moved.title}” to ${column.name}`, moved.id);
    }
    res.json(moved);
  }));

router.delete("/:taskId", requireRole("member"), asyncHandler(async (req, res) => {
  await deleteTask(req.task.id);
  res.json({ deleted: true });
}));

/* ----------------------------- comments ---------------------------------- */
router.get("/:taskId/comments", asyncHandler(async (req, res) => {
  res.json(await listComments(req.task.id));
}));

router.post("/:taskId/comments", requireRole("member"), requireBody("body"),
  asyncHandler(async (req, res) => {
    const comment = await addComment({
      taskId: req.task.id, userId: req.user.id, body: req.body.body,
    });
    // Notify the assignee of new activity (unless they wrote it).
    await notify(req.user, req.task.assignee_id,
      `${req.user.name} commented on “${req.task.title}”`, req.task.id);
    res.status(201).json(comment);
  }));

/* --------------------------- attachments --------------------------------- */
router.get("/:taskId/attachments", asyncHandler(async (req, res) => {
  res.json(await listAttachments(req.task.id));
}));

// Metadata-only upload record (filename + size); binary storage is out of scope.
router.post("/:taskId/attachments", requireRole("member"), requireBody("filename"),
  asyncHandler(async (req, res) => {
    const att = await addAttachment({
      taskId: req.task.id, userId: req.user.id,
      filename: req.body.filename, sizeBytes: req.body.sizeBytes,
    });
    res.status(201).json(att);
  }));

// Loads :attId scoped to the current task; after the role guard so a role
// failure still wins over a 404.
const loadAttachment = loadResource("attId", {
  fetch: getAttachmentById, as: "attachment", notFound: "Attachment not found.",
  belongsTo: (att, req) => att.task_id === req.task.id,
});

router.delete("/:taskId/attachments/:attId", requireRole("member"),
  loadAttachment, asyncHandler(async (req, res) => {
    await deleteAttachment(req.attachment.id);
    res.json({ deleted: true });
  }));

export default router;

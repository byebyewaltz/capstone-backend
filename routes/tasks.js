import express from "express";
import requireBody from "#middleware/requireBody";
import { requireRole } from "#middleware/auth";
import {
  getTaskById, createTask, updateTask, moveTask, deleteTask, listTasks,
} from "#db/tasks";
import {
  listComments, addComment, listAttachments, addAttachment,
  getAttachmentById, deleteAttachment, createNotification,
} from "#db/activity";
import { getColumnById } from "#db/projects";
import { getMembership } from "#db/orgs";

// mergeParams so :orgId and :projectId from the parent chain are visible here.
const router = express.Router({ mergeParams: true });

// A task may only be assigned to someone who belongs to the same organization.
// Without this, assigning to an outsider would create a notification carrying
// the task title and project id into an org they cannot otherwise see.
async function resolveAssignee(orgId, assigneeId) {
  if (assigneeId === undefined || assigneeId === null || assigneeId === "") return null;
  const id = Number(assigneeId);
  if (!Number.isInteger(id)) {
    throw Object.assign(new Error("Assignee must be a user id."), { status: 400 });
  }
  const membership = await getMembership(Number(orgId), id);
  if (!membership) {
    throw Object.assign(
      new Error("That person is not a member of this organization."),
      { status: 422 }
    );
  }
  return id;
}

// Centralized 404 + record attachment for any :taskId route.
router.param("taskId", async (req, res, next, id) => {
  try {
    const task = await getTaskById(Number(id));
    if (!task || task.project_id !== Number(req.params.projectId)) {
      return res.status(404).json({ error: "Task not found." });
    }
    req.task = task;
    next();
  } catch (err) {
    next(err);
  }
});

// GET /orgs/:orgId/projects/:projectId/tasks?priority=&assigneeId=
router.get("/", async (req, res, next) => {
  try {
    const tasks = await listTasks(Number(req.params.projectId), {
      priority: req.query.priority,
      assigneeId: req.query.assigneeId ? Number(req.query.assigneeId) : undefined,
    });
    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

// POST tasks — members and up.
router.post("/", requireRole("member"), requireBody("title", "columnId"),
  async (req, res, next) => {
    try {
      const { title, columnId, description, priority, assigneeId, dueDate } = req.body;
      const column = await getColumnById(Number(columnId));
      if (!column || column.project_id !== Number(req.params.projectId)) {
        return res.status(400).json({ error: "Column does not belong to this project." });
      }
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
      if (task.assignee_id && task.assignee_id !== req.user.id) {
        await createNotification({
          userId: task.assignee_id,
          body: `${req.user.name} assigned you “${task.title}”`,
          taskId: task.id,
        });
      }
      res.status(201).json(task);
    } catch (err) {
      next(err);
    }
  });

router.get("/:taskId", (req, res) => res.json(req.task));

// PATCH task — edit fields. Maps camelCase input to column names.
router.patch("/:taskId", requireRole("member"), async (req, res, next) => {
  try {
    const map = {
      title: "title", description: "description", priority: "priority",
      assigneeId: "assignee_id", dueDate: "due_date", columnId: "column_id",
    };
    const patch = {};
    for (const [k, col] of Object.entries(map)) {
      if (k in req.body) patch[col] = req.body[k] === "" ? null : req.body[k];
    }
    // Reassignment must stay inside the organization.
    if ("assignee_id" in patch) {
      patch.assignee_id = await resolveAssignee(req.params.orgId, patch.assignee_id);
    }
    const before = req.task;
    const updated = await updateTask(req.task.id, patch);

    // Notify on meaningful changes, never notifying the actor about their own edit.
    const notify = (userId, body) => {
      if (userId && userId !== req.user.id) {
        return createNotification({ userId, body, taskId: updated.id });
      }
    };
    const reassigned =
      "assignee_id" in patch && Number(patch.assignee_id) !== before.assignee_id;

    if (reassigned) {
      // The new owner hears they've been given the task.
      await notify(updated.assignee_id, `${req.user.name} assigned you “${updated.title}”`);
      // The previous owner hears it moved off their plate.
      await notify(before.assignee_id, `${req.user.name} reassigned “${updated.title}”`);
    } else {
      // Describe what actually changed, so the notification is worth reading.
      const changes = [];
      if ("priority" in patch && patch.priority !== before.priority)
        changes.push(`priority → ${patch.priority}`);
      if ("due_date" in patch && String(patch.due_date) !== String(before.due_date).slice(0, 10))
        changes.push(patch.due_date ? `due ${patch.due_date}` : "due date cleared");
      if ("title" in patch && patch.title !== before.title) changes.push("title");
      if ("description" in patch && patch.description !== before.description) changes.push("description");

      if (changes.length) {
        await notify(
          updated.assignee_id,
          `${req.user.name} updated “${before.title}” (${changes.join(", ")})`
        );
      }
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST move — drag-and-drop endpoint. Transactional reorder in the query layer.
router.post("/:taskId/move", requireRole("member"),
  requireBody("toColumnId", "toPosition"), async (req, res, next) => {
    try {
      const { toColumnId, toPosition } = req.body;
      const column = await getColumnById(Number(toColumnId));
      if (!column || column.project_id !== req.task.project_id) {
        return res.status(400).json({ error: "Target column is not in this project." });
      }
      const moved = await moveTask(req.task.id, Number(toColumnId), Number(toPosition));
      // A column change is a status change — worth telling the assignee about.
      if (moved.column_id !== req.task.column_id &&
          moved.assignee_id && moved.assignee_id !== req.user.id) {
        await createNotification({
          userId: moved.assignee_id,
          body: `${req.user.name} moved “${moved.title}” to ${column.name}`,
          taskId: moved.id,
        });
      }
      res.json(moved);
    } catch (err) {
      next(err);
    }
  });

router.delete("/:taskId", requireRole("member"), async (req, res, next) => {
  try {
    await deleteTask(req.task.id);
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

/* ----------------------------- comments ---------------------------------- */
router.get("/:taskId/comments", async (req, res, next) => {
  try {
    res.json(await listComments(req.task.id));
  } catch (err) { next(err); }
});

router.post("/:taskId/comments", requireRole("member"), requireBody("body"),
  async (req, res, next) => {
    try {
      const comment = await addComment({
        taskId: req.task.id, userId: req.user.id, body: req.body.body,
      });
      // Notify the assignee of new activity (unless they wrote it).
      if (req.task.assignee_id && req.task.assignee_id !== req.user.id) {
        await createNotification({
          userId: req.task.assignee_id,
          body: `${req.user.name} commented on “${req.task.title}”`,
          taskId: req.task.id,
        });
      }
      res.status(201).json(comment);
    } catch (err) { next(err); }
  });

/* --------------------------- attachments --------------------------------- */
router.get("/:taskId/attachments", async (req, res, next) => {
  try {
    res.json(await listAttachments(req.task.id));
  } catch (err) { next(err); }
});

// Metadata-only upload record (filename + size); binary storage is out of scope.
router.post("/:taskId/attachments", requireRole("member"), requireBody("filename"),
  async (req, res, next) => {
    try {
      const att = await addAttachment({
        taskId: req.task.id, userId: req.user.id,
        filename: req.body.filename, sizeBytes: req.body.sizeBytes,
      });
      res.status(201).json(att);
    } catch (err) { next(err); }
  });

router.delete("/:taskId/attachments/:attId", requireRole("member"),
  async (req, res, next) => {
    try {
      const att = await getAttachmentById(Number(req.params.attId));
      if (!att || att.task_id !== req.task.id) {
        return res.status(404).json({ error: "Attachment not found." });
      }
      await deleteAttachment(att.id);
      res.json({ deleted: true });
    } catch (err) { next(err); }
  });

export default router;

import express from "express";
import asyncHandler from "#middleware/asyncHandler";
import { loadResource } from "#middleware/loadResource";
import { requireUser } from "#middleware/auth";
import {
  listNotifications, getNotificationById, markRead, markAllRead,
} from "#db/activity";

const router = express.Router();
router.use(requireUser);

// GET /notifications — the caller's own feed.
router.get("/", asyncHandler(async (req, res) => {
  res.json(await listNotifications(req.user.id));
}));

// PATCH /notifications/read-all
router.patch("/read-all", asyncHandler(async (req, res) => {
  await markAllRead(req.user.id);
  res.json({ ok: true });
}));

// Someone else's notification 404s rather than 403s — its existence is
// nobody else's business.
const loadNotification = loadResource("id", {
  fetch: getNotificationById, as: "notification", notFound: "Notification not found.",
  belongsTo: (notif, req) => notif.user_id === req.user.id,
});

// PATCH /notifications/:id/read — only the owner may mark it.
router.patch("/:id/read", loadNotification, asyncHandler(async (req, res) => {
  res.json(await markRead(req.notification.id, req.user.id));
}));

export default router;

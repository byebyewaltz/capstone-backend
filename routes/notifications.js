import express from "express";
import { requireUser } from "#middleware/auth";
import {
  listNotifications, getNotificationById, markRead, markAllRead,
} from "#db/activity";

const router = express.Router();
router.use(requireUser);

// GET /notifications — the caller's own feed.
router.get("/", async (req, res, next) => {
  try {
    res.json(await listNotifications(req.user.id));
  } catch (err) { next(err); }
});

// PATCH /notifications/read-all
router.patch("/read-all", async (req, res, next) => {
  try {
    await markAllRead(req.user.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PATCH /notifications/:id/read — only the owner may mark it.
router.patch("/:id/read", async (req, res, next) => {
  try {
    const notif = await getNotificationById(Number(req.params.id));
    if (!notif || notif.user_id !== req.user.id) {
      return res.status(404).json({ error: "Notification not found." });
    }
    res.json(await markRead(notif.id, req.user.id));
  } catch (err) { next(err); }
});

export default router;

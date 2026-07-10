import express from "express";
import { requireUser } from "#middleware/auth";
import { listNotifications, markRead, markAllRead } from "#db/activity";
import { query } from "#db/client";

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
    const { rows } = await query(
      `SELECT * FROM notifications WHERE id = $1`, [Number(req.params.id)]
    );
    const notif = rows[0];
    if (!notif || notif.user_id !== req.user.id) {
      return res.status(404).json({ error: "Notification not found." });
    }
    res.json(await markRead(notif.id));
  } catch (err) { next(err); }
});

export default router;

import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import { subscribeUserNotifications } from "../services/notificationRealtime.js";

const FAIL = (res, code, message, extra = {}) => res.status(code).json({ success: false, message, ...extra });
const handle = (action) => async (req, res, next) => {
  try { await action(req, res); }
  catch (error) {
    if (error instanceof mongoose.CastError) return FAIL(res, 400, "Invalid identifier.");
    next(error);
  }
};

const toPublic = (record) => ({
  id: String(record._id),
  type: record.type,
  title: record.title,
  message: record.message,
  link: record.link || "",
  read: record.read === true,
  createdAt: record.createdAt,
});

const listFilter = (req, { type, unreadOnly } = {}) => ({
  recipientId: req.user._id,
  ...(type ? { type } : {}),
  ...(unreadOnly ? { read: false } : {}),
});

// GET /api/notifications — the user's own notifications (paginated).
export const listNotifications = handle(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const type = String(req.query.type || "").trim().slice(0, 60);
  const unreadOnly = req.query.unreadOnly === "true" || req.query.unreadOnly === "1";
  const filter = listFilter(req, { type, unreadOnly });
  const [total, notifications] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.find(filter).select("_id type title message link read createdAt")
      .sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
  ]);
  res.json({ success: true, notifications: notifications.map(toPublic), total, page, pageCount: Math.max(1, Math.ceil(total / limit)), limit });
});

// GET /api/notifications/unread-count — the user's unread notification count.
export const getUnreadCount = handle(async (req, res) => {
  const count = await Notification.countDocuments({ recipientId: req.user._id, read: false });
  res.json({ success: true, unreadCount: count });
});

// PATCH /api/notifications/:id/read — mark one of your notifications as read.
// The recipient filter keeps other users' notifications unreachable (404).
export const markNotificationRead = handle(async (req, res) => {
  const updated = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipientId: req.user._id },
    { $set: { read: true } },
    { returnDocument: "after" },
  ).lean();
  if (!updated) return FAIL(res, 404, "Notification not found.");
  res.json({ success: true, notification: toPublic(updated) });
});

// PATCH /api/notifications/read-all — mark every unread notification of yours as read.
export const markAllNotificationsRead = handle(async (req, res) => {
  const result = await Notification.updateMany({ recipientId: req.user._id, read: false }, { $set: { read: true } });
  res.json({ success: true, updated: result.modifiedCount });
});

// DELETE /api/notifications/:id — delete one of your notifications.
export const deleteNotification = handle(async (req, res) => {
  const removed = await Notification.findOneAndDelete({ _id: req.params.id, recipientId: req.user._id }).lean();
  if (!removed) return FAIL(res, 404, "Notification not found.");
  res.json({ success: true, message: "Notification deleted." });
});

// GET /api/notifications/stream — authenticated SSE stream for the current user.
// MongoDB remains authoritative; this pushes newly persisted notifications and
// lightweight unread-count updates without polling.
export const streamNotifications = async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const userId = String(req.user._id);
  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const unreadCount = await Notification.countDocuments({ recipientId: req.user._id, read: false });
    send("ready", { ok: true, unreadCount });
  } catch {
    send("ready", { ok: true });
  }

  const onNotification = (payload) => {
    if (payload?.notification) send("notification", payload.notification);
  };
  const unsubscribe = subscribeUserNotifications(userId, onNotification);

  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch { /* ignore */ }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    try { res.end(); } catch { /* ignore */ }
  });
};

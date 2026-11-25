import { randomUUID } from "node:crypto";
import Notification from "../models/Notification.js";
import Admin from "../models/Admin.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import { publishUserNotification } from "./notificationRealtime.js";

// MongoDB remains the source of truth; realtime delivery is handled by
// notificationRealtime (in-process bus + optional Redis pub/sub for multi-instance).

const MAX_TITLE = 160;
const MAX_MESSAGE = 500;

export function clip(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

export function notificationData(data = {}) {
  // Accepts a dashboard tab id ("help-support") or an in-app path ("/orders").
  const rawLink = String(data.link || "").trim();
  const link = /^[a-z0-9-]{1,60}$/i.test(rawLink) || rawLink.startsWith("/") ? clip(rawLink, 200) : "";
  const title = clip(data.title, MAX_TITLE) || "Update";
  return {
    type: clip(data.type, 60) || "general",
    title,
    message: clip(data.message, MAX_MESSAGE) || title,
    link,
  };
}

export const toNotificationPublic = (record) => ({
  id: String(record._id),
  type: record.type,
  title: record.title,
  message: record.message,
  link: record.link || "",
  read: record.read === true,
  createdAt: record.createdAt,
});

function publishNotification(record) {
  if (!record?._id || !record?.recipientId) return record;
  // Fire-and-forget; delivery must not break the business flow.
  void publishUserNotification(String(record.recipientId), toNotificationPublic(record));
  return record;
}

export async function createNotification(recipientId, data = {}) {
  if (!recipientId) return null;
  const payload = notificationData(data);
  const rawKey = clip(data.idempotencyKey, 130);
  if (rawKey) {
    // Keys are scoped per recipient so one event can notify many accounts
    // without the unique index collapsing them into a single document.
    const key = `${String(recipientId)}:${rawKey}`;
    const existing = await Notification.findOne({ idempotencyKey: key }).lean();
    if (existing) return existing;
    try {
      const created = await Notification.create({ recipientId, ...payload, idempotencyKey: key });
      return publishNotification(created.toObject ? created.toObject() : created);
    } catch (error) {
      if (error.code === 11000) return Notification.findOne({ idempotencyKey: key }).lean();
      throw error;
    }
  }
  const created = await Notification.create({ recipientId, ...payload, idempotencyKey: `ntf-${randomUUID()}` });
  return publishNotification(created.toObject ? created.toObject() : created);
}

export async function notifyAllAdmins(data = {}) {
  const admins = await Admin.find({ isActive: true }).select("_id").lean();
  return Promise.all(admins.map((admin) => createNotification(admin._id, data)));
}

// Resolves an account by its (lowercase, trimmed) email within the role's own
// collection and creates the notification there. Returns null when unknown.
export async function notifyUserByEmail(email, role, data = {}) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  const Model = role === "teacher" ? Teacher : role === "admin" ? Admin : Student;
  const user = await Model.findOne({ email: normalized, isActive: true }).select("_id").lean();
  if (!user) return null;
  return createNotification(user._id, data);
}

// Notification delivery must never break the business flow it annotates.
export async function safeNotify(run) {
  try { return await run(); }
  catch { return null; }
}

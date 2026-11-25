import mongoose from "mongoose";
import AuditLog from "../models/AuditLog.js";
import { recordAdminAction } from "../services/auditService.js";

const fail = (res, code, message) => res.status(code).json({ success: false, message });
const handle = (action) => async (req, res, next) => {
  try { await action(req, res); }
  catch (error) {
    if (error instanceof mongoose.CastError) return res.status(400).json({ success: false, message: "Invalid identifier." });
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
};

const toInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
};
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const listAuditLogs = handle(async (req, res) => {
  const filter = {};
  const actorId = String(req.query.actorId || "").trim();
  if (actorId) {
    if (!mongoose.isValidObjectId(actorId)) return fail(res, 400, "Invalid user identifier.");
    filter.actorId = new mongoose.Types.ObjectId(actorId);
  }
  for (const field of ["category", "module", "action", "result", "entityType", "entityId", "targetId", "targetName", "actorEmail"]) {
    const value = String(req.query[field] || "").trim();
    if (value) filter[field] = { $regex: escapeRegExp(value), $options: "i" };
  }
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  const range = {};
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (fromDate && !Number.isNaN(fromDate.getTime())) range.$gte = fromDate;
  if (toDate && !Number.isNaN(toDate.getTime())) range.$lte = toDate;
  if (Object.keys(range).length) filter.timestamp = range;
  const search = String(req.query.search || "").trim().toLowerCase();
  if (search) {
    const pattern = new RegExp(escapeRegExp(search), "i");
    filter.$or = [{ actorEmail: pattern }, { targetName: pattern }, { action: pattern }, { description: pattern }, { entityId: pattern }];
  }

  const total = await AuditLog.countDocuments(filter);
  const page = toInt(req.query.page, 1);
  const limit = Math.min(100, toInt(req.query.limit, 25));
  const logs = (await AuditLog.find(filter).sort({ timestamp: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean()).map((log) => ({
    id: String(log._id),
    actor: log.actorEmail || "",
    actorRole: log.actorRole || "Admin",
    actorId: log.actorId ? String(log.actorId) : "",
    action: log.action || "",
    category: log.category || "",
    module: log.module || "",
    entityType: log.entityType || "",
    entityId: log.entityId || "",
    targetId: log.targetId || "",
    targetName: log.targetName || "",
    result: log.result || "Success",
    description: log.description || "",
    details: log.details || null,
    timestamp: log.timestamp || null,
    createdAt: log.createdAt || null,
  }));
  res.json({ success: true, logs, total, page, pageCount: Math.max(1, Math.ceil(total / limit)), limit });
});

export const recordAdminActionLog = (data) => recordAdminAction(data);

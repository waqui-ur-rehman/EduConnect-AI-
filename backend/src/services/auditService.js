import mongoose from "mongoose";
import AuditLog from "../models/AuditLog.js";

const SENSITIVE_KEY = /password|secret|token|hash|salt|credential|signature|authorization|cookie|session|document|cnic|key/i;
const MAX_DEPTH = 4;

function sanitize(value, depth = 0) {
  if (depth > MAX_DEPTH) return "[truncated]";
  if (value === null || value === undefined) return value === undefined ? "" : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 300);
  if (Array.isArray(value)) return value.slice(0, 30).map((entry) => sanitize(entry, depth + 1));
  if (typeof value === "object") {
    const clean = {};
    for (const [key, entry] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) { clean[key] = "[redacted]"; continue; }
      clean[key] = sanitize(entry, depth + 1);
    }
    return clean;
  }
  return String(value).slice(0, 300);
}

// Centralized, MongoDB-backed audit log for admin actions.
// Safe for logs, reports and filters: secrets, credentials, tokens and raw documents are redacted.
export async function recordAdminAction({
  actorEmail, actorRole, actorId, action, category, module,
  entityType, entityId, targetId, targetName, result, description, details,
}) {
  try {
    const actor = String(actorEmail || "Admin").trim().toLowerCase().slice(0, 254) || "admin";
    return await AuditLog.create({
      actorEmail: actor,
      actorRole: String(actorRole || "Admin").trim() || "Admin",
      actorId: actorId ? new mongoose.Types.ObjectId(String(actorId)) : null,
      action: String(action || "Action").trim().slice(0, 160),
      category: String(category || "general").trim().slice(0, 40),
      module: String(module || "").trim().slice(0, 80),
      entityType: String(entityType || "").trim().slice(0, 80),
      entityId: String(entityId ?? "").trim().slice(0, 160),
      targetId: String(targetId ?? "").trim().slice(0, 160),
      targetName: String(targetName || "").trim().slice(0, 160),
      result: String(result || "Success").trim().slice(0, 80),
      description: String(description || "").trim().slice(0, 1000),
      details: sanitize(details),
    });
  } catch (error) {
    console.error("[audit] Could not record admin action:", String(error?.message || error));
  }
  return null;
}

import { randomUUID } from "node:crypto";
import AdminQueueRecord from "../models/AdminQueueRecord.js";

const REASONS = new Set([
  "Copyright Violation",
  "Spam",
  "Misleading Information",
  "Inappropriate Content",
  "Harassment",
  "Fake or Fraudulent Content",
  "Other",
]);
const TARGET_TYPES = new Set([
  "course",
  "pdf",
  "video",
  "review",
  "book-review",
  "comment",
  "teacher",
  "user",
]);

function clean(value, maximum) {
  return String(value || "").trim().slice(0, maximum);
}

export async function submitModerationReport(req, res, next) {
  try {
    const reason = clean(req.body?.reason, 100);
    const description = clean(req.body?.description, 1500);
    const targetType = clean(req.body?.targetType, 40);
    const targetId = clean(req.body?.targetId, 300);
    const targetTitle = clean(req.body?.targetTitle, 200);
    if (!REASONS.has(reason)) {
      return res.status(400).json({ success: false, message: "Select a supported report reason." });
    }
    if (description.length < 10) {
      return res.status(400).json({ success: false, message: "Description must be at least 10 characters." });
    }
    if (!TARGET_TYPES.has(targetType) || !targetId || !targetTitle) {
      return res.status(400).json({ success: false, message: "The reported item could not be identified." });
    }

    const reporterEmail = String(req.user.email || "").trim().toLowerCase();
    const duplicate = await AdminQueueRecord.findOne({
      queue: "moderation-reports",
      "payload.reporterEmail": reporterEmail,
      "payload.targetType": targetType,
      "payload.targetId": targetId,
      "payload.status": { $in: ["Pending", "Under Review", "Escalated"] },
    }).lean();
    if (duplicate) {
      return res.status(409).json({ success: false, message: "You already have an active report for this item." });
    }

    const now = new Date().toISOString();
    const id = `RPT-${randomUUID()}`;
    const report = {
      id,
      reportType: req.body?.reportType === "user" ? "user" : "content",
      targetType,
      targetId,
      targetTitle,
      targetOwnerEmail: clean(req.body?.targetOwnerEmail, 254).toLowerCase(),
      targetOwnerName: clean(req.body?.targetOwnerName, 120),
      targetRole: clean(req.body?.targetRole, 40),
      reporterEmail,
      reporterName: clean(req.user.fullName || req.body?.reporterName || "User", 100),
      reporterRole: req.user.role === "teacher" ? "Teacher" : "Student",
      reason,
      description,
      evidence: clean(req.body?.evidence, 500),
      priority: "Medium",
      status: "Pending",
      createdAt: now,
      updatedAt: now,
      history: [{ action: "Report submitted", actor: reporterEmail, reason: "Initial report", timestamp: now }],
      violation: null,
      appealId: "",
    };
    await AdminQueueRecord.create({
      queue: "moderation-reports",
      recordId: id,
      payload: report,
      createdBy: reporterEmail,
      updatedBy: reporterEmail,
    });
    res.status(201).json({ success: true, report });
  } catch (error) {
    next(error);
  }
}

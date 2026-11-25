import mongoose from "mongoose";
import SupportTicket, { SUPPORT_TICKET_STATUSES, SUPPORT_TICKET_PRIORITIES, SUPPORT_TICKET_CATEGORIES } from "../models/SupportTicket.js";
import { recordAdminAction } from "../services/auditService.js";
import { notifyAllAdmins, notifyUserByEmail, safeNotify } from "../services/notificationService.js";

const fail = (res, code, message, extra = {}) => res.status(code).json({ success: false, message, ...extra });
const handle = (action) => async (req, res, next) => {
  try { await action(req, res); }
  catch (error) {
    if (error instanceof mongoose.CastError) return res.status(400).json({ success: false, message: "Invalid identifier." });
    if (error.status) return res.status(error.status).json({ success: false, message: error.message, ...(error.code ? { code: error.code } : {}) });
    next(error);
  }
};

const capitalize = (value) => {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
};
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
};
const clip = (value, max) => String(value || "").trim().slice(0, max);

async function allocateTicketId() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `STK-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    if (!await SupportTicket.exists({ ticketId: candidate })) return candidate;
  }
  throw new Error("Could not allocate a support ticket ID.");
}

const presentTicket = (ticket) => ({
  id: String(ticket._id),
  ticketId: ticket.ticketId,
  subject: ticket.subject,
  description: ticket.description,
  category: ticket.category,
  priority: ticket.priority,
  status: ticket.status,
  requesterName: ticket.requesterName || "User",
  requesterEmail: ticket.requesterEmail || "",
  requesterRole: ticket.requesterRole || "User",
  relatedRecordId: ticket.relatedRecordId || "",
  relatedRecordTitle: ticket.relatedRecordTitle || "",
  assignedStaff: ticket.assignedStaff || "",
  assignedBy: ticket.assignedBy || "",
  assignedAt: ticket.assignedAt || null,
  responses: (ticket.responses || []).map((response) => ({
    id: response.id,
    message: response.message,
    type: response.type,
    author: response.author || "Admin",
    authorRole: response.authorRole,
    createdAt: response.createdAt,
  })),
  resolvedAt: ticket.resolvedAt || null,
  closedAt: ticket.closedAt || null,
  createdAt: ticket.createdAt,
  updatedAt: ticket.updatedAt,
});

const ticketScope = async (id, actorEmail, role) => {
  if (!mongoose.isValidObjectId(id)) throw Object.assign(new Error("Invalid ticket ID."), { status: 400 });
  const ticket = await SupportTicket.findById(id);
  if (!ticket) throw Object.assign(new Error("Ticket not found."), { status: 404 });
  if (role === "Admin") return ticket;
  if (actorEmail && ticket.requesterEmail === String(actorEmail).trim().toLowerCase() && ticket.requesterRole === role) return ticket;
  throw Object.assign(new Error("You can only access your own support record."), { status: 403 });
};

const auditTicket = (actorEmail, ticket, action, details) => recordAdminAction({
  actorEmail: actorEmail || "admin", actorRole: "Admin",
  action, category: "support", module: "Support & Moderation",
  entityType: "Support Ticket", entityId: String(ticket._id), targetId: String(ticket._id),
  targetName: ticket.subject || "Support Ticket", result: "Success",
  description: `${action} ${ticket.ticketId}.`, details,
});

// ----------------------------------------------------------- Requester side
export const submitSupportTicket = handle(async (req, res) => {
  const role = capitalize(req.user.role);
  if (!["Student", "Teacher"].includes(role)) {
    return fail(res, 403, "Students and teachers can submit support tickets.");
  }
  const subject = clip(req.body?.subject, 200);
  const description = clip(req.body?.description, 5000);
  const category = clip(req.body?.category, 60);
  const priority = clip(req.body?.priority, 20);
  const relatedRecordId = clip(req.body?.relatedRecordId, 254);
  const relatedRecordTitle = clip(req.body?.relatedRecordTitle, 300);
  if (subject.length < 3) return fail(res, 400, "Subject must be at least 3 characters long.");
  if (description.length < 5) return fail(res, 400, "Description must be at least 5 characters long.");
  if (!SUPPORT_TICKET_CATEGORIES.includes(category)) return fail(res, 400, "Please select a supported support category.");
  if (!SUPPORT_TICKET_PRIORITIES.includes(priority)) return fail(res, 400, "Please select a supported priority level.");

  // Duplicate submission protection: the same requester with the same subject
  // while their previous ticket is still open is rejected.
  const requesterEmail = String(req.user.email || "").trim().toLowerCase().slice(0, 254);
  const duplicate = await SupportTicket.findOne({
    requesterEmail,
    requesterRole: role,
    subject,
    status: "Open",
    createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
  });
  if (duplicate) return fail(res, 409, "A similar ticket was just submitted. Please change the subject or wait for the first ticket to be reviewed.");

  const ticket = await SupportTicket.create({
    ticketId: await allocateTicketId(),
    subject, description, category, priority,
    requesterName: clip(req.body?.requesterName || req.user.fullName || "User", 120),
    requesterEmail,
    requesterRole: role,
    relatedRecordId,
    relatedRecordTitle,
    status: "Open",
  });

  await recordAdminAction({
    actorEmail: req.user.email, actorRole: role,
    action: "Support ticket submitted", category: "support", module: "Support & Moderation",
    entityType: "Support Ticket", entityId: String(ticket._id), targetId: ticket.ticketId,
    targetName: subject, result: "Open", description: `Submitted support ticket ${ticket.ticketId} [${category} / ${priority}].`,
  });
  await safeNotify(() => notifyAllAdmins({
    type: "support",
    title: "New support ticket",
    message: `${clip(req.user.fullName || "A user", 60)} opened ${ticket.ticketId}: ${subject}`,
    link: "help-support",
    idempotencyKey: `support-open:${ticket._id}`,
  }));
  res.status(201).json({ success: true, message: "Support ticket submitted.", ticket: presentTicket(ticket) });
});

export const listMySupportTickets = handle(async (req, res) => {
  const role = capitalize(req.user.role);
  if (!["Student", "Teacher"].includes(role)) return fail(res, 403, "Students and teachers can view their own tickets.");
  const filter = { requesterEmail: String(req.user.email || "").trim().toLowerCase(), requesterRole: role };
  const total = await SupportTicket.countDocuments(filter);
  const page = toInt(req.query.page, 1);
  const limit = Math.min(50, toInt(req.query.limit, 10));
  const tickets = (await SupportTicket.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean()).map(presentTicket);
  res.json({ success: true, tickets, total, page, pageCount: Math.max(1, Math.ceil(total / limit)), limit });
});

export const updateMySupportTicketStatus = handle(async (req, res) => {
  const role = capitalize(req.user.role);
  if (!["Student", "Teacher"].includes(role)) return fail(res, 403, "Students and teachers can reopen or close their own tickets.");
  const ticket = await ticketScope(req.params.id, String(req.user.email || "").trim().toLowerCase(), role);
  const next = clip(req.body?.status, 40);
  const current = ticket.status;
  if (next !== "Open" && next !== "Closed") {
    return fail(res, 400, "Only \"Open\" and \"Closed\" are available to requesters.");
  }
  if (current === "Closed" && next !== "Open") return fail(res, 409, "A closed ticket can be reopened only.");
  if (current !== "Closed" && next === "Closed") {
    ticket.status = "Closed";
    ticket.closedAt = new Date();
    await ticket.save();
  }
  if (current === "Closed" && next === "Open") {
    ticket.status = "Open";
    ticket.closedAt = null;
    await ticket.save();
  }
  await auditTicket(String(req.user.email || "admin"), ticket, next === "Closed" ? "Requester Closed Ticket" : "Requester Reopened Ticket", { requesterEmail: ticket.requesterEmail });
  res.json({ success: true, ticket: presentTicket(ticket) });
});

// --------------------------------------------------------- Requester replies
export const submitSupportTicketReply = handle(async (req, res) => {
  const role = capitalize(req.user.role);
  if (!["Student", "Teacher"].includes(role)) return fail(res, 403, "Students and teachers can reply to their own tickets.");
  const ticket = await ticketScope(req.params.id, String(req.user.email || "").trim().toLowerCase(), role);
  const message = clip(req.body?.message, 2000);
  if (message.length < 2) return fail(res, 400, "Reply message must be at least 2 characters.");
  const reopened = ticket.status === "Resolved";
  const responseId = `resp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  ticket.responses = [...(ticket.responses || []), {
    id: responseId,
    message, type: "response",
    author: clip(req.user.fullName || req.user.email || "Support", 160),
    authorRole: role,
    createdAt: new Date(),
  }];
  if (reopened) { ticket.status = "Open"; ticket.closedAt = null; }
  await ticket.save();
  await recordAdminAction({
    actorEmail: req.user.email, actorRole: role,
    action: "Submitted support ticket reply", category: "support", module: "Support & Moderation",
    entityType: "Support Ticket", entityId: String(ticket._id), targetId: String(ticket._id),
    targetName: ticket.subject || "Support Ticket", result: reopened ? "Reopened" : "Response",
    description: `Submitted reply to ${ticket.ticketId}.`,
  });
  await safeNotify(() => notifyAllAdmins({
    type: "support",
    title: "Support ticket reply",
    message: `${clip(req.user.fullName || "A user", 60)} replied to ${ticket.ticketId}: ${ticket.subject}`,
    link: "help-support",
    idempotencyKey: `support-reply:${ticket._id}:${responseId}`,
  }));
  res.json({ success: true, ticket: presentTicket(ticket) });
});

// --------------------------------------------------------------- Admin side
export const listSupportTickets = handle(async (req, res) => {
  const filters = {};
  const status = String(req.query.status || "").trim();
  const category = String(req.query.category || "").trim();
  const priority = String(req.query.priority || "").trim();
  const requesterEmail = String(req.query.requesterEmail || "").trim();
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  const search = String(req.query.search || "").trim().toLowerCase();
  if (status && status !== "all") filters.status = status;
  if (category && category !== "all") filters.category = category;
  if (priority && priority !== "all") filters.priority = priority;
  if (requesterEmail) filters.requesterEmail = new RegExp(`^${escapeRegExp(requesterEmail)}$`, "i");
  const range = {};
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (fromDate && !Number.isNaN(fromDate.getTime())) range.$gte = fromDate;
  if (toDate && !Number.isNaN(toDate.getTime())) range.$lte = new Date(toDate.getTime() + 86399999);
  if (Object.keys(range).length) filters.createdAt = range;
  if (search) filters.$or = [{ subject: { $regex: escapeRegExp(search), $options: "i" } }, { description: { $regex: escapeRegExp(search), $options: "i" } }, { requesterName: { $regex: escapeRegExp(search), $options: "i" } }];

  const total = await SupportTicket.countDocuments(filters);
  const page = toInt(req.query.page, 1);
  const limit = Math.min(100, toInt(req.query.limit, 25));
  const tickets = (await SupportTicket.find(filters).sort({ createdAt: -1, ticketId: -1 }).skip((page - 1) * limit).limit(limit).lean()).map(presentTicket);
  res.json({ success: true, tickets, total, page, pageCount: Math.max(1, Math.ceil(total / limit)), limit });
});

export const getSupportTicket = handle(async (req, res) => {
  const ticket = await ticketScope(req.params.id, null, "Admin");
  res.json({ success: true, ticket: presentTicket(ticket) });
});

export const updateSupportTicketStatus = handle(async (req, res) => {
  const ticket = await ticketScope(req.params.id, null, "Admin");
  const status = clip(req.body?.status, 40);
  if (!SUPPORT_TICKET_STATUSES.includes(status)) return fail(res, 400, "Select a valid support ticket status.");
  if (ticket.status !== status) {
    const previousStatus = ticket.status;
    ticket.status = status;
    if (status === "Resolved" && !ticket.resolvedAt) ticket.resolvedAt = new Date();
    if (status === "Closed" && !ticket.closedAt) ticket.closedAt = new Date();
    if (status === "Open") ticket.closedAt = null;
    await ticket.save();
    await auditTicket(String(req.user.email || "admin"), ticket, "Admin Updated Ticket Status", { beforeStatus: previousStatus, newStatus: status, reason: clip(req.body?.reason, 200) });
    await safeNotify(() => notifyUserByEmail(ticket.requesterEmail, String(ticket.requesterRole || "student").toLowerCase(), {
      type: "support",
      title: `Support ticket ${status.toLowerCase()}`,
      message: `${ticket.ticketId} "${clip(ticket.subject, 120)}" is now ${status}.`,
      link: "help-support",
      idempotencyKey: `support-status:${ticket._id}:${status}:${Date.now()}`,
    }));
  }
  res.json({ success: true, ticket: presentTicket(ticket) });
});

export const updateSupportTicketPriority = handle(async (req, res) => {
  const ticket = await ticketScope(req.params.id, null, "Admin");
  const priority = clip(req.body?.priority, 20);
  if (!SUPPORT_TICKET_PRIORITIES.includes(priority)) return fail(res, 400, "Select a valid support ticket priority.");
  const changed = ticket.priority !== priority;
  ticket.priority = priority;
  await ticket.save();
  if (changed) await auditTicket(String(req.user.email || "admin"), ticket, "Admin Updated Ticket Priority", { newPriority: priority });
  res.json({ success: true, ticket: presentTicket(ticket) });
});

export const assignSupportTicket = handle(async (req, res) => {
  const ticket = await ticketScope(req.params.id, null, "Admin");
  const staff = clip(req.body?.assignedStaff, 160);
  const changed = (ticket.assignedStaff || "") !== staff;
  ticket.assignedStaff = staff;
  ticket.assignedBy = staff ? String(req.user._id || "Admin") : "";
  ticket.assignedAt = staff ? new Date() : null;
  await ticket.save();
  if (changed) await auditTicket(String(req.user.email || "admin"), ticket, "Admin Assigned Ticket", { assignedStaff: staff || "Unassigned" });
  res.json({ success: true, ticket: presentTicket(ticket) });
});

export const addSupportTicketReply = handle(async (req, res) => {
  const ticket = await ticketScope(req.params.id, null, "Admin");
  const message = clip(req.body?.message, 2000);
  const type = req.body?.type === "internal_note" ? "internal_note" : "response";
  if (message.length < 2) return fail(res, 400, "Reply message must be at least 2 characters.");
  if (ticket.status === "Closed") return fail(res, 409, "Reopen this ticket before replying.");
  const responseId = `resp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  ticket.responses = [...(ticket.responses || []), {
    id: responseId,
    message, type,
    author: clip(req.user.fullName || req.user.email || "Admin", 160),
    authorRole: "Admin",
    createdAt: new Date(),
  }];
  await ticket.save();
  await auditTicket(String(req.user.email || "admin"), ticket, "Admin Added Ticket Reply", { replyType: type, replyLength: message.length });
  // Only visible replies reach the requester; internal notes stay internal.
  if (type === "response") {
    await safeNotify(() => notifyUserByEmail(ticket.requesterEmail, String(ticket.requesterRole || "student").toLowerCase(), {
      type: "support",
      title: "Support replied to your ticket",
      message: `${ticket.ticketId} "${clip(ticket.subject, 120)}": ${clip(message, 300)}`,
      link: "help-support",
      idempotencyKey: `support-response:${ticket._id}:${responseId}`,
    }));
  }
  res.json({ success: true, ticket: presentTicket(ticket) });
});

export const listSupportTicketStats = handle(async (_req, res) => {
  const [byStatus, byCategory, byPriority, total] = await Promise.all([
    SupportTicket.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    SupportTicket.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]),
    SupportTicket.aggregate([{ $group: { _id: "$priority", count: { $sum: 1 } } }]),
    SupportTicket.countDocuments({}),
  ]);
  res.json({
    success: true,
    total,
    byStatus: Object.fromEntries(byStatus.map((row) => [row._id, row.count])),
    byCategory: Object.fromEntries(byCategory.map((row) => [row._id, row.count])),
    byPriority: Object.fromEntries(byPriority.map((row) => [row._id, row.count])),
  });
});

import {
  appendAdminActivityRecord,
  notifyAdminDataChanged,
  readAdminSupportRequestsState,
} from "../components/admin/adminData";
import { getReviews, saveModeratedReview } from "./courseReviews";
import { getBookRecords, getBookReviews, saveBookReviews } from "./books";
import { readDiscussions, saveDiscussions } from "./courseDiscussions";
import { getModerationVisibilityMap, setModerationVisibility } from "./moderationVisibility";
import { apiFetch } from "./api";

export const MODERATION_REPORTS_KEY = "educonnect.moderationReports.v1";
export const MODERATION_REPORTS_EVENT = "educonnect:moderation-reports-changed";
export const MODERATION_STATUSES = ["Pending", "Under Review", "Resolved", "Dismissed", "Escalated"];
export const MODERATION_REASONS = [
  "Copyright Violation",
  "Spam",
  "Misleading Information",
  "Inappropriate Content",
  "Harassment",
  "Fake or Fraudulent Content",
  "Other",
];
const MODERATION_TARGET_TYPES = ["course", "pdf", "video", "review", "book-review", "comment", "teacher", "user"];

function isAcceptedAppeal(appeal) {
  const acceptedValues = ["accepted", "appeal accepted", "accepted appeal"];
  return appeal?.appealAccepted === true || [appeal?.status, appeal?.decision, appeal?.outcome, appeal?.resolution].some((value) => acceptedValues.includes(String(value || "").trim().toLowerCase()));
}

function reportId() {
  return window.crypto?.randomUUID?.() || `RPT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function announce() {
  window.dispatchEvent(new Event(MODERATION_REPORTS_EVENT));
  notifyAdminDataChanged();
}

export function getModerationReportsState() {
  try {
    const raw = window.localStorage.getItem(MODERATION_REPORTS_KEY);
    if (raw === null) return { records: [], error: null };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { records: [], error: "Saved moderation reports are not in a supported format." };
    return { records: parsed.filter((item) => item && typeof item === "object"), error: null };
  } catch {
    return { records: [], error: "Saved moderation reports could not be read." };
  }
}

export async function submitModerationReport(input) {
  const reason = String(input.reason || "").trim();
  const description = String(input.description || "").trim();
  const priority = "Medium";
  if (!MODERATION_REASONS.includes(reason)) throw new Error("Select a supported report reason.");
  if (description.length < 10 || description.length > 1500) throw new Error("Description must be between 10 and 1,500 characters.");
  if (!MODERATION_TARGET_TYPES.includes(input.targetType)) throw new Error("Choose a supported item to report.");
  if (!String(input.reporterEmail || "").trim()) throw new Error("Your signed-in account could not be identified.");
  if (!String(input.targetId || "").trim() || !String(input.targetTitle || "").trim()) throw new Error("The reported item could not be identified.");

  const state = getModerationReportsState();
  if (state.error) throw new Error(state.error);
  const reporterEmail = String(input.reporterEmail).trim().toLowerCase();
  const targetId = String(input.targetId).trim();
  const activeDuplicate = state.records.find((record) =>
    record.reporterEmail === reporterEmail &&
    record.targetType === input.targetType &&
    record.targetId === targetId &&
    ["Pending", "Under Review", "Escalated"].includes(record.status),
  );
  if (activeDuplicate) throw new Error("You already have an active report for this item.");

  const now = new Date().toISOString();
  let record = {
    id: reportId(),
    reportType: input.reportType === "user" ? "user" : "content",
    targetType: String(input.targetType),
    targetId,
    targetTitle: String(input.targetTitle).trim().slice(0, 200),
    targetOwnerEmail: String(input.targetOwnerEmail || "").trim().toLowerCase(),
    targetOwnerName: String(input.targetOwnerName || "").trim(),
    targetRole: String(input.targetRole || "").trim(),
    reporterEmail,
    reporterName: String(input.reporterName || "Student").trim().slice(0, 100),
    reporterRole: input.reporterRole === "Teacher" ? "Teacher" : "Student",
    reason,
    description,
    evidence: String(input.evidence || "").trim().slice(0, 500),
    priority,
    status: "Pending",
    createdAt: now,
    updatedAt: now,
    history: [{ action: "Report submitted", actor: reporterEmail, reason: "Initial report", timestamp: now }],
    violation: null,
    appealId: "",
  };
  try {
    const response = await apiFetch("/moderation/reports", {
      method: "POST",
      body: JSON.stringify(input),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.message || "Report could not be submitted."), { status: response.status });
    record = data.report;
  } catch (error) {
    if (error?.status) throw error;
  }
  window.localStorage.setItem(MODERATION_REPORTS_KEY, JSON.stringify([record, ...state.records.filter((item) => item.id !== record.id)]));
  announce();
  return record;
}

function setVisibility(report, action) {
  const nextState = action === "Hide Content" ? "hidden" : action === "Remove Content" ? "removed" : "";
  setModerationVisibility(report.targetType, report.targetId, nextState);

  if (report.targetType === "review") {
    saveModeratedReview(report.targetId, action !== "Restore Content");
  } else if (report.targetType === "book-review") {
    const reviews = getBookReviews().map((item) => String(item.id) === report.targetId ? { ...item, moderated: action !== "Restore Content" } : item);
    saveBookReviews(reviews);
  } else if (report.targetType === "comment") {
    const items = readDiscussions().map((item) => String(item.id) === report.targetId ? { ...item, moderated: action !== "Restore Content" } : item);
    saveDiscussions(items);
  }
}

export function applyModerationAction(id, { action, reason, actor, resolutionNotes = "", severity = "", violationCategory = "" }) {
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) throw new Error("Enter a reason before taking a moderation action.");
  const state = getModerationReportsState();
  if (state.error) throw new Error(state.error);
  const current = state.records.find((record) => String(record.id) === String(id));
  if (!current) throw new Error("This report could not be found.");
  if (current.lastActionAt && Date.now() - new Date(current.lastActionAt).getTime() < 800) throw new Error("Please wait before submitting another action.");
  const nextStatus = {
    "Mark Under Review": "Under Review",
    "Dismiss Report": "Dismissed",
    "Resolve Case": "Resolved",
    "Escalate Case": "Escalated",
    "Hide Content": "Under Review",
    "Remove Content": "Resolved",
    "Restore Content": "Resolved",
    "Issue Warning": "Resolved",
    "Confirm Violation": "Resolved",
    "Reverse Moderation Decision": "Resolved",
  }[action];
  if (!nextStatus) throw new Error("Choose a supported moderation action.");
  if (["Hide Content", "Remove Content", "Restore Content"].includes(action)) setVisibility(current, action);
  if (action === "Reverse Moderation Decision") {
    const appeal = readAdminSupportRequestsState().records.find((item) => String(item.id) === String(current.appealId));
    if (!appeal || !isAcceptedAppeal(appeal)) throw new Error("Only an appeal marked Accepted in the existing Support & Appeals record can reverse a decision.");
    if (getModerationVisibilityMap()[`${current.targetType}:${current.targetId}`]) setVisibility(current, "Restore Content");
  }

  const now = new Date().toISOString();
  const entry = { action, actor: String(actor || "Admin"), reason: cleanReason.slice(0, 500), timestamp: now };
  const updated = {
    ...current,
    status: nextStatus,
    updatedAt: now,
    lastActionAt: now,
    resolutionNotes: String(resolutionNotes || "").trim().slice(0, 1000),
    violation: action === "Confirm Violation" ? { category: String(violationCategory || current.reason), severity: severity || "Medium", status: "Confirmed", confirmedAt: now, confirmedBy: entry.actor, notes: entry.reason } : action === "Reverse Moderation Decision" && current.violation ? { ...current.violation, status: "Reversed", reversedAt: now, reversedBy: entry.actor, reversalNotes: entry.reason } : current.violation,
    history: [...(Array.isArray(current.history) ? current.history : []), entry],
  };
  window.localStorage.setItem(MODERATION_REPORTS_KEY, JSON.stringify(state.records.map((record) => record.id === current.id ? updated : record)));
  try {
    appendAdminActivityRecord({ actor: entry.actor, action: `Moderation: ${action}`, category: "moderation", entityType: "Moderation Report", entityId: current.id, targetName: current.targetTitle, description: `${action} for ${current.id}: ${entry.reason}; status ${current.status} → ${nextStatus}.`, result: "Success" });
  } catch {
    // Keep the moderation decision even if the separate audit store is unavailable.
  }
  announce();
  return updated;
}

export function linkModerationAppeal(id, appealId, actor = "Admin") {
  const state = getModerationReportsState();
  const cleanId = String(appealId || "").trim();
  if (!cleanId) throw new Error("Enter the existing Support & Appeals request ID.");
  const now = new Date().toISOString();
  const current = state.records.find((record) => record.id === id);
  if (!current) throw new Error("This moderation report could not be found.");
  const updated = state.records.map((record) => record.id === id ? {
    ...record,
    appealId: cleanId,
    updatedAt: now,
    history: [...(record.history || []), { action: "Appeal linked", actor: String(actor || "Admin"), reason: `Linked to ${cleanId}`, timestamp: now }],
  } : record);
  window.localStorage.setItem(MODERATION_REPORTS_KEY, JSON.stringify(updated));
  try { appendAdminActivityRecord({ actor: String(actor || "Admin"), action: "Linked moderation appeal", category: "moderation", entityType: "Moderation Report", entityId: id, targetName: current.targetTitle, description: `Linked existing appeal ${cleanId}.`, result: "Success" }); } catch { /* link remains saved */ }
  announce();
}

export function setModerationPriority(id, priority, actor) {
  if (!["Low", "Medium", "High", "Urgent"].includes(priority)) throw new Error("Choose a supported priority.");
  const state = getModerationReportsState();
  const current = state.records.find((record) => record.id === id);
  if (!current) throw new Error("This moderation report could not be found.");
  const now = new Date().toISOString();
  const entry = { action: "Priority Updated", actor: String(actor || "Admin"), reason: `Priority changed to ${priority}.`, timestamp: now };
  window.localStorage.setItem(MODERATION_REPORTS_KEY, JSON.stringify(state.records.map((record) => record.id === id ? { ...record, priority, updatedAt: now, history: [...(record.history || []), entry] } : record)));
  try { appendAdminActivityRecord({ actor: entry.actor, action: "Moderation priority updated", category: "moderation", entityType: "Moderation Report", entityId: id, targetName: current.targetTitle, description: entry.reason, result: "Success" }); } catch { /* report state remains saved */ }
  announce();
}

export function getModerationPolicies() {
  const defaults = [
    ["Community Guidelines", "Treat students and educators respectfully. Harassment, threats, spam, and targeted abuse are not allowed."],
    ["Content Publishing Guidelines", "Learning content must be accurate, educational, and authorized for publication."],
    ["Copyright Policy", "Only publish material that you own or are authorized to distribute. Report suspected infringement for review."],
    ["Review & Comment Policy", "Reviews should describe genuine learning experiences. Criticism alone is not a policy violation."],
    ["Student/Teacher Conduct Rules", "Use the platform for learning and teaching. Do not threaten, harass, impersonate, or defraud other users."],
    ["Reporting Guidelines", "Submit a specific reason and relevant evidence. Reports are allegations until Admin review is complete."],
    ["Moderation Escalation Rules", "Escalate serious, repeated, or uncertain cases for a second authorized review."],
  ].map(([title, body]) => ({ id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"), title, body, version: 1, updatedAt: "", updatedBy: "" }));
  try {
    const parsed = JSON.parse(window.localStorage.getItem("educonnect.moderationPolicies.v1") || "null");
    return Array.isArray(parsed) ? parsed : defaults;
  } catch { return defaults; }
}

export function saveModerationPolicies(policies, actor) {
  const existing = getModerationPolicies();
  const now = new Date().toISOString();
  const next = policies.map((policy) => {
    const prior = existing.find((item) => item.id === policy.id);
    const body = String(policy.body || "").trim();
    if (body.length < 20 || body.length > 5000) throw new Error(`${policy.title}: policy text must be between 20 and 5,000 characters.`);
    if (prior?.body === body) return prior;
    const updated = { ...policy, body, version: (prior?.version || 0) + 1, updatedAt: now, updatedBy: String(actor || "Admin") };
    try { appendAdminActivityRecord({ actor: updated.updatedBy, action: "Updated moderation policy", category: "moderation", entityType: "Moderation Policy", entityId: policy.id, targetName: policy.title, description: `Updated ${policy.title} to version ${updated.version}.`, result: "Success" }); } catch { /* policy remains saved */ }
    return updated;
  });
  window.localStorage.setItem("educonnect.moderationPolicies.v1", JSON.stringify(next));
  announce();
  return next;
}

export function getRealModerationReviews() {
  return getReviews(true).map((review) => ({ ...review, targetType: "review", targetId: String(review.id || `${review.courseKey}:${review.studentEmail}`), targetTitle: review.courseTitle || "Course review" }));
}

export function getModerationContentRecords() {
  return [
    ...getBookRecords().map((book) => ({ ...book, targetType: "pdf", targetId: String(book.id), targetTitle: book.title || "Untitled PDF/eBook" })),
  ];
}

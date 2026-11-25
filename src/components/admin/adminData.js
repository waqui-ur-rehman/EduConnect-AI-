import { getContentState } from "../../utils/contentApi";
import { addDemoNotification } from "../../utils/demoNotifications";

export const ADMIN_USERS_KEY = "educonnect.registeredUsers";
export const ADMIN_AI_KNOWLEDGE_KEY = "educonnect.aiKnowledge";
export const ADMIN_ACTIVITY_LOG_KEY = "educonnect.adminActivityLog";
export const ADMIN_SUPPORT_REQUESTS_KEY = "educonnect.supportRequests";
export const ADMIN_HELP_FAQS_KEY = "educonnect.supportFaqs";
export const ADMIN_DATA_CHANGED_EVENT = "educonnect:admin-data-changed";

export const ADMIN_ACTIVITY_CATEGORY_LABELS = {
  "teacher-applications": "Teacher Applications",
  "course-review": "Course Review",
  "book-approvals": "Course & Books",
  "user-management": "User Management",
  "user-activity": "User Management",
  "financial-management": "Financial Management",
  "admin-settings": "Settings & Configuration",
  "data-export": "Data Export",
  "ai-operations": "AI Operations",
  "tutor-marketplace": "Tutor Marketplace",
  "ai-knowledge": "AI Knowledge Governance",
  "data-import": "Data Import",
  "security": "Security & Access",
  "support": "Support & Moderation",
  "moderation": "Moderation & Governance",
};

const KNOWLEDGE_PROPOSAL_STATUSES = [
  "Pending Review",
  "Approved for Processing",
  "Changes Requested",
  "Rights Evidence Requested",
  "Rejected",
];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readKnowledgeStore() {
  try {
    const raw = window.localStorage.getItem(ADMIN_AI_KNOWLEDGE_KEY);
    if (raw === null) return { records: [], error: null };
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) {
      return {
        records: [],
        error: "Saved AI knowledge proposals are not in a supported format.",
      };
    }
    return { records: value, error: null };
  } catch {
    return {
      records: [],
      error: "Saved AI knowledge proposals could not be read.",
    };
  }
}

function uniqueUsersByRole(users, role) {
  const seenEmails = new Set();

  return users.filter((user) => {
    if (!isRecord(user) || user.role !== role || typeof user.email !== "string") {
      return false;
    }

    const email = user.email.trim().toLowerCase();
    if (!email || seenEmails.has(email)) {
      return false;
    }

    seenEmails.add(email);
    return true;
  });
}

export function getAdminTeachers(users = readAdminArray(ADMIN_USERS_KEY)) {
  return uniqueUsersByRole(users, "Teacher");
}

export function readAdminArray(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function readAdminUsersState() {
  try {
    const raw = window.localStorage.getItem(ADMIN_USERS_KEY);
    if (raw === null) {
      return { users: [], error: null };
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return {
        users: [],
        error: "Saved user data is not in a supported format.",
      };
    }

    return {
      users: parsed.filter(isRecord),
      error: null,
    };
  } catch {
    return {
      users: [],
      error: "Saved user data could not be read.",
    };
  }
}

export function getAdminCourses() {
  return getContentState().role === "admin" ? getContentState().managedCourses : [];
}

export function getAdminOverviewData() {
  const users = readAdminArray(ADMIN_USERS_KEY);
  const students = uniqueUsersByRole(users, "Student");
  const teachers = getAdminTeachers(users);
  const courses = getAdminCourses(users);
  const knowledgeProposals = getAdminKnowledgeProposals();

  return {
    studentCount: students.length,
    teacherCount: teachers.length,
    courseCount: courses.length,
    pendingTeacherCount: teachers.filter((user) => user.status === "pending").length,
    approvedTeacherCount: teachers.filter((user) => user.status === "approved").length,
    rejectedTeacherCount: teachers.filter((user) => user.status === "rejected").length,
    pendingCourseCount: courses.filter(
      (course) => course.status === "Pending Approval",
    ).length,
    approvedCourseCount: courses.filter((course) => course.status === "Approved").length,
    publishedCourseCount: courses.filter((course) => course.status === "Published").length,
    rejectedCourseCount: courses.filter((course) => course.status === "Rejected").length,
    knowledgeProposalCount: knowledgeProposals.length,
    pendingKnowledgeProposalCount: knowledgeProposals.filter(
      (proposal) => proposal.status === "Pending Review",
    ).length,
    approvedKnowledgeProposalCount: knowledgeProposals.filter(
      (proposal) => proposal.status === "Approved for Processing",
    ).length,
    rejectedKnowledgeProposalCount: knowledgeProposals.filter(
      (proposal) => proposal.status === "Rejected",
    ).length,
  };
}

export function getAdminKnowledgeStorageState() {
  const { records, error } = readKnowledgeStore();
  return {
    proposals: records.filter(isRecord),
    error,
  };
}

export function getAdminKnowledgeProposals() {
  return getAdminKnowledgeStorageState().proposals;
}

function knowledgeProposalId() {
  return (
    window.crypto?.randomUUID?.() ??
    `knowledge-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function copyCourseContent(course) {
  const snapshot = {};
  const scalarFields = [
    "title",
    "subtitle",
    "description",
    "category",
    "subject",
    "level",
    "language",
    "createdAt",
  ];

  scalarFields.forEach((field) => {
    const value = course[field];
    if (typeof value === "string" || typeof value === "number") {
      snapshot[field] = value;
    }
  });

  if (Array.isArray(course.lessons)) {
    snapshot.lessons = course.lessons
      .filter(isRecord)
      .map((lesson) => {
        const content = {};
        ["id", "title", "description", "duration"].forEach((field) => {
          const value = lesson[field];
          if (typeof value === "string" || typeof value === "number") {
            content[field] = value;
          }
        });
        if (typeof lesson.isFreePreview === "boolean") {
          content.isFreePreview = lesson.isFreePreview;
        }
        return content;
      });
  }

  return snapshot;
}

export function createAdminKnowledgeProposal(course, teacherName) {
  if (!isRecord(course) || typeof course.teacherEmail !== "string") {
    throw new Error("Select an existing course with a registered teacher.");
  }

  const topic = typeof course.title === "string" ? course.title.trim() : "";
  if (!topic) {
    throw new Error("This course has no title and cannot be submitted.");
  }

  const { records, error } = readKnowledgeStore();
  if (error) throw new Error(error);

  const teacherEmail = course.teacherEmail.trim().toLowerCase();
  const courseId = course.id === undefined || course.id === null
    ? ""
    : String(course.id);

  if (!courseId) {
    throw new Error("This course has no ID and cannot be linked to a proposal.");
  }

  if (
    records.some(
      (proposal) =>
        isRecord(proposal) &&
        String(proposal.courseId) === courseId &&
        typeof proposal.teacherEmail === "string" &&
        proposal.teacherEmail.trim().toLowerCase() === teacherEmail,
    )
  ) {
    throw new Error("A knowledge proposal already exists for this course.");
  }

  const proposal = {
    proposalId: knowledgeProposalId(),
    courseId,
    teacherEmail,
    proposedTopic: topic,
    status: "Pending Review",
    submittedAt: new Date().toISOString(),
    courseSnapshot: copyCourseContent(course),
  };

  if (typeof teacherName === "string" && teacherName.trim()) {
    proposal.teacherName = teacherName.trim();
  }
  if (typeof course.category === "string" && course.category.trim()) {
    proposal.subject = course.category.trim();
  } else if (typeof course.subject === "string" && course.subject.trim()) {
    proposal.subject = course.subject.trim();
  }
  if (typeof course.level === "string" && course.level.trim()) {
    proposal.academicLevel = course.level.trim();
  }
  if (typeof course.language === "string" && course.language.trim()) {
    proposal.language = course.language.trim();
  }

  window.localStorage.setItem(
    ADMIN_AI_KNOWLEDGE_KEY,
    JSON.stringify([...records, proposal]),
  );
  notifyAdminDataChanged();
  return proposal;
}

export function updateAdminKnowledgeProposal(proposalId, status, reviewNotes = "") {
  if (!KNOWLEDGE_PROPOSAL_STATUSES.includes(status)) {
    throw new Error("This knowledge proposal status is not supported.");
  }

  const normalizedNotes = typeof reviewNotes === "string" ? reviewNotes.trim() : "";
  if (
    ["Changes Requested", "Rights Evidence Requested", "Rejected"].includes(status) &&
    normalizedNotes.length < 10
  ) {
    throw new Error("Add a meaningful review note of at least 10 characters.");
  }

  const { records, error } = readKnowledgeStore();
  if (error) throw new Error(error);

  let updated = false;
  const updatedRecords = records.map((proposal) => {
    if (
      !updated &&
      isRecord(proposal) &&
      String(proposal.proposalId) === String(proposalId)
    ) {
      if (proposal.status !== "Pending Review") {
        throw new Error("Only proposals pending review can be actioned.");
      }

      updated = true;
      return {
        ...proposal,
        status,
        reviewNotes: normalizedNotes,
        ...(status === "Rights Evidence Requested"
          ? { rightsEvidenceStatus: "Evidence Requested" }
          : {}),
        decisionAt: new Date().toISOString(),
      };
    }
    return proposal;
  });

  if (!updated) {
    throw new Error("This knowledge proposal could not be found. Refresh and try again.");
  }

  window.localStorage.setItem(
    ADMIN_AI_KNOWLEDGE_KEY,
    JSON.stringify(updatedRecords),
  );
  notifyAdminDataChanged();
  return updatedRecords;
}

export function updateAdminTeacherStatus(email, status) {
  const users = readAdminArray(ADMIN_USERS_KEY);
  const normalizedEmail = email.trim().toLowerCase();
  let updated = false;

  const updatedUsers = users.map((user) => {
    if (
      isRecord(user) &&
      user.role === "Teacher" &&
      typeof user.email === "string" &&
      user.email.trim().toLowerCase() === normalizedEmail
    ) {
      updated = true;
      return { ...user, status };
    }

    return user;
  });

  if (!updated) {
    throw new Error("This teacher application could not be found. Refresh and try again.");
  }

  window.localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(updatedUsers));
  notifyAdminDataChanged();
  return updatedUsers;
}

export function updateAdminCourseStatus(
  teacherEmail,
  courseId,
  status,
  changes = {},
) {
  const allowedStatuses = [
    "Approved",
    "Rejected",
    "Changes Requested",
    "Suspended",
  ];
  if (!allowedStatuses.includes(status)) {
    throw new Error("This course status change is not supported.");
  }

  if (status === "Changes Requested") {
    if (typeof changes.revisionNotes !== "string" || !changes.revisionNotes.trim()) {
      throw new Error("Add revision notes before requesting changes.");
    }
  } else if (status !== "Suspended" && Object.keys(changes).length > 0) {
    throw new Error("Additional course fields are not supported for this action.");
  }

  if (courseId === undefined || courseId === null || courseId === "") {
    throw new Error("This course cannot be updated because it has no course ID.");
  }

  const key = `educonnect.teacher.${teacherEmail}.courses`;
  const courses = readAdminArray(key);
  let updated = false;

  const updatedCourses = courses.map((course) => {
    if (
      !updated &&
      isRecord(course) &&
      String(course.id) === String(courseId)
    ) {
      const isPending = course.status === "Pending Approval";
      const canSuspend = ["Approved", "Published"].includes(course.status);
      if (
        (status === "Suspended" && !canSuspend) ||
        (status !== "Suspended" && !isPending)
      ) {
        throw new Error(
          status === "Suspended"
            ? "Only approved or published courses can be suspended."
            : "Only courses pending approval can be reviewed.",
        );
      }

      updated = true;
      return {
        ...course,
        ...(status === "Changes Requested"
          ? { revisionNotes: changes.revisionNotes.trim() }
          : {}),
        status,
      };
    }

    return course;
  });

  if (!updated) {
    throw new Error("This course could not be found. Refresh and try again.");
  }

  window.localStorage.setItem(key, JSON.stringify(updatedCourses));
  notifyAdminDataChanged();
  return updatedCourses;
}

export function createAdminActivityId(prefix, seed = "") {
  const cleanedPrefix = String(prefix || "activity").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "activity";
  const cleanedSeed = String(seed || "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  const stamp = Math.random().toString(36).slice(2, 10);

  return cleanedSeed ? `${cleanedPrefix}-${cleanedSeed}-${stamp}` : `${cleanedPrefix}-${stamp}`;
}

export function getAdminActivityLog() {
  try {
    const raw = window.localStorage.getItem(ADMIN_ACTIVITY_LOG_KEY);
    if (raw === null) return { records: [], error: null };
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return {
        records: [],
        error: "Saved admin activity log is not in a supported format.",
      };
    }

    return {
      records: parsed.filter(isRecord),
      error: null,
    };
  } catch {
    return {
      records: [],
      error: "Saved admin activity log could not be read.",
    };
  }
}

export function appendAdminActivityRecord(record) {
  if (!isRecord(record)) {
    throw new Error("The activity record is invalid.");
  }

  const previous = getAdminActivityLog();
  if (previous.error) {
    throw new Error(previous.error);
  }

  const actor = typeof record.actor === "string" && record.actor.trim()
    ? record.actor.trim()
    : "Admin";
  let sessionRole = "";
  try {
    sessionRole = window.sessionStorage.getItem("educonnect.demoRole") || "";
  } catch {
    // Activity logging remains available if session storage is blocked.
  }
  const requestedId = typeof record.id === "string" && record.id.trim()
    ? record.id.trim()
    : "";
  const idAlreadyUsed = requestedId && previous.records.some((item) => item.id === requestedId);
  const id = requestedId && !idAlreadyUsed
    ? requestedId
    : createAdminActivityId("activity");
  const category = typeof record.category === "string" ? record.category : "";
  const actorRole = typeof record.actorRole === "string" && record.actorRole.trim()
    ? record.actorRole.trim()
    : sessionRole || "Admin";
  const nextRecord = {
    ...record,
    id,
    actor,
    actorRole,
    actorId: typeof record.actorId === "string" && record.actorId.trim()
      ? record.actorId.trim()
      : actor.includes("@") ? actor : undefined,
    module: typeof record.module === "string" && record.module.trim()
      ? record.module.trim()
      : ADMIN_ACTIVITY_CATEGORY_LABELS[category] || category || "General",
    targetId: record.targetId ?? record.entityId,
    status: typeof record.status === "string" && record.status.trim()
      ? record.status.trim()
      : typeof record.result === "string" && record.result.trim()
        ? record.result.trim()
        : "Success",
    timestamp: typeof record.timestamp === "string" && record.timestamp.trim()
      ? record.timestamp
      : new Date().toISOString(),
  };

  const updated = [...previous.records, nextRecord];
  window.localStorage.setItem(ADMIN_ACTIVITY_LOG_KEY, JSON.stringify(updated));
  notifyAdminDataChanged();
  return updated;
}

export function notifyAdminDataChanged() {
  window.dispatchEvent(new Event(ADMIN_DATA_CHANGED_EVENT));
}

export const SUPPORT_REQUEST_STATUSES = [
  "Open",
  "In Progress",
  "Waiting for User",
  "Resolved",
  "Closed",
];

export const MODERATION_APPEAL_STATUSES = [
  "Submitted",
  "Under Review",
  "More Information Required",
  "Accepted",
  "Rejected",
  "Closed",
];

export const SUPPORT_REQUEST_CATEGORIES = [
  "Course Access",
  "PDF/eBook Problem",
  "Video Lecture Problem",
  "Enrollment Issue",
  "Account Problem",
  "AI Tutor Problem",
  "Teacher Communication",
  "Certificate Problem",
  "Payment Failed",
  "Payment Completed but Course Locked",
  "Duplicate Payment",
  "Incorrect Purchase Status",
  "Payment Problem",
  "Refund Request",
  "Transaction Not Found",
  "Technical Issue",
  "Account & Access",
  "Course Content",
  "Billing & Payment",
  "Moderation & Appeal",
  "General Inquiry",
  "Course Upload Error",
  "PDF/eBook Upload Error",
  "Course Approval Delay",
  "Teacher Profile Problem",
  "Account Access Problem",
  "Student Communication Issue",
  "Earnings Query",
  "Other",
];

export const SUPPORT_REQUEST_PRIORITIES = [
  "Low",
  "Medium",
  "High",
  "Urgent",
];

export function readAdminSupportRequestsState() {
  try {
    const raw = window.localStorage.getItem(ADMIN_SUPPORT_REQUESTS_KEY);
    if (raw === null) {
      return { records: [], error: null };
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return {
        records: [],
        error: "Saved support requests data is not in a supported format.",
      };
    }

    return {
      records: parsed.filter(isRecord),
      error: null,
    };
  } catch {
    return {
      records: [],
      error: "Saved support requests could not be read from browser storage.",
    };
  }
}

export function getAdminSupportRequests() {
  return readAdminSupportRequestsState().records;
}

export function importLegacyStudentHelpRequests(legacyRequests = []) {
  if (!Array.isArray(legacyRequests) || legacyRequests.length === 0) return 0;
  const state = readAdminSupportRequestsState();
  if (state.error) throw new Error(state.error);
  const imported = new Set(state.records.map((item) => String(item.legacyHelpRequestId || "")));
  const additions = [];
  legacyRequests.filter(isRecord).forEach((legacy, index) => {
    const legacyId = String(legacy.id || `legacy-${index}`).trim();
    if (!legacyId || imported.has(legacyId)) return;
    const createdAt = typeof legacy.createdAt === "string" ? legacy.createdAt : new Date().toISOString();
    const statusValue = String(legacy.status || "Open").toLowerCase();
    const status = statusValue === "resolved" ? "Resolved" : statusValue === "closed" ? "Closed" : statusValue === "assigned" ? "In Progress" : "Open";
    const idBase = `support-legacy-${legacyId.replace(/[^a-z0-9_-]/gi, "-").slice(0, 80)}`;
    const id = state.records.some((item) => String(item.id) === idBase) || additions.some((item) => item.id === idBase)
      ? `${idBase}-${Date.now().toString(36)}-${index}`
      : idBase;
    const request = {
      id,
      legacyHelpRequestId: legacyId,
      subject: String(legacy.subject || `Help request: ${legacy.teacherName || "Teacher"}`).slice(0, 160),
      description: String(legacy.question || "Student requested help.").slice(0, 5000),
      category: "Teacher Communication",
      priority: SUPPORT_REQUEST_PRIORITIES.includes(legacy.priority) ? legacy.priority : "Medium",
      status,
      requesterName: String(legacy.studentName || "Student").slice(0, 120),
      requesterEmail: String(legacy.studentEmail || "").trim().toLowerCase().slice(0, 254),
      requesterRole: "Student",
      requesterId: String(legacy.studentEmail || "").trim().toLowerCase().slice(0, 254),
      relatedRecordId: String(legacy.teacherEmail || "").slice(0, 120),
      relatedRecordTitle: String(legacy.teacherName || "Teacher").slice(0, 180),
      assignedStaff: String(legacy.assignedTeacher || "").slice(0, 160),
      createdAt,
      updatedAt: typeof legacy.updatedAt === "string" ? legacy.updatedAt : createdAt,
      ...(status === "Resolved" ? { resolvedAt: typeof legacy.updatedAt === "string" ? legacy.updatedAt : createdAt } : {}),
      responses: [],
      legacyImported: true,
    };
    additions.push(request);
    imported.add(legacyId);
  });
  if (!additions.length) return 0;
  window.localStorage.setItem(ADMIN_SUPPORT_REQUESTS_KEY, JSON.stringify([...additions, ...state.records]));
  notifyAdminDataChanged();
  return additions.length;
}

export function createAdminSupportRequest({
  subject,
  description,
  category = "General Inquiry",
  priority = "Medium",
  requesterName = "User",
  requesterEmail = "",
  requesterRole = "User",
  requesterId = "",
  relatedRecordId = "",
  relatedRecordTitle = "",
  appealType = "",
  originalDecision = "",
  attachment = null,
  moderationReportId = "",
  actor = requesterEmail || requesterRole,
}) {
  const cleanSubject = typeof subject === "string" ? subject.trim() : "";
  const cleanDescription = typeof description === "string" ? description.trim() : "";
  const normalizedRequester = String(requesterEmail || "").trim().toLowerCase();

  if (cleanSubject.length < 3) {
    throw new Error("Subject must be at least 3 characters long.");
  }
  if (cleanDescription.length < 5) {
    throw new Error("Description must be at least 5 characters long.");
  }
  if (!SUPPORT_REQUEST_CATEGORIES.includes(category)) {
    throw new Error("Please select a supported support category.");
  }
  if (!SUPPORT_REQUEST_PRIORITIES.includes(priority)) {
    throw new Error("Please select a supported priority level.");
  }
  if (["Student", "Teacher"].includes(requesterRole) && !normalizedRequester) {
    throw new Error("Sign in with an account email before submitting a support request.");
  }
  if (attachment && (Number(attachment.size) > 2 * 1024 * 1024 || String(attachment.dataUrl || "").length > 3 * 1024 * 1024)) {
    throw new Error("Attachments must be 2 MB or smaller.");
  }

  const state = readAdminSupportRequestsState();
  if (state.error) {
    throw new Error(state.error);
  }
  const duplicate = state.records.find((item) => String(item.requesterEmail || "").toLowerCase() === normalizedRequester
    && item.category === category
    && String(item.subject || "").trim().toLowerCase() === cleanSubject.toLowerCase()
    && String(item.description || "").trim().toLowerCase() === cleanDescription.toLowerCase()
    && Date.now() - new Date(item.createdAt || 0).getTime() < 60_000);
  if (normalizedRequester && duplicate) throw new Error("This same request was just submitted. Check My Tickets before sending it again.");

  const id = `support-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  const newRequest = {
    id,
    subject: cleanSubject,
    description: cleanDescription,
    category,
    priority,
    status: category === "Moderation & Appeal" ? "Submitted" : "Open",
    requesterName: typeof requesterName === "string" && requesterName.trim() ? requesterName.trim().slice(0, 120) : "User",
    requesterEmail: typeof requesterEmail === "string" ? requesterEmail.trim().toLowerCase().slice(0, 254) : "",
    requesterRole: typeof requesterRole === "string" && requesterRole.trim() ? requesterRole.trim() : "User",
    requesterId: typeof requesterId === "string" && requesterId.trim() ? requesterId.trim().slice(0, 160) : typeof requesterEmail === "string" ? requesterEmail.trim().toLowerCase().slice(0, 254) : "",
    relatedRecordId: typeof relatedRecordId === "string" ? relatedRecordId.trim().slice(0, 120) : "",
    relatedRecordTitle: typeof relatedRecordTitle === "string" ? relatedRecordTitle.trim().slice(0, 180) : "",
    ...(typeof appealType === "string" && appealType.trim() ? { appealType: appealType.trim().slice(0, 100) } : {}),
    ...(typeof originalDecision === "string" && originalDecision.trim() ? { originalDecision: originalDecision.trim().slice(0, 240) } : {}),
    ...(attachment && typeof attachment === "object" && typeof attachment.dataUrl === "string" && typeof attachment.name === "string"
      ? { attachment: { name: attachment.name.slice(0, 240), type: String(attachment.type || "application/octet-stream").slice(0, 120), size: Math.max(0, Number(attachment.size) || 0), dataUrl: attachment.dataUrl } }
      : {}),
    ...(category === "Moderation & Appeal" && String(moderationReportId || "").trim() ? { moderationReportId: String(moderationReportId).trim().slice(0, 80) } : {}),
    createdAt: now,
    updatedAt: now,
    responses: [],
  };

  const updatedRecords = [newRequest, ...state.records];
  window.localStorage.setItem(ADMIN_SUPPORT_REQUESTS_KEY, JSON.stringify(updatedRecords));

  try {
    appendAdminActivityRecord({
      actor: actor || "Admin",
      actorRole: requesterRole,
      action: category === "Moderation & Appeal" ? "Submitted moderation appeal" : "Submitted support ticket",
      category: category === "Moderation & Appeal" ? "moderation" : "support",
      entityType: category === "Moderation & Appeal" ? "Moderation Appeal" : "Support Request",
      entityId: id,
      targetName: cleanSubject,
      description: `Submitted ${category === "Moderation & Appeal" ? "appeal" : "support ticket"} ${id} [${category} / ${priority}].`,
      result: "Success",
    });
  } catch {
    // Activity log failure should not block request creation
  }

  notifyAdminDataChanged();
  return newRequest;
}

function assertSupportRecordOwner(record, actorRole, requesterEmail) {
  if (!["Student", "Teacher"].includes(actorRole)) return;
  const normalizedEmail = String(requesterEmail || "").trim().toLowerCase();
  if (!normalizedEmail || normalizedEmail !== String(record.requesterEmail || "").trim().toLowerCase()
    || (record.requesterRole && record.requesterRole !== actorRole)) {
    throw new Error("You can only access your own support record.");
  }
}

function notifySupportRequester(record, event, message) {
  const role = String(record?.requesterRole || "").toLowerCase();
  if (!record?.requesterEmail || !["student", "teacher"].includes(role)) return;
  const updatedAt = record.updatedAt || new Date().toISOString();
  try {
    addDemoNotification(role, record.requesterEmail, {
      id: `support:${record.id}:${event}:${updatedAt}`,
      type: "support",
      title: event === "reply" ? record.category === "Moderation & Appeal" ? "Admin replied to your appeal" : "Admin replied to your support ticket" : event === "assigned" ? "Your support ticket was assigned" : record.category === "Moderation & Appeal" ? "Your appeal was updated" : "Support ticket updated",
      message,
      link: record.category === "Moderation & Appeal" ? "appeals" : "help-support",
      createdAt: updatedAt,
    });
  } catch {
    // A notification failure must not prevent a support update from being saved.
  }
}

export function updateAdminSupportRequestStatus(id, nextStatus, actor = "Admin", decisionReason = "", options = {}) {
  const state = readAdminSupportRequestsState();
  if (state.error) {
    throw new Error(state.error);
  }

  const currentRecord = state.records.find((item) => String(item.id) === String(id));
  if (!currentRecord) {
    throw new Error("The requested support record could not be found.");
  }
  const actorRole = options.actorRole || "Admin";
  if (!["Admin", "Student", "Teacher"].includes(actorRole)) throw new Error("This account cannot update support ticket status.");
  assertSupportRecordOwner(currentRecord, actorRole, options.requesterEmail);
  if (["Student", "Teacher"].includes(actorRole)) {
    const allowedUserStatuses = currentRecord.status === "Closed" ? ["Open"] : currentRecord.status === "Resolved" ? ["Closed"] : [];
    if (!allowedUserStatuses.includes(nextStatus) || currentRecord.category === "Moderation & Appeal") {
      throw new Error("You can close a resolved ticket or reopen a closed ticket only.");
    }
  }
  const allowedStatuses = currentRecord.category === "Moderation & Appeal" ? MODERATION_APPEAL_STATUSES : SUPPORT_REQUEST_STATUSES;
  if (!allowedStatuses.includes(nextStatus)) {
    throw new Error("This support request status is not supported.");
  }
  if (currentRecord.category === "Moderation & Appeal" && ["Accepted", "Rejected"].includes(nextStatus) && String(decisionReason || "").trim().length < 3) {
    throw new Error("Add a decision reason before accepting or rejecting an appeal.");
  }

  let updatedRecord = null;
  const updatedRecords = state.records.map((item) => {
    if (String(item.id) === String(id)) {
      const now = new Date().toISOString();
      updatedRecord = {
        ...item,
        status: nextStatus,
        updatedAt: now,
        ...(nextStatus === "Resolved" ? { resolvedAt: now } : {}),
        ...(currentRecord.category === "Moderation & Appeal" && ["Accepted", "Rejected"].includes(nextStatus)
          ? { decisionReason: String(decisionReason).trim().slice(0, 2000), decisionAt: now, decidedBy: actor }
          : {}),
      };
      return updatedRecord;
    }
    return item;
  });

  window.localStorage.setItem(ADMIN_SUPPORT_REQUESTS_KEY, JSON.stringify(updatedRecords));

  try {
    appendAdminActivityRecord({
      actor: actor || "Admin",
      actorRole,
      action: updatedRecord.category === "Moderation & Appeal"
        ? ["Accepted", "Rejected"].includes(currentRecord.status) && ["Accepted", "Rejected"].includes(nextStatus) ? "Appeal Decision Changed" : nextStatus === "Accepted" || nextStatus === "Rejected" ? `Appeal ${nextStatus.toLowerCase()}` : `Updated appeal status to ${nextStatus}`
        : nextStatus === "Closed" ? "Ticket Closed" : nextStatus === "Resolved" ? "Ticket Resolved" : nextStatus === "Open" && currentRecord.status === "Closed" ? "Ticket Reopened" : "Updated support ticket status",
      category: updatedRecord.category === "Moderation & Appeal" ? "moderation" : "support",
      entityType: updatedRecord.category === "Moderation & Appeal" ? "Moderation Appeal" : "Support Request",
      entityId: String(id),
      targetName: updatedRecord.subject || "Support Request",
      description: `Updated status of ${id} to "${nextStatus}"${decisionReason ? `: ${String(decisionReason).trim()}` : ""}.`,
      result: "Success",
    });
  } catch {
    // Activity log failure should not block status change
  }

  if (actorRole === "Admin") notifySupportRequester(updatedRecord, "status", `Your ${updatedRecord.category === "Moderation & Appeal" ? "appeal" : "ticket"} ${updatedRecord.id} is now ${updatedRecord.status}${updatedRecord.decisionReason ? `. Admin reason: ${updatedRecord.decisionReason}` : ""}.`);
  notifyAdminDataChanged();
  return updatedRecords;
}

export function updateAdminSupportRequestAssignment(id, assignedStaff, actor = "Admin") {
  const staff = String(assignedStaff || "").trim().slice(0, 160);
  const state = readAdminSupportRequestsState();
  if (state.error) throw new Error(state.error);
  const current = state.records.find((item) => String(item.id) === String(id));
  if (!current) throw new Error("The requested support record could not be found.");
  let updatedRecord;
  const now = new Date().toISOString();
  const updatedRecords = state.records.map((item) => {
    if (String(item.id) !== String(id)) return item;
    updatedRecord = { ...item, assignedStaff: staff, assignedBy: staff ? actor : "", assignedAt: staff ? now : "", updatedAt: now };
    return updatedRecord;
  });
  window.localStorage.setItem(ADMIN_SUPPORT_REQUESTS_KEY, JSON.stringify(updatedRecords));
  try {
    appendAdminActivityRecord({ actor, actorRole: "Admin", action: staff ? current.assignedStaff ? "Ticket Reassigned" : "Ticket Assigned" : "Ticket Assignment Cleared", category: "support", entityType: current.category === "Moderation & Appeal" ? "Moderation Appeal" : "Support Request", entityId: String(id), targetId: String(id), targetName: current.subject, previousValue: current.assignedStaff || "Unassigned", newValue: staff || "Unassigned", result: "Success" });
  } catch { /* audit logging must not block assignment */ }
  if (staff) notifySupportRequester(updatedRecord, "assigned", `Your ticket ${id} was assigned to ${staff}.`);
  notifyAdminDataChanged();
  return updatedRecords;
}

export function updateAdminSupportRequestPriority(id, priority, actor = "Admin") {
  if (!SUPPORT_REQUEST_PRIORITIES.includes(priority)) throw new Error("Select a supported priority level.");
  const state = readAdminSupportRequestsState();
  if (state.error) throw new Error(state.error);
  const current = state.records.find((item) => String(item.id) === String(id));
  if (!current) throw new Error("The requested support record could not be found.");
  const updatedRecords = state.records.map((item) => String(item.id) === String(id) ? { ...item, priority, updatedAt: new Date().toISOString() } : item);
  window.localStorage.setItem(ADMIN_SUPPORT_REQUESTS_KEY, JSON.stringify(updatedRecords));
  try { appendAdminActivityRecord({ actor, actorRole: "Admin", action: "Ticket Priority Changed", category: "support", entityType: "Support Request", entityId: String(id), targetId: String(id), targetName: current.subject, previousValue: current.priority, newValue: priority, result: "Success" }); } catch { /* audit logging must not block priority changes */ }
  notifyAdminDataChanged();
  return updatedRecords;
}

export function addAdminSupportResponse(id, { message, type = "response", author = "Admin", actor = "Admin", authorRole = "Admin", requesterEmail = "" }) {
  const cleanMessage = typeof message === "string" ? message.trim() : "";
  if (cleanMessage.length < 2) {
    throw new Error("Response or note message cannot be empty.");
  }

  const allowedTypes = ["response", "internal_note"];
  const finalType = allowedTypes.includes(type) ? type : "response";

  const state = readAdminSupportRequestsState();
  if (state.error) {
    throw new Error(state.error);
  }

  const now = new Date().toISOString();
  const currentRecord = state.records.find((item) => String(item.id) === String(id));
  if (!currentRecord) throw new Error("The requested support record could not be found.");
  assertSupportRecordOwner(currentRecord, authorRole, requesterEmail);
  if (currentRecord.status === "Closed") throw new Error("Reopen this ticket before replying.");
  if (!["Admin", "Student", "Teacher"].includes(authorRole)) throw new Error("This account cannot reply to support tickets.");
  if (authorRole !== "Admin" && finalType !== "response") throw new Error("Only Admin can add internal notes.");
  const responseId = `resp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let updatedRecord = null;

  const newResponse = {
    id: responseId,
    message: cleanMessage,
    type: finalType,
    author: typeof author === "string" && author.trim() ? author.trim() : actor || "Admin",
    authorRole,
    createdAt: now,
  };

  const updatedRecords = state.records.map((item) => {
    if (String(item.id) === String(id)) {
      const existingResponses = Array.isArray(item.responses) ? item.responses : [];
      updatedRecord = {
        ...item,
        ...(authorRole !== "Admin" && item.status === "Resolved" ? { status: "Open", reopenedAt: now } : {}),
        responses: [...existingResponses, newResponse],
        updatedAt: now,
      };
      return updatedRecord;
    }
    return item;
  });

  if (!updatedRecord) {
    throw new Error("The requested support record could not be found.");
  }

  window.localStorage.setItem(ADMIN_SUPPORT_REQUESTS_KEY, JSON.stringify(updatedRecords));

  try {
    appendAdminActivityRecord({
      actor: actor || "Admin",
      actorRole: authorRole,
      action: finalType === "internal_note" ? "Added internal note" : authorRole !== "Admin" && currentRecord.status === "Resolved" ? "Ticket Reopened by Requester Reply" : "Added support response",
      category: "support",
      entityType: "Support Request",
      entityId: String(id),
      targetName: updatedRecord.subject || "Support Request",
      description: `${finalType === "internal_note" ? "Added internal note" : "Added response"} to support request ${id}.`,
      result: "Success",
    });
  } catch {
    // Activity log failure should not block response addition
  }

  if (authorRole === "Admin" && finalType === "response") notifySupportRequester(updatedRecord, "reply", `Admin replied to ticket ${id}.`);
  notifyAdminDataChanged();
  return updatedRecord;
}

export const SUPPORT_FAQ_CATEGORIES = [
  "Account & Login", "Courses & Enrollment", "PDF/eBooks", "Video Lectures", "Teacher Registration",
  "Course Upload", "Payments & Refunds", "AI Tutor", "Certificates", "Technical Support",
];

export const DEFAULT_SUPPORT_FAQS = [
  { id: "faq-education-levels", category: "Courses & Enrollment", question: "Which education levels are available?", answer: "The platform is designed to organize learning from Class 1 to 12, college, undergraduate, postgraduate and PhD levels.", published: true },
  { id: "faq-subjects", category: "Courses & Enrollment", question: "Which subjects can I explore?", answer: "You can explore technology, science, mathematics, business, languages, engineering, health sciences, humanities and more.", published: true },
  { id: "faq-professional-courses", category: "Courses & Enrollment", question: "Can I search for professional courses?", answer: "Yes. You can search for topics such as Web Development, Artificial Intelligence, Machine Learning and Data Science.", published: true },
  { id: "faq-video-lectures", category: "Video Lectures", question: "Are all courses and videos already available?", answer: "The platform currently contains a starter course catalog. Complete notes, verified videos and detailed syllabuses need to be added progressively.", published: true },
  { id: "faq-more-courses", category: "Courses & Enrollment", question: "Will the platform support more courses?", answer: "Yes. The catalog is structured so more subjects, courses and learning resources can be added in the future.", published: true },
];

export function readAdminHelpFaqsState() {
  try {
    const raw = window.localStorage.getItem(ADMIN_HELP_FAQS_KEY);
    if (raw === null) return { records: DEFAULT_SUPPORT_FAQS, error: null };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { records: [], error: "Saved Help Center FAQs are not in a supported format." };
    return { records: parsed.filter(isRecord), error: null };
  } catch {
    return { records: [], error: "Saved Help Center FAQs could not be read from browser storage." };
  }
}

export function getAdminHelpFaqs({ publishedOnly = false } = {}) {
  const records = readAdminHelpFaqsState().records;
  return publishedOnly ? records.filter((faq) => faq.published !== false) : records;
}

export function saveAdminHelpFaq(faq, actor = "Admin") {
  const question = String(faq?.question || "").trim();
  const answer = String(faq?.answer || "").trim();
  if (question.length < 5 || answer.length < 5) throw new Error("FAQ question and answer must each contain at least 5 characters.");
  if (!SUPPORT_FAQ_CATEGORIES.includes(faq.category)) throw new Error("Select a valid FAQ category.");
  const state = readAdminHelpFaqsState();
  if (state.error) throw new Error(state.error);
  const now = new Date().toISOString();
  const id = String(faq.id || `faq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const existing = state.records.find((item) => item.id === id);
  const savedFaq = { id, category: faq.category, question: question.slice(0, 240), answer: answer.slice(0, 5000), published: faq.published !== false, createdAt: existing?.createdAt || now, updatedAt: now };
  const records = existing ? state.records.map((item) => item.id === id ? savedFaq : item) : [savedFaq, ...state.records];
  window.localStorage.setItem(ADMIN_HELP_FAQS_KEY, JSON.stringify(records));
  try { appendAdminActivityRecord({ actor, actorRole: "Admin", action: existing ? "FAQ Updated" : "FAQ Created", category: "support", entityType: "Support FAQ", entityId: id, targetId: id, targetName: question, previousValue: existing ? "Existing FAQ" : "Not present", newValue: savedFaq.published ? "Published" : "Unpublished", result: "Success" }); } catch { /* audit logging must not block FAQ changes */ }
  notifyAdminDataChanged();
  return records;
}

export function deleteAdminHelpFaq(id, actor = "Admin") {
  const state = readAdminHelpFaqsState();
  if (state.error) throw new Error(state.error);
  const faq = state.records.find((item) => item.id === id);
  if (!faq) throw new Error("The selected FAQ could not be found.");
  const records = state.records.filter((item) => item.id !== id);
  window.localStorage.setItem(ADMIN_HELP_FAQS_KEY, JSON.stringify(records));
  try { appendAdminActivityRecord({ actor, actorRole: "Admin", action: "FAQ Deleted", category: "support", entityType: "Support FAQ", entityId: id, targetId: id, targetName: faq.question, result: "Success" }); } catch { /* audit logging must not block FAQ changes */ }
  notifyAdminDataChanged();
  return records;
}

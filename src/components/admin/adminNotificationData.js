import { Bell, BookOpenCheck, ClipboardCheck, LifeBuoy } from "lucide-react";
import {
  ADMIN_DATA_CHANGED_EVENT,
  getAdminKnowledgeStorageState,
  getAdminTeachers,
  readAdminUsersState,
  readAdminSupportRequestsState,
} from "./adminData";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function firstText(record, fields) {
  for (const field of fields) {
    const value = record[field];
    if (
      (typeof value === "string" || typeof value === "number") &&
      String(value).trim()
    ) {
      return String(value).trim();
    }
  }
  return "";
}

function getTimestamp(record, fields) {
  for (const field of fields) {
    const value = record[field];
    if (typeof value !== "string" && typeof value !== "number") continue;
    if (String(value).trim() && !Number.isNaN(new Date(value).getTime())) {
      return value;
    }
  }
  return null;
}

function getCourseNotifications(teachers, liveCourses) {
  const notifications = [];
  const errors = [];
  const seen = new Set();

  function addCourse(course, fallbackEmail = "") {
    if (course.status !== "Pending Approval") return;
    const teacherEmail = firstText(course, ["teacherEmail", "instructorEmail"])
      || fallbackEmail;
    const identity = course.id === undefined || course.id === null || course.id === ""
      ? JSON.stringify(course)
      : String(course.id);
    const dedupeKey = `${teacherEmail.toLowerCase()}:${identity}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    const courseTitle = firstText(course, ["title", "name"]) || "Untitled course";
    notifications.push({
      id: `course:${dedupeKey}`,
      category: "course",
      categoryLabel: "Course review",
      title: "Course awaiting approval",
      description: `${courseTitle} is marked Pending Approval.`,
      related: courseTitle,
      timestamp: getTimestamp(course, [
        "submittedAt",
        "submissionDate",
        "submittedOn",
        "submittedDate",
        "createdAt",
      ]),
      path: "/admin/courses",
      icon: BookOpenCheck,
    });
  }

  if (Array.isArray(liveCourses)) {
    liveCourses.filter(isRecord).forEach((course) => addCourse(course));
    return { notifications, errors };
  }

  teachers.forEach((teacher) => {
    const teacherEmail = teacher.email.trim();
    const key = `educonnect.teacher.${teacherEmail}.courses`;
    let courses;

    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return;
      courses = JSON.parse(raw);
      if (!Array.isArray(courses)) {
        errors.push("Saved teacher course data is not in the expected array format.");
        return;
      }
    } catch {
      errors.push("Some saved teacher course data could not be read.");
      return;
    }

    courses.filter(isRecord).forEach((course) => addCourse(course, teacherEmail));
  });

  return { notifications, errors };
}

export function getAdminNotifications({
  teacherApplications,
  courses,
  knowledgeProposals,
  supportRequests,
} = {}) {
  const errors = [];
  const userState = readAdminUsersState();
  if (userState.error) errors.push(userState.error);

  const teachers = getAdminTeachers(userState.users);
  const notificationTeachers = Array.isArray(teacherApplications)
    ? teacherApplications
    : teachers;
  const notifications = [];

  notificationTeachers.forEach((teacher) => {
    const status = firstText(teacher, ["status", "teacherStatus"])
      .toLowerCase();
    if (status !== "pending") return;

    const email = firstText(teacher, ["email"]).toLowerCase();
    if (!email) return;
    const name = firstText(teacher, ["name", "fullName"]) || email;
    notifications.push({
      id: `teacher:${email}`,
      category: "teacher",
      categoryLabel: "Teacher application",
      title: "Teacher application awaiting review",
      description: `${name} has a teacher application marked pending.`,
      related: name,
      timestamp: getTimestamp(teacher, [
        "appliedAt",
        "submittedAt",
        "createdAt",
        "registeredAt",
      ]),
      path: "/admin/teachers",
      icon: ClipboardCheck,
    });
  });

  const courseState = getCourseNotifications(teachers, courses);
  notifications.push(...courseState.notifications);
  errors.push(...courseState.errors);

  const knowledgeState = Array.isArray(knowledgeProposals)
    ? { proposals: knowledgeProposals, error: "" }
    : getAdminKnowledgeStorageState();
  if (knowledgeState.error) errors.push(knowledgeState.error);
  const seenProposals = new Set();
  knowledgeState.proposals.forEach((proposal) => {
    if (proposal.status !== "Pending Review") return;

    const proposalId =
      firstText(proposal, ["proposalId"]) || JSON.stringify(proposal);
    if (seenProposals.has(proposalId)) return;
    seenProposals.add(proposalId);

    const topic =
      firstText(proposal, ["proposedTopic"]) ||
      firstText(proposal.courseSnapshot || {}, ["title"]) ||
      "Untitled proposal";
    const requester = firstText(proposal, ["teacherName", "teacherEmail"]);
    notifications.push({
      id: `knowledge:${proposalId}`,
      category: "knowledge",
      categoryLabel: "AI knowledge",
      title: "AI knowledge proposal awaiting review",
      description: requester
        ? `${topic} was proposed by ${requester}.`
        : `${topic} is marked Pending Review.`,
      related: topic,
      timestamp: getTimestamp(proposal, ["submittedAt"]),
      path: "/admin/knowledge",
      icon: Bell,
    });
  });

  const supportState = Array.isArray(supportRequests)
    ? { records: supportRequests, error: "" }
    : readAdminSupportRequestsState();
  if (supportState.error) errors.push(supportState.error);
  supportState.records.forEach((request) => {
    if (request.legacyImported) return;
    const lastResponse = Array.isArray(request.responses) ? request.responses.at(-1) : null;
    const userReplied = lastResponse && ["Student", "Teacher"].includes(lastResponse.authorRole)
      && lastResponse.createdAt === request.updatedAt;
    const newRequest = !lastResponse && ["Open", "Submitted"].includes(request.status);
    if (!newRequest && !userReplied) return;
    const role = request.requesterRole || "User";
    const isAppeal = request.category === "Moderation & Appeal";
    notifications.push({
      id: `support:${request.id}:${request.updatedAt || request.createdAt}`,
      category: "support",
      categoryLabel: isAppeal ? "Appeal" : `${role} support`,
      title: isAppeal ? "Appeal submitted" : userReplied ? "Requester replied to a ticket" : "New support ticket",
      description: `${request.subject || "Support request"} · ${request.requesterName || request.requesterEmail || role}`,
      related: request.subject || request.id,
      timestamp: request.updatedAt || request.createdAt || null,
      path: "/admin/support",
      icon: LifeBuoy,
    });
  });

  const uniqueNotifications = [
    ...new Map(
      notifications.map((notification) => [notification.id, notification]),
    ).values(),
  ];

  uniqueNotifications.sort((first, second) => {
    if (!first.timestamp) return second.timestamp ? 1 : 0;
    if (!second.timestamp) return -1;
    return new Date(second.timestamp).getTime() - new Date(first.timestamp).getTime();
  });

  return { notifications: uniqueNotifications, errors };
}

export function formatAdminNotificationTimestamp(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export { ADMIN_DATA_CHANGED_EVENT };

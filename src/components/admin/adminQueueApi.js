import { apiFetch } from "../../utils/api";
import {
  contentRequest,
  getContentState,
  normalizeContentItem,
} from "../../utils/contentApi";
import { getAdminTeachers, readAdminUsersState } from "./adminData";

function markUnavailable(error, message) {
  if (error?.status) return error;
  return Object.assign(
    error instanceof Error ? error : new Error(message),
    { backendUnavailable: true },
  );
}

export async function adminApiRequest(path, options = {}) {
  let response;
  try {
    response = await apiFetch(path, options);
  } catch (error) {
    throw markUnavailable(error, "Cannot connect to the backend.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(
      new Error(data.message || `Request failed (${response.status})`),
      { status: response.status },
    );
  }
  return data;
}

export function getLegacyAdminCourseQueue() {
  const userState = readAdminUsersState();
  const seen = new Set();
  return getAdminTeachers(userState.users).flatMap((teacher) => {
    let courses = [];
    try {
      const saved = JSON.parse(
        window.localStorage.getItem(
          `educonnect.teacher.${teacher.email.trim()}.courses`,
        ) || "[]",
      );
      if (Array.isArray(saved)) courses = saved;
    } catch {
      courses = [];
    }
    return courses
      .filter((course) => {
        const id = `${teacher.email}:${course.id || JSON.stringify(course)}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((course) => ({
        ...course,
        teacherEmail: course.teacherEmail || teacher.email,
        teacherName: course.teacherName || teacher.name,
      }));
  });
}

export async function getAdminContentQueue(kind, { allowLegacyFallback = true } = {}) {
  try {
    const data = await contentRequest(`/${kind}/admin`);
    const items = Array.isArray(data.items) ? data.items : [];
    return {
      records: items.map(normalizeContentItem),
      source: "backend",
    };
  } catch (error) {
    const unavailable = markUnavailable(
      error,
      `${kind === "courses" ? "Course" : "Book"} review queue is unavailable.`,
    );
    if (!unavailable.backendUnavailable || !allowLegacyFallback) throw unavailable;
    return {
      records: kind === "courses"
        ? getLegacyAdminCourseQueue()
        : getContentState().managedBooks,
      source: "fallback",
      error: unavailable,
    };
  }
}

export async function getAdminSupportQueue({ limit = 100 } = {}) {
  const firstPage = await adminApiRequest(`/admin/support/tickets?limit=${limit}&page=1`);
  const pageCount = Math.max(1, Number(firstPage.pageCount) || 1);
  const remainingPages = pageCount > 1
    ? await Promise.all(
        Array.from({ length: pageCount - 1 }, (_, index) =>
          adminApiRequest(`/admin/support/tickets?limit=${limit}&page=${index + 2}`),
        ),
      )
    : [];
  const records = [firstPage, ...remainingPages].flatMap((page) =>
    Array.isArray(page.tickets) ? page.tickets : [],
  );
  return {
    records,
    total: Number.isFinite(firstPage.total) ? firstPage.total : records.length,
    source: "backend",
  };
}

export function normalizeAdminSupportTicket(ticket) {
  return {
    ...ticket,
    id: String(ticket.id || ticket._id || ""),
    ticketId: ticket.ticketId || "",
    requesterId: ticket.requesterId || "",
    requesterName: ticket.requesterName || "User",
    requesterEmail: ticket.requesterEmail || "",
    requesterRole: ticket.requesterRole || "User",
    assignedStaff: ticket.assignedStaff || "",
    assignedBy: ticket.assignedBy || "",
    assignedAt: ticket.assignedAt || null,
    relatedRecordId: ticket.relatedRecordId || "",
    relatedRecordTitle: ticket.relatedRecordTitle || "",
    responses: (ticket.responses || []).map((response) => ({
      ...response,
      id: String(response.id || response._id || ""),
    })),
  };
}

export async function getAdminOperationalQueue(
  queue,
  localRecords = [],
  getId = (record) => record.id,
) {
  try {
    let data = await adminApiRequest(`/admin/queues/${encodeURIComponent(queue)}`);
    if (localRecords.length) {
      data = await adminApiRequest(
        `/admin/queues/${encodeURIComponent(queue)}/import`,
        {
          method: "POST",
          body: JSON.stringify({
            records: localRecords.map((record) => ({
              id: String(getId(record)),
              record,
            })),
          }),
        },
      );
    }
    return {
      records: (data.records || []).map((item) => item.record),
      source: "backend",
    };
  } catch (error) {
    if (!error?.backendUnavailable) throw error;
    return { records: localRecords, source: "fallback", error };
  }
}

export async function saveAdminOperationalRecord(queue, id, record) {
  const data = await adminApiRequest(
    `/admin/queues/${encodeURIComponent(queue)}/${encodeURIComponent(id)}`,
    { method: "PUT", body: JSON.stringify({ record }) },
  );
  return data.item?.record || record;
}

export async function deleteAdminOperationalRecord(queue, id) {
  await adminApiRequest(
    `/admin/queues/${encodeURIComponent(queue)}/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

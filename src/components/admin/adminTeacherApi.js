import { apiFetch } from "../../utils/api";

export const ADMIN_TEACHER_APPLICATIONS_CHANGED_EVENT =
  "educonnect:admin-teacher-applications-changed";

const STATUS_PRIORITY = {
  pending: 0,
  approved: 1,
  rejected: 2,
};

function createApiError(message, details = {}) {
  return Object.assign(new Error(message), details);
}

async function adminTeacherRequest(path, options = {}) {
  let response;
  try {
    response = await apiFetch(path, options);
  } catch {
    throw createApiError(
      "Cannot connect to backend. Check that port 5000 is running.",
      { backendUnavailable: true },
    );
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw createApiError(
      data.message || `Request failed (${response.status})`,
      { status: response.status },
    );
  }

  return data;
}

export function normalizeTeacherApplication(teacher) {
  return {
    ...teacher,
    id: String(teacher._id || teacher.id || ""),
    name: teacher.fullName || teacher.name || "Not provided",
    status: String(teacher.teacherStatus || teacher.status || "pending")
      .trim()
      .toLowerCase(),
  };
}

export function sortTeacherApplications(applications) {
  return [...applications].sort((first, second) => {
    const statusDifference =
      (STATUS_PRIORITY[first.status] ?? 3) -
      (STATUS_PRIORITY[second.status] ?? 3);
    if (statusDifference) return statusDifference;

    const firstTime = new Date(first.createdAt || first.appliedAt || 0).getTime();
    const secondTime = new Date(second.createdAt || second.appliedAt || 0).getTime();
    return secondTime - firstTime;
  });
}

export async function getAdminTeacherApplications({ pendingOnly = false } = {}) {
  const data = await adminTeacherRequest(
    pendingOnly ? "/admin/teachers/pending" : "/admin/teachers",
  );
  const teachers = Array.isArray(data.teachers) ? data.teachers : [];
  return sortTeacherApplications(teachers.map(normalizeTeacherApplication));
}

export async function updateAdminTeacherApplication(id, nextStatus) {
  if (!id || !["approved", "rejected"].includes(nextStatus)) {
    throw new Error("Select a valid teacher application decision.");
  }

  const action = nextStatus === "approved" ? "approve" : "reject";
  return adminTeacherRequest(
    `/admin/teachers/${encodeURIComponent(id)}/${action}`,
    { method: "PATCH" },
  );
}

export function notifyAdminTeacherApplicationsChanged() {
  window.dispatchEvent(new Event(ADMIN_TEACHER_APPLICATIONS_CHANGED_EVENT));
}

// Phase 7 API helpers: personalized recommendations, the research workspace,
// the MongoDB notification inbox and role-scoped learning analytics.
// Every call goes through apiFetch (session cookie + CSRF header) and throws
// a readable Error when the backend rejects the request.
import { apiFetch, apiBase } from "./api";

async function jsonOrThrow(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || `Request failed (${response.status}).`);
  return data;
}

// ---- Personalized recommendations ----------------------------------------
export async function fetchStudentRecommendations() {
  return jsonOrThrow(await apiFetch("/recommendations"));
}

export async function fetchInterestProfile() {
  return jsonOrThrow(await apiFetch("/recommendations/profile"));
}

export async function saveInterestProfile({ interests = [], learningGoals = [] }) {
  return jsonOrThrow(await apiFetch("/recommendations/profile", {
    method: "PUT",
    body: JSON.stringify({ interests, learningGoals }),
  }));
}

// ---- Research Workspace ---------------------------------------------------
export const RESEARCH_SECTION_TYPES = {
  projects: "project",
  papers: "paper",
  matrix: "matrix",
  references: "reference",
  datasets: "dataset",
  experiments: "experiment",
};
export const RESEARCH_TYPE_SECTIONS = Object.fromEntries(
  Object.entries(RESEARCH_SECTION_TYPES).map(([section, type]) => [type, section]),
);

const researchInput = (record) => {
  const { title, payload = {}, status, tags = [], courseId } = record;
  return { type: record.type, title, payload, status, tags, ...(courseId ? { courseId } : {}) };
};

export async function fetchResearchRecords() {
  const data = await jsonOrThrow(await apiFetch("/research/records?limit=100"));
  return data.records || [];
}

export async function createResearchRecord(record) {
  const data = await jsonOrThrow(await apiFetch("/research/records", {
    method: "POST",
    body: JSON.stringify(researchInput(record)),
  }));
  return data.record;
}

export async function updateResearchRecord(id, record) {
  const data = await jsonOrThrow(await apiFetch(`/research/records/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(researchInput(record)),
  }));
  return data.record;
}

export async function deleteResearchRecord(id) {
  return jsonOrThrow(await apiFetch(`/research/records/${encodeURIComponent(id)}`, { method: "DELETE" }));
}

export async function archiveResearchRecord(id, status = "Archived") {
  const data = await jsonOrThrow(await apiFetch(`/research/records/${encodeURIComponent(id)}/archive`, {
    method: "POST",
    body: JSON.stringify({ status }),
  }));
  return data.record;
}

// Bulk-imports browser-saved records (duplicate-aware, per owner).
export async function importResearchRecords(records) {
  return jsonOrThrow(await apiFetch("/research/import", {
    method: "POST",
    body: JSON.stringify({ records }),
  }));
}

// ---- Notifications --------------------------------------------------------
export async function fetchNotifications({ page = 1, limit = 100 } = {}) {
  return jsonOrThrow(await apiFetch(`/notifications?page=${page}&limit=${limit}`));
}

export async function markServerNotificationRead(id) {
  return jsonOrThrow(await apiFetch(`/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" }));
}

export async function markAllServerNotificationsRead() {
  return jsonOrThrow(await apiFetch("/notifications/read-all", { method: "PATCH" }));
}

export async function deleteServerNotification(id) {
  return jsonOrThrow(await apiFetch(`/notifications/${encodeURIComponent(id)}`, { method: "DELETE" }));
}

// ---- Learning Analytics ---------------------------------------------------
export async function fetchStudentAnalytics() {
  return jsonOrThrow(await apiFetch("/analytics/student"));
}

export async function fetchTeacherAnalytics() {
  return jsonOrThrow(await apiFetch("/analytics/teacher"));
}

export async function fetchAdminAnalytics() {
  return jsonOrThrow(await apiFetch("/analytics/admin"));
}

// Realtime notifications (SSE). MongoDB remains authoritative; this is a live
// hint to refresh/merge. EventSource reconnects automatically.
export function subscribeToNotificationStream({ onNotification, onReady, onError } = {}) {
  if (typeof window === "undefined" || typeof EventSource === "undefined") return () => {};
  const url = new URL("/notifications/stream", apiBase + "/").toString().replace(/\/+$/, "");
  // apiBase already ends with /api; build /api/notifications/stream reliably.
  const streamUrl = `${apiBase}/notifications/stream`;
  const source = new EventSource(streamUrl, { withCredentials: true });
  source.addEventListener("ready", (event) => {
    try { onReady?.(JSON.parse(event.data)); } catch { onReady?.({}); }
  });
  source.addEventListener("notification", (event) => {
    try { onNotification?.(JSON.parse(event.data)); } catch { /* ignore malformed event */ }
  });
  source.onerror = (event) => { onError?.(event); };
  return () => source.close();
}

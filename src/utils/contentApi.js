import { apiBase, apiFetch } from "./api";
import { isDevelopmentAdminSession } from "./devAdminSession";

export const CONTENT_CHANGED_EVENT = "educonnect:content-changed";
const empty = { courses: [], books: [], managedCourses: [], managedBooks: [], accesses: [], role: "", email: "" };
let state = { ...empty };
let generation = 0;
let pendingRefresh;

export async function contentRequest(path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await apiFetch(`/content${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.message || "Content could not be loaded. Please try again."), { status: response.status });
  return data;
}

export const contentFileUrl = (id, image = false) => `${apiBase}/content/${image ? "images" : "files"}/${String(id).replace(/^remote:/, "")}`;
const fileRef = (value) => String(value || "").replace(/^remote:/, "").split("/").at(-1);
const isFileId = (value) => /^[a-f0-9]{24}$/i.test(fileRef(value));

export function normalizeContentItem(item) {
  return { ...item,
    ...(item.thumbnail ? { thumbnail: contentFileUrl(item.thumbnail, true) } : {}),
    ...Object.fromEntries(["pdfFileId", "previewFileId", "coverFileId"].filter((key) => item[key]).map((key) => [key, `remote:${item[key]}`])),
  };
}
function notify() {
  for (const event of [CONTENT_CHANGED_EVENT, "educonnect:teacher-courses-changed", "educonnect:books-changed", "educonnect:admin-data-changed"]) {
    window.dispatchEvent(new Event(event));
  }
}
export function clearContentSession() {
  generation += 1;
  state = { ...empty, courses: state.courses, books: state.books };
  // Drop all lesson bodies and file references associated with the old account.
  state.courses = [];
  state.books = [];
  notify();
}
export function getContentState() { return state; }
export function getManagedCourses(email) {
  return state.role === "admin" || state.email?.toLowerCase() === String(email).toLowerCase() ? state.managedCourses : [];
}

export async function refreshContent(force = false) {
  if (isDevelopmentAdminSession({
    isDevelopment: import.meta.env.DEV,
    adminEmail: import.meta.env.VITE_ADMIN_EMAIL,
    adminPassword: import.meta.env.VITE_ADMIN_PASSWORD,
    role: window.sessionStorage.getItem("educonnect.demoRole"),
    email: window.sessionStorage.getItem("educonnect.demoEmail"),
    marker: window.sessionStorage.getItem("educonnect.devAdminSession"),
  })) {
    const email = window.sessionStorage.getItem("educonnect.demoEmail") || "";
    if (state.role !== "admin" || state.email !== email) {
      generation += 1;
      state = { ...empty, role: "admin", email };
      notify();
    }
    return state;
  }
  if (force && pendingRefresh) {
    await pendingRefresh.catch(() => {});
    return refreshContent();
  }
  if (pendingRefresh) return pendingRefresh;
  const currentGeneration = generation;
  pendingRefresh = (async () => {
    let data;
    try { data = await contentRequest("/state"); }
    catch (error) {
      if (error.status !== 401) throw error;
      data = { ...empty, ...await contentRequest("/catalog") };
    }
    if (currentGeneration !== generation) return;
    const next = { ...empty, ...data };
    for (const key of ["courses", "books", "managedCourses", "managedBooks"]) next[key] = (next[key] || []).map(normalizeContentItem);
    if (JSON.stringify(next) !== JSON.stringify(state)) { state = next; notify(); }
    return state;
  })().finally(() => { pendingRefresh = undefined; });
  return pendingRefresh;
}

const metadataKeys = ["curriculum", "category", "level", "price", "thumbnail", "requirements", "learningOutcomes", "outcomes", "objectives", "whatYouWillLearn", "educationLevel", "targetLevel", "classNumber", "intermediateYear", "stream", "degreeLevel", "program", "subjects", "subject", "specialization", "language", "author", "classOrProgram", "semester", "pages", "isFree", "downloadAllowed", "pdfFileId", "previewFileId", "coverFileId", "fileName", "previewFileName"];
const lessonKeys = ["id", "title", "description", "content", "duration", "order", "isFreePreview", "videoFileId", "fileId", "type", "section", "sectionId", "needsUpload"];

export async function uploadContentFile(kind, file) {
  if (!file.type) {
    const mime = { md: "text/markdown", txt: "text/plain", csv: "text/csv", zip: "application/zip" }[file.name?.split(".").at(-1)?.toLowerCase()];
    if (mime) file = new File([file], file.name, { type: mime });
  }
  const form = new FormData();
  form.append("file", file, file.name || `${kind}-upload`);
  return (await contentRequest(`/files/${kind}`, { method: "POST", body: form })).file.id;
}
async function acceptManagedRecord(kind, item) {
  generation += 1;
  const normalized = normalizeContentItem(item);
  const key = kind === "courses" ? "managedCourses" : "managedBooks";
  state = { ...state, [key]: [normalized, ...state[key].filter((record) => record.id !== normalized.id)] };
  notify();
  await refreshContent(true).catch((error) => console.error("Content saved, refresh failed", error));
  return normalized;
}
export async function saveContent(kind, record) {
  const metadata = Object.fromEntries(metadataKeys.filter((key) => record[key] !== undefined).map((key) => [key, record[key]]));
  for (const key of ["requirements", "learningOutcomes", "outcomes", "objectives", "whatYouWillLearn"]) {
    if (typeof metadata[key] === "string") metadata[key] = metadata[key].split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }
  if (metadata.thumbnail?.startsWith("data:")) {
    const blob = await (await fetch(metadata.thumbnail)).blob();
    metadata.thumbnail = await uploadContentFile("image", blob);
  }
  for (const key of ["thumbnail", "pdfFileId", "previewFileId", "coverFileId"]) {
    if (metadata[key]) {
      if (!isFileId(metadata[key])) throw new Error("Import the original browser files before saving this content.");
      metadata[key] = fileRef(metadata[key]);
    }
  }
  const body = { title: record.title, description: record.description || "", metadata };
  if (kind === "courses") body.lessons = (record.lessons || []).map((lesson, order) => ({
    ...Object.fromEntries(lessonKeys.filter((key) => lesson[key] !== undefined).map((key) => [key, lesson[key]])),
    id: String(lesson.id || crypto.randomUUID()), order,
  }));
  const existing = record.mongoContent === true;
  if (existing) body.revision = record.revision;
  else if (record.id) body.legacyId = String(record.id);
  const data = await contentRequest(`/${kind}${existing ? `/${record.id}` : ""}`, { method: existing ? "PATCH" : "POST", body: JSON.stringify(body) });
  return acceptManagedRecord(kind, data.item);
}
export async function submitContent(kind, record) {
  const data = await contentRequest(`/${kind}/${record.id}/submit`, { method: "POST", body: JSON.stringify({ revision: record.revision }) });
  return acceptManagedRecord(kind, data.item);
}
export async function removeContent(kind, record) {
  await contentRequest(`/${kind}/${record.id}`, { method: "DELETE", headers: { "If-Match": String(record.revision) } });
  generation += 1;
  const key = kind === "courses" ? "managedCourses" : "managedBooks";
  state = { ...state, [key]: state[key].filter((item) => item.id !== record.id), [kind]: state[kind].filter((item) => item.id !== record.id) };
  notify();
  await refreshContent(true).catch(console.error);
}
export async function reviewContent(kind, record, decision, reason = "") {
  const data = await contentRequest(`/${kind}/${record.id}/review`, { method: "POST", body: JSON.stringify({ decision, revision: record.revision, reason }) });
  await acceptManagedRecord(kind, data.item);
}
export async function enrollContent(items) {
  const records = items.filter((item) => item.mongoContent || /^[a-f0-9]{24}$/i.test(String(item.id)));
  if (!records.length) return;
  await contentRequest("/enrollments", { method: "POST", body: JSON.stringify({ items: records.map((item) => ({ id: String(item.id), kind: item.itemType === "book" ? "book" : "course" })) }) });
  await refreshContent(true);
}
export async function unenrollContent(item) {
  const kind = item.itemType === "book" ? "book" : item.kind || "course";
  const contentId = String(item.contentId || item.id || "");
  if (!/^[a-f0-9]{24}$/i.test(contentId)) return;
  await contentRequest("/enrollments", { method: "DELETE", body: JSON.stringify({ kind, contentId }) });
  await refreshContent(true);
}
// MongoDB is the source of truth for course enrollments. Joins the student's
// access records from /content/state with the approved published catalog.
export function getMongoCourseEnrollments() {
  const state = getContentState();
  if (state.role !== "student") return [];
  const byId = new Map(state.courses.map((course) => [String(course.id), course]));
  return state.accesses
    .filter((entry) => entry.kind === "course")
    .map((entry) => {
      const course = byId.get(String(entry.contentId));
      if (!course) return null;
      return { ...course, id: String(entry.contentId), mongoContent: true,
        enrolledAt: entry.createdAt || null, accessSource: entry.source, accessPrice: entry.price };
    })
    .filter(Boolean);
}
export async function loadContentFile(id) {
  const response = await fetch(contentFileUrl(id), { credentials: "include" });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "This file is unavailable or access has not been granted.");
  }
  return response.blob();
}

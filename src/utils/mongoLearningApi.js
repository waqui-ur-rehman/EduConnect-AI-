import { apiFetch } from "./api";

export const LEARNING_UPDATED_EVENT = "educonnect:learning-updated";

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await apiFetch(`/learning${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.message || "The learning service could not complete this request."), { status: response.status, missing: data.missing, progress: data.progress });
  return data;
}
const notify = () => window.dispatchEvent(new Event(LEARNING_UPDATED_EVENT));

export async function fetchProgress() {
  const data = await request("/progress");
  return data.courses || [];
}
export async function setLessonCompleted(courseId, lessonId, completed) {
  const data = await request("/progress/lessons", { method: "POST", body: JSON.stringify({ courseId: String(courseId), lessonId: String(lessonId), completed: Boolean(completed) }) });
  notify();
  return data.progress;
}

export async function fetchCourseReviews(courseId) {
  return request(`/reviews/course/${encodeURIComponent(String(courseId))}`);
}
export async function fetchTeacherSummary(teacherId) {
  return request(`/reviews/teacher-summary/${encodeURIComponent(String(teacherId))}`);
}
export async function fetchMyReviews() {
  const data = await request("/reviews/mine");
  return data.reviews || [];
}
export async function fetchTeacherReviews() {
  const data = await request("/reviews/teacher");
  return data.reviews || [];
}
export async function saveMongoReview(courseId, { rating, comment }) {
  const data = await request("/reviews", { method: "POST", body: JSON.stringify({ courseId: String(courseId), rating, comment }) });
  notify();
  return data.review;
}
export async function deleteMongoReview(courseId) {
  await request(`/reviews/mine/${encodeURIComponent(String(courseId))}`, { method: "DELETE" });
  notify();
}

export async function fetchMyCertificates() {
  const data = await request("/certificates/mine");
  return data.certificates || [];
}
export async function issueCertificate(courseId) {
  return request("/certificates/issue", { method: "POST", body: JSON.stringify({ courseId: String(courseId) }) });
}

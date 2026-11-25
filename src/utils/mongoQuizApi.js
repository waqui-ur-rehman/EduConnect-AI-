import { apiFetch } from "./api";
export const isMongoId = value => /^[a-f\d]{24}$/i.test(String(value || ""));
export async function mongoQuizRequest(path, options = {}) {
  const response = await apiFetch(`/quizzes${path}`, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.message || `Request failed (${response.status})`);
  return data;
}
export const teacherQuizzes = courseId => mongoQuizRequest(`/courses/${courseId}/teacher`);
export const studentQuizzes = courseId => mongoQuizRequest(`/courses/${courseId}/student`);
export function saveTeacherQuiz(courseId, quiz) {
  const existing = isMongoId(quiz.id);
  const body = { ...quiz };
  if (!existing && quiz.id) body.legacyId = quiz.legacyId || String(quiz.id);
  return mongoQuizRequest(`/courses/${courseId}/teacher${existing ? `/${quiz.id}` : ""}`, {
    method: existing ? "PUT" : "POST", body: JSON.stringify(body),
  });
}
export const publishTeacherQuiz = (courseId, quizId, published) => mongoQuizRequest(`/courses/${courseId}/teacher/${quizId}/publish`, { method: "PATCH", body: JSON.stringify({ published }) });
export const removeTeacherQuiz = (courseId, quizId) => mongoQuizRequest(`/courses/${courseId}/teacher/${quizId}`, { method: "DELETE" });
export const submitStudentAttempt = (courseId, quizId, data) => mongoQuizRequest(`/courses/${courseId}/student/${quizId}/attempts`, { method: "POST", body: JSON.stringify(data) });

export const startStudentAttempt = (courseId, quizId) => mongoQuizRequest(`/courses/${courseId}/student/${quizId}/start`, { method: "POST" });

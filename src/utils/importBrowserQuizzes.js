import { publishTeacherQuiz, saveTeacherQuiz, teacherQuizzes } from "./mongoQuizApi";

// Keep the original questions in the browser as a backup. MongoDB's unique
// legacyId index also makes retries and simultaneous tabs safe.
export async function loadTeacherQuizCourse(course, email) {
  const courseId = String(course.id || course._id);
  const initial = await teacherQuizzes(courseId);
  const warnings = [];
  let changed = false;
  for (const sourceId of new Set([courseId, course.legacyId].filter(Boolean).map(String))) {
    const key = `educonnect.quiz.v1.${encodeURIComponent(String(email).trim().toLowerCase())}.${encodeURIComponent(sourceId)}`;
    let records;
    try { records = JSON.parse(localStorage.getItem(key) || "[]"); }
    catch { warnings.push(`Browser quizzes for ${course.title} could not be read.`); continue; }
    if (!Array.isArray(records)) continue;
    for (const record of records) {
      if (!record?.id || record.mongoQuizId) continue;
      try {
        const existing = initial.quizzes.find(quiz => quiz.legacyId === String(record.id));
        const { quiz } = existing ? { quiz: existing } : await saveTeacherQuiz(courseId, { ...record, id: undefined, legacyId: String(record.id) });
        changed = true;
        record.mongoQuizId = String(quiz._id || quiz.id);
        localStorage.setItem(key, JSON.stringify(records));
        if (!existing && record.published) {
          try { await publishTeacherQuiz(courseId, record.mongoQuizId, true); }
          catch (error) { warnings.push(`${record.title} was saved as a draft. ${error.message}`); }
        }
      } catch (error) { warnings.push(`${record.title || "Browser quiz"} could not be transferred: ${error.message}`); }
    }
  }
  return { ...(changed ? await teacherQuizzes(courseId) : initial), warnings };
}

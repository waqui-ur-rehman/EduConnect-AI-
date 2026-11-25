const normalize = value => String(value ?? "").trim().toLowerCase();
const encoded = value => encodeURIComponent(String(value));
export const QUIZZES_EVENT = "educonnect:quizzes-updated";
export const quizCourseKey = course => `${normalize(course.teacherEmail || course.instructorEmail)}::${course.id}`;
export const publishedQuizKey = (teacher, course) => `educonnect.quiz.v1.${encoded(normalize(teacher))}.${encoded(course)}`;
export const studentAttemptKey = (email, quizId) => `educonnect.quizAttempt.v1.${encoded(normalize(email))}.${encoded(quizId)}`;
export const studentDraftKey = (email, quiz) => `educonnect.quizDraft.v1.${encoded(normalize(email))}.${encoded(normalize(quiz.teacherEmail))}.${encoded(quiz.courseId)}.${encoded(quiz.id)}`;
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } };
const readArray = key => { const value = read(key, []); return Array.isArray(value) ? value : []; };
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const emit = () => window.dispatchEvent(new Event(QUIZZES_EVENT));
export const quizSignature = quiz => JSON.stringify([quiz.questions, Number(quiz.timeLimit) || 0, Number(quiz.passingScore)]);

export function subscribeStudentQuizzes(callback) {
  [QUIZZES_EVENT, "storage", "focus"].forEach(event => window.addEventListener(event, callback));
  return () => [QUIZZES_EVENT, "storage", "focus"].forEach(event => window.removeEventListener(event, callback));
}

export function validPublishedQuiz(quiz, course) {
  return !!(quiz?.published && quiz.id && String(quiz.courseId) === String(course.id) && normalize(quiz.teacherEmail) === normalize(course.teacherEmail || course.instructorEmail) &&
    typeof quiz.title === "string" && quiz.title.trim() && Array.isArray(quiz.questions) && quiz.questions.length && quiz.questions.every(question => question &&
      typeof question.prompt === "string" && question.prompt.trim() && Array.isArray(question.options) && question.options.length === 4 &&
      question.options.every(option => typeof option === "string" && option.trim()) && [0, 1, 2, 3].includes(Number(question.correct))));
}

export function readQuizAttempts(email, quiz) {
  return readArray(studentAttemptKey(email, quiz.id)).filter(attempt => attempt && String(attempt.quizId) === String(quiz.id) &&
    normalize(attempt.studentEmail) === normalize(email) && String(attempt.courseId) === String(quiz.courseId) && normalize(attempt.teacherEmail) === normalize(quiz.teacherEmail))
    .sort((a, b) => (Date.parse(b.submittedAt) || 0) - (Date.parse(a.submittedAt) || 0));
}

export function cleanQuizAnswers(quiz, answers = {}) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) answers = {};
  const result = {};
  quiz.questions.forEach((_, index) => { if (Object.hasOwn(answers, index) && Number.isInteger(answers[index]) && answers[index] >= 0 && answers[index] < 4) result[index] = answers[index]; });
  return result;
}

export function readQuizDraft(email, quiz) {
  const draft = read(studentDraftKey(email, quiz), null);
  if (!draft || draft.signature !== quizSignature(quiz) || !draft.id || !Number.isFinite(Date.parse(draft.startedAt))) return null;
  if (readQuizAttempts(email, quiz).some(attempt => attempt.sessionId === draft.id)) return null;
  return { ...draft, answers: cleanQuizAnswers(quiz, draft.answers), questionIndex: Math.max(0, Math.min(quiz.questions.length - 1, Math.floor(Number(draft.questionIndex)) || 0)) };
}

export function makeQuizSession(email, quiz, now = new Date().toISOString()) {
  return readQuizDraft(email, quiz) || { id: uid(), signature: quizSignature(quiz), startedAt: now, answers: {}, questionIndex: 0 };
}

export function saveQuizDraft(email, quiz, session) {
  const draft = { ...session, answers: cleanQuizAnswers(quiz, session.answers), updatedAt: new Date().toISOString() };
  localStorage.setItem(studentDraftKey(email, quiz), JSON.stringify(draft));
  emit();
  return draft;
}

export function quizSecondsRemaining(quiz, session, now = Date.now()) {
  const minutes = Number(quiz.timeLimit) || 0;
  return minutes > 0 ? Math.max(0, Math.ceil((Date.parse(session.startedAt) + minutes * 60000 - now) / 1000)) : null;
}

export function scoreQuiz(quiz, answers) {
  const clean = cleanQuizAnswers(quiz, answers);
  const correct = quiz.questions.reduce((sum, question, index) => sum + (Object.hasOwn(clean, index) && clean[index] === Number(question.correct) ? 1 : 0), 0);
  const total = quiz.questions.length;
  const percentage = total ? Math.round(correct / total * 100) : 0;
  return { correct, total, percentage, passed: total > 0 && percentage >= Number(quiz.passingScore ?? 60) };
}

export function submitQuizSession(email, quiz, session, timedOut = false, now = new Date().toISOString()) {
  if (session.signature !== quizSignature(quiz)) throw new Error("This quiz has changed. Return to Course Quizzes and start the updated version.");
  const key = studentAttemptKey(email, quiz.id);
  const previous = readArray(key);
  const existing = readQuizAttempts(email, quiz).find(attempt => attempt.sessionId === session.id);
  if (existing) return { record: existing, isNew: false };
  const record = { id: uid(), sessionId: session.id, quizId: quiz.id, quizTitle: quiz.title, courseId: quiz.courseId,
    teacherEmail: quiz.teacherEmail, studentEmail: email, ...scoreQuiz(quiz, session.answers), answers: cleanQuizAnswers(quiz, session.answers),
    questions: quiz.questions, passingScore: Number(quiz.passingScore ?? 60), startedAt: session.startedAt, submittedAt: now, timedOut };
  localStorage.setItem(key, JSON.stringify([...previous, record]));
  // The submitted session id also prevents a duplicate attempt if draft cleanup fails.
  try { localStorage.removeItem(studentDraftKey(email, quiz)); } catch { /* Submission is already saved. */ }
  emit();
  return { record, isNew: true };
}

export function studentQuizLibrary(email, courses, publishedCourses = []) {
  const seen = new Set();
  return courses.flatMap(enrolled => {
    const teacher = enrolled.teacherEmail || enrolled.instructorEmail;
    if (!teacher) return [];
    const published = publishedCourses.find(course => quizCourseKey(course) === quizCourseKey(enrolled));
    const course = { ...published, ...enrolled, thumbnail: published?.thumbnail || enrolled.thumbnail, image: published?.image || enrolled.image };
    return readArray(publishedQuizKey(teacher, course.id)).filter(quiz => validPublishedQuiz(quiz, course)).flatMap(quiz => {
      const key = `${quizCourseKey(course)}::${quiz.id}`;
      if (seen.has(key)) return [];
      seen.add(key);
      const attempts = readQuizAttempts(email, quiz), latest = attempts[0] || null, draft = readQuizDraft(email, quiz);
      const status = draft ? "progress" : latest ? latest.passed ? "passed" : "failed" : "new";
      const progress = draft ? Math.round(Object.keys(draft.answers).length / quiz.questions.length * 100) : latest ? 100 : 0;
      return [{ key, quiz, course, attempts, latest, draft, status, progress }];
    });
  });
}

export function quizLibraryStats(entries) {
  const submitted = entries.filter(entry => entry.latest);
  return { total: entries.length, attempted: entries.filter(entry => entry.latest || entry.draft).length,
    passed: entries.filter(entry => entry.status === "passed").length,
    average: submitted.length ? Math.round(submitted.reduce((sum, entry) => sum + Number(entry.latest.percentage || 0), 0) / submitted.length) : null };
}

export function filterStudentQuizzes(entries, { search = "", course = "all", status = "all" } = {}) {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter(entry => {
    if (course !== "all" && quizCourseKey(entry.course) !== course) return false;
    if (status === "attempted" ? !entry.latest && !entry.draft : status === "submitted" ? !entry.latest : status !== "all" && entry.status !== status) return false;
    const text = [entry.quiz.title, entry.course.title, entry.course.category, entry.course.instructor, entry.course.instructorName].filter(Boolean).join(" ").toLowerCase();
    return words.every(word => text.includes(word));
  });
}

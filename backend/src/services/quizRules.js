export function validateQuiz(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw Error("Invalid quiz details.");
  const title = String(body.title || "").trim();
  const passingScore = Number(body.passingScore ?? 60);
  const timeLimit = Number(body.timeLimit ?? 0);
  if (title.length < 2 || title.length > 160) throw Error("Quiz title must be 2–160 characters.");
  if (!Number.isFinite(passingScore) || passingScore < 0 || passingScore > 100) throw Error("Invalid passing score.");
  if (!Number.isInteger(timeLimit) || timeLimit < 0 || timeLimit > 180) throw Error("Invalid time limit.");
  if (!Array.isArray(body.questions) || !body.questions.length || body.questions.length > 100) throw Error("Add 1–100 questions.");
  const questions = body.questions.map((q, i) => {
    const prompt = String(q?.prompt || "").trim();
    const options = Array.isArray(q?.options) ? q.options.map(o => String(o).trim()) : [];
    const correct = Number(q?.correct);
    if (!prompt || prompt.length > 2000 || options.length !== 4 || options.some(o => !o || o.length > 500) || new Set(options.map(o => o.toLowerCase())).size !== 4 || !Number.isInteger(correct) || correct < 0 || correct > 3) {
      throw Error(`Question ${i + 1}: enter a prompt, four distinct options, and the correct option.`);
    }
    return { id: String(i + 1), prompt, options, correct };
  });
  return { title, passingScore, timeLimit, questions };
}
export function publicQuiz(quiz) {
  const value = quiz.toObject ? quiz.toObject() : quiz;
  return { id: String(value._id), courseId: String(value.courseId), title: value.title, passingScore: value.passingScore, timeLimit: value.timeLimit, revision: value.revision, published: value.published,
    questions: value.questions.map(({ id, prompt, options }) => ({ id, prompt, options })) };
}
export function scoreAnswers(questions, submittedAnswers, passingScore) {
  const answers = submittedAnswers && typeof submittedAnswers === "object" && !Array.isArray(submittedAnswers) ? submittedAnswers : {};
  const clean = {};
  for (const [key, value] of Object.entries(answers)) {
    if (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= questions.length || !Number.isInteger(value) || value < 0 || value > 3) throw Error("Invalid answer selection.");
    clean[key] = value;
  }
  const correct = questions.reduce((sum, question, i) => sum + (clean[i] === question.correct ? 1 : 0), 0);
  const total = questions.length;
  const percentage = Math.round(correct / total * 100);
  return { answers: clean, correct, total, percentage, passed: percentage >= passingScore };
}
export function isReviewedCourse(course) {
  return !!(course?.published === true && course?.approvedVersion && ["approved", "published", "pending", "rejected"].includes(course?.status));
}

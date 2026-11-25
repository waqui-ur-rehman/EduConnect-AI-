import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import Course from "../models/Course.js";
import CourseQuiz from "../models/CourseQuiz.js";
import QuizAttempt from "../models/QuizAttempt.js";
import QuizSession from "../models/QuizSession.js";
import ContentAccess from "../models/ContentAccess.js";
import Student from "../models/Student.js";
import { hasAccess } from "../services/contentService.js";
import { isReviewedCourse, publicQuiz, scoreAnswers, validateQuiz } from "../services/quizRules.js";
const idOk = value => mongoose.isValidObjectId(value);
const fail = (res, code, message) => res.status(code).json({ success: false, message });
async function courseForTeacher(req, res) {
  if (!idOk(req.params.courseId)) { fail(res, 400, "Invalid course ID."); return null; }
  const course = await Course.findById(req.params.courseId);
  if (!course || course.status === "deleted") { fail(res, 404, "Course not found."); return null; }
  if (String(course.teacherId) !== String(req.user._id)) { fail(res, 403, "Only this course's teacher can manage its quizzes."); return null; }
  return course;
}
async function courseForStudent(req, res) {
  if (!idOk(req.params.courseId)) { fail(res, 400, "Invalid course ID."); return null; }
  const course = await Course.findById(req.params.courseId);
  if (!isReviewedCourse(course)) { fail(res, 404, "Course not available."); return null; }
  if (!await hasAccess(req.user, "course", course._id)) { fail(res, 403, "Enroll in this course to access quizzes."); return null; }
  return course;
}
export async function teacherList(req, res, next) {
  try { if (!await courseForTeacher(req, res)) return;
    const quizzes = await CourseQuiz.find({ courseId: req.params.courseId, teacherId: req.user._id }).sort({ updatedAt: -1 }).lean();
    const [attempts, accesses] = await Promise.all([
      QuizAttempt.find({ courseId: req.params.courseId, quizId: { $in: quizzes.map(q => q._id) } }).sort({ submittedAt: 1 }).lean(),
      ContentAccess.find({ kind: "course", contentId: req.params.courseId }).select("studentId").lean(),
    ]);
    const students = await Student.find({ _id: { $in: [...accesses, ...attempts].map(row => row.studentId) } }).select("email fullName").lean();
    const identities = new Map(students.map(student => [String(student._id), student]));
    res.json({ success: true, quizzes: quizzes.map(q => ({ ...q, id: String(q._id) })),
      students: accesses.map(access => { const student = identities.get(String(access.studentId)); return { id: String(access.studentId), email: student?.email || String(access.studentId), name: student?.fullName || "Student" }; }),
      attempts: attempts.map(attempt => ({ id: String(attempt._id), quizId: String(attempt.quizId), courseId: String(attempt.courseId), studentEmail: identities.get(String(attempt.studentId))?.email || String(attempt.studentId), studentName: identities.get(String(attempt.studentId))?.fullName || "Student", percentage: attempt.percentage, passed: attempt.passed, correct: attempt.correct, total: attempt.total, submittedAt: attempt.submittedAt })),
    });
  } catch(e) { next(e); }
}
export async function teacherSave(req, res, next) {
  try {
    if (!await courseForTeacher(req, res)) return;
    let fields; try { fields = validateQuiz(req.body); } catch(e) { return fail(res, 400, e.message); }
    const existing = req.params.quizId ? await CourseQuiz.findOne({ _id: idOk(req.params.quizId) ? req.params.quizId : null, courseId: req.params.courseId, teacherId: req.user._id }) : null;
    if (req.params.quizId && !existing) return fail(res, 404, "Quiz not found.");
    if (existing) {
      // Updating quiz invalidates publication; no unreviewed update reaches students.
      const expected = Number(req.body.revision);
      if (!Number.isInteger(expected) || existing.revision !== expected) return fail(res, 409, "Quiz changed. Refresh and retry.");
      const updated = await CourseQuiz.findOneAndUpdate({ _id: existing._id, revision: expected }, { $set: { ...fields, published: false }, $inc: { revision: 1 } }, { returnDocument: "after", runValidators: true });
      if (!updated) return fail(res, 409, "Quiz changed. Refresh and retry.");
      return res.json({ success: true, quiz: updated });
    }
    const legacyId = req.body.legacyId;
    if (legacyId !== undefined && (typeof legacyId !== "string" || !legacyId.trim() || legacyId.length > 100)) return fail(res, 400, "Invalid browser quiz ID.");
    const identity = { teacherId: req.user._id, courseId: req.params.courseId, legacyId };
    if (legacyId) {
      const imported = await CourseQuiz.findOne(identity);
      if (imported) return res.json({ success: true, quiz: imported });
    }
    let quiz;
    try {
      quiz = await CourseQuiz.create({ ...fields, teacherId: req.user._id, courseId: req.params.courseId, published: false, ...(legacyId ? { legacyId } : {}) });
    } catch (error) {
      if (error.code !== 11000 || !legacyId) throw error;
      quiz = await CourseQuiz.findOne(identity);
      if (!quiz) throw error;
    }
    res.status(201).json({ success: true, quiz });
  } catch(e) { next(e); }
}
export async function teacherPublish(req, res, next) {
  try {
    const course = await courseForTeacher(req, res); if (!course) return;
    if (!idOk(req.params.quizId)) return fail(res, 400, "Invalid quiz ID.");
    const publish = req.body.published === true;
    if (publish && !isReviewedCourse(course)) return fail(res, 409, "Course must have an approved published version first.");
    const quiz = await CourseQuiz.findOneAndUpdate({ _id: req.params.quizId, courseId: course._id, teacherId: req.user._id }, { $set: { published: publish } }, { returnDocument: "after" });
    if (!quiz) return fail(res, 404, "Quiz not found.");
    res.json({ success: true, quiz });
  } catch(e) { next(e); }
}
export async function teacherDelete(req, res, next) {
  try { if (!await courseForTeacher(req, res)) return;
    const quiz = await CourseQuiz.findOneAndDelete({ _id: idOk(req.params.quizId) ? req.params.quizId : null, courseId: req.params.courseId, teacherId: req.user._id });
    if (!quiz) return fail(res, 404, "Quiz not found.");
    // Preserve attempts for reporting/audit; inaccessible via student quiz list once removed.
    res.json({ success: true });
  } catch(e) { next(e); }
}
export async function studentList(req, res, next) {
  try { if (!await courseForStudent(req, res)) return;
    const quizzes = await CourseQuiz.find({ courseId: req.params.courseId, published: true }).sort({ createdAt: 1 }).lean();
    const ids = quizzes.map(q => q._id);
    const attempts = await QuizAttempt.find({ studentId: req.user._id, quizId: { $in: ids } }).sort({ submittedAt: -1 }).lean();
    res.json({ success: true, quizzes: quizzes.map(q => ({ ...publicQuiz(q), attempts: attempts.filter(a => String(a.quizId) === String(q._id)).map(a => ({ id: String(a._id), quizId: String(a.quizId), percentage: a.percentage, correct: a.correct, total: a.total, passed: a.passed, submittedAt: a.submittedAt })) })) });
  } catch(e) { next(e); }
}
export async function studentStart(req, res, next) {
  try {
    if (!await courseForStudent(req, res)) return;
    if (!idOk(req.params.quizId)) return fail(res, 400, "Invalid quiz ID.");
    const quiz = await CourseQuiz.findOne({ _id: req.params.quizId, courseId: req.params.courseId, published: true });
    if (!quiz) return fail(res, 404, "Quiz unavailable.");
    const sessionId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (quiz.timeLimit > 0 ? quiz.timeLimit * 60000 : 24 * 60 * 60000));
    const session = await QuizSession.create({ quizId: quiz._id, courseId: quiz.courseId, studentId: req.user._id, sessionId, revision: quiz.revision, startedAt: now, expiresAt });
    res.status(201).json({ success: true, sessionId, revision: session.revision, startedAt: session.startedAt, expiresAt: session.expiresAt, timeLimit: quiz.timeLimit });
  } catch(e) { next(e); }
}
export async function studentSubmit(req, res, next) {
  try {
    if (!await courseForStudent(req, res)) return;
    if (!idOk(req.params.quizId)) return fail(res, 400, "Invalid quiz ID.");
    const quiz = await CourseQuiz.findOne({ _id: req.params.quizId, courseId: req.params.courseId, published: true });
    if (!quiz) return fail(res, 404, "Quiz unavailable.");
    const sessionId = req.body.sessionId;
    if (typeof sessionId !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(sessionId)) return fail(res, 400, "Invalid attempt ID.");
    if (Number(req.body.revision) !== quiz.revision) return fail(res, 409, "Quiz has changed. Reload before submitting.");
    const previous = await QuizAttempt.findOne({ quizId: quiz._id, studentId: req.user._id, sessionId });
    if (previous) return res.json({ success: true, attempt: { id: String(previous._id), correct: previous.correct, total: previous.total, percentage: previous.percentage, passed: previous.passed, submittedAt: previous.submittedAt } });
    const session = await QuizSession.findOne({ quizId: quiz._id, studentId: req.user._id, sessionId, revision: quiz.revision });
    if (!session) return fail(res, 403, "Start a new quiz attempt first.");
    if (Date.now() > session.expiresAt.getTime() + 5000) return fail(res, 409, "Time expired. Start a new attempt.");
    let result; try { result = scoreAnswers(quiz.questions, req.body.answers, quiz.passingScore); } catch(e) { return fail(res, 400, e.message); }
    try {
      const attempt = await QuizAttempt.create({ ...result, quizId: quiz._id, courseId: quiz.courseId, studentId: req.user._id, sessionId, quizRevision: quiz.revision });
      res.status(201).json({ success: true, attempt: { id: String(attempt._id), ...result, submittedAt: attempt.submittedAt, correctAnswers: quiz.questions.map(q => q.correct) } });
    } catch (e) {
      if (e.code !== 11000) throw e;
      const attempt = await QuizAttempt.findOne({ quizId: quiz._id, studentId: req.user._id, sessionId });
      res.json({ success: true, attempt: { id: String(attempt._id), correct: attempt.correct, total: attempt.total, percentage: attempt.percentage, passed: attempt.passed, submittedAt: attempt.submittedAt } });
    }
  } catch(e) { next(e); }
}

import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import Course from "../models/Course.js";
import CourseQuiz from "../models/CourseQuiz.js";
import QuizAttempt from "../models/QuizAttempt.js";
import Assignment from "../models/Assignment.js";
import AssignmentSubmission from "../models/AssignmentSubmission.js";
import Student from "../models/Student.js";
import ContentAccess from "../models/ContentAccess.js";
import LessonProgress from "../models/LessonProgress.js";
import CourseReview from "../models/CourseReview.js";
import CourseCertificate from "../models/CourseCertificate.js";
import { hasAccess } from "../services/contentService.js";

const visible = { published: true, approvedVersion: { $ne: null }, status: { $ne: "deleted" } };
const idOk = (value) => mongoose.isValidObjectId(value);
const fail = (res, code, message, extra = {}) => res.status(code).json({ success: false, message, ...extra });
const handle = (action) => async (req, res, next) => {
  try { await action(req, res); }
  catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, message: "Invalid fields or values.", issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })) });
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
};

async function reviewedCourse(courseId) {
  if (!idOk(courseId)) return null;
  return Course.findOne({ _id: courseId, ...visible });
}
const approvedLessons = (course) => (Array.isArray(course?.approvedVersion?.lessons) ? course.approvedVersion.lessons : []);
const courseTitle = (course) => course?.approvedVersion?.title || course?.title || "Course";

async function progressFor(course, studentId) {
  const lessons = approvedLessons(course);
  const ids = [...new Set(lessons.map((lesson) => String(lesson.id)))];
  const records = ids.length
    ? await LessonProgress.find({ studentId, courseId: course._id, lessonId: { $in: ids } }).select("lessonId completedAt").lean()
    : [];
  const completed = new Set(records.map((record) => record.lessonId));
  const total = ids.length;
  const done = completed.size;
  const completions = records.map((record) => new Date(record.completedAt).getTime());
  return {
    courseId: String(course._id),
    lessons: total,
    completedLessons: done,
    completedLessonIds: [...completed],
    progress: total ? Math.round((done / total) * 100) : 0,
    completedAt: done === total && records.length ? new Date(Math.max(...completions)) : null,
  };
}

export const myProgress = handle(async (req, res) => {
  const accessFilter = { studentId: req.user._id, kind: "course" };
  if (process.env.NODE_ENV === "production") accessFilter.source = { $ne: "demo" };
  const accesses = await ContentAccess.find(accessFilter).select("contentId").lean();
  const ids = accesses.map((entry) => entry.contentId);
  const courses = ids.length ? await Course.find({ _id: { $in: ids }, ...visible }) : [];
  const progress = await Promise.all(courses.map((course) => progressFor(course, req.user._id)));
  res.json({ success: true, courses: progress });
});

export const setLessonProgress = handle(async (req, res) => {
  const { courseId, lessonId, completed } = z.object({
    courseId: z.string().refine(idOk, "Invalid course ID."),
    lessonId: z.string().trim().min(1).max(160),
    completed: z.boolean(),
  }).strict().parse(req.body);
  const course = await reviewedCourse(courseId);
  if (!course) return fail(res, 404, "Course not available.");
  if (!await hasAccess(req.user, "course", course._id)) return fail(res, 403, "Enroll in this course before tracking progress.");
  if (!approvedLessons(course).some((lesson) => String(lesson.id) === lessonId)) {
    return fail(res, 400, "Lesson is not part of the approved curriculum.");
  }
  if (completed) {
    await LessonProgress.findOneAndUpdate(
      { studentId: req.user._id, courseId: course._id, lessonId },
      { $setOnInsert: { studentId: req.user._id, courseId: course._id, lessonId } },
      { upsert: true }
    ).catch((error) => { if (error.code !== 11000) throw error; });
  } else {
    await LessonProgress.deleteOne({ studentId: req.user._id, courseId: course._id, lessonId });
  }
  res.json({ success: true, progress: await progressFor(course, req.user._id) });
});

const ratingSummary = (rows) => {
  const count = rows.length;
  const average = count ? Math.round((rows.reduce((sum, row) => sum + row.rating, 0) / count) * 10) / 10 : null;
  return { average, count };
};
const studentNames = async (studentIds) => {
  const students = await Student.find({ _id: { $in: studentIds } }).select("fullName").lean();
  return new Map(students.map((student) => [String(student._id), student.fullName || "Student"]));
};
const presentReview = (review, names, course) => ({
  id: String(review._id),
  courseId: String(review.courseId),
  rating: review.rating,
  comment: review.comment,
  moderated: Boolean(review.moderated),
  studentName: names.get(String(review.studentId)) || "Student",
  ...(course ? { courseTitle: courseTitle(course), teacherId: String(course.teacherId) } : {}),
  createdAt: review.createdAt,
  updatedAt: review.updatedAt,
});

export const courseReviews = handle(async (req, res) => {
  const course = await reviewedCourse(req.params.courseId);
  if (!course) return fail(res, 404, "Course not available.");
  const rows = await CourseReview.find({ courseId: course._id, moderated: false }).sort({ createdAt: -1 }).lean();
  const names = await studentNames([...new Set(rows.map((row) => row.studentId))]);
  res.json({ success: true,
    summary: ratingSummary(rows),
    reviews: rows.map((row) => presentReview(row, names, course)) });
});

export const teacherSummary = handle(async (req, res) => {
  if (!idOk(req.params.teacherId)) return fail(res, 400, "Invalid teacher ID.");
  const courses = await Course.find({ teacherId: req.params.teacherId, ...visible }).select("_id").lean();
  const rows = courses.length ? await CourseReview.find({ courseId: { $in: courses.map((course) => course._id) }, moderated: false }).select("rating").lean() : [];
  res.json({ success: true, summary: ratingSummary(rows) });
});

export const myReviews = handle(async (req, res) => {
  const rows = await CourseReview.find({ studentId: req.user._id }).sort({ updatedAt: -1 }).lean();
  const courses = await Course.find({ _id: { $in: rows.map((row) => row.courseId) } }).select("approvedVersion title teacherId").lean();
  const byId = new Map(courses.map((course) => [String(course._id), course]));
  res.json({ success: true, reviews: rows.map((row) => presentReview(row, new Map([[String(req.user._id), req.user.fullName || "Student"]]), byId.get(String(row.courseId)))) });
});

export const teacherReviews = handle(async (req, res) => {
  const courses = await Course.find({ teacherId: req.user._id, ...visible }).select("approvedVersion title teacherId").lean();
  const rows = courses.length ? await CourseReview.find({ courseId: { $in: courses.map((course) => course._id) } }).sort({ createdAt: -1 }).lean() : [];
  const names = await studentNames([...new Set(rows.map((row) => row.studentId))]);
  const byId = new Map(courses.map((course) => [String(course._id), course]));
  res.json({ success: true, reviews: rows.map((row) => presentReview(row, names, byId.get(String(row.courseId)))) });
});

export const saveReview = handle(async (req, res) => {
  const { courseId, rating, comment } = z.object({
    courseId: z.string().refine(idOk, "Invalid course ID."),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().min(3).max(1000),
  }).strict().parse(req.body);
  const course = await reviewedCourse(courseId);
  if (!course) return fail(res, 404, "Course not available.");
  if (!await hasAccess(req.user, "course", course._id)) return fail(res, 403, "Enroll in this course before writing a review.");
  const review = await CourseReview.findOneAndUpdate(
    { courseId: course._id, studentId: req.user._id },
    { $set: { rating, comment }, $setOnInsert: { courseId: course._id, studentId: req.user._id } },
    { upsert: true, returnDocument: "after", runValidators: true }
  ).catch((error) => { if (error.code === 11000) return CourseReview.findOne({ courseId: course._id, studentId: req.user._id }); throw error; });
  const names = new Map([[String(req.user._id), req.user.fullName || "Student"]]);
  res.json({ success: true, review: presentReview(review, names, course) });
});

export const deleteMyReview = handle(async (req, res) => {
  if (!idOk(req.params.courseId)) return fail(res, 400, "Invalid course ID.");
  await CourseReview.deleteOne({ courseId: req.params.courseId, studentId: req.user._id });
  res.json({ success: true, message: "Your review has been deleted." });
});

export const moderateReview = handle(async (req, res) => {
  const { moderated } = z.object({ moderated: z.boolean() }).strict().parse(req.body);
  if (!idOk(req.params.id)) return fail(res, 400, "Invalid review ID.");
  const review = await CourseReview.findByIdAndUpdate(req.params.id, { $set: { moderated } }, { returnDocument: "after" });
  if (!review) return fail(res, 404, "Review not found.");
  res.json({ success: true, id: String(review._id), moderated: review.moderated });
});

const certificatePayload = (cert) => ({
  certificateId: cert.certificateId,
  courseId: String(cert.courseId),
  courseTitle: cert.courseTitle,
  studentName: cert.studentName,
  completedAt: cert.completedAt,
  issuedAt: cert.issuedAt,
});

export const myCertificates = handle(async (req, res) => {
  const rows = await CourseCertificate.find({ studentId: req.user._id }).sort({ issuedAt: -1 }).lean();
  res.json({ success: true, certificates: rows.map(certificatePayload) });
});

export const verifyCertificate = handle(async (req, res) => {
  const certificateId = String(req.params.certificateId || "").trim().toUpperCase();
  if (!/^EDC-[A-F0-9]{12}$/.test(certificateId)) return fail(res, 404, "Certificate not found.");
  const cert = await CourseCertificate.findOne({ certificateId }).lean();
  if (!cert) return fail(res, 404, "Certificate not found.");
  res.json({ success: true, valid: true, certificate: certificatePayload(cert) });
});

async function assessmentCriteria(course, studentId) {
  const missing = [];
  const links = Array.isArray(course?.approvedVersion?.metadata?.curriculum?.links)
    ? course.approvedVersion.metadata.curriculum.links : [];
  for (const link of links) {
    if (link?.type === "quiz") {
      const quiz = await CourseQuiz.findOne({ courseId: course._id,
        $or: [...(idOk(link.id) ? [{ _id: link.id }] : []), { legacyId: String(link.id) }] }).select("_id").lean();
      if (quiz) {
        const passed = await QuizAttempt.exists({ courseId: course._id, quizId: quiz._id, studentId, passed: true });
        if (!passed) missing.push("quiz");
      }
    } else if (link?.type === "assignment") {
      const assignment = await Assignment.findOne({ courseId: course._id,
        $or: [...(idOk(link.id) ? [{ _id: link.id }] : []), { legacyId: String(link.id) }] }).select("_id").lean();
      if (assignment) {
        const submitted = await AssignmentSubmission.exists({ assignmentId: assignment._id, studentId });
        if (!submitted) missing.push("assignment");
      }
    }
  }
  return missing;
}

export const issueCertificate = handle(async (req, res) => {
  const { courseId } = z.object({ courseId: z.string().refine(idOk, "Invalid course ID.") }).strict().parse(req.body);
  const course = await reviewedCourse(courseId);
  if (!course) return fail(res, 404, "Course not available.");
  if (!await hasAccess(req.user, "course", course._id)) return fail(res, 403, "Enroll in this course before claiming a certificate.");
  const existing = await CourseCertificate.findOne({ studentId: req.user._id, courseId: course._id }).lean();
  if (existing) return res.json({ success: true, certificate: certificatePayload(existing), alreadyIssued: true });
  const progress = await progressFor(course, req.user._id);
  if (progress.progress < 100) {
    return fail(res, 409, "Complete all approved lessons before claiming a certificate.", { missing: ["lessons"], progress: progress.progress });
  }
  const missing = await assessmentCriteria(course, req.user._id);
  if (missing.length) return fail(res, 409, "Complete the remaining required course work before claiming a certificate.", { missing: [...new Set(missing)] });
  const completedAt = progress.completedAt || new Date();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const cert = await CourseCertificate.create({
        certificateId: `EDC-${randomBytes(6).toString("hex").toUpperCase()}`,
        studentId: req.user._id,
        courseId: course._id,
        courseTitle: courseTitle(course),
        studentName: req.user.fullName || "Student",
        completedAt,
      });
      return res.status(201).json({ success: true, certificate: certificatePayload(cert) });
    } catch (error) {
      if (error.code !== 11000) throw error;
      if (error.keyPattern?.studentId || error.keyValue?.studentId) {
        const dup = await CourseCertificate.findOne({ studentId: req.user._id, courseId: course._id }).lean();
        if (dup) return res.json({ success: true, certificate: certificatePayload(dup), alreadyIssued: true });
      }
      if (attempt === 2) throw error;
    }
  }
});

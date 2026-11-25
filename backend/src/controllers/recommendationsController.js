import mongoose from "mongoose";
import Course from "../models/Course.js";
import OwnedTeacherBook from "../models/TeacherBook.js";
import LessonProgress from "../models/LessonProgress.js";
import CourseQuiz from "../models/CourseQuiz.js";
import QuizAttempt from "../models/QuizAttempt.js";
import ContentAccess from "../models/ContentAccess.js";
import CourseReview from "../models/CourseReview.js";
import Teacher from "../models/Teacher.js";
import Student from "../models/Student.js";

const FAIL = (res, code, message) => res.status(code).json({ success: false, message });
const handle = (action) => async (req, res, next) => {
  try { await action(req, res); }
  catch (error) {
    if (error instanceof mongoose.CastError) return FAIL(res, 400, "Invalid identifier.");
    if (error.status >= 400 && error.status < 500) return FAIL(res, error.status, error.message);
    next(error);
  }
};

// ---- server-side text utilities (deterministic, no LLM) --------------------
const normalize = (value) => String(value ?? "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

const containsPhrase = (haystack, needle) => {
  const text = normalize(haystack);
  const phrase = normalize(needle);
  return Boolean(phrase && ` ${text} `.includes(` ${phrase} `));
};

const parseList = (value) => {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const seen = new Set();
  return list.filter((item) => {
    const text = normalize(item);
    if (!text || seen.has(text)) return false;
    seen.add(text);
    return true;
  });
};

const PERSONAL_CATEGORIES = ["development", "computer science", "information technology", "software engineering",
  "web development", "artificial intelligence", "data science", "machine learning", "cyber security",
  "programming", "programming languages", "software development", "cloud computing", "networking",
  "mobile app development", "database management", "graphic design", "ui/ux design", "digital marketing",
  "business", "marketing", "finance", "accounting", "economics", "entrepreneurship", "education", "law"];

const courseIdText = (course) => `${String(course._id)}::${String(course.teacherId)}`;

function courseMetadata(course) {
  return (course.approvedVersion && typeof course.approvedVersion.metadata === "object" && course.approvedVersion.metadata) || {};
}

function courseProfileFields(course) {
  const meta = courseMetadata(course);
  return {
    title: String(course.approvedVersion?.title || course.title || ""),
    description: String(course.approvedVersion?.description || course.description || ""),
    category: String(course.category || meta.category || course.metadata?.category || ""),
    subjects: [...parseList([course.subjects, course.subject, course.specialization, course.tags, meta.subjects, meta.tags, course.metadata?.subjects, course.metadata?.tags].flat().filter(Boolean))],
    programs: parseList([course.program, course.programs, meta.program, meta.programs, course.metadata?.program].flat().filter(Boolean)),
    instructorExpertise: String(course.instructorProfile?.expertise || course.instructorProfile?.qualification || meta.expertise || ""),
    lessons: Array.isArray(course.approvedVersion?.lessons) ? course.approvedVersion.lessons : [],
  };
}

function courseSearchText(course) {
  const fields = courseProfileFields(course);
  return [fields.title, fields.description, fields.category, ...fields.subjects, ...fields.programs, fields.instructorExpertise].join(" ");
}

// ---- progress / quiz / access data ---------------------------------------
async function loadContext(studentId, courses) {
  const progressRecords = await LessonProgress.find({ studentId, courseId: { $in: courses.map((course) => course._id) } }).select("courseId").lean();
  const completed = new Set();
  const progress = new Map();
  for (const record of progressRecords) {
    if (progress.has(String(record.courseId))) progress.get(String(record.courseId)).push(record.lessonId);
    else progress.set(String(record.courseId), [record.lessonId]);
  }
  const accesses = await ContentAccess.find({ studentId, kind: "course", contentId: { $in: courses.map((course) => course._id) } }).select("_id contentId source createdAt").lean();
  const purchases = new Set(accesses.map((access) => String(access.contentId)));
  const quizzes = await CourseQuiz.find({ courseId: { $in: courses.map((course) => course._id) }, published: true }).select("_id courseId").lean();
  const attempts = await QuizAttempt.find({ studentId, courseId: { $in: courses.map((course) => course._id) } }).select("_id quizId percentage passed submittedAt").lean();
  const byQuiz = new Map();
  for (const attempt of attempts) byQuiz.set(String(attempt.quizId), attempt);
  const reviewAggs = await CourseReview.aggregate([
    { $match: { courseId: { $in: courses.map((course) => course._id) }, moderated: false } },
    { $group: { _id: "$courseId", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const ratings = new Map(reviewAggs.map((row) => [String(row._id), { average: row.avg, count: row.count }]));
  const enrollmentCounts = await ContentAccess.aggregate([
    { $match: { kind: "course", contentId: { $in: courses.map((course) => course._id) } } },
    { $group: { _id: "$contentId", count: { $sum: 1 } } },
  ]);
  const enrollmentByCourse = new Map(enrollmentCounts.map((row) => [String(row._id), row.count]));
  return { completed, progress, purchases, enrollmentByCourse, ratings, quizzes, byQuiz };
}

function courseMetrics(course, context) {
  const lessons = courseProfileFields(course).lessons;
  const lessonIds = lessons.map((lesson) => String(lesson.id));
  const completedIds = new Set(context.progress.get(String(course._id)) || []);
  const progress = lessons.length ? Math.round((completedIds.size / lessons.length) * 100) : 0;
  const quizAttempts = context.quizzes.filter((quiz) => String(quiz.courseId) === String(course._id)).map((quiz) => context.byQuiz.get(String(quiz._id))).filter(Boolean);
  const passedCount = quizAttempts.filter((attempt) => attempt.passed).length;
  const avgQuiz = quizAttempts.length ? Math.round((quizAttempts.reduce((sum, attempt) => sum + Number(attempt.percentage || 0), 0) / quizAttempts.length) * 10) / 10 : null;
  const rating = context.ratings.get(String(course._id)) || null;
  const enrollmentCount = context.enrollmentByCourse.get(String(course._id)) || 0;
  return {
    lessons: lessons.length,
    completedLessons: completedIds.size,
    progress,
    progressIds: completedIds.size,
    quizAttempts: quizAttempts.length,
    passedQuizzes: passedCount,
    avgQuizPercentage: avgQuiz,
    averageRating: rating ? Number(rating.average || 0) : 0,
    ratingCount: rating ? Number(rating.count || 0) : 0,
    enrollmentCount,
    purchased: context.purchases.has(String(course._id)),
    completed: lessons.length > 0 && completedIds.size >= lessons.length,
    inProgress: progress > 0 && progress < 100,
  };
}

function reasonFor(course, profile, metrics, index) {
  const text = courseSearchText(course);
  const normalizedProfile = parseList([...(profile.interests || []), ...(profile.learningGoals || [])]);
  const matches = normalizedProfile.filter((item) => containsPhrase(text, item));
  if (metrics.inProgress) return `Continue your unfinished course: ${String(course.approvedVersion?.title || course.title || "")}`;
  if (matches.length) return `Similar to your interests: ${String(course.approvedVersion?.title || course.title || "")}`;
  if (metrics.enrollmentCount >= 3 || metrics.avgQuizPercentage > 0) return `Popular in ${String(courseProfileFields(course).category || "Your Area")}`;
  if (metrics.averageRating > 0) return `Top rated by other students`;
  return `Recommended course ${index + 1}`;
}

function scoreCourse(course, profile, metrics) {
  const text = courseSearchText(course);
  const normalizedInterests = parseList((profile.interests || []).map((item) => item.trim()));
  const normalizedGoals = parseList((profile.learningGoals || []).map((item) => item.trim()));
  const searchable = ` ${text} `;
  let score = 0;
  for (const interest of normalizedInterests) {
    if (containsPhrase(text, interest)) score += 8;
    else if (containsPhrase(searchable, interest) === false) score += 1;
  }
  for (const goal of normalizedGoals) {
    if (containsPhrase(text, goal)) score += 6;
  }
  const categoryText = normalize(courseProfileFields(course).category);
  if (categoryText && PERSONAL_CATEGORIES.includes(categoryText) && !normalizedInterests.length && !normalizedGoals.length) score += 3;
  score += Math.min(8, metrics.enrollmentCount * 0.5);
  if (metrics.averageRating > 0) score += Math.min(6, metrics.averageRating * 1.2);
  if (metrics.inProgress) score += 6;
  return score;
}

const SORT_FIELDS = { title: -1, progress: -1, enrollmentCount: -1 };

// ---- the endpoint --------------------------------------------------------
export const getStudentRecommendations = handle(async (req, res) => {
  const student = await Student.findById(req.user._id).select("interests learningGoals fullName").lean();
  const profile = { interests: student?.interests || [], learningGoals: student?.learningGoals || [] };
  const [publishedCourses, teacherReviewRows] = await Promise.all([
    Course.find({ status: { $ne: "deleted" }, published: true, approvedVersion: { $ne: null } }).sort({ createdAt: -1 }).lean(),
    CourseReview.aggregate([
      { $match: { moderated: false, courseId: { $ne: null } } },
      { $group: { _id: "$courseId", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]),
  ]);
  const context = await loadContext(req.user._id, publishedCourses);
  const teacherRatings = new Map();
  const teacherNames = new Map();
  for (const row of teacherReviewRows) teacherRatings.set(String(row._id), { average: row.avg, count: row.count });
  for (const course of publishedCourses) {
    teacherNames.set(String(course.teacherId), course.teacherName || course.instructorName || "");
  }
  const teacherIds = new Set(publishedCourses.map((course) => String(course.teacherId)));
  const teacherRecords = await Teacher.find({ _id: { $in: [...teacherIds].map((id) => new mongoose.Types.ObjectId(id)) } }).select("fullName email").lean();
  for (const teacher of teacherRecords) teacherNames.set(String(teacher._id), teacher.fullName || teacher.email || "");

  const metricsByCourse = new Map(publishedCourses.map((course) => {
    const metrics = courseMetrics(course, context);
    return [String(course._id), metrics];
  }));

  const notEnrolled = publishedCourses
    .filter((course) => !context.purchases.has(String(course._id)) && !context.progress.has(String(course._id)))
    .sort((first, second) => scoreCourse(second, profile, metricsByCourse.get(String(second._id)) || courseMetrics(second, context)) - scoreCourse(first, profile, metricsByCourse.get(String(first._id)) || courseMetrics(first, context)))
    .slice(0, 12);

  const recommended = [];
  for (const course of notEnrolled) {
    const metrics = metricsByCourse.get(String(course._id));
    const score = scoreCourse(course, profile, metrics);
    recommended.push({
      id: String(course._id),
      title: String(course.approvedVersion?.title || course.title || ""),
      teacherName: teacherNames.get(String(course.teacherId)) || "",
      teacherEmail: String(course.teacherEmail || ""),
      category: String(course.category || ""),
      price: Number(course.approvedVersion?.metadata?.price || 0),
      free: !Number(course.approvedVersion?.metadata?.price || 0),
      averageRating: metrics.averageRating,
      score,
      reason: reasonFor(course, profile, metrics, recommended.length),
    });
  }

  const continueCourses = publishedCourses
    .filter((course) => context.progress.has(String(course._id)))
    .map((course) => ({
      id: String(course._id),
      title: String(course.approvedVersion?.title || course.title || ""),
      teacherName: teacherNames.get(String(course.teacherId)) || "",
      category: String(course.category || ""),
      progress: metricsByCourse.get(String(course._id)).progress,
    }))
    .sort((first, second) => second.progress - first.progress);

  const similarToCompleted = new Map();
  for (const course of publishedCourses) {
    if (metricsByCourse.get(String(course._id)).completed) {
      for (const other of publishedCourses) {
        if (other._id.toString() === course._id.toString()) continue;
        const otherMetrics = metricsByCourse.get(String(other._id));
        if (otherMetrics.purchased || otherMetrics.completed) continue;
        const sameCategory = normalize(courseProfileFields(course).category) && normalize(courseProfileFields(course).category) === normalize(courseProfileFields(other).category);
        const sharedSubjects = parseList(courseProfileFields(course).subjects.concat(courseProfileFields(other).subjects).filter(Boolean))
          .filter((item) => containsPhrase(courseProfileFields(other).searchText || courseSearchText(other), item));
        if (sameCategory || sharedSubjects.length >= 2) similarToCompleted.set(courseIdText(other), other);
      }
    }
  }

  const books = await OwnedTeacherBook.find({ status: "published", published: true, approvedVersion: { $ne: null } }).sort({ createdAt: -1 }).lean();
  const profileText = normalize([...(profile.interests || []), ...(profile.learningGoals || []), ...(student?.interests || []), ...(student?.learningGoals || [])].join(" "));
  const recommendedBooks = books
    .map((book) => {
      const fields = {
        title: String(book.approvedVersion?.title || book.title || ""),
        category: String(book.metadata?.category || book.approvedVersion?.metadata?.category || ""),
        subjects: parseList([book.metadata?.subjects, book.approvedVersion?.metadata?.subjects].flat().filter(Boolean)),
        tags: parseList([book.metadata?.tags, book.approvedVersion?.metadata?.tags].flat().filter(Boolean)),
        authors: String(book.approvedVersion?.metadata?.authors || ""),
      };
      const haystack = ` ${[fields.title, fields.category, ...fields.subjects, ...fields.tags, fields.authors].join(" ")} `;
      const matched = profileText && haystack.toLowerCase().includes(` ${profileText} `) ? profileText : null;
      const matchScore = matched ? haystack.length : 0;
      const isNotPurchased = !context.purchases.has(String(book._id));
      return { book, matchScore, isNotPurchased, fields };
    })
    .filter(({ book, matchScore, isNotPurchased }) => isNotPurchased && matchScore > 0)
    .sort((first, second) => second.matchScore - first.matchScore)
    .slice(0, 6)
    .map(({ book, fields }) => ({
      id: String(book._id),
      title: fields.title,
      teacherName: String(book.teacherEmail || ""),
      category: fields.category,
      price: Number(book.approvedVersion?.metadata?.price || 0),
    }));

  // Learning paths: group the best recommendations by primary category.
  const paths = [];
  const byCategory = new Map();
  for (const item of recommended) {
    const category = normalize(item.category) || normalize(courseProfileFields({ approvedVersion: { metadata: {} } }).category);
    if (!category) continue;
    const bucket = byCategory.get(category) || { category, courses: [] };
    bucket.courses.push(item);
    byCategory.set(category, bucket);
  }
  for (const bucket of [...byCategory.values()].sort((first, second) => second.courses.length - first.courses.length).slice(0, 3)) {
    if (bucket.courses.length) {
      paths.push({
        id: `path-${bucket.category.replaceAll(" ", "-")}`,
        category: bucket.category,
        courses: bucket.courses.slice(0, 6),
        reason: `Follow this ${bucket.category} path.`,
      });
    }
  }

  // Related instructors of recommended courses.
  const recommendedCourseIds = new Set(recommended.map((item) => String(item.id)));
  const relatedInstructors = [];
  for (const course of publishedCourses) {
    if (!recommendedCourseIds.has(String(course._id)) && !context.purchases.has(String(course._id)) && !context.progress.has(String(course._id))) continue;
    const rating = teacherRatings.get(String(course._id));
    if (!rating) continue;
    const email = String(course.teacherEmail || "").trim().toLowerCase();
    const name = teacherNames.get(String(course.teacherId)) || email.split("@")[0] || "";
    if (relatedInstructors.some((row) => row.email === email)) continue;
    relatedInstructors.push({ name, email, rating: rating.average, courseCount: 1, reasons: ["Related to your recommended courses"] });
  }
  relatedInstructors.sort((first, second) => second.rating - first.rating || second.courseCount - first.courseCount);

  res.json({
    success: true,
    recommendations: recommended,
    continueLearning: continueCourses,
    similarCourses: Object.values(similarToCompleted).map((course) => ({
      id: String(course._id),
      title: String(course.approvedVersion?.title || course.title || ""),
      teacherName: teacherNames.get(String(course.teacherId)) || "",
      category: String(course.category || ""),
      reason: "Similar to your completed or in-progress courses.",
    })).slice(0, 8),
    learningPaths: paths,
    recommendedBooks: recommendedBooks,
    relatedInstructors: relatedInstructors.slice(0, 6),
    profileMatches: parseList([...(profile.interests || []), ...(profile.learningGoals || [])]).filter((interest) => parseList(publishedCourses.map((course) => courseSearchText(course))).some((text) => containsPhrase(text, interest))).slice(0, 8),
  });
});

// ---- interests / learning goals profile -----------------------------------
const MAX_PROFILE_ITEMS = 20;
const MAX_PROFILE_ITEM_LENGTH = 60;

// Accepts an array or a comma/newline separated string; trims, bounds,
// de-duplicates (case-insensitive) and caps the number of entries.
function cleanProfileList(value, label) {
  if (value === undefined || value === null || value === "") return [];
  const source = Array.isArray(value) ? value.slice(0, 200)
    : typeof value === "string" ? value.split(/[,\n]/).slice(0, 200)
    : null;
  if (!source) throw Object.assign(new Error(`The ${label} must be a list of short text entries.`), { status: 400 });
  const seen = new Set();
  const items = [];
  for (const raw of source) {
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    const text = String(raw).replace(/\s+/g, " ").trim().slice(0, MAX_PROFILE_ITEM_LENGTH);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(text);
    if (items.length >= MAX_PROFILE_ITEMS) break;
  }
  return items;
}

// GET /api/recommendations/profile — the signed-in student's saved interests and goals.
export const getStudentInterests = handle(async (req, res) => {
  const student = await Student.findById(req.user._id).select("interests learningGoals").lean();
  res.json({ success: true, interests: student?.interests || [], learningGoals: student?.learningGoals || [] });
});

// PUT /api/recommendations/profile — replace the student's interests and goals.
export const updateStudentInterests = handle(async (req, res) => {
  const interests = cleanProfileList(req.body?.interests, "interests");
  const learningGoals = cleanProfileList(req.body?.learningGoals, "learning goals");
  const updated = await Student.findByIdAndUpdate(
    req.user._id,
    { $set: { interests, learningGoals } },
    { new: true, runValidators: true },
  ).select("interests learningGoals").lean();
  if (!updated) return FAIL(res, 401, "Session expired.");
  res.json({ success: true, interests: updated.interests || [], learningGoals: updated.learningGoals || [] });
});

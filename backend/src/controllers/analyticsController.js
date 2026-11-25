import ContentAccess from "../models/ContentAccess.js";
import Course from "../models/Course.js";
import CourseReview from "../models/CourseReview.js";
import CourseQuiz from "../models/CourseQuiz.js";
import LessonProgress from "../models/LessonProgress.js";
import QuizAttempt from "../models/QuizAttempt.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import CourseCertificate from "../models/CourseCertificate.js";

const FAIL = (res, code, message) => res.status(code).json({ success: false, message });
const visible = { status: { $ne: "deleted" } };

const number = (value) => Math.max(0, Number(value) || 0);
const clampPercent = (value) => Math.min(100, Math.max(0, Math.round(number(value))));
const round1 = (value) => Math.round(value * 10) / 10;

async function publishedCourseRows(filter) {
  return Course.find({ ...filter, ...visible, status: "published", published: true, approvedVersion: { $ne: null } })
    .select("_id title lessons").lean();
}

// Teacher analytics from MongoDB: courses, enrollments, lesson completion,
// quiz performance and ratings.
export const getTeacherAnalytics = async (req, res, next) => {
  try {
    const teacherId = req.user._id;
    const publishedCourses = await publishedCourseRows({ teacherId });
    const courseIds = publishedCourses.map((course) => course._id);
    const [lessonProgress, enrollmentRows, quizRows, reviewRows] = await Promise.all([
      LessonProgress.find({ courseId: { $in: courseIds } }).select("_id courseId lessonId").lean(),
      ContentAccess.find({ kind: "course", contentId: { $in: courseIds } }).select("_id contentId").lean(),
      QuizAttempt.find({ courseId: { $in: courseIds } }).select("_id courseId percentage passed").lean(),
      CourseReview.find({ courseId: { $in: courseIds }, moderated: false }).select("_id courseId rating").lean(),
    ]);
    const progressByCourse = new Map();
    for (const row of lessonProgress) {
      const key = String(row.courseId);
      if (!progressByCourse.has(key)) progressByCourse.set(key, new Set());
      progressByCourse.get(key).add(row.lessonId);
    }
    const enrolledByCourse = new Map();
    for (const row of enrollmentRows) {
      const key = String(row.contentId);
      enrolledByCourse.set(key, (enrolledByCourse.get(key) || 0) + 1);
    }
    const attemptsByCourse = new Map();
    for (const row of quizRows) {
      const key = String(row.courseId);
      if (!attemptsByCourse.has(key)) attemptsByCourse.set(key, []);
      attemptsByCourse.get(key).push(row);
    }
    const ratingsByCourseId = new Map();
    for (const row of reviewRows) {
      const key = String(row.courseId);
      if (!ratingsByCourseId.has(key)) ratingsByCourseId.set(key, []);
      ratingsByCourseId.get(key).push(Number(row.rating));
    }

    const perCourse = publishedCourses.map((course) => {
      const lessons = Array.isArray(course.lessons) ? course.lessons : [];
      const completed = progressByCourse.get(String(course._id))?.size || 0;
      const attempts = attemptsByCourse.get(String(course._id)) || [];
      const ratingRows = ratingsByCourseId.get(String(course._id)) || [];
      const passCount = attempts.filter((attempt) => attempt.passed === true).length;
      return {
        courseId: String(course._id),
        title: String(course.title || ""),
        lessons: lessons.length,
        completedLessons: completed,
        completionPercent: lessons.length ? clampPercent((completed / lessons.length) * 100) : 0,
        enrollments: enrolledByCourse.get(String(course._id)) || 0,
        quizAttempts: attempts.length,
        passedQuizzes: passCount,
        passRate: attempts.length ? Math.round((passCount / attempts.length) * 100) : null,
        avgQuizPercentage: attempts.length ? clampPercent(attempts.reduce((sum, attempt) => sum + Number(attempt.percentage || 0), 0) / attempts.length) : null,
        averageRating: ratingRows.length ? Math.round((ratingRows.reduce((sum, rating) => sum + rating, 0) / ratingRows.length) * 10) / 10 : null,
        reviewCount: ratingRows.length,
        status: lessons.length ? (completed >= lessons.length ? "Completed" : completed > 0 ? "In Progress" : "Not Started") : "Not Started",
      };
    });
    const totals = perCourse.reduce((total, course) => ({
      publishedCourses: total.publishedCourses + 1,
      enrolledStudents: total.enrolledStudents + course.enrollments,
      totalLessons: total.totalLessons + course.lessons,
      completedLessons: total.completedLessons + course.completedLessons,
      totalQuizAttempts: total.totalQuizAttempts + course.quizAttempts,
      totalQuizzesPassed: total.totalQuizzesPassed + (course.passedQuizzes || 0),
    }), { publishedCourses: 0, enrolledStudents: 0, totalLessons: 0, completedLessons: 0, totalQuizAttempts: 0, totalQuizzesPassed: 0 });
    const allRatings = publishedCourses.flatMap((course) => (ratingsByCourseId.get(String(course._id)) || []).map((rating) => Number(rating)));
    const summary = {
      totalPublishedCourses: perCourse.length,
      enrolledStudents: totals.enrolledStudents,
      totalLessons: totals.totalLessons,
      completedLessons: totals.completedLessons,
      completionPercent: totals.totalLessons ? clampPercent((totals.completedLessons / totals.totalLessons) * 100) : 0,
      quizParticipants: perCourse.reduce((sum, course) => sum + course.quizAttempts, 0),
      avgQuizPercentage: perCourse.some((course) => course.avgQuizPercentage !== null)
        ? Math.round((perCourse.filter((course) => course.avgQuizPercentage !== null).reduce((sum, course) => sum + course.avgQuizPercentage, 0) / perCourse.filter((course) => course.avgQuizPercentage !== null).length) * 10) / 10
        : null,
      avgCourseRating: allRatings.length ? Math.round((allRatings.reduce((sum, rating) => sum + rating, 0) / allRatings.length) * 10) / 10 : null,
      ratingCount: allRatings.length,
    };
    res.json({ success: true, summary, courses: perCourse });
  } catch (error) {
    next(error);
  }
};

// Student analytics from MongoDB: progress, quiz performance, activity over
// time, milestones and revision topics.
export const getStudentAnalytics = async (req, res, next) => {
  try {
    const studentId = req.user._id;
    const [enrollments, lessonProgress, quizAttempts] = await Promise.all([
      ContentAccess.find({ studentId, kind: "course" }).sort({ createdAt: -1 }).lean(),
      LessonProgress.find({ studentId }).select("courseId completedAt lessonId").sort({ createdAt: -1 }).lean(),
      QuizAttempt.find({ studentId }).select("courseId submittedAt percentage passed").sort({ submittedAt: -1 }).lean(),
    ]);
    const courseIds = Array.from(new Set([...enrollments.map((row) => String(row.contentId)), ...lessonProgress.map((row) => String(row.courseId)), ...quizAttempts.map((row) => String(row.courseId))]));
    const [courseRows, reviewRows] = await Promise.all([
      courseIds.length ? Course.find({ _id: { $in: courseIds }, ...visible, status: "published", published: true, approvedVersion: { $ne: null } }).select("_id title lessons").lean() : [],
      CourseReview.find({ courseId: { $in: courseIds } }).select("courseId rating").lean(),
    ]);
    const courses = courseRows.map((course) => {
      const lessons = Array.isArray(course.lessons) ? course.lessons : [];
      const completedIds = new Set(lessonProgress.filter((row) => String(row.courseId) === String(course._id)).map((row) => String(row.lessonId)));
      const attempts = quizAttempts.filter((row) => String(row.courseId) === String(course._id));
      const passCount = attempts.filter((attempt) => attempt.passed === true).length;
      return {
        id: String(course._id),
        title: String(course.title || ""),
        lessons: lessons.length,
        completedLessons: completedIds.size,
        progress: lessons.length ? clampPercent((completedIds.size / lessons.length) * 100) : 0,
        quizAttempts: attempts.length,
        passedQuizzes: passCount,
        avgQuizPercentage: attempts.length ? clampPercent(attempts.reduce((sum, attempt) => sum + Number(attempt.percentage || 0), 0) / attempts.length) : null,
        completed: lessons.length > 0 && completedIds.size >= lessons.length,
      };
    });
    const completedCount = courses.filter((course) => course.completed).length;
    const overallLessons = courses.reduce((sum, course) => sum + course.lessons, 0);
    const overallCompleted = courses.reduce((sum, course) => sum + course.completedLessons, 0);
    const inProgress = courses.filter((course) => course.progress > 0 && course.progress < 100);
    const quizByCourse = new Map();
    quizAttempts.forEach((attempt) => {
      const key = String(attempt.courseId);
      if (!quizByCourse.has(key)) quizByCourse.set(key, []);
      quizByCourse.get(key).push(attempt);
    });
    const revisionTopics = [];
    const seenTopics = new Set();
    for (const course of courses) {
      const attempts = quizByCourse.get(course.id) || [];
      const avg = attempts.length ? attempts.reduce((sum, attempt) => sum + Number(attempt.percentage || 0), 0) / attempts.length : null;
      if (avg !== null && avg < 70 && attempts.length >= 1 && course.title) {
        if (!seenTopics.has(course.title)) {
          seenTopics.add(course.title);
          revisionTopics.push({ topic: course.title, reason: `Quiz performance on "${course.title}" is below 70%. Review the lesson and retry the quiz.` });
        }
      }
      if (course.progress > 0 && course.progress < 100) {
        if (!seenTopics.has(course.title)) { seenTopics.add(course.title); revisionTopics.push({ topic: course.title, reason: `Continue your unfinished course. ${course.completedLessons} of ${course.lessons} lessons done.` }); }
      }
    }
    // Learning activity over time: real events only (lesson completions and quizzes).
    const timelineByMonth = new Map();
    for (const row of lessonProgress) {
      const monthKey = String(row.completedAt || "").slice(0, 7);
      if (!monthKey) continue;
      const entry = timelineByMonth.get(monthKey) || { month: monthKey, lessonsCompleted: 0, quizzesPassed: 0, enrollments: 0 };
      entry.lessonsCompleted += 1;
      timelineByMonth.set(monthKey, entry);
    }
    for (const attempt of quizAttempts) {
      const monthKey = String(attempt.submittedAt || "").slice(0, 7);
      if (!monthKey) continue;
      const entry = timelineByMonth.get(monthKey) || { month: monthKey, lessonsCompleted: 0, quizzesPassed: 0, enrollments: 0 };
      if (attempt.passed === true) entry.quizzesPassed += 1;
      timelineByMonth.set(monthKey, entry);
    }
    for (const row of enrollments) {
      const monthKey = String(row.createdAt || "").slice(0, 7);
      if (!monthKey) continue;
      const entry = timelineByMonth.get(monthKey) || { month: monthKey, lessonsCompleted: 0, quizzesPassed: 0, enrollments: 0 };
      entry.enrollments += 1;
      timelineByMonth.set(monthKey, entry);
    }
    const timeline = [...timelineByMonth.values()].sort((first, second) => String(first.month).localeCompare(String(second.month))).slice(-12);
    const milestones = [
      { title: "First Course Enrolled", earned: enrollments.length > 0, detail: "Enroll in your first course" },
      { title: "Course Completion", earned: completedCount > 0, detail: "Complete a course" },
      { title: "Active Learner", earned: quizAttempts.length > 0 || lessonProgress.length > 0, detail: "Start a quiz or complete a lesson" },
      { title: "Quiz Master", earned: quizByCourse.size > 0, detail: "Take a quiz on your completed courses" },
      { title: "Halfway to Done", earned: courses.length > 0 && overallLessons > 0 && overallCompleted / overallLessons >= 0.5, detail: "Half of your lessons are done" },
    ];
    res.json({
      success: true,
      summary: {
        enrolledCourses: enrollments.length,
        inProgressCourses: inProgress.length,
        completedCourses: completedCount,
        overallProgress: overallLessons ? clampPercent((overallCompleted / overallLessons) * 100) : 0,
        totalLessons: overallLessons,
        completedLessons: overallCompleted,
        quizAttempts: quizAttempts.length,
        passedQuizzes: quizAttempts.filter((attempt) => attempt.passed === true).length,
        recentAccess: enrollments.length ? new Date(enrollments[0].createdAt).toISOString() : null,
      },
      courses,
      quizPerformance: quizAttempts.map((attempt) => ({
        courseId: String(attempt.courseId),
        percentage: Number(attempt.percentage) || 0,
        passed: attempt.passed === true,
        submittedAt: attempt.submittedAt,
      })),
      activityTimeline: timeline,
      milestones,
      revisionTopics: revisionTopics.slice(0, 10),
    });
  } catch (error) {
    next(error);
  }
};

// Admin learning analytics from MongoDB: platform-wide learning activity,
// completion, quiz performance and the most enrolled courses.
export const getAdminAnalytics = async (req, res, next) => {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [students, teachers, publishedCourses, enrollments, lessonProgress, quizAttempts, quizzes, certificates, reviewAgg, recentEnrollments] = await Promise.all([
      Student.countDocuments({ isActive: true }),
      Teacher.countDocuments({ isActive: true }),
      Course.countDocuments({ status: "published", published: true }),
      ContentAccess.countDocuments({ kind: "course" }),
      LessonProgress.countDocuments({}),
      QuizAttempt.countDocuments({}),
      CourseQuiz.countDocuments({}),
      CourseCertificate.countDocuments({}),
      CourseReview.aggregate([
        { $match: { moderated: false, courseId: { $ne: null } } },
        { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } },
      ]),
      ContentAccess.find({ kind: "course", createdAt: { $gte: cutoff } }).select("_id").limit(5000).lean(),
    ]);
    const passedAttempts = await QuizAttempt.countDocuments({ passed: true });

    // Most enrolled published courses (top 5) with lesson completion totals.
    const enrollmentRows = await ContentAccess.aggregate([
      { $match: { kind: "course" } },
      { $group: { _id: "$contentId", enrollments: { $sum: 1 } } },
      { $sort: { enrollments: -1 } },
      { $limit: 5 },
    ]);
    const topCourseIds = enrollmentRows.map((row) => row._id);
    const topCourseRows = topCourseIds.length
      ? await Course.find({ _id: { $in: topCourseIds }, status: { $ne: "deleted" } }).select("title lessons approvedVersion").lean()
      : [];
    const topCourses = enrollmentRows.map((row) => {
      const course = topCourseRows.find((item) => String(item._id) === String(row._id));
      const lessons = Array.isArray(course?.approvedVersion?.lessons) ? course.approvedVersion.lessons
        : Array.isArray(course?.lessons) ? course.lessons : [];
      return {
        courseId: String(row._id),
        title: String(course?.approvedVersion?.title || course?.title || "Untitled course"),
        enrollments: Number(row.enrollments || 0),
        lessons: lessons.length,
      };
    }).filter((row) => row.title !== "Untitled course" || row.enrollments > 0);

    // Monthly learning activity over the last 6 months.
    const sixMonthsAgo = new Date(Date.now() - 182 * 24 * 60 * 60 * 1000);
    const [monthlyLessons, monthlyEnrollments] = await Promise.all([
      LessonProgress.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      ContentAccess.aggregate([
        { $match: { kind: "course", createdAt: { $gte: sixMonthsAgo } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);
    const timelineByMonth = new Map();
    for (const row of monthlyLessons) timelineByMonth.set(String(row._id), { month: String(row._id), lessonsCompleted: Number(row.count || 0), enrollments: 0 });
    for (const row of monthlyEnrollments) {
      const key = String(row._id);
      const entry = timelineByMonth.get(key) || { month: key, lessonsCompleted: 0, enrollments: 0 };
      entry.enrollments = Number(row.count || 0);
      timelineByMonth.set(key, entry);
    }
    const timeline = [...timelineByMonth.values()].sort((first, second) => first.month.localeCompare(second.month)).slice(-6);

    const review = reviewAgg.length ? reviewAgg[0] : { average: 0, count: 0 };
    res.json({
      success: true,
      summary: {
        activeStudents: students,
        activeTeachers: teachers,
        publishedCourses,
        enrollments,
        lessonsCompleted: lessonProgress,
        completionRate: enrollments ? clampPercent((lessonProgress / Math.max(1, enrollments)) * 100) : 0,
        quizAttempts,
        passedQuizzes: passedAttempts,
        quizPassRate: quizAttempts ? Math.round((passedAttempts / quizAttempts) * 100) : null,
        quizzes,
        certificatesIssued: certificates,
        recentEnrollments: recentEnrollments.length,
        averageRating: review.count ? round1(Number(review.average || 0)) : null,
        reviewCount: Number(review.count || 0),
      },
      topCourses,
      activityTimeline: timeline,
    });
  } catch (error) {
    next(error);
  }
};

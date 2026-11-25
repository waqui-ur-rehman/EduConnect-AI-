import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import Student from "../src/models/Student.js";
import Teacher from "../src/models/Teacher.js";
import Admin from "../src/models/Admin.js";
import Course from "../src/models/Course.js";
import ContentAccess from "../src/models/ContentAccess.js";
import LessonProgress from "../src/models/LessonProgress.js";
import CourseReview from "../src/models/CourseReview.js";
import CourseQuiz from "../src/models/CourseQuiz.js";
import QuizAttempt from "../src/models/QuizAttempt.js";
import CourseCertificate from "../src/models/CourseCertificate.js";

// Phase 7 — Learning Analytics for students, teachers and admins, each scoped
// to its own role and computed from MongoDB collections.
test("Phase 7 role-scoped learning analytics through real HTTP and MongoDB", { timeout: 120000 }, async (t) => {
  const database = `educonnect_analytics_test_${randomUUID().replaceAll("-", "")}`;
  const previousEnv = { ...process.env };
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "analytics-integration-test-secret-32chars";
  process.env.CLIENT_ORIGIN = "http://localhost:5173";
  await mongoose.connect("mongodb://127.0.0.1:27017", { dbName: database, serverSelectionTimeoutMS: 5000 });
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    assert.equal(mongoose.connection.name, database);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    for (const [key, value] of Object.entries(previousEnv)) process.env[key] = value;
    for (const key of Object.keys(process.env)) {
      if (!(key in previousEnv)) delete process.env[key];
    }
  });
  await Promise.all([Student, Teacher, Admin, Course, ContentAccess, LessonProgress, CourseReview, CourseQuiz, QuizAttempt, CourseCertificate].map((Model) => Model.init()));
  const { default: app } = await import("../src/app.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const password = "Test-password-12345";
  const accounts = {};
  for (const [name, Model, role] of [
    ["teacher", Teacher, "teacher"], ["student", Student, "student"],
    ["student2", Student, "student"], ["admin", Admin, "admin"],
  ]) {
    accounts[name] = await Model.create({ fullName: `Analytics ${name}`, email: `${name}@analytics.test`, password, role });
  }
  const cookies = {};
  async function request(path, { actor, method = "GET", body, headers = {} } = {}) {
    const response = await fetch(base + path, { method, headers: {
      Origin: "http://localhost:5173", "X-Requested-With": "XMLHttpRequest",
      ...(actor ? { Cookie: cookies[actor] } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}), ...headers,
    }, body: body ? JSON.stringify(body) : undefined });
    const data = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
    return { response, data, code: response.status };
  }
  for (const name of Object.keys(accounts)) {
    const login = await request("/auth/login", { method: "POST", body: { email: accounts[name].email, password } });
    assert.equal(login.code, 200, `Login failed for ${name}`);
    cookies[name] = login.response.headers.get("set-cookie").split(";")[0];
  }

  const courseInput = {
    title: "Analytics tracked course",
    description: "A published course used to verify analytics aggregation.",
    metadata: { category: "Data Science", price: 0, learningOutcomes: ["Measure progress"] },
    lessons: [
      { id: "lesson-1", title: "First lesson", content: "Content one", order: 0 },
      { id: "lesson-2", title: "Second lesson", content: "Content two", order: 1 },
    ],
  };
  let course = (await request("/content/courses", { actor: "teacher", method: "POST", body: courseInput })).data.item;
  course = (await request(`/content/courses/${course.id}/submit`, { actor: "teacher", method: "POST", body: { revision: course.revision } })).data.item;
  course = (await request(`/content/courses/${course.id}/review`, { actor: "admin", method: "POST", body: { decision: "approve", revision: course.revision } })).data.item;
  assert.equal((await request("/content/enrollments", { actor: "student", method: "POST", body: { items: [{ id: course.id, kind: "course" }] } })).code, 200);
  assert.equal((await request("/content/enrollments", { actor: "student2", method: "POST", body: { items: [{ id: course.id, kind: "course" }] } })).code, 200);
  const progress = await request("/learning/progress/lessons", { actor: "student", method: "POST", body: { courseId: course.id, lessonId: "lesson-1", completed: true } });
  assert.equal(progress.code, 200, JSON.stringify(progress.data));
  // One real quiz attempt for pass-rate math.
  await QuizAttempt.create({
    quizId: new mongoose.Types.ObjectId(),
    courseId: new mongoose.Types.ObjectId(course.id),
    studentId: accounts.student._id,
    sessionId: `sess-${randomUUID().slice(0, 8)}`,
    quizRevision: 0,
    answers: {},
    correct: 4, total: 5, percentage: 80, passed: true,
    submittedAt: new Date(),
  });

  await t.test("1. Students receive their own progress, quiz and milestone data", async () => {
    const analytics = await request("/analytics/student", { actor: "student" });
    assert.equal(analytics.code, 200, JSON.stringify(analytics.data));
    const { summary, courses, milestones, activityTimeline, revisionTopics, quizPerformance } = analytics.data;
    assert.equal(summary.enrolledCourses, 1);
    assert.equal(summary.completedCourses, 0);
    assert.equal(summary.totalLessons, 2);
    assert.equal(summary.completedLessons, 1);
    assert.equal(summary.overallProgress, 50);
    assert.equal(summary.quizAttempts, 1);
    assert.equal(summary.passedQuizzes, 1, "passedQuizzes is a count, not a boolean");
    assert.equal(typeof summary.passedQuizzes, "number");
    assert.equal(courses.length, 1);
    assert.equal(courses[0].progress, 50);
    assert.equal(courses[0].quizAttempts, 1);
    assert.equal(courses[0].passedQuizzes, 1);
    assert.equal(courses[0].completed, false);
    assert.equal(quizPerformance.length, 1);
    assert.equal(quizPerformance[0].percentage, 80);
    assert.equal(quizPerformance[0].passed, true);
    assert.ok(Array.isArray(milestones) && milestones.length >= 4);
    assert.ok(milestones.some((item) => item.title === "First Course Enrolled" && item.earned));
    assert.ok(Array.isArray(activityTimeline));
    assert.ok(Array.isArray(revisionTopics));

    const other = await request("/analytics/student", { actor: "student2" });
    assert.equal(other.code, 200);
    assert.equal(other.data.summary.enrolledCourses, 1, "student2 has their own enrollment");
    assert.equal(other.data.summary.completedLessons, 0, "student2 completed nothing");
    assert.equal(other.data.summary.quizAttempts, 0, "student2 attempts are not mixed in");
  });

  await t.test("2. Teachers receive aggregates for their own courses only", async () => {
    const analytics = await request("/analytics/teacher", { actor: "teacher" });
    assert.equal(analytics.code, 200, JSON.stringify(analytics.data));
    const { summary, courses } = analytics.data;
    assert.equal(summary.totalPublishedCourses, 1);
    assert.equal(summary.enrolledStudents, 2);
    assert.equal(summary.totalLessons, 2);
    assert.equal(summary.completedLessons, 1);
    assert.equal(summary.completionPercent, 50);
    assert.equal(summary.ratingCount, 0, "No reviews yet");
    assert.equal(summary.avgCourseRating, null);
    assert.equal(courses.length, 1);
    assert.equal(courses[0].courseId, course.id);
    assert.equal(courses[0].enrollments, 2);
    assert.equal(courses[0].lessons, 2);
    assert.equal(courses[0].completedLessons, 1);
    assert.equal(courses[0].status, "In Progress");
    assert.equal(courses[0].quizAttempts, 1);
    assert.equal(courses[0].passedQuizzes, 1);
    assert.equal(courses[0].passRate, 100);
  });

  await t.test("3. Admins receive platform-wide learning analytics", async () => {
    const analytics = await request("/analytics/admin", { actor: "admin" });
    assert.equal(analytics.code, 200, JSON.stringify(analytics.data));
    const { summary, topCourses, activityTimeline } = analytics.data;
    assert.ok(summary.activeStudents >= 2);
    assert.ok(summary.activeTeachers >= 1);
    assert.ok(summary.publishedCourses >= 1);
    assert.ok(summary.enrollments >= 2);
    assert.ok(summary.lessonsCompleted >= 1);
    assert.ok(summary.quizAttempts >= 1);
    assert.ok(summary.passedQuizzes >= 1);
    assert.equal(summary.quizPassRate, 100);
    assert.equal(typeof summary.certificatesIssued, "number");
    assert.equal(summary.averageRating, null, "No reviews yet");
    const top = topCourses.find((item) => item.courseId === course.id);
    assert.ok(top, "The enrolled course appears in top courses");
    assert.equal(top.enrollments, 2);
    assert.equal(top.lessons, 2);
    assert.ok(Array.isArray(activityTimeline));
  });

  await t.test("4. Every analytics route is protected and role-scoped", async () => {
    const cases = [
      ["/analytics/student", "teacher", 403],
      ["/analytics/student", "admin", 403],
      ["/analytics/teacher", "student", 403],
      ["/analytics/teacher", "admin", 403],
      ["/analytics/admin", "student", 403],
      ["/analytics/admin", "teacher", 403],
      ["/analytics/student", null, 401],
      ["/analytics/teacher", null, 401],
      ["/analytics/admin", null, 401],
    ];
    for (const [path, actor, expected] of cases) {
      const response = await request(path, { actor });
      assert.equal(response.code, expected, `${path} as ${actor || "anonymous"} should be ${expected}`);
    }
  });
});

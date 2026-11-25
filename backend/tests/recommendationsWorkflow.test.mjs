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

// Phase 7 — Personalized Recommendations: MongoDB-backed profile (interests and
// learning goals) plus deterministic, ownership-scoped recommendation output.
test("Phase 7 personalized recommendations through real HTTP and MongoDB", { timeout: 120000 }, async (t) => {
  const database = `educonnect_recs_test_${randomUUID().replaceAll("-", "")}`;
  const previousEnv = { ...process.env };
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "recommendations-integration-test-secret-32";
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
  await Promise.all([Student, Teacher, Admin, Course, ContentAccess, LessonProgress, CourseReview, CourseQuiz, QuizAttempt].map((Model) => Model.init()));
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
    accounts[name] = await Model.create({ fullName: `Recs ${name}`, email: `${name}@recommendations.test`, password, role });
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
    title: "Full stack development fundamentals",
    description: "A complete development course used to verify personalized recommendations.",
    metadata: { category: "Development", price: 0, learningOutcomes: ["Build web apps"] },
    lessons: [
      { id: "lesson-1", title: "First lesson", content: "Content one", order: 0 },
      { id: "lesson-2", title: "Second lesson", content: "Content two", order: 1 },
    ],
  };
  let course = (await request("/content/courses", { actor: "teacher", method: "POST", body: courseInput })).data.item;
  course = (await request(`/content/courses/${course.id}/submit`, { actor: "teacher", method: "POST", body: { revision: course.revision } })).data.item;
  course = (await request(`/content/courses/${course.id}/review`, { actor: "admin", method: "POST", body: { decision: "approve", revision: course.revision } })).data.item;
  assert.equal((await request("/content/enrollments", { actor: "student", method: "POST", body: { items: [{ id: course.id, kind: "course" }] } })).code, 200);

  await t.test("1. The endpoint is student-only and returns MongoDB recommendations", async () => {
    const anonymous = await request("/recommendations");
    assert.equal(anonymous.code, 401, "Anonymous callers are rejected");
    const asTeacher = await request("/recommendations", { actor: "teacher" });
    assert.equal(asTeacher.code, 403, "Teachers do not get student recommendations");
    const asAdmin = await request("/recommendations", { actor: "admin" });
    assert.equal(asAdmin.code, 403, "Admins do not get student recommendations");

    // The unenrolled student sees the course as a recommendation.
    const newcomer = await request("/recommendations", { actor: "student2" });
    assert.equal(newcomer.code, 200, JSON.stringify(newcomer.data));
    assert.equal(newcomer.data.success, true);
    const recommended = newcomer.data.recommendations.find((item) => item.id === course.id);
    assert.ok(recommended, "The published course is recommended to an unenrolled student");
    assert.equal(recommended.title, courseInput.title);
    assert.equal(recommended.free, true);
    assert.ok(typeof recommended.score === "number");
    assert.ok(recommended.reason.length > 0);
    assert.equal(newcomer.data.continueLearning.length, 0, "Nothing to continue yet");
    assert.ok(Array.isArray(newcomer.data.learningPaths));
    assert.ok(Array.isArray(newcomer.data.recommendedBooks));
    assert.ok(Array.isArray(newcomer.data.relatedInstructors));

    // The enrolled student sees it under continue-learning instead.
    const progress = await request("/learning/progress/lessons", { actor: "student", method: "POST", body: { courseId: course.id, lessonId: "lesson-1", completed: true } });
    assert.equal(progress.code, 200, JSON.stringify(progress.data));
    const enrolledView = await request("/recommendations", { actor: "student" });
    assert.equal(enrolledView.code, 200, JSON.stringify(enrolledView.data));
    const continueItem = enrolledView.data.continueLearning.find((item) => item.id === course.id);
    assert.ok(continueItem, "An in-progress course appears in continue-learning");
    assert.equal(continueItem.progress, 50);
    assert.ok(!enrolledView.data.recommendations.some((item) => item.id === course.id), "Owned courses are not re-recommended");
  });

  await t.test("2. The interests and learning goals profile persists in MongoDB", async () => {
    const empty = await request("/recommendations/profile", { actor: "student" });
    assert.equal(empty.code, 200, JSON.stringify(empty.data));
    assert.deepEqual(empty.data.interests, []);
    assert.deepEqual(empty.data.learningGoals, []);

    const invalid = await request("/recommendations/profile", { actor: "student", method: "PUT", body: { interests: 123 } });
    assert.equal(invalid.code, 400, "Non-list input is rejected");
    const valid = await request("/recommendations/profile", { actor: "student", method: "PUT", body: {
      interests: ["Development", "Development ", " web development "],
      learningGoals: ["Become a full stack developer", ""],
    } });
    assert.equal(valid.code, 200, JSON.stringify(valid.data));
    assert.deepEqual(valid.data.interests, ["Development", "web development"], "Entries are trimmed and de-duplicated");
    assert.equal(valid.data.learningGoals.length, 1);

    const stored = await Student.findById(accounts.student._id).select("interests learningGoals").lean();
    assert.deepEqual(stored.interests, ["Development", "web development"], "The document is updated in the students collection");

    const stringInput = await request("/recommendations/profile", { actor: "student", method: "PUT", body: { interests: "Data Science, Finance", learningGoals: "Graduate with honours" } });
    assert.equal(stringInput.code, 200);
    assert.deepEqual(stringInput.data.interests, ["Data Science", "Finance"], "Comma separated strings are accepted");
    assert.deepEqual(stringInput.data.learningGoals, ["Graduate with honours"]);

    const capped = await request("/recommendations/profile", { actor: "student", method: "PUT", body: {
      interests: Array.from({ length: 40 }, (_, index) => `Interest number ${index}`),
      learningGoals: ["x".repeat(300)],
    } });
    assert.equal(capped.code, 200);
    assert.equal(capped.data.interests.length, 20, "Interest lists are capped at 20 entries");
    assert.equal(capped.data.learningGoals[0].length, 60, "Long entries are clipped");

    const otherStudent = await request("/recommendations/profile", { actor: "student2" });
    assert.deepEqual(otherStudent.data.interests, [], "Profiles are scoped to the signed-in student");
    const anonymous = await request("/recommendations/profile");
    assert.equal(anonymous.code, 401);
    const teacherProfile = await request("/recommendations/profile", { actor: "teacher", method: "PUT", body: { interests: ["Teaching"] } });
    assert.equal(teacherProfile.code, 403, "Only students own a recommendation profile");
  });

  await t.test("3. Saved interests flow into the recommendation response", async () => {
    await request("/recommendations/profile", { actor: "student", method: "PUT", body: { interests: ["Development"], learningGoals: ["Build web apps"] } });
    const view = await request("/recommendations", { actor: "student" });
    assert.equal(view.code, 200, JSON.stringify(view.data));
    assert.ok(view.data.profileMatches.includes("Development"), "The saved interest is matched against course content");
    const stored = await Student.findById(accounts.student._id).select("interests").lean();
    assert.deepEqual(stored.interests, ["Development"]);
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Teacher from "../src/models/Teacher.js";
import Student from "../src/models/Student.js";
import Admin from "../src/models/Admin.js";
import Course from "../src/models/Course.js";
import ContentAccess from "../src/models/ContentAccess.js";
import ContentFile from "../src/models/ContentFile.js";
import LessonProgress from "../src/models/LessonProgress.js";
import CourseReview from "../src/models/CourseReview.js";
import CourseCertificate from "../src/models/CourseCertificate.js";

test("Student learning workflow and security through real HTTP and MongoDB", { timeout: 90000 }, async (t) => {
  const database = `educonnect_learning_test_${randomUUID().replaceAll("-", "")}`;
  const previousEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  process.env.CONTENT_DEMO_CHECKOUT = "true";
  process.env.JWT_SECRET = "learning-integration-test-only-secret-32-characters";
  process.env.CLIENT_ORIGIN = "http://localhost:5173";
  await mongoose.connect("mongodb://127.0.0.1:27017", { dbName: database, serverSelectionTimeoutMS: 5000 });
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    for (const file of await ContentFile.find().lean()) {
      await unlink(fileURLToPath(new URL(`../uploads/content/${file.storageName}`, import.meta.url))).catch(() => {});
    }
    assert.equal(mongoose.connection.name, database);
    assert.ok(database.startsWith("educonnect_learning_test_"));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    process.env.NODE_ENV = previousEnvironment;
  });
  await Promise.all([Teacher, Student, Admin, Course, ContentAccess, ContentFile, LessonProgress, CourseReview, CourseCertificate].map((Model) => Model.init()));
  const { default: app } = await import("../src/app.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const password = "Test-password-12345";
  const accounts = {};
  for (const [name, Model, role] of [["owner", Teacher, "teacher"], ["other", Teacher, "teacher"], ["student", Student, "student"], ["student2", Student, "student"], ["admin", Admin, "admin"]]) {
    accounts[name] = await Model.create({ fullName: `Test ${name}`, email: `${name}@example.test`, password, role });
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
    assert.equal(login.code, 200);
    cookies[name] = login.response.headers.get("set-cookie").split(";")[0];
  }
  const input = { title: "Learning workflow course", description: "Complete learning course description",
    metadata: { category: "Development", price: 0, learningOutcomes: ["Track progress"] },
    lessons: [
      { id: "lesson-1", title: "First lesson", content: "First approved lesson", order: 0 },
      { id: "lesson-2", title: "Second lesson", content: "Second approved lesson", order: 1 },
    ] };
  let course = (await request("/content/courses", { actor: "owner", method: "POST", body: input })).data.item;
  course = (await request(`/content/courses/${course.id}/submit`, { actor: "owner", method: "POST", body: { revision: course.revision } })).data.item;
  course = (await request(`/content/courses/${course.id}/review`, { actor: "admin", method: "POST", body: { decision: "approve", revision: course.revision } })).data.item;
  await request("/content/enrollments", { actor: "student", method: "POST", body: { items: [{ id: course.id, kind: "course" }] } });
  await request("/content/enrollments", { actor: "student2", method: "POST", body: { items: [{ id: course.id, kind: "course" }] } });

  await t.test("Lesson completion is saved idempotently and progress is backend-calculated", async () => {
    const first = await request("/learning/progress/lessons", { actor: "student", method: "POST", body: { courseId: course.id, lessonId: "lesson-1", completed: true } });
    assert.equal(first.code, 200, JSON.stringify(first.data));
    assert.equal(first.data.progress.completedLessons, 1);
    assert.equal(first.data.progress.progress, 50);
    const repeat = await request("/learning/progress/lessons", { actor: "student", method: "POST", body: { courseId: course.id, lessonId: "lesson-1", completed: true } });
    assert.equal(repeat.data.progress.completedLessons, 1, "Duplicate completion must not inflate progress");
    const ghost = await request("/learning/progress/lessons", { actor: "student", method: "POST", body: { courseId: course.id, lessonId: "not-a-lesson", completed: true } });
    assert.equal(ghost.code, 400, "Lessons outside the approved curriculum are rejected");
    const list = await request("/learning/progress", { actor: "student" });
    const entry = list.data.courses.find((item) => item.courseId === course.id);
    assert.equal(entry.progress, 50);
    assert.equal(entry.lessons, 2);
  });

  await t.test("Unauthorized users cannot read or change progress", async () => {
    const read = await request("/learning/progress", { actor: "other" });
    assert.equal(read.code, 403, "Teachers are not student progress readers");
    const write = await request("/learning/progress/lessons", { actor: "other", method: "POST", body: { courseId: course.id, lessonId: "lesson-2", completed: true } });
    assert.equal(write.code, 403, "Only enrolled students can record progress");
    const outsider = await request("/content/enrollments", { actor: "other", method: "POST", body: { items: [{ id: course.id, kind: "course" }] } });
    assert.equal(outsider.code, 403, "Teachers cannot enroll as students");
  });

  await t.test("Reviews are stored in MongoDB, edited by their owner and summarized from records", async () => {
    const created = await request("/learning/reviews", { actor: "student", method: "POST", body: { courseId: course.id, rating: 5, comment: "Excellent, well structured course." } });
    assert.equal(created.code, 200, JSON.stringify(created.data));
    const reviewId = created.data.review.id;
    const publicBefore = await request(`/learning/reviews/course/${course.id}`);
    assert.equal(publicBefore.data.summary.count, 1);
    assert.equal(publicBefore.data.summary.average, 5);
    const outsider = await request("/learning/reviews", { actor: "other", method: "POST", body: { courseId: course.id, rating: 1, comment: "Not enrolled, cannot review." } });
    assert.equal(outsider.code, 403, "Only enrolled students may review");
    const updated = await request("/learning/reviews", { actor: "student", method: "POST", body: { courseId: course.id, rating: 3, comment: "Good, could use more examples." } });
    assert.equal(updated.code, 200);
    const mine = await request("/learning/reviews/mine", { actor: "student" });
    assert.equal(mine.data.reviews.length, 1, "Editing keeps one active review per student and course");
    assert.equal(mine.data.reviews[0].rating, 3);
    const publicAfter = await request(`/learning/reviews/course/${course.id}`);
    assert.equal(publicAfter.data.summary.average, 3);
    // Admin moderation hides and restores the review from public output.
    assert.equal((await request(`/learning/reviews/${reviewId}/moderate`, { actor: "student", method: "PATCH", body: { moderated: true } })).code, 403, "Students cannot moderate reviews");
    assert.equal((await request(`/learning/reviews/${reviewId}/moderate`, { actor: "admin", method: "PATCH", body: { moderated: true } })).code, 200);
    assert.equal((await request(`/learning/reviews/course/${course.id}`)).data.summary.count, 0);
    await request("/learning/reviews", { actor: "student", method: "POST", body: { courseId: course.id, rating: 4, comment: "Great course, highly recommended." } });
    assert.equal((await request(`/learning/reviews/course/${course.id}`)).data.summary.count, 0, "Student edits do not unhide a moderated review");
    await request(`/learning/reviews/${reviewId}/moderate`, { actor: "admin", method: "PATCH", body: { moderated: false } });
    assert.equal((await request(`/learning/reviews/course/${course.id}`)).data.summary.count, 1);
  });

  await t.test("Certificate is issued only after full completion and is verifiable and unique", async () => {
    await request("/learning/progress/lessons", { actor: "student", method: "POST", body: { courseId: course.id, lessonId: "lesson-2", completed: true } });
    const issued = await request("/learning/certificates/issue", { actor: "student", method: "POST", body: { courseId: course.id } });
    assert.equal(issued.code, 201, JSON.stringify(issued.data));
    const certificateId = issued.data.certificate.certificateId;
    assert.match(certificateId, /^EDC-[A-F0-9]{12}$/);
    assert.equal(issued.data.certificate.courseTitle, input.title);
    assert.equal(issued.data.certificate.studentName, "Test student");
    const repeated = await request("/learning/certificates/issue", { actor: "student", method: "POST", body: { courseId: course.id } });
    assert.equal(repeated.code, 200);
    assert.equal(repeated.data.alreadyIssued, true);
    assert.equal(repeated.data.certificate.certificateId, certificateId, "Duplicate issuance is prevented");
    const mine = await request("/learning/certificates/mine", { actor: "student" });
    assert.equal(mine.data.certificates.length, 1);
    const otherMine = await request("/learning/certificates/mine", { actor: "student2" });
    assert.equal(otherMine.data.certificates.length, 0, "Other students do not see this certificate");
    const verify = await request(`/learning/certificates/verify/${certificateId}`);
    assert.equal(verify.code, 200);
    assert.equal(verify.data.valid, true);
    assert.equal(verify.data.certificate.certificateId, certificateId);
    assert.equal((await request("/learning/certificates/verify/EDC-DEADBEEF0000")).code, 404);
  });

  await t.test("Mandatory quiz in the approved curriculum blocks the certificate until passed", async () => {
    const quizResult = await request(`/quizzes/courses/${course.id}/teacher`, { actor: "owner", method: "POST", body: {
      title: "Final knowledge check", passingScore: 60, timeLimit: 0,
      questions: [{ prompt: "Pick the correct answer", options: ["Correct answer", "Wrong 1", "Wrong 2", "Wrong 3"], correct: 0 }],
    } });
    assert.equal(quizResult.code, 201, JSON.stringify(quizResult.data));
    const quizId = String(quizResult.data.quiz._id || quizResult.data.quiz.id);
    assert.equal((await request(`/quizzes/courses/${course.id}/teacher/${quizId}/publish`, { actor: "owner", method: "PATCH", body: { published: true } })).code, 200);
    const curriculum = { sections: [{ id: "module-1", title: "Foundation", lessonIds: ["lesson-1", "lesson-2"] }], resources: [],
      links: [{ sectionId: "module-1", type: "quiz", id: quizId }] };
    course = (await request(`/content/courses/${course.id}`, { actor: "owner", method: "PATCH", body: { revision: course.revision, metadata: { curriculum } } })).data.item;
    course = (await request(`/content/courses/${course.id}/submit`, { actor: "owner", method: "POST", body: { revision: course.revision } })).data.item;
    course = (await request(`/content/courses/${course.id}/review`, { actor: "admin", method: "POST", body: { decision: "approve", revision: course.revision } })).data.item;
    await request("/learning/progress/lessons", { actor: "student2", method: "POST", body: { courseId: course.id, lessonId: "lesson-1", completed: true } });
    await request("/learning/progress/lessons", { actor: "student2", method: "POST", body: { courseId: course.id, lessonId: "lesson-2", completed: true } });
    const blocked = await request("/learning/certificates/issue", { actor: "student2", method: "POST", body: { courseId: course.id } });
    assert.equal(blocked.code, 409);
    assert.ok((blocked.data.missing || []).includes("quiz"));
    const started = await request(`/quizzes/courses/${course.id}/student/${quizId}/start`, { actor: "student2", method: "POST", body: {} });
    assert.equal(started.code, 201);
    const attempt = await request(`/quizzes/courses/${course.id}/student/${quizId}/attempts`, { actor: "student2", method: "POST", body: { sessionId: started.data.sessionId, revision: started.data.revision, answers: { "0": 0 } } });
    assert.equal(attempt.code, 201, JSON.stringify(attempt.data));
    assert.equal(attempt.data.attempt.passed, true);
    const issued = await request("/learning/certificates/issue", { actor: "student2", method: "POST", body: { courseId: course.id } });
    assert.equal(issued.code, 201, JSON.stringify(issued.data));
  });
});

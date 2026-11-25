import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import Teacher from "../src/models/Teacher.js";
import Student from "../src/models/Student.js";
import Course from "../src/models/Course.js";
import CourseQuiz from "../src/models/CourseQuiz.js";
import ContentAccess from "../src/models/ContentAccess.js";

test("Browser quizzes migrate to MongoDB and use authenticated publication and attempts", { timeout: 60000 }, async t => {
  const database = `educonnect_quiz_test_${randomUUID().replaceAll("-", "")}`;
  Object.assign(process.env, { NODE_ENV: "test", JWT_SECRET: "quiz-test-only-secret-at-least-32-characters", CLIENT_ORIGIN: "http://localhost:5173" });
  await mongoose.connect("mongodb://127.0.0.1:27017", { dbName: database, serverSelectionTimeoutMS: 5000 });
  let server;
  const originalFetch = globalThis.fetch;
  t.after(async () => {
    globalThis.fetch = originalFetch;
    delete globalThis.quizTestFetch;
    delete globalThis.localStorage;
    if (server) await new Promise(resolve => server.close(resolve));
    assert.equal(mongoose.connection.name, database);
    assert.ok(database.startsWith("educonnect_quiz_test_"));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  await Promise.all([Teacher, Student, Course, CourseQuiz, ContentAccess].map(model => model.init()));
  const { default: app } = await import("../src/app.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const password = "Test-password-12345";
  const owner = await Teacher.create({ email: "quiz-owner@example.test", fullName: "Quiz Owner", role: "teacher", password });
  const other = await Teacher.create({ email: "quiz-other@example.test", fullName: "Other Teacher", role: "teacher", password });
  const student = await Student.create({ email: "quiz-student@example.test", fullName: "Quiz Student", role: "student", password });
  const cookies = {};
  async function request(path, { actor = "owner", method = "GET", body } = {}) {
    const response = await originalFetch(base + path, { method, headers: {
      "X-Requested-With": "XMLHttpRequest", ...(cookies[actor] ? { Cookie: cookies[actor] } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    }, body: body ? JSON.stringify(body) : undefined });
    return { response, code: response.status, data: await response.json() };
  }
  for (const [actor, account] of [["owner", owner], ["other", other], ["student", student]]) {
    const login = await request("/auth/login", { body: { email: account.email, password }, method: "POST" });
    assert.equal(login.code, 200, JSON.stringify(login.data));
    cookies[actor] = login.response.headers.get("set-cookie").split(";")[0];
  }
  const course = await Course.create({ title: "Machine Learning", teacherId: owner._id, status: "published", published: true, approvedVersion: { title: "Machine Learning" }, legacyId: "browser-course-1" });
  const courseId = String(course._id);
  const quizInput = { id: "browser-quiz-1", title: "Machine Learning Basics Quiz", published: true, passingScore: 60, timeLimit: 0,
    questions: [{ id: "q1", prompt: "Which is a fruit?", options: ["Mango", "Car", "Book", "Desk"], correct: 0 }] };
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  // Load the real browser API and migration helper, substituting only the
  // browser's cookie transport with this test's authenticated HTTP transport.
  const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  globalThis.quizTestFetch = (path, options = {}) => originalFetch(base + path, { ...options, headers: { ...options.headers, Cookie: cookies.owner, "X-Requested-With": "XMLHttpRequest" } });
  const transport = moduleUrl("export const apiFetch = (...args) => globalThis.quizTestFetch(...args);");
  const apiSource = await readFile(new URL("../../src/utils/mongoQuizApi.js", import.meta.url), "utf8");
  const apiUrl = moduleUrl(apiSource.replace('"./api"', JSON.stringify(transport)));
  const migrationSource = await readFile(new URL("../../src/utils/importBrowserQuizzes.js", import.meta.url), "utf8");
  const { loadTeacherQuizCourse } = await import(moduleUrl(migrationSource.replace('"./mongoQuizApi"', JSON.stringify(apiUrl))));
  const { saveTeacherQuiz } = await import(apiUrl);
  const key = `educonnect.quiz.v1.${encodeURIComponent(owner.email)}.${course.legacyId}`;
  storage.set(key, JSON.stringify([quizInput, { ...quizInput, id: "browser-quiz-2" }]));
  const frontendCourse = { id: courseId, legacyId: course.legacyId, title: course.title };
  let quizId;
  await t.test("Previously published browser quizzes transfer once, retaining their original questions", async () => {
    const result = await loadTeacherQuizCourse(frontendCourse, owner.email);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.quizzes.length, 2);
    assert.ok(result.quizzes.every(q => q.published && /^[a-f\d]{24}$/.test(q.id)));
    assert.equal(await CourseQuiz.countDocuments(), 2);
    assert.equal(CourseQuiz.collection.name, "coursequizzes");
    assert.equal(result.quizzes[0].questions[0].options[0], "Mango");
    const originals = JSON.parse(storage.get(key));
    assert.equal(originals[0].id, quizInput.id);
    assert.equal(originals[0].questions[0].correct, 0);
    assert.ok(originals.every(q => q.mongoQuizId));
    await loadTeacherQuizCourse(frontendCourse, owner.email);
    assert.equal(await CourseQuiz.countDocuments(), 2);
    quizId = result.quizzes[0].id;
  });
  await t.test("A repeated browser ID cannot duplicate a quiz or overwrite its server copy", async () => {
    const requests = await Promise.all([1, 2].map(() => request(`/quizzes/courses/${courseId}/teacher`, { method: "POST", body: { ...quizInput, legacyId: quizInput.id, title: "Stale browser title" } })));
    assert.ok(requests.every(r => r.code === 200));
    assert.equal(await CourseQuiz.countDocuments(), 2);
    assert.equal(requests[0].data.quiz.title, quizInput.title);
    const created = await saveTeacherQuiz(courseId, { ...quizInput, id: "fresh-form-uuid" });
    const retried = await saveTeacherQuiz(courseId, { ...quizInput, id: "fresh-form-uuid" });
    assert.equal(String(created.quiz._id), String(retried.quiz._id));
    assert.equal(created.quiz.published, false);
  });
  await t.test("Publication failures remain saved drafts and are reported", async () => {
    const draft = await Course.create({ teacherId: owner._id, title: "Draft Course" });
    const draftKey = `educonnect.quiz.v1.${encodeURIComponent(owner.email)}.${draft._id}`;
    storage.set(draftKey, JSON.stringify([{ ...quizInput, id: "draft-quiz" }]));
    const result = await loadTeacherQuizCourse({ id: String(draft._id), title: draft.title }, owner.email);
    assert.equal(result.quizzes.length, 1);
    assert.equal(result.quizzes[0].published, false);
    assert.match(result.warnings[0], /saved as a draft.*approved published version/);
  });
  await t.test("Unauthorized migration leaves browser originals untouched", async () => {
    const before = storage.get(key);
    const transport = globalThis.quizTestFetch;
    globalThis.quizTestFetch = (path, options) => originalFetch(base + path, options);
    try { await assert.rejects(loadTeacherQuizCourse(frontendCourse, owner.email), /session|log in/i); }
    finally { globalThis.quizTestFetch = transport; }
    assert.equal(storage.get(key), before);
    assert.equal((await request(`/quizzes/courses/${courseId}/teacher`, { actor: "other" })).code, 403);
  });
  await t.test("Enrolled students load published quizzes and submit results to MongoDB", async () => {
    assert.equal((await request(`/quizzes/courses/${courseId}/student`, { actor: "student" })).code, 403);
    await ContentAccess.create({ studentId: student._id, kind: "course", contentId: course._id, source: "free", price: 0 });
    const library = await request(`/quizzes/courses/${courseId}/student`, { actor: "student" });
    assert.equal(library.code, 200, JSON.stringify(library.data));
    assert.equal(library.data.quizzes.length, 2);
    assert.equal(library.data.quizzes[0].questions[0].correct, undefined);
    const quiz = library.data.quizzes.find(q => q.id === quizId);
    const start = await request(`/quizzes/courses/${courseId}/student/${quizId}/start`, { actor: "student", method: "POST" });
    assert.equal(start.code, 201);
    const attempt = await request(`/quizzes/courses/${courseId}/student/${quizId}/attempts`, { actor: "student", method: "POST", body: { sessionId: start.data.sessionId, revision: quiz.revision, answers: { 0: 0 } } });
    assert.equal(attempt.code, 201, JSON.stringify(attempt.data));
    assert.equal(attempt.data.attempt.percentage, 100);
    const teacher = await request(`/quizzes/courses/${courseId}/teacher`);
    assert.equal(teacher.data.attempts.length, 1);
    assert.equal(teacher.data.attempts[0].studentEmail, student.email);
    assert.equal(teacher.data.students[0].email, student.email);
  });
  await t.test("Deleting an imported quiz does not restore its browser backup", async () => {
    assert.equal((await request(`/quizzes/courses/${courseId}/teacher/${quizId}`, { method: "DELETE" })).code, 200);
    const result = await loadTeacherQuizCourse(frontendCourse, owner.email);
    assert.ok(result.quizzes.every(q => q.id !== quizId));
  });
});

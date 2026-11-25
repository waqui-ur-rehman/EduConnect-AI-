import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { unlink, readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Teacher from "../src/models/Teacher.js";
import Student from "../src/models/Student.js";
import Admin from "../src/models/Admin.js";
import Course from "../src/models/Course.js";
import CourseCurriculum from "../src/models/CourseCurriculum.js";
import TeacherBook from "../src/models/TeacherBook.js";
import ContentFile from "../src/models/ContentFile.js";
import ContentAccess from "../src/models/ContentAccess.js";
import Lesson from "../src/models/Lesson.js";

test("Teacher to Admin to Student workflow and security through real HTTP and MongoDB", { timeout: 90000 }, async (t) => {
  // This suite creates and removes only its uniquely named, disposable database.
  const database = `educonnect_content_test_${randomUUID().replaceAll("-", "")}`;
  const previousEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  process.env.CONTENT_DEMO_CHECKOUT = "true";
  process.env.JWT_SECRET = "content-integration-test-only-secret-32-characters";
  process.env.CLIENT_ORIGIN = "http://localhost:5173";
  await mongoose.connect("mongodb://127.0.0.1:27017", { dbName: database, serverSelectionTimeoutMS: 5000 });
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    for (const file of await ContentFile.find().lean()) {
      await unlink(fileURLToPath(new URL(`../uploads/content/${file.storageName}`, import.meta.url))).catch(() => {});
    }
    assert.equal(mongoose.connection.name, database);
    assert.ok(database.startsWith("educonnect_content_test_"));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    process.env.NODE_ENV = previousEnvironment;
  });
  await Promise.all([Teacher, Student, Admin, Course, CourseCurriculum, TeacherBook, ContentFile, ContentAccess, Lesson].map((Model) => Model.init()));
  const { default: app } = await import("../src/app.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const password = "Test-password-12345";
  const accounts = {};
  for (const [name, Model, role] of [["owner", Teacher, "teacher"], ["other", Teacher, "teacher"], ["student", Student, "student"], ["admin", Admin, "admin"]]) {
    accounts[name] = await Model.create({ fullName: `Test ${name}`, email: `${name}@example.test`, password, role });
  }
  const cookies = {};
  async function request(path, { actor, method = "GET", body, form, headers = {} } = {}) {
    const response = await fetch(base + path, { method, headers: {
      Origin: "http://localhost:5173", "X-Requested-With": "XMLHttpRequest",
      ...(actor ? { Cookie: cookies[actor] } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}), ...headers,
    }, body: form || (body ? JSON.stringify(body) : undefined) });
    const data = response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.arrayBuffer();
    return { response, data, code: response.status };
  }
  for (const name of Object.keys(accounts)) {
    const login = await request("/auth/login", { method: "POST", body: { email: accounts[name].email, password } });
    assert.equal(login.code, 200);
    assert.match(login.response.headers.get("set-cookie"), /HttpOnly/i);
    cookies[name] = login.response.headers.get("set-cookie").split(";")[0];
  }
  let course;
  const input = { title: "Integration course", description: "Complete course description", metadata: { category: "Development", price: 0, requirements: ["Browser"], learningOutcomes: ["Build a course"] },
    lessons: [{ id: "lesson-1", title: "First lesson", content: "Approved lesson body", order: 0, isFreePreview: false }], legacyId: "repeat-safe-import" };
  await t.test("Unverified teacher creates a draft, ownership is server assigned and retries do not duplicate", async () => {
    assert.equal((await request("/content/courses", { method: "POST", body: input })).code, 401);
    const created = await request("/content/courses", { actor: "owner", method: "POST", body: input });
    assert.equal(created.code, 201, JSON.stringify(created.data));
    course = created.data.item;
    assert.equal(course.teacherId, String(accounts.owner._id));
    const repeated = await request("/content/courses", { actor: "owner", method: "POST", body: input });
    assert.equal(repeated.data.item.id, course.id);
    assert.equal(await Course.countDocuments(), 1);
    for (const patch of [{ status: "published" }, { approvedVersion: input }, { teacherId: String(accounts.other._id) }, { published: true }]) {
      assert.equal((await request(`/content/courses/${course.id}`, { actor: "owner", method: "PATCH", body: { revision: course.revision, ...patch } })).code, 400);
    }
    assert.equal((await request(`/content/courses/${course.id}`, { actor: "other", method: "PATCH", body: { title: "Stolen", revision: 0 } })).code, 403);
    assert.equal((await request(`/content/courses/${course.id}`, { actor: "student" })).code, 403);
    assert.equal((await request("/content/catalog")).data.courses.length, 0);
  });
  await t.test("Submission appears in Admin Review and only Admin can approve", async () => {
    const submitted = await request(`/content/courses/${course.id}/submit`, { actor: "owner", method: "POST", body: { revision: course.revision } });
    assert.equal(submitted.code, 200);
    course = submitted.data.item;
    const queue = await request("/content/courses/admin", { actor: "admin" });
    assert.equal(queue.data.items[0].status, "Pending Approval");
    assert.equal((await request(`/content/courses/${course.id}/review`, { actor: "owner", method: "POST", body: { decision: "approve", revision: course.revision } })).code, 403);
    assert.equal((await request(`/content/courses/${course.id}/lessons`, { actor: "student" })).code, 403);
    const review = await request(`/content/courses/${course.id}/review`, { actor: "admin", method: "POST", body: { decision: "approve", revision: course.revision } });
    assert.equal(review.code, 200, JSON.stringify(review.data));
    course = review.data.item;
    assert.equal(course.status, "Published");
    assert.equal(course.reviewedBy, String(accounts.admin._id));
    assert.ok(course.reviewedAt);
    const catalog = await request("/content/catalog");
    assert.equal(catalog.data.courses[0].title, input.title);
    assert.equal(catalog.data.courses[0].lessons[0].content, undefined);
  });
  await t.test("Enrollment is persisted and required to receive private lesson bodies", async () => {
    const enrolled = await request("/content/enrollments", { actor: "student", method: "POST", body: { items: [{ id: course.id, kind: "course" }] } });
    assert.equal(enrolled.code, 200);
    const state = await request("/content/state", { actor: "student" });
    assert.equal(state.data.accesses.length, 1);
    assert.equal(state.data.courses[0].lessons[0].content, "Approved lesson body");
    assert.equal((await request(`/content/courses/${course.id}`, { actor: "student" })).data.item.lessons[0].content, "Approved lesson body");
  });
  await t.test("Edits, stale writes, rejection and reapproval preserve the last approved version", async () => {
    const oldRevision = course.revision;
    const edited = await request(`/content/courses/${course.id}`, { actor: "owner", method: "PATCH", body: { title: "Revised course", lessons: [{ id: "lesson-1", title: "First lesson", content: "Unreviewed lesson body" }], revision: oldRevision } });
    assert.equal(edited.code, 200);
    course = edited.data.item;
    assert.equal((await request(`/content/courses/${course.id}`, { actor: "owner", method: "PATCH", body: { title: "Stale", revision: oldRevision } })).code, 409);
    let visible = (await request(`/content/courses/${course.id}`, { actor: "student" })).data.item;
    assert.equal(visible.title, input.title);
    assert.equal(visible.lessons[0].content, "Approved lesson body");
    course = (await request(`/content/courses/${course.id}/submit`, { actor: "owner", method: "POST", body: { revision: course.revision } })).data.item;
    const rejected = await request(`/content/courses/${course.id}/review`, { actor: "admin", method: "POST", body: { decision: "reject", revision: course.revision, reason: "Improve the lesson" } });
    assert.equal(rejected.code, 200);
    course = rejected.data.item;
    assert.equal(course.rejectionReason, "Improve the lesson");
    visible = (await request(`/content/courses/${course.id}`, { actor: "student" })).data.item;
    assert.equal(visible.lessons[0].content, "Approved lesson body");
    course = (await request(`/content/courses/${course.id}/submit`, { actor: "owner", method: "POST", body: { revision: course.revision } })).data.item;
    course = (await request(`/content/courses/${course.id}/review`, { actor: "admin", method: "POST", body: { decision: "approve", revision: course.revision } })).data.item;
    assert.equal((await request(`/content/courses/${course.id}`, { actor: "student" })).data.item.lessons[0].content, "Unreviewed lesson body");
  });
  await t.test("Curriculum modules, ordering and assessment references are owner-only and approval-gated", async () => {
    const quizResult = await request(`/quizzes/courses/${course.id}/teacher`, { actor: "owner", method: "POST", body: {
      title: "Linked curriculum quiz", passingScore: 60, timeLimit: 0,
      questions: [{ id: "linked-q1", prompt: "Choose the correct answer", options: ["Correct", "Wrong 1", "Wrong 2", "Wrong 3"], correct: 0 }],
    } });
    assert.equal(quizResult.code, 201, JSON.stringify(quizResult.data));
    const quizId = String(quizResult.data.quiz._id || quizResult.data.quiz.id);
    assert.equal((await request(`/quizzes/courses/${course.id}/teacher/${quizId}/publish`, { actor: "owner", method: "PATCH", body: { published: true } })).code, 200);

    const assignmentResult = await request(`/assignments/courses/${course.id}/teacher`, { actor: "owner", method: "POST", body: {
      title: "Linked curriculum assignment", description: "Approved assignment", instructions: "Submit your answer.", maxMarks: 20, dueAt: null, attachmentIds: [],
    } });
    assert.equal(assignmentResult.code, 201, JSON.stringify(assignmentResult.data));
    const assignmentId = String(assignmentResult.data.assignment._id || assignmentResult.data.assignment.id);
    assert.equal((await request(`/assignments/courses/${course.id}/teacher/${assignmentId}/publish`, { actor: "owner", method: "PATCH", body: { published: true } })).code, 200);

    const curriculum = { sections: [
      { id: "module-2", title: "Advanced", lessonIds: ["lesson-1", "lesson-1"] },
      { id: "module-1", title: "Foundation", lessonIds: ["lesson-1"] },
    ], resources: [], links: [
      { sectionId: "module-1", type: "quiz", id: quizId },
      { sectionId: "module-1", type: "quiz", id: quizId },
      { sectionId: "module-2", type: "assignment", id: assignmentId },
    ] };
    assert.equal((await request(`/content/courses/${course.id}`, { actor: "other", method: "PATCH", body: { revision: course.revision, metadata: { curriculum } } })).code, 403);
    const saved = await request(`/content/courses/${course.id}`, { actor: "owner", method: "PATCH", body: { revision: course.revision, metadata: { curriculum } } });
    assert.equal(saved.code, 200, JSON.stringify(saved.data));
    course = saved.data.item;
    assert.deepEqual(course.curriculum.sections.map(section => section.id), ["module-2", "module-1"]);
    assert.deepEqual(course.curriculum.sections.map(section => section.lessonIds), [["lesson-1"], []]);
    assert.equal(course.curriculum.links[0].id, quizId);
    assert.equal(course.curriculum.links.length, 2);
    let storedCurriculum = await CourseCurriculum.findOne({ courseId: course.id }).lean();
    assert.deepEqual(storedCurriculum.curriculum.sections.map(section => section.id), ["module-2", "module-1"]);
    assert.equal(storedCurriculum.approvedCurriculum, null);
    assert.equal(String(storedCurriculum.teacherId), String(accounts.owner._id));
    assert.equal((await request(`/content/courses/${course.id}`, { actor: "student" })).data.item.curriculum, undefined);

    course = (await request(`/content/courses/${course.id}/submit`, { actor: "owner", method: "POST", body: { revision: course.revision } })).data.item;
    course = (await request(`/content/courses/${course.id}/review`, { actor: "admin", method: "POST", body: { decision: "approve", revision: course.revision } })).data.item;
    let visible = (await request(`/content/courses/${course.id}`, { actor: "student" })).data.item;
    assert.deepEqual(visible.curriculum.sections.map(section => section.id), ["module-2", "module-1"]);
    assert.deepEqual(visible.curriculum.links.map(link => link.id), [quizId, assignmentId]);
    assert.equal((await request(`/quizzes/courses/${course.id}/student`, { actor: "student" })).data.quizzes[0].id, quizId);
    assert.equal(String((await request(`/assignments/courses/${course.id}/student`, { actor: "student" })).data.assignments[0]._id), assignmentId);

    const reordered = { ...curriculum, sections: [...curriculum.sections].reverse() };
    course = (await request(`/content/courses/${course.id}`, { actor: "owner", method: "PATCH", body: { revision: course.revision, metadata: { curriculum: reordered } } })).data.item;
    visible = (await request(`/content/courses/${course.id}`, { actor: "student" })).data.item;
    assert.deepEqual(visible.curriculum.sections.map(section => section.id), ["module-2", "module-1"]);
    course = (await request(`/content/courses/${course.id}/submit`, { actor: "owner", method: "POST", body: { revision: course.revision } })).data.item;
    course = (await request(`/content/courses/${course.id}/review`, { actor: "admin", method: "POST", body: { decision: "approve", revision: course.revision } })).data.item;
    visible = (await request(`/content/courses/${course.id}`, { actor: "student" })).data.item;
    assert.deepEqual(visible.curriculum.sections.map(section => section.id), ["module-1", "module-2"]);
    storedCurriculum = await CourseCurriculum.findOne({ courseId: course.id }).lean();
    assert.deepEqual(storedCurriculum.approvedCurriculum.sections.map(section => section.id), ["module-1", "module-2"]);
    assert.equal(storedCurriculum.status, "published");
  });
  let pdfId;
  await t.test("Private uploads reject spoofed files and enforce approval, ownership and purchase", async () => {
    const upload = async (actor, type, bytes, mime, name) => {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: mime }), name);
      return request(`/content/files/${type}`, { actor, method: "POST", form });
    };
    assert.equal((await upload("owner", "pdf", "fake PDF", "application/pdf", "fake.pdf")).code, 400);
    const uploaded = await upload("owner", "pdf", "%PDF-1.7\nIntegration test PDF\n%%EOF", "application/pdf", "test.pdf");
    assert.equal(uploaded.code, 201, JSON.stringify(uploaded.data));
    pdfId = uploaded.data.file.id;
    assert.equal((await request(`/content/files/${pdfId}`)).code, 401);
    assert.equal((await request(`/content/files/${pdfId}`, { actor: "other" })).code, 403);
    assert.equal((await request(`/content/files/${pdfId}`, { actor: "student" })).code, 403);
    assert.equal((await request(`/content/files/${pdfId}`, { actor: "admin" })).code, 200);
    const stolen = await request("/content/books", { actor: "other", method: "POST", body: { title: "Stolen book", metadata: { pdfFileId: pdfId } } });
    assert.equal(stolen.code, 400);
    const createBookBody = { title: "Real book", description: "Book description", legacyId: "book-upload-retry", metadata: { pdfFileId: pdfId, price: 120, isFree: false, subject: "Programming", category: "Programming" } };
    let book = (await request("/content/books", { actor: "owner", method: "POST", body: createBookBody })).data.item;
    const retry = await request("/content/books", { actor: "owner", method: "POST", body: createBookBody });
    assert.equal(retry.data.item.id, book.id);
    assert.equal(await TeacherBook.countDocuments({ teacherId: accounts.owner._id, legacyId: "book-upload-retry" }), 1);
    assert.equal((await request("/content/books/mine", { actor: "owner" })).data.items[0].category, "Programming");
    const storedFile = await ContentFile.findById(pdfId).lean();
    assert.match(String(await readFile(fileURLToPath(new URL(`../uploads/content/${storedFile.storageName}`, import.meta.url)))), /^%PDF-/);
    assert.equal((await request(`/content/books/${book.id}`, { actor: "other", method: "PATCH", body: { revision: book.revision, title: "Unauthorized edit" } })).code, 403);
    assert.equal((await request(`/content/books/${book.id}`, { actor: "other", method: "DELETE", headers: { "If-Match": String(book.revision) } })).code, 403);
    book = (await request(`/content/books/${book.id}/submit`, { actor: "owner", method: "POST", body: { revision: book.revision } })).data.item;
    assert.equal((await request("/content/books/admin", { actor: "admin" })).data.items[0].status, "Pending Approval");
    assert.equal((await request(`/content/books/${book.id}/review`, { actor: "owner", method: "POST", body: { decision: "approve", revision: book.revision } })).code, 403);
    book = (await request(`/content/books/${book.id}/review`, { actor: "admin", method: "POST", body: { decision: "approve", revision: book.revision } })).data.item;
    const approvedBook = await TeacherBook.findById(book.id).lean();
    assert.equal(approvedBook.status, "published");
    assert.equal(String(approvedBook.reviewedBy), String(accounts.admin._id));
    assert.equal(approvedBook.approvedVersion.metadata.category, "Programming");
    assert.equal((await request("/content/catalog")).data.books.length, 1);
    assert.equal((await request(`/content/files/${pdfId}`, { actor: "student" })).code, 403);
    process.env.NODE_ENV = "production";
    assert.equal((await request("/content/enrollments", { actor: "student", method: "POST", body: { items: [{ kind: "book", id: book.id }] } })).code, 402);
    process.env.NODE_ENV = "test";
    assert.equal((await request("/content/enrollments", { actor: "student", method: "POST", body: { items: [{ kind: "book", id: book.id }] } })).code, 200);
    assert.equal((await request(`/content/files/${pdfId}`, { actor: "student", headers: { Range: "bytes=0-7" } })).code, 206);
    assert.equal((await request(`/content/files/${pdfId}`, { actor: "student", headers: { Range: "bytes=999999-" } })).code, 416);
    book = (await request(`/content/books/${book.id}`, { actor: "owner", method: "PATCH", body: { revision: book.revision, title: "Unapproved book edit" } })).data.item;
    assert.equal((await request("/content/catalog")).data.books[0].title, "Real book");
    await request(`/content/books/${book.id}/review`, { actor: "admin", method: "POST", body: { decision: "unpublish", revision: book.revision } });
    assert.equal((await request(`/content/files/${pdfId}`, { actor: "student" })).code, 403);
  });
  await t.test("Lesson writes and deletions are owner-only and use the course revision", async () => {
    assert.equal((await request(`/content/courses/${course.id}/lessons`, { actor: "other", method: "POST", body: { title: "Attack", revision: course.revision } })).code, 403);
    const added = await request(`/content/courses/${course.id}/lessons`, { actor: "owner", method: "POST", body: { title: "New lesson", content: "New content", revision: course.revision } });
    assert.equal(added.code, 200);
    course = added.data.item;
    const lessonId = course.lessons[1].id;
    assert.equal((await request(`/content/courses/${course.id}/lessons/${lessonId}`, { actor: "other", method: "DELETE", headers: { "If-Match": String(course.revision) } })).code, 403);
    const removed = await request(`/content/courses/${course.id}/lessons/${lessonId}`, { actor: "owner", method: "DELETE", headers: { "If-Match": String(course.revision) } });
    assert.equal(removed.code, 200);
    course = removed.data.item;
    assert.equal(course.lessons.length, 1);
    assert.equal((await request(`/content/courses/${course.id}`, { actor: "other", method: "DELETE", headers: { "If-Match": String(course.revision) } })).code, 403);
    assert.equal((await request(`/content/courses/${course.id}`, { actor: "owner", method: "DELETE", headers: { "If-Match": String(course.revision) } })).code, 200);
    assert.equal((await request("/content/catalog")).data.courses.length, 0);
    assert.ok(await Course.findById(course.id));
  });
  await t.test("Legacy MongoDB records remain intact and require explicit review", async () => {
    const legacy = await Course.create({ teacherId: accounts.owner._id, title: "Legacy course", description: "Legacy description", status: "published" });
    await Lesson.create({ courseId: legacy._id, title: "Legacy lesson", content: "Legacy content", order: 0 });
    const owned = await request(`/content/courses/${legacy._id}`, { actor: "owner" });
    assert.equal(owned.data.item.status, "Draft");
    assert.equal(owned.data.item.lessons[0].content, "Legacy content");
    assert.equal((await request(`/content/courses/${legacy._id}`, { actor: "student" })).code, 403);
    assert.equal((await request("/content/catalog")).data.courses.length, 0);
    assert.equal(await Lesson.countDocuments({ courseId: legacy._id }), 1);
  });
  await t.test("Concurrent edits, video previews and curriculum files respect approval boundaries", async () => {
    async function upload(kind, bytes, mimeType, name) {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: mimeType }), name);
      const result = await request(`/content/files/${kind}`, { actor: "owner", method: "POST", form });
      assert.equal(result.code, 201, JSON.stringify(result.data));
      return result.data.file.id;
    }
    const video = await upload("video", Buffer.from([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0,105,115,111,109,109,112,52,50]), "video/mp4", "lesson.mp4");
    const preview = await upload("video", Buffer.from([26,69,223,163,0,1,2,3,4,5,6,7,8,9,10,11]), "video/webm", "preview.webm");
    const attachment = await upload("document", "A text lesson attachment", "text/plain", "notes.txt");
    let record = (await request("/content/courses", { actor: "owner", method: "POST", body: {
      title: "Video course", description: "Video and attachment review", metadata: { price: 0,
        curriculum: { sections: [{ id: "module", title: "Introduction", lessonIds: ["private", "preview"] }],
          resources: [{ id: `remote:${attachment}`, fileId: attachment, lessonId: "private", name: "notes.txt", size: 24 },
            { id: `shared:${attachment}`, fileId: attachment, lessonId: "private", name: "notes-copy.txt", size: 24 }], links: [] } },
      lessons: [{ id: "private", title: "Private video", videoFileId: video }, { id: "preview", title: "Preview video", videoFileId: preview, isFreePreview: true }],
    } })).data.item;
    assert.deepEqual(record.curriculum.resources.map(resource => resource.name), ["notes.txt", "notes-copy.txt"]);
    assert.equal((await request(`/content/files/${preview}`, { actor: "student" })).code, 403);
    const edits = await Promise.all(["Concurrent one", "Concurrent two"].map((title) => request(`/content/courses/${record.id}`, { actor: "owner", method: "PATCH", body: { title, revision: record.revision } })));
    assert.deepEqual(edits.map((entry) => entry.code).sort(), [200, 409]);
    record = edits.find((entry) => entry.code === 200).data.item;
    record = (await request(`/content/courses/${record.id}/submit`, { actor: "owner", method: "POST", body: { revision: record.revision } })).data.item;
    record = (await request(`/content/courses/${record.id}/review`, { actor: "admin", method: "POST", body: { decision: "approve", revision: record.revision } })).data.item;
    assert.equal((await request(`/content/files/${preview}`, { actor: "student" })).code, 200);
    assert.equal((await request(`/content/files/${video}`, { actor: "student" })).code, 403);
    assert.equal((await request(`/content/files/${attachment}`, { actor: "student" })).code, 403);
    assert.equal((await request("/content/enrollments", { actor: "student", method: "POST", body: { items: [{ id: record.id, kind: "course" }] } })).code, 200);
    const part = await request(`/content/files/${video}`, { actor: "student", headers: { Range: "bytes=0-7" } });
    assert.equal(part.code, 206);
    assert.equal(part.data.byteLength, 8);
    assert.equal((await request(`/content/files/${attachment}`, { actor: "student" })).code, 200);
    const revised = await request(`/content/courses/${record.id}/lessons/private`, { actor: "owner", method: "DELETE", headers: { "If-Match": String(record.revision) } });
    assert.equal(revised.code, 200, JSON.stringify(revised.data));
    assert.equal(revised.data.item.curriculum.resources.length, 0);
    assert.equal((await request(`/content/files/${attachment}`, { actor: "student" })).code, 200);
  });
  await t.test("The actual frontend API adapter saves, submits, reviews and reloads the same content", async () => {
    const originalWindow = globalThis.window;
    globalThis.window = new EventTarget();
    globalThis.window.sessionStorage = { getItem: () => null };
    globalThis.__contentTestEnv = { DEV: false };
    let actor = "owner";
    globalThis.__contentTestApi = { apiBase: base, apiFetch: (path, options = {}) => fetch(base + path, {
      ...options, headers: { ...Object.fromEntries(new Headers(options.headers)), Cookie: cookies[actor],
        Origin: "http://localhost:5173", "X-Requested-With": "XMLHttpRequest" },
    }) };
    try {
      const source = (await readFile(new URL("../../src/utils/contentApi.js", import.meta.url), "utf8"))
        .replace('import { apiBase, apiFetch } from "./api";', 'const { apiBase, apiFetch } = globalThis.__contentTestApi;')
        .replace('import { isDevelopmentAdminSession } from "./devAdminSession";', 'const isDevelopmentAdminSession = () => false;')
        .replaceAll("import.meta.env", "globalThis.__contentTestEnv");
      const client = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
      await client.refreshContent();
      let item = await client.saveContent("courses", { id: "frontend-contract", title: "Frontend course", description: "Frontend description", price: 0,
        requirements: "A browser\nInternet", learningOutcomes: "Learn safely", lessons: [{ id: "client-lesson", title: "Client lesson", content: "Private client content" }] });
      assert.equal(item.mongoContent, true);
      assert.deepEqual(item.requirements, ["A browser", "Internet"]);
      item = await client.submitContent("courses", item);
      assert.equal(client.getManagedCourses(accounts.owner.email).find((entry) => entry.id === item.id).status, "Pending Approval");
      actor = "admin";
      client.clearContentSession();
      await client.refreshContent(true);
      await client.reviewContent("courses", item, "approve");
      actor = "student";
      client.clearContentSession();
      await client.refreshContent(true);
      let published = client.getContentState().courses.find((entry) => entry.id === item.id);
      assert.ok(published);
      assert.equal(published.lessons[0].content, undefined);
      await client.enrollContent([published]);
      published = client.getContentState().courses.find((entry) => entry.id === item.id);
      assert.equal(published.lessons[0].content, "Private client content");
    } finally {
      globalThis.window = originalWindow;
      delete globalThis.__contentTestApi;
      delete globalThis.__contentTestEnv;
    }
  });
  await t.test("Vite blocks direct filesystem access to private uploads", async () => {
    const { createServer } = await import("vite");
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const sentinel = fileURLToPath(new URL(`../uploads/content/storage-test-${randomUUID()}`, import.meta.url));
    await mkdir(fileURLToPath(new URL("../uploads/content/", import.meta.url)), { recursive: true });
    await writeFile(sentinel, "private-test-content", { flag: "wx" });
    const vite = await createServer({ root, configFile: root + "vite.config.js", logLevel: "silent", server: { port: 0, host: "127.0.0.1", hmr: false } });
    try {
      await vite.listen();
      const url = `http://127.0.0.1:${vite.httpServer.address().port}`;
      const response = await fetch(url + "/backend/uploads/content/" + sentinel.split(/[\\/]/).at(-1));
      assert.equal(response.status, 403);
      const direct = await fetch(url + "/@fs/" + sentinel.replaceAll("\\", "/"));
      assert.equal(direct.status, 403);
    } finally {
      await vite.close();
      await unlink(sentinel);
    }
  });
});

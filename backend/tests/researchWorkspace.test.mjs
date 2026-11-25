import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import Student from "../src/models/Student.js";
import Teacher from "../src/models/Teacher.js";
import Admin from "../src/models/Admin.js";
import Course from "../src/models/Course.js";
import ContentAccess from "../src/models/ContentAccess.js";
import ResearchRecord from "../src/models/ResearchRecord.js";

// Phase 7 — Research Workspace: MongoDB-backed records with strict ownership,
// validation, course-link access rules and duplicate-aware import.
test("Phase 7 Research Workspace through real HTTP and MongoDB", { timeout: 120000 }, async (t) => {
  const database = `educonnect_research_test_${randomUUID().replaceAll("-", "")}`;
  const previousEnv = { ...process.env };
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "research-integration-test-secret-32chars";
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
  await Promise.all([Student, Teacher, Admin, Course, ContentAccess, ResearchRecord].map((Model) => Model.init()));
  const { default: app } = await import("../src/app.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const password = "Test-password-12345";
  const accounts = {};
  for (const [name, Model, role] of [
    ["owner", Teacher, "teacher"], ["other", Teacher, "teacher"],
    ["student", Student, "student"], ["student2", Student, "student"],
    ["admin", Admin, "admin"],
  ]) {
    accounts[name] = await Model.create({ fullName: `Research ${name}`, email: `${name}@research.test`, password, role });
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

  // Publish a real course owned by "owner" and enroll "student" in it.
  const courseInput = {
    title: "Research methods companion course",
    description: "A complete course used to verify research record course links.",
    metadata: { category: "Education", price: 0, learningOutcomes: ["Link research records"] },
    lessons: [
      { id: "lesson-1", title: "First lesson", content: "Content one", order: 0 },
      { id: "lesson-2", title: "Second lesson", content: "Content two", order: 1 },
    ],
  };
  let course = (await request("/content/courses", { actor: "owner", method: "POST", body: courseInput })).data.item;
  course = (await request(`/content/courses/${course.id}/submit`, { actor: "owner", method: "POST", body: { revision: course.revision } })).data.item;
  course = (await request(`/content/courses/${course.id}/review`, { actor: "admin", method: "POST", body: { decision: "approve", revision: course.revision } })).data.item;
  const enrolled = await request("/content/enrollments", { actor: "student", method: "POST", body: { items: [{ id: course.id, kind: "course" }] } });
  assert.equal(enrolled.code, 200, JSON.stringify(enrolled.data));
  const state = {};

  await t.test("1. Students can create every research record type in MongoDB", async () => {
    const types = ["project", "paper", "matrix", "reference", "dataset", "experiment"];
    for (const type of types) {
      const created = await request("/research/records", { actor: "student", method: "POST", body: {
        type, title: `My ${type} record ${type.length}`, payload: { question: "Why does this matter?" }, tags: ["Methods", "methods", "Study"],
      } });
      assert.equal(created.code, 201, `${type}: ${JSON.stringify(created.data)}`);
      assert.equal(created.data.record.type, type);
      assert.equal(created.data.record.tags.length, 2, "Tags are normalized and de-duplicated");
    }
    const list = await request("/research/records", { actor: "student" });
    assert.equal(list.code, 200);
    assert.equal(list.data.total, 6, "All six records are stored server-side");
    const doc = await ResearchRecord.findOne({ type: "project" }).lean();
    assert.ok(doc, "The record lives in the research_records collection");
    assert.ok(mongoose.isValidObjectId(String(doc._id)));
    // Defaults for types with a status lifecycle.
    const project = list.data.records.find((record) => record.type === "project");
    assert.equal(project.status, "Planning", "Projects default to Planning");
    const paper = list.data.records.find((record) => record.type === "paper");
    assert.equal(paper.status, "Planned", "Papers default to Planned");
  });

  await t.test("2. Invalid input is rejected before any write", async () => {
    const badType = await request("/research/records", { actor: "student", method: "POST", body: { type: "meme", title: "Valid title here" } });
    assert.equal(badType.code, 400);
    assert.ok(Array.isArray(badType.data.validTypes));
    const shortTitle = await request("/research/records", { actor: "student", method: "POST", body: { type: "project", title: "ab" } });
    assert.equal(shortTitle.code, 400);
    const badUrl = await request("/research/records", { actor: "student", method: "POST", body: { type: "paper", title: "A valid paper title", payload: { url: "javascript:alert(1)" } } });
    assert.equal(badUrl.code, 400, "Unsafe URLs are rejected");
    const badStatus = await request("/research/records", { actor: "student", method: "POST", body: { type: "project", title: "Another valid title", status: "Donezo" } });
    assert.equal(badStatus.code, 400, "Unknown statuses are rejected");
    const before = await ResearchRecord.countDocuments({ ownerId: accounts.student._id });
    assert.equal(before, 6, "No document was written for rejected requests");
  });

  await t.test("3. Records are private to their owner", async () => {
    const mine = await request("/research/records", { actor: "student" });
    state.recordId = mine.data.records[0].id;
    const otherList = await request("/research/records", { actor: "student2" });
    assert.equal(otherList.data.total, 0, "Another student sees an empty workspace");
    const otherGet = await request(`/research/records/${state.recordId}`, { actor: "student2" });
    assert.equal(otherGet.code, 404, "Foreign records read as not found");
    const otherPatch = await request(`/research/records/${state.recordId}`, { actor: "student2", method: "PATCH", body: { type: "project", title: "Hijacked record title" } });
    assert.equal(otherPatch.code, 404, "Foreign updates are rejected");
    const otherDelete = await request(`/research/records/${state.recordId}`, { actor: "student2", method: "DELETE" });
    assert.equal(otherDelete.code, 404, "Foreign deletes are rejected");
    const stillThere = await ResearchRecord.findById(state.recordId).lean();
    assert.ok(stillThere, "The owner's record still exists");
    assert.equal(stillThere.title, mine.data.records[0].title);
    const anon = await request("/research/records");
    assert.equal(anon.code, 401, "Anonymous callers are rejected");
    const asAdmin = await request("/research/records", { actor: "admin" });
    assert.equal(asAdmin.code, 403, "Admins do not get a research workspace");
  });

  await t.test("4. Course links enforce enrollment and teaching ownership", async () => {
    const linked = await request("/research/records", { actor: "student", method: "POST", body: {
      type: "project", title: "Linked project record", courseId: course.id, payload: { question: "Linked question?" },
    } });
    assert.equal(linked.code, 201, JSON.stringify(linked.data));
    assert.equal(linked.data.record.courseId, course.id);
    assert.equal(linked.data.record.courseTitle, courseInput.title, "The course title is resolved for display");
    const noAccess = await request("/research/records", { actor: "student2", method: "POST", body: { type: "project", title: "Unenrolled link attempt", courseId: course.id } });
    assert.equal(noAccess.code, 403, "Unenrolled students cannot link the course");
    const teacherOwn = await request("/research/records", { actor: "owner", method: "POST", body: { type: "paper", title: "Teacher linked paper", courseId: course.id, payload: { year: "2026" } } });
    assert.equal(teacherOwn.code, 201, "Teachers link their own courses");
    const teacherForeign = await request("/research/records", { actor: "other", method: "POST", body: { type: "paper", title: "Foreign course paper", courseId: course.id } });
    assert.equal(teacherForeign.code, 403, "Teachers cannot link courses they do not teach");
    const badCourse = await request("/research/records", { actor: "student", method: "POST", body: { type: "project", title: "Bad course id record", courseId: "not-an-id" } });
    assert.equal(badCourse.code, 400, "Malformed course ids are rejected");
    // Course-scoped listing obeys the same rules.
    const linkedList = await request(`/research/courses/${course.id}/records`, { actor: "student" });
    assert.equal(linkedList.code, 200);
    assert.equal(linkedList.data.count, 1, "Only the enrolled student's linked records are returned");
    const otherLinked = await request(`/research/courses/${course.id}/records`, { actor: "student2" });
    assert.equal(otherLinked.code, 403, "Unenrolled students cannot read linked records");
    const teacherLinked = await request(`/research/courses/${course.id}/records`, { actor: "owner" });
    assert.equal(teacherLinked.code, 200);
    assert.equal(teacherLinked.data.count, 1, "The teacher sees their own linked record");
    const foreignTeacherLinked = await request(`/research/courses/${course.id}/records`, { actor: "other" });
    assert.equal(foreignTeacherLinked.code, 403);
  });

  await t.test("5. Listing supports type, search and pagination filters", async () => {
    const byType = await request("/research/records?type=paper", { actor: "student" });
    assert.ok(byType.data.records.every((record) => record.type === "paper"));
    assert.ok(byType.data.total >= 1);
    assert.equal(byType.data.total, await ResearchRecord.countDocuments({ ownerId: accounts.student._id, type: "paper" }));
    const search = await request("/research/records?q=linked+project", { actor: "student" });
    assert.ok(search.data.records.some((record) => record.title === "Linked project record"));
    const noMatch = await request("/research/records?q=zzz-no-such-record", { actor: "student" });
    assert.equal(noMatch.data.total, 0);
    const paged = await request("/research/records?limit=2&page=1", { actor: "student" });
    assert.equal(paged.data.records.length, 2);
    assert.ok(paged.data.pageCount > 1);
    const byCourse = await request(`/research/records?courseId=${course.id}`, { actor: "student" });
    assert.equal(byCourse.data.total, 1, "The course filter returns the linked record");
    const all = await request("/research/records?type=all", { actor: "student" });
    assert.ok(all.data.total >= 7);
  });

  await t.test("6. Owners update and archive their records with validation", async () => {
    const updated = await request(`/research/records/${state.recordId}`, { actor: "student", method: "PATCH", body: {
      type: "project", title: "Renamed research project", payload: { question: "Updated question?", status: "In Progress" }, status: "In Progress",
    } });
    assert.equal(updated.code, 200, JSON.stringify(updated.data));
    assert.equal(updated.data.record.title, "Renamed research project");
    assert.equal(updated.data.record.status, "In Progress");
    assert.equal(updated.data.record.payload.question, "Updated question?");
    const badStatus = await request(`/research/records/${state.recordId}`, { actor: "student", method: "PATCH", body: { type: "project", title: "Renamed research project", status: "Nope" } });
    assert.equal(badStatus.code, 400);
    const archived = await request(`/research/records/${state.recordId}/archive`, { actor: "student", method: "POST", body: {} });
    assert.equal(archived.code, 200, JSON.stringify(archived.data));
    assert.equal(archived.data.record.status, "Archived");
    const badArchive = await request(`/research/records/${state.recordId}/archive`, { actor: "student", method: "POST", body: { status: "Banana" } });
    assert.equal(badArchive.code, 200, "Unknown archive statuses fall back to a safe default");
    assert.equal(badArchive.data.record.status, "Archived");
    const foreignArchive = await request(`/research/records/${state.recordId}/archive`, { actor: "student2", method: "POST", body: {} });
    assert.equal(foreignArchive.code, 404);
  });

  await t.test("7. Import is duplicate-aware and applies the same access rules", async () => {
    const rows = [
      { type: "dataset", title: "Imported survey dataset", payload: { source: "Field survey", format: "CSV" }, tags: ["survey"] },
      { type: "experiment", title: "Imported trial experiment", payload: { hypothesis: "Sleep improves recall" }, status: "Running" },
      { type: "meme", title: "Invalid row type" },
      { type: "project", title: "Imported linked project", courseId: course.id },
      { type: "project", title: "Foreign course project", courseId: "0123456789abcdef01234567" },
    ];
    const imported = await request("/research/import", { actor: "student", method: "POST", body: { records: rows } });
    assert.equal(imported.code, 200, JSON.stringify(imported.data));
    assert.equal(imported.data.imported, 3, "Valid rows are stored");
    assert.equal(imported.data.errors.length, 2, "Invalid rows are reported");
    assert.ok(imported.data.errors.some((message) => /invalid type/.test(message)));
    assert.ok(imported.data.errors.some((message) => /cannot link/.test(message)));
    const repeat = await request("/research/import", { actor: "student", method: "POST", body: { records: rows.slice(0, 3) } });
    assert.equal(repeat.data.imported, 0, "Re-importing the same rows creates nothing");
    assert.equal(repeat.data.skipped, 3);
    // Another user importing identical rows gets their own copies.
    const foreignImport = await request("/research/import", { actor: "student2", method: "POST", body: { records: rows.slice(0, 1) } });
    assert.equal(foreignImport.data.imported, 1, "Deduplication is scoped per owner");
    const experiment = await request("/research/records?type=experiment", { actor: "student" });
    assert.equal(experiment.data.records[0].status, "Running", "Imported status values are preserved");
  });

  await t.test("8. Owners delete records permanently", async () => {
    const list = await request("/research/records", { actor: "student" });
    const target = list.data.records.find((record) => record.title === "Imported survey dataset");
    assert.ok(target);
    const removed = await request(`/research/records/${target.id}`, { actor: "student", method: "DELETE" });
    assert.equal(removed.code, 200, JSON.stringify(removed.data));
    const gone = await request(`/research/records/${target.id}`, { actor: "student" });
    assert.equal(gone.code, 404);
    const again = await request(`/research/records/${target.id}`, { actor: "student", method: "DELETE" });
    assert.equal(again.code, 404);
    const count = await ResearchRecord.countDocuments({ ownerId: accounts.student._id });
    assert.equal(count, list.data.total - 1);
  });
});

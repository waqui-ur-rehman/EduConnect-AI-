import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import Student from "../src/models/Student.js";
import Teacher from "../src/models/Teacher.js";
import Admin from "../src/models/Admin.js";
import SupportTicket from "../src/models/SupportTicket.js";

// Support workflow: Student & Teacher → MongoDB → Admin → Student/Teacher.
// Verifies the complete requester/admin workflow against real HTTP and MongoDB.
test("Support ticket workflow: Student & Teacher submissions, replies and ownership", { timeout: 120000 }, async (t) => {
  const database = `educonnect_support_wf_${randomUUID().replaceAll("-", "")}`;
  const previousEnv = { ...process.env };
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "support-workflow-integration-test-secret-32";
  process.env.CLIENT_ORIGIN = "http://localhost:5173";
  await mongoose.connect("mongodb://127.0.0.1:27017", { dbName: database, serverSelectionTimeoutMS: 5000 });
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    for (const [key, value] of Object.entries(previousEnv)) process.env[key] = value;
    for (const key of Object.keys(process.env)) {
      if (!(key in previousEnv)) delete process.env[key];
    }
  });
  await Promise.all([Student, Teacher, Admin, SupportTicket].map((Model) => Model.init()));
  const { default: app } = await import("../src/app.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const password = "Test-password-12345";
  const accounts = {};
  for (const [name, Model, role] of [["admin", Admin, "admin"], ["student", Student, "student"], ["student2", Student, "student"], ["teacher", Teacher, "teacher"], ["teacher2", Teacher, "teacher"]]) {
    accounts[name] = await Model.create({ fullName: `Support ${name}`, email: `${name}@support-workflow.test`, password, role });
  }
  const cookies = {};
  const request = async (path, { actor, method = "GET", body, query } = {}) => {
    const queryString = query ? `?${typeof query === "string" ? query : new URLSearchParams(query).toString()}` : "";
    const headers = { Origin: "http://localhost:5173", "X-Requested-With": "XMLHttpRequest", ...(actor ? { Cookie: cookies[actor] } : {}) };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(base + path + queryString, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const data = await response.json().catch(() => null);
    return { response, data, code: response.status };
  };
  for (const name of Object.keys(accounts)) {
    const login = await request("/auth/login", { method: "POST", body: { email: accounts[name].email, password } });
    assert.equal(login.code, 200, `Login failed for ${name}`);
    cookies[name] = login.response.headers.get("set-cookie").split(";")[0];
  }
  const requestAs = (actor) => (path, options) => request(path, { ...options, actor });
  const state = {};

  await t.test("1. Student submits a ticket that is stored in MongoDB", async () => {
    const submit = await requestAs("student")("/support/tickets", { method: "POST", body: {
      subject: "Help with my course video access",
      description: "The lesson video will not play after the upgrade.",
      category: "Video Lecture Problem",
      priority: "High",
      relatedRecordId: "course-abc123",
      relatedRecordTitle: "Beginner Django Course",
    } });
    assert.equal(submit.code, 201, JSON.stringify(submit.data));
    assert.equal(submit.data.ticket.requesterRole, "Student");
    assert.equal(submit.data.ticket.requesterEmail, accounts.student.email.toLowerCase());
    assert.equal(submit.data.ticket.status, "Open");
    assert.equal(submit.data.ticket.relatedRecordId, "course-abc123");
    assert.equal(submit.data.ticket.relatedRecordTitle, "Beginner Django Course");
    state.studentTicket = submit.data.ticket;
    const doc = await SupportTicket.findById(state.studentTicket.id);
    assert.ok(doc, "The student ticket is stored in MongoDB");
    assert.equal(doc.requesterEmail, accounts.student.email.toLowerCase());
    assert.equal(doc.requesterRole, "Student");
    assert.equal(doc.status, "Open");
  });

  await t.test("2. Teacher submits a ticket that is stored in MongoDB", async () => {
    const submit = await requestAs("teacher")("/support/tickets", { method: "POST", body: {
      subject: "Course approval delay notice",
      description: "My approved course is still pending review since last week.",
      category: "Course Approval Delay",
      priority: "Medium",
    } });
    assert.equal(submit.code, 201, JSON.stringify(submit.data));
    assert.equal(submit.data.ticket.requesterRole, "Teacher");
    assert.equal(submit.data.ticket.requesterEmail, accounts.teacher.email.toLowerCase());
    state.teacherTicket = submit.data.ticket;
    const doc = await SupportTicket.findById(state.teacherTicket.id);
    assert.ok(doc, "The teacher ticket is stored in MongoDB");
    assert.equal(doc.requesterRole, "Teacher");
  });

  await t.test("3. Admin sees the Student and Teacher tickets in MongoDB", async () => {
    const list = await requestAs("admin")("/admin/support/tickets", { query: { limit: 50 } });
    assert.equal(list.code, 200, JSON.stringify(list.data));
    const studentTicketInDb = list.data.tickets.find((ticket) => ticket.id === state.studentTicket.id);
    assert.ok(studentTicketInDb, "The Student ticket is visible to Admin");
    assert.equal(studentTicketInDb.requesterRole, "Student");
    assert.equal(studentTicketInDb.subject, state.studentTicket.subject);
    const teacherTicketInDb = list.data.tickets.find((ticket) => ticket.id === state.teacherTicket.id);
    assert.ok(teacherTicketInDb, "The Teacher ticket is visible to Admin");
    assert.equal(teacherTicketInDb.requesterRole, "Teacher");
    const detail = await requestAs("admin")(`/admin/support/tickets/${state.studentTicket.id}`);
    assert.equal(detail.code, 200);
    assert.equal(detail.data.ticket.relatedRecordId, "course-abc123");
  });

  await t.test("4. Admin replies to the Student; the Student sees the reply and can reply back", async () => {
    const reply = await requestAs("admin")(`/admin/support/tickets/${state.studentTicket.id}/replies`, { method: "POST", body: { message: "Your course video access has been restored. Please refresh the player." } });
    assert.equal(reply.code, 200, JSON.stringify(reply.data));
    assert.equal(reply.data.ticket.responses.length, 1);
    assert.equal(reply.data.ticket.responses[0].authorRole, "Admin");
    const mine = await requestAs("student")("/support/tickets/mine");
    assert.equal(mine.code, 200);
    const mineTicket = mine.data.tickets.find((ticket) => ticket.id === state.studentTicket.id);
    assert.ok(mineTicket, "The Student ticket appears in their ticket list");
    assert.ok(mineTicket.responses.some((response) => response.authorRole === "Admin" && String(response.message).includes("course video access has been restored")), "The Student sees the Admin reply");
    const studentReply = await requestAs("student")(`/support/tickets/${state.studentTicket.id}/replies`, { method: "POST", body: { message: "Thank you. It works now." } });
    assert.equal(studentReply.code, 200, JSON.stringify(studentReply.data));
    const adminDetail = await requestAs("admin")(`/admin/support/tickets/${state.studentTicket.id}`);
    assert.ok(adminDetail.data.ticket.responses.some((response) => response.authorRole === "Student" && String(response.message).includes("Thank you. It works now.")), "The Admin sees the Student reply");
  });

  await t.test("5. Admin replies to the Teacher; the Teacher sees the reply", async () => {
    const reply = await requestAs("admin")(`/admin/support/tickets/${state.teacherTicket.id}/replies`, { method: "POST", body: { message: "Your course is queued for another review pass." } });
    assert.equal(reply.code, 200, JSON.stringify(reply.data));
    const mine = await requestAs("teacher")("/support/tickets/mine");
    assert.equal(mine.code, 200);
    const mineTicket = mine.data.tickets.find((ticket) => ticket.id === state.teacherTicket.id);
    assert.ok(mineTicket, "The Teacher ticket appears in their ticket list");
    assert.ok(mineTicket.responses.some((response) => response.authorRole === "Admin" && String(response.message).includes("queued for another review pass")), "The Teacher sees the Admin reply");
  });

  await t.test("6. Admin changes the ticket status; MongoDB reflects it", async () => {
    const update = await requestAs("admin")(`/admin/support/tickets/${state.studentTicket.id}/status`, { method: "PATCH", body: { status: "In Progress" } });
    assert.equal(update.code, 200, JSON.stringify(update.data));
    assert.equal(update.data.ticket.status, "In Progress");
    const doc = await SupportTicket.findById(state.studentTicket.id);
    assert.equal(doc.status, "In Progress", "The status change persists in MongoDB");
  });

  await t.test("7. Tickets remain available after a refresh", async () => {
    const again = await requestAs("student")("/support/tickets/mine");
    assert.equal(again.code, 200);
    assert.ok(again.data.tickets.some((ticket) => ticket.id === state.studentTicket.id), "The Student ticket survives a re-fetch");
    const docIds = new Set((await SupportTicket.find({}, { _id: 1 }).lean()).map((doc) => String(doc._id)));
    assert.ok(docIds.has(state.studentTicket.id));
    assert.ok(docIds.has(state.teacherTicket.id));
    assert.equal(await SupportTicket.countDocuments({}), docIds.size, "All tickets are records in the support_tickets collection");
  });

  await t.test("8. Cross-user access is denied and tickets stay isolated per user", async () => {
    const teacher2Ticket = (await requestAs("teacher2")("/support/tickets", { method: "POST", body: { subject: "Second teacher isolation ticket", description: "Teacher 2 private ticket for isolation checks.", category: "Technical Issue", priority: "Low" } })).data.ticket;
    assert.ok(teacher2Ticket);
    assert.equal((await requestAs("student2")(`/admin/support/tickets/${state.studentTicket.id}`)).code, 403, "student2 cannot open the Student ticket detail");
    assert.equal((await requestAs("student2")(`/admin/support/tickets/${state.teacherTicket.id}`)).code, 403, "student2 cannot open the Teacher ticket detail");
    assert.equal((await requestAs("student2")(`/admin/support/tickets/${teacher2Ticket.id}`)).code, 403, "student2 cannot open another Teacher ticket detail");
    assert.equal((await requestAs("teacher")(`/admin/support/tickets/${teacher2Ticket.id}`)).code, 403, "The Teacher cannot open another Teacher's ticket detail");
    assert.equal((await requestAs("teacher")(`/admin/support/tickets/${state.teacherTicket.id}/status`, { method: "PATCH", body: { status: "Closed" } })).code, 403, "The Teacher cannot change another Teacher's ticket status");
    assert.equal((await requestAs("student")(`/admin/support/tickets/${state.teacherTicket.id}`)).code, 403, "A Student cannot open Teacher tickets through the admin endpoint");
    assert.equal((await requestAs("student")(`/admin/support/tickets/${state.teacherTicket.id}/replies`, { method: "POST", body: { message: "Wrong role reply." } })).code, 403, "A Student cannot reply to Teacher tickets");
    const mine = await requestAs("student2")("/support/tickets/mine");
    assert.equal(mine.code, 200);
    assert.equal(mine.data.tickets.length, 0, "student2 sees none of the other users' tickets");
    const teacherMine = await requestAs("teacher")("/support/tickets/mine");
    assert.ok(teacherMine.data.tickets.some((ticket) => ticket.id === state.teacherTicket.id), "The Teacher sees their own ticket");
    assert.ok(!teacherMine.data.tickets.some((ticket) => ticket.requesterRole === "Student"), "The Teacher does not see Student tickets");
    const adminMine = await requestAs("admin")("/support/tickets/mine");
    assert.equal(adminMine.code, 403, "The Admin cannot use the requester endpoint");
  });

  await t.test("9. Duplicate submission protection: same subject while Open is rejected", async () => {
    const first = await requestAs("student")("/support/tickets", { method: "POST", body: { subject: "Duplicate protection probe", description: "First duplicate probe ticket.", category: "Technical Issue", priority: "Low" } });
    assert.equal(first.code, 201);
    const duplicate = await requestAs("student")("/support/tickets", { method: "POST", body: { subject: "Duplicate protection probe", description: "Second identical-subject probe ticket.", category: "Technical Issue", priority: "Low" } });
    assert.equal(duplicate.code, 409, "The same subject while the first ticket is Open is rejected");
    assert.equal(duplicate.data.success, false);
    const close = await requestAs("student")(`/support/tickets/${first.data.ticket.id}`, { method: "PATCH", body: { status: "Closed" } });
    assert.equal(close.code, 200);
    const resubmit = await requestAs("student")("/support/tickets", { method: "POST", body: { subject: "Duplicate protection probe", description: "Third probe ticket after the first was closed.", category: "Technical Issue", priority: "Low" } });
    assert.equal(resubmit.code, 201, "The same subject is allowed once the first ticket is closed");
    const closeAgain = await requestAs("student")(`/support/tickets/${resubmit.data.ticket.id}`, { method: "PATCH", body: { status: "Closed" } });
    assert.equal(closeAgain.code, 200);
  });

  await t.test("10. Requesters can reopen and close their own tickets", async () => {
    const close = await requestAs("teacher")(`/support/tickets/${state.teacherTicket.id}`, { method: "PATCH", body: { status: "Closed" } });
    assert.equal(close.code, 200);
    assert.equal((await SupportTicket.findById(state.teacherTicket.id)).status, "Closed");
    const reopen = await requestAs("teacher")(`/support/tickets/${state.teacherTicket.id}`, { method: "PATCH", body: { status: "Open" } });
    assert.equal(reopen.code, 200);
    assert.equal(reopen.data.ticket.status, "Open");
    assert.equal((await SupportTicket.findById(state.teacherTicket.id)).status, "Open", "Reopening persists in MongoDB");
    const closeSecond = await requestAs("teacher")(`/support/tickets/${state.teacherTicket.id}`, { method: "PATCH", body: { status: "Closed" } });
    assert.equal(closeSecond.code, 200);
    assert.equal((await SupportTicket.findById(state.teacherTicket.id)).status, "Closed");
  });

  await t.test("11. Unauthenticated requests are rejected", async () => {
    assert.equal((await request("/support/tickets/mine")).code, 401);
    assert.equal((await request("/support/tickets", { method: "POST", body: { subject: "Unauthenticated probe", description: "Should fail.", category: "Technical Issue", priority: "Low" } })).code, 401);
    assert.equal((await request(`/admin/support/tickets/${state.studentTicket.id}`, { method: "PATCH", body: { status: "Closed" } })).code, 401);
  });

  await t.test("12. Invalid ticket submissions are rejected with 400 and a clear message", async () => {
    const shortSubject = await requestAs("student")("/support/tickets", { method: "POST", body: { subject: "Hi", description: "short subject test", category: "Technical Issue", priority: "Low" } });
    assert.equal(shortSubject.code, 400);
    assert.equal(shortSubject.data.success, false);
    assert.ok(String(shortSubject.data.message).length > 0);
    const badCategory = await requestAs("student")("/support/tickets", { method: "POST", body: { subject: "Bad category probe", description: "Has an invalid category.", category: "NotARealCategory", priority: "Low" } });
    assert.equal(badCategory.code, 400);
    const badPriority = await requestAs("student")("/support/tickets", { method: "POST", body: { subject: "Bad priority probe", description: "Has an invalid priority.", category: "Technical Issue", priority: "Nowhere" } });
    assert.equal(badPriority.code, 400);
    const shortDescription = await requestAs("student")("/support/tickets", { method: "POST", body: { subject: "Short description probe", description: "no", category: "Technical Issue", priority: "Low" } });
    assert.equal(shortDescription.code, 400);
    const adminSubmit = await requestAs("admin")("/support/tickets", { method: "POST", body: { subject: "Admin cannot submit", description: "Admins submit through other means.", category: "Technical Issue", priority: "Low" } });
    assert.equal(adminSubmit.code, 403, "Admin cannot submit support tickets");
  });

  await t.test("13. Backend errors are structured responses, not silent successes", async () => {
    const missingCategory = await requestAs("student")("/support/tickets", { method: "POST", body: { subject: "Missing category probe", description: "The category is missing here.", priority: "Low" } });
    assert.equal(missingCategory.code, 400);
    assert.equal(missingCategory.data.success, false);
    assert.ok(String(missingCategory.data.message).length > 0, "Errors carry a message");
    const missingSubject = await requestAs("teacher")("/support/tickets", { method: "POST", body: { description: "Both subject and category are missing.", priority: "Low" } });
    assert.equal(missingSubject.code, 400);
    const badStatus = await requestAs("admin")(`/admin/support/tickets/${state.studentTicket.id}/status`, { method: "PATCH", body: { status: "Kaboom" } });
    assert.equal(badStatus.code, 400, "Invalid admin status values are rejected");
  });

  await t.test("14. Every ticket returned by the requester endpoints is a MongoDB record", async () => {
    const docIds = new Set((await SupportTicket.find({}, { _id: 1 }).lean()).map((doc) => String(doc._id)));
    const mine = await requestAs("student")("/support/tickets/mine");
    assert.equal(mine.code, 200);
    assert.ok(mine.data.tickets.length > 0);
    for (const ticket of mine.data.tickets) assert.ok(docIds.has(ticket.id), `Ticket ${ticket.id} is a MongoDB record`);
    const mineTeacher = await requestAs("teacher")("/support/tickets/mine");
    assert.ok(mineTeacher.data.tickets.length > 0);
    for (const ticket of mineTeacher.data.tickets) assert.ok(docIds.has(ticket.id));
  });

  await t.test("15. Admin support ticket counts match MongoDB", async () => {
    const stats = await requestAs("admin")("/admin/support/tickets/stats");
    assert.equal(stats.code, 200, JSON.stringify(stats.data));
    const expectedTotal = await SupportTicket.countDocuments({});
    assert.equal(stats.data.total, expectedTotal, "Admin stats match the support_tickets collection");
    assert.ok(stats.data.byStatus && Object.keys(stats.data.byStatus).length >= 1);
    const report = await requestAs("admin")("/admin/reports/tickets");
    assert.equal(report.code, 200);
    assert.equal(report.data.total, expectedTotal, "The Tickets report matches MongoDB");
  });

  await t.test("16. Regression: valid subjects are saved to MongoDB; short or empty subjects are rejected", async () => {
    // Regression for the production bug: a valid subject must be saved (the
    // request body is JSON, so the API must parse it), with trimming.
    const validSubmit = await requestAs("student")("/support/tickets", { method: "POST", body: {
      subject: "   Student needs help with the billing statement   ",
      description: "Valid subject regression ticket.",
      category: "Billing & Payment",
      priority: "Medium",
    } });
    assert.equal(validSubmit.code, 201, JSON.stringify(validSubmit.data));
    const doc = await SupportTicket.findById(validSubmit.data.ticket.id);
    assert.ok(doc, "A valid subject saves the ticket to MongoDB");
    assert.equal(doc.subject, "Student needs help with the billing statement", "The subject is trimmed when saved");
    const adminList = await requestAs("admin")("/admin/support/tickets", { query: { requesterEmail: accounts.student.email, limit: 50 } });
    assert.ok(adminList.data.tickets.some((ticket) => ticket.ticketId === validSubmit.data.ticket.ticketId), "Admin receives the created ticket");
    // Close it so later duplicate protection does not block other submissions.
    assert.equal((await requestAs("student")(`/support/tickets/${validSubmit.data.ticket.id}`, { method: "PATCH", body: { status: "Closed" } })).code, 200);

    const shortSubject = await requestAs("student")("/support/tickets", { method: "POST", body: { subject: "Hi", description: "Short subject regression." } });
    assert.equal(shortSubject.code, 400, "Subjects shorter than 3 characters are rejected");
    const spacesSubject = await requestAs("student")("/support/tickets", { method: "POST", body: { subject: "   ", description: "Whitespace-only subject regression." } });
    assert.equal(spacesSubject.code, 400, "Whitespace-only subjects are rejected");
    const threeChar = await requestAs("student")("/support/tickets", { method: "POST", body: { subject: "abc", description: "Three character subject regression.", category: "Technical Issue", priority: "Low" } });
    assert.equal(threeChar.code, 201, "A 3-character subject is accepted");
    if (threeChar.data?.ticket) await requestAs("student")(`/support/tickets/${threeChar.data.ticket.id}`, { method: "PATCH", body: { status: "Closed" } });
    assert.equal((await request("/support/tickets", { method: "POST", body: { subject: "Valid but unauthenticated", description: "Should fail at auth." } })).code, 401, "Valid subjects still require authentication");
  });
});

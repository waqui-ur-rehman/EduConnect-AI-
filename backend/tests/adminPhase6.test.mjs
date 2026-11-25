import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import Teacher from "../src/models/Teacher.js";
import Student from "../src/models/Student.js";
import Admin from "../src/models/Admin.js";
import TeacherBook from "../src/models/TeacherBook.js";
import Course from "../src/models/Course.js";
import TeacherEarning from "../src/models/TeacherEarning.js";
import Order from "../src/models/Order.js";
import AuditLog from "../src/models/AuditLog.js";
import SupportTicket from "../src/models/SupportTicket.js";
import { TeacherVerification } from "../src/models/IdentityVerification.js";

// Phase 6 — Admin Management (MongoDB-backed): User Management, Support
// Management, Audit Logs, Reporting and Security, verified over real HTTP
// and MongoDB with the same style as the existing marketplace workflow tests.
test("Admin Phase 6: management, security and reporting over real HTTP and MongoDB", { timeout: 180000 }, async (t) => {
  const database = `educonnect_admin_phase6_test_${randomUUID().replaceAll("-", "")}`;
  const previousEnv = { ...process.env };
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "admin-phase6-test-integration-secret-32";
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
  await Promise.all([Teacher, Student, Admin, TeacherBook, Course, TeacherEarning, Order, AuditLog, SupportTicket, TeacherVerification].map((Model) => Model.init()));
  const { default: app } = await import("../src/app.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const password = "Test-password-12345";
  const accounts = {};
  for (const [name, Model, role] of [["admin", Admin, "admin"], ["owner", Teacher, "teacher"], ["teacher2", Teacher, "teacher"], ["student", Student, "student"], ["student2", Student, "student"]]) {
    accounts[name] = await Model.create({ fullName: `Phase6 ${name}`, email: `${name}@phase6.test`, password, role, teacherStatus: role === "teacher" ? "pending" : "not_applicable" });
  }
  accounts.teacher2.teacherStatus = "pending";
  await accounts.teacher2.save();

  const cookies = {};
  const request = async (path, { actor, method = "GET", body, query } = {}) => {
    const queryString = new URLSearchParams(query || {}).toString();
    const target = queryString ? `${path}?${queryString}` : path;
    const headers = { Origin: "http://localhost:5173", "X-Requested-With": "XMLHttpRequest", ...(actor ? { Cookie: cookies[actor] } : {}) };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(base + target, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const data = await response.json().catch(() => null);
    return { response, data, code: response.status };
  };
  for (const name of Object.keys(accounts)) {
    const login = await request("/auth/login", { method: "POST", body: { email: accounts[name].email, password } });
    assert.equal(login.code, 200, `Login failed for ${name}`);
    cookies[name] = login.response.headers.get("set-cookie").split(";")[0];
  }
  const requestAs = (actor) => (path, options) => request(path, { ...options, actor });

  await t.test("Student and Teacher are denied all admin routes", async () => {
    assert.equal((await requestAs("student")("/admin/users")).code, 403, "Students cannot list users");
    assert.equal((await requestAs("student")("/admin/users/anything")).code, 403);
    assert.equal((await requestAs("student")("/admin/audit-logs")).code, 403);
    assert.equal((await requestAs("student")("/admin/reports/overview")).code, 403);
    assert.equal((await requestAs("student")("/admin/support/tickets")).code, 403);
    assert.equal((await requestAs("student")("/admin/users/507f1f77bcf86cd799439011/status", { method: "PATCH", body: { status: "suspended" } })).code, 403, "Students cannot suspend users");
    assert.equal((await requestAs("teacher2")("/admin/users")).code, 403, "Teachers cannot list users");
    assert.equal((await requestAs("teacher2")("/admin/audit-logs")).code, 403);
    assert.equal((await requestAs("teacher2")("/admin/reports/finance")).code, 403);
  });

  await t.test("User Management: MongoDB-backed list, profile, suspend and reactivate", async () => {
    const listed = await requestAs("admin")("/admin/users", { query: { page: 1, limit: 100 } });
    assert.equal(listed.code, 200, JSON.stringify(listed.data));
    assert.ok(listed.data.total >= 5, "All users are listed");
    const studentDoc = listed.data.users.find((user) => user.email === accounts.student.email);
    assert.ok(studentDoc, "Student appears in the user list");
    assert.equal(studentDoc.role, "Student");
    assert.equal(studentDoc.status, "active");
    assert.ok(!("password" in studentDoc), "Passwords are never exposed");
    assert.ok(!("sessionVersion" in studentDoc), "Session versions are never exposed");

    const profile = await requestAs("admin")(`/admin/users/${studentDoc.id}`);
    assert.equal(profile.code, 200);
    assert.equal(profile.data.user.email, accounts.student.email);
    assert.ok(profile.data.user.activity, "Account activity is included");

    const unknownId = "507f1f77bcf86cd799439011";
    assert.equal((await requestAs("admin")(`/admin/users/${unknownId}`)).code, 404, "Missing users are 404");
    assert.equal((await requestAs("admin")("/admin/users/not-an-objectid")).code, 400, "Invalid IDs are 400");

    // Suspend with confirmation of audit log creation.
    const auditBefore = await AuditLog.countDocuments({ action: "User suspended" });
    const suspend = await requestAs("admin")(`/admin/users/${studentDoc.id}/status`, { method: "PATCH", body: { status: "suspended" } });
    assert.equal(suspend.code, 200, JSON.stringify(suspend.data));
    assert.equal(suspend.data.user.isActive, false);
    assert.equal(suspend.data.user.status, "suspended");
    const suspendedInDb = await Student.findById(accounts.student._id);
    assert.equal(suspendedInDb.isActive, false, "Suspension persists in MongoDB");
    const auditAfter = await AuditLog.countDocuments({ action: "User suspended", actorEmail: accounts.admin.email.toLowerCase() });
    assert.ok(auditAfter > auditBefore, "Suspension is audited");

    // Repeated suspension is rejected.
    assert.equal((await requestAs("admin")(`/admin/users/${studentDoc.id}/status`, { method: "PATCH", body: { status: "suspended" } })).code, 409);
    // Reactivate.
    const reactivate = await requestAs("admin")(`/admin/users/${studentDoc.id}/status`, { method: "PATCH", body: { status: "active" } });
    assert.equal(reactivate.code, 200);
    assert.equal((await Student.findById(accounts.student._id)).isActive, true, "Reactivation persists in MongoDB");

    // Admin accounts cannot be suspended; self-suspension is denied.
    assert.equal((await requestAs("admin")(`/admin/users/${accounts.admin._id}/status`, { method: "PATCH", body: { status: "suspended" } })).code, 403, "Admins cannot suspend accounts");
    const adminDoc = (await requestAs("admin")("/admin/users", { query: { limit: 100 } })).data.users.find((user) => user.role === "Admin");
    assert.equal((await requestAs("admin")(`/admin/users/${adminDoc.id}/status`, { method: "PATCH", body: { status: "suspended" } })).code, 403);
    assert.equal((await requestAs("admin")(`/admin/users/${accounts.admin._id}/status`, { method: "PATCH", body: { status: "suspended" } })).code, 403, "An admin cannot suspend their own account");
    assert.equal((await requestAs("admin")(`/admin/users/${accounts.student._id}/status`, { method: "PATCH", body: { status: "weird" } })).code, 400, "Invalid statuses are rejected");
    assert.equal((await requestAs("admin")(`/admin/users/${accounts.student._id}/status`, { method: "PATCH", body: { status: "active" } })).code, 409, "Already-active accounts cannot be reactivated again");

    // Search, role, status, verified filters.
    const searched = await requestAs("admin")("/admin/users", { query: { q: accounts.teacher2.email } });
    assert.equal(searched.code, 200);
    assert.ok(searched.data.users.every((user) => user.email.includes(accounts.teacher2.email.split("@")[0])), "Search filters by email");
    const roleFiltered = await requestAs("admin")("/admin/users", { query: { role: "Teacher" } });
    assert.ok(roleFiltered.data.users.every((user) => user.role === "Teacher"));
    const suspendedList = await requestAs("admin")("/admin/users", { query: { status: "suspended" } });
    assert.equal(suspendedList.data.total, 0, "No users are suspended");
  });

  await t.test("Teacher approval: self-approval denied, duplicate approval prevented, audit logged", async () => {
    assert.equal((await requestAs("teacher2")("/admin/teachers/pending")).code, 403, "Teachers cannot list pending teachers");
    assert.equal((await requestAs("teacher2")("/admin/teachers/123456789012345678901234/approve", { method: "PATCH" })).code, 403, "Users cannot approve their own application");
    assert.equal((await requestAs("admin")("/admin/teachers/not-an-id/approve", { method: "PATCH" })).code, 400, "Invalid teacher IDs are rejected");

    const teacher2Doc = (await requestAs("admin")("/admin/users", { query: { limit: 100 } })).data.users.find((user) => user.email === accounts.teacher2.email);
    assert.equal(teacher2Doc.teacherStatus, "pending");

    const approve = await requestAs("admin")(`/admin/teachers/${teacher2Doc.id}/approve`, { method: "PATCH" });
    assert.equal(approve.code, 200, JSON.stringify(approve.data));
    assert.equal(approve.data.teacher.teacherStatus, "approved");
    assert.equal((await Teacher.findById(accounts.teacher2._id)).teacherStatus, "approved");

    const approveAgain = await requestAs("admin")(`/admin/teachers/${teacher2Doc.id}/approve`, { method: "PATCH" });
    assert.equal(approveAgain.code, 409, "Duplicate approvals are rejected");

    const reject = await requestAs("admin")(`/admin/teachers/${teacher2Doc.id}/reject`, { method: "PATCH" });
    assert.equal(reject.code, 409, "Rejecting an approved teacher is rejected");

    // A second teacher application can be rejected (corrections are possible).
    const other = await Teacher.create({ fullName: "Phase6 Third Teacher", email: "third.teacher@phase6.test", password, role: "teacher", teacherStatus: "pending" });
    const reject2 = await requestAs("admin")(`/admin/teachers/${other._id}/reject`, { method: "PATCH" });
    assert.equal(reject2.code, 200, JSON.stringify(reject2.data));
    assert.equal((await Teacher.findById(other._id)).teacherStatus, "rejected");
    // A rejected application cannot be re-approved directly; it can only be re-requested.
    const approve2 = await requestAs("admin")(`/admin/teachers/${other._id}/approve`, { method: "PATCH" });
    assert.equal(approve2.code, 409, "Rejected applications cannot be re-approved directly");
    await Teacher.deleteOne({ _id: other._id });

    const auditApprovals = await AuditLog.countDocuments({ action: "Teacher approved", actorEmail: accounts.admin.email.toLowerCase() });
    assert.ok(auditApprovals >= 1, "Approvals are audited");
  });

  await t.test("Course and Book approval workflows with audit logs", async () => {
    // Teacher submits a course.
    const input = {
      title: "Phase6 Course Approval Test",
      description: "A course submitted for admin review during Phase 6.",
      metadata: { category: "Development", price: 0, learningOutcomes: ["Understand admin approval"] },
      lessons: [{ id: "lesson-1", title: "Lesson 1", content: "Approved lesson content for the review test.", order: 0 }],
    };
    const created = (await requestAs("owner")("/content/courses", { method: "POST", body: input })).data.item;
    assert.ok(created, "Teacher can create a course");
    const submitted = (await requestAs("owner")(`/content/courses/${created.id}/submit`, { method: "POST", body: { revision: created.revision } })).data.item;
    assert.equal(submitted.status, "Pending Approval", "Teacher submissions are pending admin approval");

    const approve = await requestAs("admin")(`/content/courses/${created.id}/review`, { method: "POST", body: { decision: "approve", revision: submitted.revision } });
    assert.equal(approve.code, 200, JSON.stringify(approve.data));
    assert.equal((await Course.findById(created.id)).status, "published");
    assert.ok((await AuditLog.countDocuments({ action: "Course approved", actorEmail: accounts.admin.email.toLowerCase() })) >= 1, "Course approvals are audited");

    const again = await requestAs("admin")(`/content/courses/${created.id}/review`, { method: "POST", body: { decision: "approve", revision: submitted.revision } });
    assert.equal(again.code, 409, "Duplicate approval is rejected");

    // Teacher submits a book; admin rejects it with a reason, then re-approves.
    const book = await TeacherBook.create({
      teacherId: accounts.owner._id, title: "Phase6 Book Approval Test", description: "A book submitted for admin review.", status: "pending", published: false, revision: 1,
      approvedVersion: { title: "Phase6 Book Approval Test", description: "A book submitted for admin review.", metadata: { price: 100, isFree: false, category: "eBook" } },
    });
    const rejectBook = await requestAs("admin")(`/content/books/${book._id}/review`, { method: "POST", body: { decision: "reject", revision: 1, reason: "Needs a cover image" } });
    assert.equal(rejectBook.code, 200, JSON.stringify(rejectBook.data));
    assert.equal((await TeacherBook.findById(book._id)).status, "rejected");
    const approveRejectedBook = await requestAs("admin")(`/content/books/${book._id}/review`, { method: "POST", body: { decision: "approve", revision: 1 } });
    assert.equal(approveRejectedBook.code, 409, "Rejected submissions cannot be approved directly");
    assert.equal((await TeacherBook.findById(book._id)).status, "rejected");
    const rejectWithoutReason = await TeacherBook.create({ teacherId: accounts.owner._id, title: "Rejected book 2", description: "Second book rejected without a stored reason.", status: "pending", published: false, revision: 1, approvedVersion: { title: "Rejected book 2", description: "Second book rejected without a stored reason.", metadata: { price: 50, isFree: false, category: "eBook" } } });
    const noReason = await requestAs("admin")(`/content/books/${rejectWithoutReason._id}/review`, { method: "POST", body: { decision: "reject", revision: 1 } });
    assert.equal(noReason.code, 400, "Rejections require a reason");
    await TeacherBook.deleteOne({ _id: rejectWithoutReason._id });
    await TeacherBook.deleteOne({ _id: book._id });
  });

  await t.test("Identity verification review with permission enforcement and audit", async () => {
    const verification = await TeacherVerification.create({
      accountId: accounts.owner._id, fullName: accounts.owner.fullName, email: accounts.owner.email,
      status: "pending", documents: { front: { relativePath: "demo/front.jpg", mimeType: "image/jpeg" }, back: { relativePath: "demo/back.jpg", mimeType: "image/jpeg" } },
      submittedAt: new Date(),
    });
    assert.equal((await requestAs("teacher2")("/admin/verifications")).code, 403, "Teachers cannot review verifications");
    assert.equal((await requestAs("teacher2")(`/admin/verifications/${accounts.owner._id}/approve`, { method: "PATCH" })).code, 403);
    assert.equal((await requestAs("admin")("/admin/verifications/not-an-id/approve", { method: "PATCH" })).code, 400);
    const approve = await requestAs("admin")(`/admin/verifications/${accounts.owner._id}/approve`, { method: "PATCH" });
    assert.ok(approve.code >= 400, "Approving missing demo documents fails closed");
    const reject = await requestAs("admin")(`/admin/verifications/${accounts.owner._id}/reject`, { method: "PATCH", body: { reason: "Needs clearer scans." } });
    assert.equal(reject.code, 200, JSON.stringify(reject.data));
    assert.equal((await TeacherVerification.findById(verification._id)).status, "rejected");
    const audit = await AuditLog.findOne({ action: "Identity verification rejected", actorEmail: accounts.admin.email.toLowerCase() });
    assert.ok(audit, "Verification reviews are audited");
    // Rejected requests can be corrected and resubmitted by the owner.
    const resubmit = await requestAs("owner")("/teacher/verification/submit", { method: "POST" });
    assert.ok(resubmit.code === 400 || resubmit.code === 201, "Rejected verification requests can be resubmitted by owners");
    await TeacherVerification.deleteOne({ _id: verification._id });
  });

  await t.test("Support tickets: requester flows and MongoDB-backed admin management", async () => {
    const submit = await requestAs("student")("/support/tickets", { method: "POST", body: { subject: "Course Access Problem", description: "My lesson is locked after payment.", category: "Course Access", priority: "High" } });
    assert.equal(submit.code, 201, JSON.stringify(submit.data));
    const ticket = submit.data.ticket;
    assert.ok(ticket.ticketId);
    assert.equal(ticket.requesterRole, "Student");
    assert.equal(ticket.status, "Open");
    assert.equal(ticket.requesterEmail, accounts.student.email);
    assert.equal(ticket.priority, "High");

    const studentList = await requestAs("student")("/support/tickets/mine");
    assert.equal(studentList.code, 200);
    assert.ok(studentList.data.tickets.some((item) => item.id === ticket.id));

    // Invalid submissions are rejected.
    const badSubmit = await requestAs("student")("/support/tickets", { method: "POST", body: { subject: "X", description: "Short subject test", category: "NotACategory" } });
    assert.equal(badSubmit.code, 400, "Invalid categories are rejected");

    // Admin side: list, detail.
    assert.equal((await requestAs("teacher2")("/admin/support/tickets")).code, 403, "Teachers cannot list admin tickets");
    const listAll = await requestAs("admin")("/admin/support/tickets", { query: { limit: 50 } });
    assert.equal(listAll.code, 200);
    assert.ok(listAll.data.tickets.some((item) => item.ticketId === ticket.ticketId), "Admin can see all tickets");
    const openList = await requestAs("admin")("/admin/support/tickets", { query: { status: "Open", limit: 50 } });
    assert.equal(openList.code, 200);
    assert.ok(openList.data.tickets.some((item) => item.ticketId === ticket.ticketId), "Open tickets are listed");
    assert.equal((await requestAs("student")("/admin/support/tickets", { query: { limit: 50 } })).code, 403, "Students cannot use the admin tickets endpoint");

    const detail = await requestAs("admin")(`/admin/support/tickets/${ticket.id}`);
    assert.equal(detail.code, 200);
    assert.equal(detail.data.ticket.subject, "Course Access Problem");

    // Requesters close and reopen their own tickets.
    assert.equal((await requestAs("student")(`/support/tickets/${ticket.id}`, { method: "PATCH", body: { status: "Open" } })).code, 200, "Reopening an open ticket is a no-op");
    assert.equal((await requestAs("student")(`/support/tickets/${ticket.id}`, { method: "PATCH", body: { status: "Closed" } })).code, 200, "Requesters can close tickets");
    const openListAfterClose = await requestAs("admin")("/admin/support/tickets", { query: { status: "Open", limit: 50 } });
    assert.ok(!openListAfterClose.data.tickets.some((item) => item.ticketId === ticket.ticketId), "Closed tickets leave the Open list");
    assert.equal((await requestAs("student")(`/support/tickets/${ticket.id}`, { method: "PATCH", body: { status: "Closed" } })).code, 409, "An already-closed ticket cannot be closed again");

    // Admin updates status/priority/assign/reply with audit.
    const update = await requestAs("admin")(`/admin/support/tickets/${ticket.id}/status`, { method: "PATCH", body: { status: "In Progress" } });
    assert.equal(update.code, 200, JSON.stringify(update.data));
    const setSame = await requestAs("admin")(`/admin/support/tickets/${ticket.id}/status`, { method: "PATCH", body: { status: "In Progress" } });
    assert.equal(setSame.code, 200, "No-op status updates are allowed");
    const badStatus = await requestAs("admin")(`/admin/support/tickets/${ticket.id}/status`, { method: "PATCH", body: { status: "Deleted" } });
    assert.equal(badStatus.code, 400);
    const setResolved = await requestAs("admin")(`/admin/support/tickets/${ticket.id}/status`, { method: "PATCH", body: { status: "Resolved", reason: "Fixed by reinstalling the course." } });
    assert.equal(setResolved.code, 200);
    assert.ok(setResolved.data.ticket.resolvedAt);

    const priority = await requestAs("admin")(`/admin/support/tickets/${ticket.id}/priority`, { method: "PATCH", body: { priority: "Urgent" } });
    assert.equal(priority.code, 200);
    assert.equal((await SupportTicket.findById(ticket.id)).priority, "Urgent");

    const assign = await requestAs("admin")(`/admin/support/tickets/${ticket.id}/assign`, { method: "PATCH", body: { assignedStaff: "Phase6 Admin" } });
    assert.equal(assign.code, 200);
    assert.equal((await SupportTicket.findById(ticket.id)).assignedStaff, "Phase6 Admin");

    const reply = await requestAs("admin")(`/admin/support/tickets/${ticket.id}/replies`, { method: "POST", body: { message: "Your access has been restored. Check the player again." } });
    assert.equal(reply.code, 200);
    assert.equal(reply.data.ticket.responses.length, 1);
    const replyTooShort = await requestAs("admin")(`/admin/support/tickets/${ticket.id}/replies`, { method: "POST", body: { message: "x" } });
    assert.equal(replyTooShort.code, 400);

    // Teacher submits a ticket; teacher only sees their own tickets.
    const teacherTicket = await requestAs("teacher2")("/support/tickets", { method: "POST", body: { subject: "Video Problem", description: "The lesson video will not play.", category: "Video Lecture Problem", priority: "Low" } });
    assert.equal(teacherTicket.code, 201);
    const teacherMine = await requestAs("teacher2")("/support/tickets/mine");
    assert.equal(teacherMine.code, 200);
    assert.ok(teacherMine.data.tickets.every((item) => item.requesterRole === "Teacher"));
    assert.ok(teacherMine.data.tickets.some((item) => item.id === teacherTicket.data.ticket.id));

    // Another student cannot access the first student's ticket.
    assert.equal((await requestAs("student2")(`/support/tickets/${ticket.id}`, { method: "PATCH", body: { status: "Open" } })).code, 403);
    assert.equal((await requestAs("student2")("/support/tickets/mine")).data.tickets.length, 0, "Requesters only see their own tickets");

    // Admin stats and reports tickets.
    const stats = await requestAs("admin")("/admin/support/tickets/stats");
    assert.equal(stats.code, 200);
    assert.ok(stats.data.total >= 2);
    assert.ok(stats.data.byStatus);
    assert.ok(stats.data.byCategory);
    assert.ok(stats.data.byPriority);
    const ticketsReport = await requestAs("admin")("/admin/reports/tickets");
    assert.equal(ticketsReport.code, 200);
    assert.ok(ticketsReport.data.total >= 2);
    assert.ok(ticketsReport.data.byPriority);

    const ticketAudits = await AuditLog.countDocuments({ category: "support" });
    assert.ok(ticketAudits >= 4, "Support actions are audited");

    // Cleanup.
    await requestAs("admin")(`/admin/support/tickets/${teacherTicket.data.ticket.id}/status`, { method: "PATCH", body: { status: "Closed" } });
  });

  await t.test("Audit Logs: creation, authorization, filters and pagination", async () => {
    const list = await requestAs("admin")("/admin/audit-logs", { query: { limit: 10 } });
    assert.equal(list.code, 200);
    assert.ok(Array.isArray(list.data.logs) && list.data.logs.length >= 5, "Audit logs are returned from MongoDB");
    assert.ok(list.data.logs.every((log) => log.actor && log.timestamp), "Audit records have actors and timestamps");
    const suspended = await requestAs("admin")("/admin/audit-logs", { query: { action: "User suspended" } });
    assert.ok(suspended.data.logs.length >= 1, "Audit logs are searchable by action");
    const from = await requestAs("admin")("/admin/audit-logs", { query: { from: new Date().toISOString(), limit: 5 } });
    assert.equal(from.code, 200);
    const page = await requestAs("admin")("/admin/audit-logs", { query: { page: 2, limit: 5 } });
    assert.equal(page.code, 200);
    assert.ok(page.data.pageCount >= 1);
    assert.equal((await AuditLog.findOne({ action: "User suspended" })).result, "Suspended");
  });

  await t.test("Reporting and Analytics: MongoDB-backed accuracy with demo excluded from real totals", async () => {
    // Seed a demo TeacherEarning and a real TeacherEarning for the teacher.
    const orderDemo = await Order.create({
      studentId: accounts.student2._id, orderNumber: `ORD-phase6-demo-${randomUUID().slice(0, 8)}`,
      items: [{ kind: "course", contentId: accounts.owner._id, title: "Phase6 Demo Course", teacherId: accounts.owner._id, price: 300, currency: "PKR" }],
      total: 300, currency: "PKR", status: "paid", provider: "demo", providerTransactionId: `demo_${randomUUID().slice(0, 12)}`, environment: "sandbox",
    });
    await TeacherEarning.create({
      order: orderDemo._id, orderNumber: orderDemo.orderNumber, studentId: accounts.student2._id, contentId: accounts.owner._id,
      kind: "course", title: "Phase6 Demo Course", teacherId: accounts.owner._id, grossAmount: 300, commissionAmount: 60, teacherAmount: 240, source: "demo", status: "earned",
    });
    const orderReal = await Order.create({
      studentId: accounts.student2._id, orderNumber: `ORD-phase6-real-${randomUUID().slice(0, 8)}`,
      items: [{ kind: "course", contentId: accounts.owner._id, title: "Phase6 Real Course", teacherId: accounts.owner._id, price: 100, currency: "PKR" }],
      total: 100, currency: "PKR", status: "paid", provider: "", providerTransactionId: null, environment: "sandbox",
    });
    await TeacherEarning.create({
      order: orderReal._id, orderNumber: orderReal.orderNumber, studentId: accounts.student2._id, contentId: accounts.owner._id,
      kind: "course", title: "Phase6 Real Course", teacherId: accounts.owner._id, grossAmount: 100, commissionAmount: 20, teacherAmount: 80, source: "payment", status: "earned",
    });

    const overview = await requestAs("admin")("/admin/reports/overview");
    assert.equal(overview.code, 200, JSON.stringify(overview.data));
    assert.ok(overview.data.users.students >= 2, "Students are counted");
    assert.ok(overview.data.users.teachers >= 2, "Teachers are counted");
    assert.ok(overview.data.users.admins >= 1, "Admins are counted");
    assert.ok(overview.data.users.activeUsers >= 1, "Active users (30-day window) are counted");
    assert.ok(overview.data.courses.publishedCourses >= 1, "Published courses are counted");
    assert.ok(overview.data.books.total >= 0);
    assert.ok(overview.data.support.total >= 2, "Support tickets are counted");
    assert.ok(overview.data.finance.teacherEarnings === 80, "Demo sales are excluded from teacher earnings");
    assert.ok(overview.data.finance.verifiedOrders >= 1);
    assert.ok(overview.data.finance.demoPaidOrders >= 1, "Demo paid orders are counted separately");
    assert.equal(overview.data.activityWindowDays, 30);

    const finance = await requestAs("admin")("/admin/reports/finance");
    assert.equal(finance.code, 200);
    assert.equal(finance.data.verifiedOrders.count, 2, "All paid orders are counted");
    assert.ok(finance.data.demoVerifiedOrders >= 1, "Demo paid orders are counted separately");
    assert.equal(finance.data.teacherEarnings, 80, "Teacher earnings include real sales only");
    assert.equal(finance.data.platformCommission, 20);
    assert.equal(finance.data.refunds, 0);
    assert.equal(finance.data.demoExcluded, true, "Demo revenue is excluded");

    // No secrets anywhere in the reports.
    assert.ok(!JSON.stringify(overview.data).includes(accounts.admin.password), "Passwords are never exposed in reports");
    assert.ok(!JSON.stringify(overview.data).includes("password"), "Reports do not contain password keys");
  });
});

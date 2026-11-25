import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import Student from "../src/models/Student.js";
import Teacher from "../src/models/Teacher.js";
import Admin from "../src/models/Admin.js";
import SupportTicket from "../src/models/SupportTicket.js";
import Notification from "../src/models/Notification.js";
import AuditLog from "../src/models/AuditLog.js";

// Phase 7 — MongoDB notification system: service delivery, recipient-scoped
// API reads/writes, ownership isolation and support-ticket event wiring.
test("Phase 7 notification system through real HTTP and MongoDB", { timeout: 120000 }, async (t) => {
  const database = `educonnect_notifications_test_${randomUUID().replaceAll("-", "")}`;
  const previousEnv = { ...process.env };
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "notifications-integration-test-secret-32chars";
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
  await Promise.all([Student, Teacher, Admin, SupportTicket, Notification, AuditLog].map((Model) => Model.init()));
  const { default: app } = await import("../src/app.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const password = "Test-password-12345";
  const accounts = {};
  for (const [name, Model, role] of [["admin", Admin, "admin"], ["student", Student, "student"], ["teacher", Teacher, "teacher"]]) {
    accounts[name] = await Model.create({ fullName: `Notify ${name}`, email: `${name}@notifications.test`, password, role });
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
  const state = {};

  await t.test("1. Submitting a support ticket notifies every active admin", async () => {
    const submit = await request("/support/tickets", { actor: "student", method: "POST", body: {
      subject: "Notification delivery check",
      description: "This ticket should raise a MongoDB notification for admins.",
      category: "Technical Issue",
      priority: "Medium",
    } });
    assert.equal(submit.code, 201, JSON.stringify(submit.data));
    state.ticketId = submit.data.ticket.id;
    const list = await request("/notifications", { actor: "admin" });
    assert.equal(list.code, 200, JSON.stringify(list.data));
    const notice = list.data.notifications.find((item) => item.type === "support");
    assert.ok(notice, "The admin inbox contains the support notification");
    assert.match(notice.message, /STK-/, "The notification message references the ticket ID");
    assert.equal(notice.link, "help-support");
    assert.equal(notice.read, false);
    state.adminNoticeId = notice.id;
    const unread = await request("/notifications/unread-count", { actor: "admin" });
    assert.equal(unread.code, 200);
    assert.ok(unread.data.unreadCount >= 1);
    // The student who opened the ticket has no admin notifications.
    const studentList = await request("/notifications", { actor: "student" });
    assert.ok(!studentList.data.notifications.some((item) => item.id === state.adminNoticeId));
  });

  await t.test("2. Notifications are unreachable across accounts and to anonymous callers", async () => {
    const crossRead = await request(`/notifications/${state.adminNoticeId}/read`, { actor: "student", method: "PATCH" });
    assert.equal(crossRead.code, 404, "Another user cannot mark your notification as read");
    const crossDelete = await request(`/notifications/${state.adminNoticeId}`, { actor: "student", method: "DELETE" });
    assert.equal(crossDelete.code, 404, "Another user cannot delete your notification");
    const crossGet = await request(`/notifications/${state.adminNoticeId}/read`, { actor: "teacher", method: "PATCH" });
    assert.equal(crossGet.code, 404);
    const anon = await request("/notifications");
    assert.equal(anon.code, 401, "Anonymous callers are rejected");
    const teacherList = await request("/notifications", { actor: "teacher" });
    assert.equal(teacherList.code, 200, "Teachers have their own inbox");
    assert.ok(!teacherList.data.notifications.some((item) => item.id === state.adminNoticeId));
    const stillUnread = await Notification.findById(state.adminNoticeId).lean();
    assert.equal(stillUnread.read, false, "Cross-account attempts did not change the document");
  });

  await t.test("3. Mark read, mark all read, delete and pagination", async () => {
    const read = await request(`/notifications/${state.adminNoticeId}/read`, { actor: "admin", method: "PATCH" });
    assert.equal(read.code, 200, JSON.stringify(read.data));
    assert.equal(read.data.notification.read, true);
    const unreadAfter = await request("/notifications/unread-count", { actor: "admin" });
    assert.equal(unreadAfter.data.unreadCount, 0);
    const readAll = await request("/notifications/read-all", { actor: "admin", method: "PATCH" });
    assert.equal(readAll.code, 200);
    assert.equal(readAll.data.updated, 0, "Nothing was left unread");
    const filtered = await request("/notifications?unreadOnly=true", { actor: "admin" });
    assert.equal(filtered.data.notifications.length, 0);
    const byType = await request("/notifications?type=support", { actor: "admin" });
    assert.ok(byType.data.notifications.every((item) => item.type === "support"));
    const wrongType = await request("/notifications?type-not-a-real-filter", { actor: "admin" });
    assert.equal(wrongType.code, 200);
    const paged = await request("/notifications?page=1&limit=1", { actor: "admin" });
    assert.equal(paged.data.limit, 1);
    assert.ok(paged.data.pageCount >= 1);
    const removed = await request(`/notifications/${state.adminNoticeId}`, { actor: "admin", method: "DELETE" });
    assert.equal(removed.code, 200);
    const afterDelete = await request("/notifications", { actor: "admin" });
    assert.ok(!afterDelete.data.notifications.some((item) => item.id === state.adminNoticeId));
    const deleteAgain = await request(`/notifications/${state.adminNoticeId}`, { actor: "admin", method: "DELETE" });
    assert.equal(deleteAgain.code, 404, "Deleting twice reports not found");
  });

  await t.test("4. Admin replies and status changes notify the requester", async () => {
    const reply = await request(`/admin/support/tickets/${state.ticketId}/replies`, { actor: "admin", method: "POST", body: { message: "We are looking into it now." } });
    assert.equal(reply.code, 200, JSON.stringify(reply.data));
    const studentList = await request("/notifications", { actor: "student" });
    const replyNotice = studentList.data.notifications.find((item) => item.type === "support");
    assert.ok(replyNotice, "The student received the admin reply notification");
    assert.match(replyNotice.message, /looking into it/);
    const status = await request(`/admin/support/tickets/${state.ticketId}/status`, { actor: "admin", method: "PATCH", body: { status: "Resolved" } });
    assert.equal(status.code, 200, JSON.stringify(status.data));
    const studentAfterStatus = await request("/notifications", { actor: "student" });
    assert.ok(studentAfterStatus.data.notifications.some((item) => /now Resolved/i.test(item.message)));
    // An internal note must not reach the requester.
    const before = studentAfterStatus.data.notifications.length;
    const note = await request(`/admin/support/tickets/${state.ticketId}/replies`, { actor: "admin", method: "POST", body: { message: "Internal handling notes.", type: "internal_note" } });
    assert.equal(note.code, 200);
    const studentAfterNote = await request("/notifications", { actor: "student" });
    assert.equal(studentAfterNote.data.notifications.length, before, "Internal notes create no requester notification");
  });

  await t.test("5. The service clips untrusted fields and deduplicates by idempotency key", async () => {
    const { createNotification } = await import("../src/services/notificationService.js");
    const teacherId = accounts.teacher._id;
    const saved = await createNotification(teacherId, {
      type: "general",
      title: "T".repeat(400),
      message: "M".repeat(900),
      link: "javascript:alert(1)",
    });
    assert.equal(saved.title.length, 160, "Titles are clipped to the schema limit");
    assert.equal(saved.message.length, 500, "Messages are clipped to the schema limit");
    assert.equal(saved.link, "", "Non-app links are dropped");
    const key = `idem-${randomUUID()}`;
    const first = await createNotification(teacherId, { type: "general", title: "Once", message: "Only once", idempotencyKey: key });
    const second = await createNotification(teacherId, { type: "general", title: "Once", message: "Only once", idempotencyKey: key });
    assert.equal(String(first._id), String(second._id), "The same idempotency key returns the same document");
    const total = await Notification.countDocuments({ recipientId: teacherId, title: "Once" });
    assert.equal(total, 1, "No duplicate document was written");
    // One key can still notify several recipients.
    const { notifyAllAdmins } = await import("../src/services/notificationService.js");
    const secondAdmin = await Admin.create({ fullName: "Notify admin two", email: "admin2@notifications.test", password, role: "admin" });
    const multiKey = `multi-${randomUUID()}`;
    await notifyAllAdmins({ type: "general", title: "Broadcast", message: "Fan-out check", idempotencyKey: multiKey });
    const adminCount = await Notification.countDocuments({ recipientId: accounts.admin._id, title: "Broadcast" });
    const secondAdminCount = await Notification.countDocuments({ recipientId: secondAdmin._id, title: "Broadcast" });
    assert.equal(adminCount, 1, "The first admin received exactly one copy");
    assert.equal(secondAdminCount, 1, "The shared key still notified every admin separately");
  });

  async function openSse(actor, timeoutMs = 4000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(base + "/notifications/stream", {
      headers: { Origin: "http://localhost:5173", "X-Requested-With": "XMLHttpRequest", Cookie: cookies[actor] },
      signal: controller.signal,
    });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const events = [];
    const readEvents = async (until, waitMs = 2500) => {
      const deadline = Date.now() + waitMs;
      while (Date.now() < deadline) {
        if (events.some(until)) return events;
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx); buffer = buffer.slice(idx + 2);
          let event = "message"; let data = "";
          for (const line of chunk.split(/\r?\n/)) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (data) { try { events.push({ event, data: JSON.parse(data) }); } catch { events.push({ event, data }); } }
        }
      }
      return events;
    };
    const close = async () => { clearTimeout(timer); controller.abort(); try { await reader.cancel(); } catch {} };
    return { response, events, readEvents, close };
  }

  await t.test("6. SSE stream requires authentication and streams only the recipient's notifications", async () => {
    const anon = await fetch(base + "/notifications/stream", { headers: { Origin: "http://localhost:5173", "X-Requested-With": "XMLHttpRequest" } });
    assert.equal(anon.status, 401, "Anonymous SSE is rejected");
    try { await anon.body.cancel(); } catch {}

    const sse = await openSse("student");
    assert.equal(sse.response.status, 200);
    assert.match(sse.response.headers.get("content-type") || "", /text\/event-stream/);
    await sse.readEvents((e) => e.event === "ready");
    assert.ok(sse.events.some((e) => e.event === "ready"), "SSE sends ready event");

    const { createNotification } = await import("../src/services/notificationService.js");
    await createNotification(accounts.student._id, { type: "general", title: "SSE hello", message: "for student", idempotencyKey: `sse-${randomUUID()}` });
    await createNotification(accounts.teacher._id, { type: "general", title: "Teacher only", message: "should not leak", idempotencyKey: `sse-${randomUUID()}` });
    await sse.readEvents((e) => e.event === "notification" && e.data?.title === "SSE hello");

    const received = sse.events.filter((e) => e.event === "notification").map((e) => e.data);
    assert.ok(received.some((n) => n.title === "SSE hello"), "Student receives own notification");
    assert.ok(!received.some((n) => n.title === "Teacher only"), "Student does not receive teacher notification");
    await sse.close();
  });

  await t.test("7. SSE reconnect/resync has no duplicate persisted notifications and unread count stays correct", async () => {
    const { createNotification } = await import("../src/services/notificationService.js");
    const key = `reconnect-${randomUUID()}`;
    await createNotification(accounts.student._id, { type: "general", title: "Reconnect test", message: "once", idempotencyKey: key });
    await createNotification(accounts.student._id, { type: "general", title: "Reconnect test", message: "once", idempotencyKey: key });

    const list = await request("/notifications?type=general", { actor: "student" });
    const matching = list.data.notifications.filter((n) => n.title === "Reconnect test");
    assert.equal(matching.length, 1, "Idempotent notification persisted only once");

    const sse = await openSse("student");
    await sse.readEvents((e) => e.event === "ready");
    const ready = sse.events.find((e) => e.event === "ready");
    assert.equal(typeof ready.data.unreadCount, "number");
    await sse.close();

    // Resync via API (same as client reconnect behavior)
    const resync = await request("/notifications", { actor: "student" });
    const afterResync = resync.data.notifications.filter((n) => n.title === "Reconnect test");
    assert.equal(afterResync.length, 1, "API resync does not create duplicates");
  });

  await t.test("8. Realtime module reports Redis optional and in-process delivery still works", async () => {
    const { notificationRealtimeStatus } = await import("../src/services/notificationRealtime.js");
    const status = notificationRealtimeStatus();
    assert.equal(typeof status.redisConfigured, "boolean");
    assert.equal(typeof status.redisReady, "boolean");
    // In test env without REDIS_URL, Redis should not be required.
    if (!process.env.REDIS_URL) assert.equal(status.redisConfigured, false);
  });
});

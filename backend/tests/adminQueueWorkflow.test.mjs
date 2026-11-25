import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import Admin from "../src/models/Admin.js";
import Student from "../src/models/Student.js";

test("Admin operational queues persist Mongo records and enforce role guards", { timeout: 60000 }, async (t) => {
  const database = `edc_admin_queues_${randomUUID().replaceAll("-", "")}`;
  const previous = Object.fromEntries(
    ["NODE_ENV", "JWT_SECRET", "JWT_EXPIRES_IN", "CLIENT_ORIGIN"]
      .map((key) => [key, process.env[key]]),
  );
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "admin-queue-test-secret-at-least-32-characters";
  process.env.JWT_EXPIRES_IN = "12h";
  process.env.CLIENT_ORIGIN = "http://localhost:5173";

  let server;
  t.after(async () => {
    if (server) {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
    if (mongoose.connection.readyState) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });

  await mongoose.connect("mongodb://127.0.0.1:27017", {
    dbName: database,
    serverSelectionTimeoutMS: 5000,
  });
  await Promise.all([Admin.init(), Student.init()]);
  const { default: app } = await import("../src/app.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function request(path, { method = "GET", body, cookie } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        Origin: "http://localhost:5173",
        "X-Requested-With": "XMLHttpRequest",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      code: response.status,
      data: await response.json().catch(() => ({})),
      cookie: (response.headers.get("set-cookie") || "").split(";", 1)[0],
    };
  }

  const password = "Admin-queue-test-123";
  const admin = await Admin.create({
    fullName: "Queue Admin",
    email: "queue.admin@example.test",
    password,
    role: "admin",
  });
  const student = await Student.create({
    fullName: "Queue Student",
    email: "queue.student@example.test",
    password,
    role: "student",
  });
  const adminLogin = await request("/auth/login", {
    method: "POST",
    body: { email: admin.email, password },
  });
  const studentLogin = await request("/auth/login", {
    method: "POST",
    body: { email: student.email, password },
  });
  assert.equal(adminLogin.code, 200);
  assert.equal(studentLogin.code, 200);

  await t.test("Admin queue endpoints reject missing and non-Admin sessions", async () => {
    assert.equal((await request("/admin/queues/knowledge")).code, 401);
    assert.equal(
      (await request("/admin/queues/knowledge", { cookie: studentLogin.cookie })).code,
      403,
    );
  });

  await t.test("Imports once, updates centrally, and never lets stale fallback overwrite live data", async () => {
    const imported = await request("/admin/queues/knowledge/import", {
      method: "POST",
      cookie: adminLogin.cookie,
      body: { records: [{ id: "KP-1", record: { proposalId: "KP-1", status: "Pending Review" } }] },
    });
    assert.equal(imported.code, 200, JSON.stringify(imported.data));
    assert.equal(imported.data.records[0].record.status, "Pending Review");

    const updated = await request("/admin/queues/knowledge/KP-1", {
      method: "PUT",
      cookie: adminLogin.cookie,
      body: { record: { proposalId: "KP-1", status: "Approved for Processing" } },
    });
    assert.equal(updated.code, 200, JSON.stringify(updated.data));

    await request("/admin/queues/knowledge/import", {
      method: "POST",
      cookie: adminLogin.cookie,
      body: { records: [{ id: "KP-1", record: { proposalId: "KP-1", status: "Pending Review" } }] },
    });
    const listed = await request("/admin/queues/knowledge", { cookie: adminLogin.cookie });
    assert.equal(listed.data.records[0].record.status, "Approved for Processing");

    assert.equal(
      (await request("/admin/queues/knowledge/KP-1", {
        method: "DELETE",
        cookie: adminLogin.cookie,
      })).code,
      200,
    );
    assert.equal(
      (await request("/admin/queues/knowledge", { cookie: adminLogin.cookie })).data.count,
      0,
    );
  });

  await t.test("Student moderation submissions become visible in the Admin Mongo queue", async () => {
    const body = {
      targetType: "course",
      targetId: "course-1",
      targetTitle: "Reported course",
      reason: "Spam",
      description: "This course contains repeated unsolicited promotional content.",
    };
    const submitted = await request("/moderation/reports", {
      method: "POST",
      cookie: studentLogin.cookie,
      body,
    });
    assert.equal(submitted.code, 201, JSON.stringify(submitted.data));
    assert.equal(submitted.data.report.status, "Pending");
    assert.equal(
      (await request("/moderation/reports", {
        method: "POST",
        cookie: studentLogin.cookie,
        body,
      })).code,
      409,
    );
    const queue = await request("/admin/queues/moderation-reports", {
      cookie: adminLogin.cookie,
    });
    assert.equal(queue.code, 200, JSON.stringify(queue.data));
    assert.equal(queue.data.count, 1);
    assert.equal(queue.data.records[0].record.reporterEmail, student.email);
  });
});

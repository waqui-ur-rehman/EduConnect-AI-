import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import Admin from "../src/models/Admin.js";
import Student from "../src/models/Student.js";
import Teacher from "../src/models/Teacher.js";

test("Admin teacher applications use authenticated MongoDB state", { timeout: 60000 }, async (t) => {
  const database = `edc_teacher_apps_${randomUUID().replaceAll("-", "")}`;
  const previousEnvironment = Object.fromEntries([
    "NODE_ENV",
    "JWT_SECRET",
    "JWT_EXPIRES_IN",
    "CLIENT_ORIGIN",
  ].map((key) => [key, process.env[key]]));

  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "teacher-application-test-secret-32-characters";
  process.env.JWT_EXPIRES_IN = "12h";
  process.env.CLIENT_ORIGIN = "http://localhost:5173";

  let server;
  t.after(async () => {
    if (server) {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
    if (mongoose.connection.readyState) {
      assert.equal(mongoose.connection.name, database);
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  await mongoose.connect("mongodb://127.0.0.1:27017", {
    dbName: database,
    serverSelectionTimeoutMS: 5000,
  });
  await Promise.all([Admin, Student, Teacher].map((Model) => Model.init()));

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
      setCookie: response.headers.get("set-cookie") || "",
    };
  }

  const password = "Teacher-application-test-123";
  const admin = await Admin.create({
    fullName: "Application Admin",
    email: "application.admin@example.test",
    password,
    role: "admin",
  });
  const pendingApprove = await Teacher.create({
    fullName: "Pending Approval Teacher",
    email: "pending.approve@example.test",
    password,
    role: "teacher",
    teacherStatus: "pending",
  });
  const pendingReject = await Teacher.create({
    fullName: "Pending Rejection Teacher",
    email: "pending.reject@example.test",
    password,
    role: "teacher",
    teacherStatus: "pending",
  });
  await Teacher.create({
    fullName: "Approved Teacher",
    email: "approved@example.test",
    password,
    role: "teacher",
    teacherStatus: "approved",
  });
  await Teacher.create({
    fullName: "Rejected Teacher",
    email: "rejected@example.test",
    password,
    role: "teacher",
    teacherStatus: "rejected",
  });

  const adminLogin = await request("/auth/login", {
    method: "POST",
    body: { email: admin.email, password },
  });
  assert.equal(adminLogin.code, 200, JSON.stringify(adminLogin.data));
  const adminCookie = adminLogin.setCookie.split(";", 1)[0];

  const teacherLogin = await request("/auth/login", {
    method: "POST",
    body: { email: pendingApprove.email, password },
  });
  assert.equal(teacherLogin.code, 200, JSON.stringify(teacherLogin.data));
  const teacherCookie = teacherLogin.setCookie.split(";", 1)[0];

  await t.test("Teacher application routes remain Admin-only", async () => {
    assert.equal((await request("/admin/teachers")).code, 401);
    assert.equal((await request("/admin/teachers", { cookie: teacherCookie })).code, 403);
  });

  await t.test("Lists all live teachers with pending applications first", async () => {
    const all = await request("/admin/teachers", { cookie: adminCookie });
    assert.equal(all.code, 200, JSON.stringify(all.data));
    assert.equal(all.data.count, 4);
    assert.deepEqual(
      all.data.teachers.slice(0, 2).map((teacher) => teacher.teacherStatus),
      ["pending", "pending"],
    );

    const pending = await request("/admin/teachers/pending", { cookie: adminCookie });
    assert.equal(pending.code, 200, JSON.stringify(pending.data));
    assert.equal(pending.data.count, 2);
    assert.ok(pending.data.teachers.every((teacher) => teacher.teacherStatus === "pending"));
  });

  await t.test("Approving and rejecting persist and refresh the pending queue", async () => {
    const approved = await request(`/admin/teachers/${pendingApprove._id}/approve`, {
      method: "PATCH",
      cookie: adminCookie,
    });
    assert.equal(approved.code, 200, JSON.stringify(approved.data));
    assert.equal(approved.data.teacher.teacherStatus, "approved");
    assert.equal(
      (await Teacher.findById(pendingApprove._id).lean()).teacherStatus,
      "approved",
    );
    assert.equal(
      (await request(`/admin/teachers/${pendingApprove._id}/approve`, {
        method: "PATCH",
        cookie: adminCookie,
      })).code,
      409,
    );

    const rejected = await request(`/admin/teachers/${pendingReject._id}/reject`, {
      method: "PATCH",
      cookie: adminCookie,
    });
    assert.equal(rejected.code, 200, JSON.stringify(rejected.data));
    assert.equal(rejected.data.teacher.teacherStatus, "rejected");
    assert.equal(
      (await Teacher.findById(pendingReject._id).lean()).teacherStatus,
      "rejected",
    );

    const pending = await request("/admin/teachers/pending", { cookie: adminCookie });
    assert.equal(pending.code, 200, JSON.stringify(pending.data));
    assert.equal(pending.data.count, 0);

    const reloaded = await request("/admin/teachers", { cookie: adminCookie });
    assert.equal(reloaded.code, 200, JSON.stringify(reloaded.data));
    const statuses = new Map(
      reloaded.data.teachers.map((teacher) => [teacher.email, teacher.teacherStatus]),
    );
    assert.equal(statuses.get(pendingApprove.email), "approved");
    assert.equal(statuses.get(pendingReject.email), "rejected");
  });
});

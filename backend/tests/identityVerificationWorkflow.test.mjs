import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import Student from "../src/models/Student.js";
import Teacher from "../src/models/Teacher.js";
import Admin from "../src/models/Admin.js";
import { StudentVerification, TeacherVerification } from "../src/models/IdentityVerification.js";
import { removePrivateCnic } from "../src/services/privateCnicStorage.js";

test("Student and Teacher CNIC verification through isolated encrypted fixtures", { timeout: 90000 }, async (t) => {
  const database = `educonnect_identity_test_${randomUUID().replaceAll("-", "")}`;
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
    CLIENT_ORIGIN: process.env.CLIENT_ORIGIN,
    CNIC_ENCRYPTION_KEY: process.env.CNIC_ENCRYPTION_KEY,
  };
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "identity-verification-test-secret-32-characters";
  process.env.CLIENT_ORIGIN = "http://localhost:5173";
  process.env.CNIC_ENCRYPTION_KEY = "11".repeat(32);

  await mongoose.connect("mongodb://127.0.0.1:27017", {
    dbName: database,
    serverSelectionTimeoutMS: 5000,
  });
  await Promise.all([
    Student,
    Teacher,
    Admin,
    StudentVerification,
    TeacherVerification,
  ].map((Model) => Model.init()));

  const { default: app } = await import("../src/app.js");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    const records = await Promise.all([
      StudentVerification.find({}).lean(),
      TeacherVerification.find({}).lean(),
    ]);
    const paths = records.flat().flatMap((record) => [
      record.documents?.front?.relativePath,
      record.documents?.back?.relativePath,
    ]).filter(Boolean);
    await Promise.all(paths.map((path) => removePrivateCnic(path)));
    await new Promise((resolve) => server.close(resolve));
    assert.equal(mongoose.connection.name, database);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function request(path, { method = "GET", body, cookie } = {}) {
    const isForm = body instanceof FormData;
    const response = await fetch(base + path, {
      method,
      headers: {
        Origin: "http://localhost:5173",
        "X-Requested-With": "XMLHttpRequest",
        ...(!isForm && body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
    });
    const contentType = response.headers.get("content-type") || "";
    return {
      code: response.status,
      contentType,
      data: contentType.startsWith("application/json")
        ? await response.json()
        : Buffer.from(await response.arrayBuffer()),
      setCookie: response.headers.get("set-cookie") || "",
    };
  }

  const pngBytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.alloc(64, 7),
  ]);
  const jpegBytes = Buffer.concat([
    Buffer.from([255, 216, 255, 224]),
    Buffer.alloc(64, 9),
  ]);
  function verificationForm(front = pngBytes, back = jpegBytes) {
    const form = new FormData();
    form.append("cnicFront", new Blob([front], { type: "image/png" }), "fixture-front.png");
    form.append("cnicBack", new Blob([back], { type: "image/jpeg" }), "fixture-back.jpg");
    return form;
  }

  const password = "Verification-test-123";
  const studentInput = { fullName: "Fixture Student", email: "fixture.student@example.test", password, role: "student" };
  const teacherInput = { fullName: "Fixture Teacher", email: "fixture.teacher@example.test", password, role: "teacher" };
  await request("/api/auth/register", { method: "POST", body: studentInput });
  await request("/api/auth/register", { method: "POST", body: teacherInput });
  const admin = await Admin.create({
    fullName: "Fixture Admin",
    email: "fixture.admin@example.test",
    password,
    role: "admin",
    teacherStatus: "not_applicable",
  });

  async function login(email) {
    const result = await request("/api/auth/login", { method: "POST", body: { email, password } });
    assert.equal(result.code, 200);
    return result.setCookie.split(";", 1)[0];
  }
  const studentCookie = await login(studentInput.email);
  const teacherCookie = await login(teacherInput.email);
  const adminCookie = await login(admin.email);

  await t.test("status and submission endpoints enforce authentication, role and image validation", async () => {
    assert.equal((await request("/api/student/verification")).code, 401);
    assert.equal((await request("/api/student/verification", { cookie: teacherCookie })).code, 403);
    const initial = await request("/api/student/verification", { cookie: studentCookie });
    assert.equal(initial.code, 200);
    assert.equal(initial.data.verification.cnicStatus, "not_submitted");

    const missingBack = new FormData();
    missingBack.append("cnicFront", new Blob([pngBytes], { type: "image/png" }), "front.png");
    assert.equal((await request("/api/student/verification/submit", {
      method: "POST", cookie: studentCookie, body: missingBack,
    })).code, 400);

    const spoofed = verificationForm(Buffer.alloc(64, 1), jpegBytes);
    assert.equal((await request("/api/student/verification/submit", {
      method: "POST", cookie: studentCookie, body: spoofed,
    })).code, 400);
  });

  await t.test("Student submission can be inspected, rejected, resubmitted and approved once", async () => {
    const submitted = await request("/api/student/verification/submit", {
      method: "POST", cookie: studentCookie, body: verificationForm(),
    });
    assert.equal(submitted.code, 201);
    assert.equal(submitted.data.verification.cnicStatus, "pending");
    assert.equal((await request("/api/student/verification/submit", {
      method: "POST", cookie: studentCookie, body: verificationForm(),
    })).code, 409);

    assert.equal((await request("/api/admin/student-verifications", { cookie: studentCookie })).code, 403);
    const pending = await request("/api/admin/student-verifications", { cookie: adminCookie });
    assert.equal(pending.code, 200);
    assert.equal(pending.data.count, 1);
    const accountId = pending.data.verifications[0].id;
    const image = await request(`/api/admin/student-verifications/${accountId}/document/front`, { cookie: adminCookie });
    assert.equal(image.code, 200);
    assert.equal(image.contentType, "image/png");
    assert.deepEqual(image.data, pngBytes);

    assert.equal((await request(`/api/admin/student-verifications/${accountId}/reject`, {
      method: "PATCH", cookie: adminCookie, body: { reason: "no" },
    })).code, 400);
    assert.equal((await request(`/api/admin/student-verifications/${accountId}/reject`, {
      method: "PATCH", cookie: adminCookie, body: { reason: "Synthetic fixture review rejection." },
    })).code, 200);
    assert.equal((await request(`/api/admin/student-verifications/${accountId}/approve`, {
      method: "PATCH", cookie: adminCookie, body: {},
    })).code, 409);

    assert.equal((await request("/api/student/verification/submit", {
      method: "POST", cookie: studentCookie, body: verificationForm(),
    })).code, 201);
    assert.equal((await request(`/api/admin/student-verifications/${accountId}/approve`, {
      method: "PATCH", cookie: adminCookie, body: {},
    })).code, 200);
    const me = await request("/api/auth/me", { cookie: studentCookie });
    assert.equal(me.data.user.cnicVerification.status, "verified");
    assert.equal(me.data.user.isIdentityVerified, true);
  });

  await t.test("Teacher verification approval is isolated from Student records", async () => {
    assert.equal((await request("/api/teacher/verification/submit", {
      method: "POST", cookie: teacherCookie, body: verificationForm(),
    })).code, 201);
    const pending = await request("/api/admin/verifications", { cookie: adminCookie });
    assert.equal(pending.code, 200);
    assert.equal(pending.data.count, 1);
    const accountId = pending.data.verifications[0].id;
    assert.equal((await request(`/api/admin/verifications/${accountId}/approve`, {
      method: "PATCH", cookie: adminCookie, body: {},
    })).code, 200);
    assert.equal((await request("/api/teacher/verification", { cookie: teacherCookie })).data.verification.cnicStatus, "verified");
    assert.equal((await request("/api/admin/student-verifications", { cookie: adminCookie })).data.count, 0);
  });

  await t.test("Admin review returns not-found and each role can log out", async () => {
    const missingId = new mongoose.Types.ObjectId();
    assert.equal((await request(`/api/admin/verifications/${missingId}/approve`, {
      method: "PATCH", cookie: adminCookie, body: {},
    })).code, 404);
    for (const cookie of [studentCookie, teacherCookie, adminCookie]) {
      const logout = await request("/api/auth/logout", { method: "POST", cookie });
      assert.equal(logout.code, 200);
      assert.match(logout.setCookie, /edc_session=;/);
    }
  });
});

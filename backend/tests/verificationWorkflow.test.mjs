import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Admin from "../src/models/Admin.js";
import Student from "../src/models/Student.js";
import Teacher from "../src/models/Teacher.js";
import { StudentVerification, TeacherVerification } from "../src/models/IdentityVerification.js";
import { readPrivateCnic, removePrivateCnic } from "../src/services/privateCnicStorage.js";
import { validateEnvironment } from "../src/config/security.js";

async function assertBackendStartsWithoutEncryptionKey(database) {
  const childEnvironment = {
    ...process.env,
    DOTENV_CONFIG_PATH: "/dev/null",
    NODE_ENV: "test",
    PORT: "0",
    HOST: "127.0.0.1",
    MONGO_URI: `mongodb://127.0.0.1:27017/${database}`,
    JWT_SECRET: "verification-integration-test-secret-32-characters",
    CLIENT_ORIGIN: "http://localhost:5173",
  };
  delete childEnvironment.CNIC_ENCRYPTION_KEY;
  const child = spawn(process.execPath, ["src/dev.js"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: childEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  let output = "";
  const startup = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Backend did not start: ${output}`)), 20000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("EduConnect AI Backend Started")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      if (!output.includes("EduConnect AI Backend Started")) {
        clearTimeout(timer);
        reject(new Error(`Backend exited before startup (${code}): ${output}`));
      }
    });
  });
  try {
    await startup;
  } finally {
    child.kill("SIGTERM");
    await exited;
  }
}

test("Backend auth and Student/Teacher verification work without an encryption key", { timeout: 90000 }, async (t) => {
  const database = `educonnect_verification_test_${randomUUID().replaceAll("-", "")}`;
  const previousEnvironment = Object.fromEntries([
    "NODE_ENV",
    "JWT_SECRET",
    "JWT_EXPIRES_IN",
    "CLIENT_ORIGIN",
    "CNIC_ENCRYPTION_KEY",
  ].map((key) => [key, process.env[key]]));
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "verification-integration-test-secret-32-characters";
  process.env.JWT_EXPIRES_IN = "12h";
  process.env.CLIENT_ORIGIN = "http://localhost:5173";
  delete process.env.CNIC_ENCRYPTION_KEY;
  assert.doesNotThrow(() => validateEnvironment({
    NODE_ENV: "development",
    CLIENT_ORIGIN: "http://localhost:5173",
  }));
  assert.doesNotThrow(() => validateEnvironment({
    NODE_ENV: "production",
    CLIENT_ORIGIN: "https://educonnect.example",
    JWT_SECRET: "production-integration-test-secret-32-characters",
    PASSWORD_RESET_FRONTEND_ORIGIN: "https://educonnect.example",
    SMTP_HOST: "smtp.example",
    SMTP_PORT: "587",
    SMTP_USER: "test-user",
    SMTP_PASS: "test-password",
    SMTP_FROM: "EduConnect <test@example.test>",
    MONGO_URI: "mongodb://test-user:test-password@db.example.test:27017/educonnect?tls=true",
  }));

  await t.test("Backend entry point starts without CNIC_ENCRYPTION_KEY", async () => {
    await assertBackendStartsWithoutEncryptionKey(database);
  });

  await mongoose.connect("mongodb://127.0.0.1:27017", { dbName: database, serverSelectionTimeoutMS: 5000 });
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    for (const Verification of [StudentVerification, TeacherVerification]) {
      const records = await Verification.find().select("documents").lean();
      for (const record of records) {
        await Promise.all(["front", "back"].map((side) =>
          removePrivateCnic(record.documents?.[side]?.relativePath),
        ));
      }
    }
    assert.equal(mongoose.connection.name, database);
    assert.ok(database.startsWith("educonnect_verification_test_"));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  await Promise.all([Student, Teacher, Admin, StudentVerification, TeacherVerification].map((Model) => Model.init()));
  const { default: app } = await import("../src/app.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const password = "Verification-test-password-123";
  const accounts = {};
  const cookies = {};

  async function request(path, { actor, method = "GET", body, form } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        Origin: "http://localhost:5173",
        "X-Requested-With": "XMLHttpRequest",
        ...(actor ? { Cookie: cookies[actor] } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: form || (body ? JSON.stringify(body) : undefined),
    });
    const data = response.headers.get("content-type")?.includes("application/json")
      ? await response.json()
      : await response.arrayBuffer();
    return { response, code: response.status, data, setCookie: response.headers.get("set-cookie") || "" };
  }

  for (const [role, fullName, email] of [
    ["student", "Verification Student", "student.verification@example.test"],
    ["teacher", "Verification Teacher", "teacher.verification@example.test"],
  ]) {
    const registration = await request("/auth/register", {
      method: "POST",
      body: { fullName, email, password, role },
    });
    assert.equal(registration.code, 201, JSON.stringify(registration.data));
    const Model = role === "student" ? Student : Teacher;
    accounts[role] = await Model.findOne({ email });
    assert.ok(accounts[role]);
  }
  accounts.admin = await Admin.create({
    fullName: "Verification Admin",
    email: "admin.verification@example.test",
    password,
    role: "admin",
  });

  for (const role of Object.keys(accounts)) {
    const login = await request("/auth/login", {
      method: "POST",
      body: { email: accounts[role].email, password },
    });
    assert.equal(login.code, 200, JSON.stringify(login.data));
    cookies[role] = login.setCookie.split(";", 1)[0];
  }

  await t.test("Unauthenticated state requests return 401; role sessions can read their own state", async () => {
    assert.equal((await request("/content/state")).code, 401);
    assert.equal((await request("/content/state", { actor: "student" })).code, 200);
    assert.equal((await request("/student/verification")).code, 401);
    assert.equal((await request("/student/verification", { actor: "student" })).code, 200);
    assert.equal((await request("/teacher/verification", { actor: "teacher" })).code, 200);
    assert.equal((await request("/student/verification", { actor: "teacher" })).code, 403);
    assert.equal((await request("/teacher/verification", { actor: "student" })).code, 403);
  });

  await t.test("Both roles upload private documents, persist records, and retain Admin approval", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
      "base64",
    );
    function uploadForm() {
      const form = new FormData();
      form.append("cnicFront", new Blob([png], { type: "image/png" }), "front.png");
      form.append("cnicBack", new Blob([png], { type: "image/png" }), "back.png");
      return form;
    }

    assert.equal((await request("/student/verification/submit", { method: "POST", form: uploadForm() })).code, 401);
    assert.equal((await request("/student/verification/submit", { actor: "teacher", method: "POST", form: uploadForm() })).code, 403);
    assert.equal((await request("/teacher/verification/submit", { actor: "student", method: "POST", form: uploadForm() })).code, 403);

    const studentSubmit = await request("/student/verification/submit", {
      actor: "student",
      method: "POST",
      form: uploadForm(),
    });
    const teacherSubmit = await request("/teacher/verification/submit", {
      actor: "teacher",
      method: "POST",
      form: uploadForm(),
    });
    assert.equal(studentSubmit.code, 201, JSON.stringify(studentSubmit.data));
    assert.equal(teacherSubmit.code, 201, JSON.stringify(teacherSubmit.data));
    assert.equal(studentSubmit.data.verification.cnicStatus, "pending");
    assert.equal(teacherSubmit.data.verification.cnicStatus, "pending");

    for (const [Model, Verification, role] of [
      [Student, StudentVerification, "student"],
      [Teacher, TeacherVerification, "teacher"],
    ]) {
      const record = await Verification.findOne({ accountId: accounts[role]._id });
      assert.ok(record);
      assert.equal(record.status, "pending");
      assert.equal(record.fullName, accounts[role].fullName);
      assert.equal(record.email, accounts[role].email);
      for (const side of ["front", "back"]) {
        const relativePath = record.documents[side].relativePath;
        assert.match(relativePath, /^uploads\/cnic\/[0-9a-f]{32}\.bin$/);
        const stored = await readFile(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)));
        assert.deepEqual(stored, png);
        const absoluteFile = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
        assert.equal((await stat(absoluteFile)).mode & 0o777, 0o600);
        assert.equal((await stat(fileURLToPath(new URL(`../uploads/cnic/`, import.meta.url)))).mode & 0o777, 0o700);
        assert.deepEqual(await readPrivateCnic(relativePath), png);
        assert.equal(record.documents[side].mimeType, "image/png");
        assert.equal((await request(`/${relativePath}`)).code, 404, "uploaded documents must not have a public HTTP path");
      }
      assert.ok(await Model.findById(accounts[role]._id));
    }

    const studentQueue = await request("/admin/student-verifications", { actor: "admin" });
    const teacherQueue = await request("/admin/verifications", { actor: "admin" });
    assert.equal(studentQueue.code, 200);
    assert.equal(teacherQueue.code, 200);
    assert.equal(studentQueue.data.count, 1);
    assert.equal(teacherQueue.data.count, 1);
    const studentDocument = await request(`/admin/student-verifications/${accounts.student._id}/document/front`, { actor: "admin" });
    const deniedStudentDocument = await request(`/admin/student-verifications/${accounts.student._id}/document/front`, { actor: "student" });
    const teacherDocument = await request(`/admin/verifications/${accounts.teacher._id}/document/front`, { actor: "admin" });
    assert.equal(studentDocument.code, 200);
    assert.deepEqual(Buffer.from(studentDocument.data), png);
    assert.equal(studentDocument.response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(studentDocument.response.headers.get("cache-control"), "no-store, private");
    assert.equal(deniedStudentDocument.code, 403);
    assert.equal(teacherDocument.code, 200);
    assert.deepEqual(Buffer.from(teacherDocument.data), png);
    assert.equal((await request(`/admin/verifications/${accounts.teacher._id}/document/front`, { actor: "student" })).code, 403);
    assert.equal(teacherDocument.response.headers.get("cache-control"), "no-store, private");

    const studentReview = await request(`/admin/student-verifications/${accounts.student._id}/approve`, {
      actor: "admin",
      method: "PATCH",
    });
    const teacherReview = await request(`/admin/verifications/${accounts.teacher._id}/approve`, {
      actor: "admin",
      method: "PATCH",
    });
    assert.equal(studentReview.code, 200, JSON.stringify(studentReview.data));
    assert.equal(teacherReview.code, 200, JSON.stringify(teacherReview.data));
    assert.equal((await request("/student/verification", { actor: "student" })).data.verification.cnicStatus, "verified");
    assert.equal((await request("/teacher/verification", { actor: "teacher" })).data.verification.cnicStatus, "verified");
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import Student from "../src/models/Student.js";
import Teacher from "../src/models/Teacher.js";
import Admin from "../src/models/Admin.js";

test("Authentication signup and session security", { timeout: 60000 }, async (t) => {
  const database = `educonnect_auth_test_${randomUUID().replaceAll("-", "")}`;
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
    CLIENT_ORIGIN: process.env.CLIENT_ORIGIN,
  };
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "authentication-integration-test-secret-32-characters";
  process.env.JWT_EXPIRES_IN = "12h";
  process.env.CLIENT_ORIGIN = "http://localhost:5173";

  await mongoose.connect("mongodb://127.0.0.1:27017", { dbName: database, serverSelectionTimeoutMS: 5000 });
  await Promise.all([Student, Teacher, Admin].map((Model) => Model.init()));
  const { default: app } = await import("../src/app.js");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/auth`;

  t.after(async () => {
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

  const password = "Secure-password-123";
  const studentInput = { fullName: "Auth Student", email: "Student.Auth@example.test", password, role: "student" };
  const teacherInput = { fullName: "Auth Teacher", email: "teacher.auth@example.test", password, role: "teacher" };
  let studentCookie;
  let teacherCookie;

  await t.test("Student and Teacher signup normalize email and reject duplicates", async () => {
    assert.equal((await request("/register", { method: "POST", body: studentInput })).code, 201);
    assert.equal((await request("/register", { method: "POST", body: teacherInput })).code, 201);
    const duplicate = await request("/register", {
      method: "POST",
      body: { ...teacherInput, email: "student.auth@example.test" },
    });
    assert.equal(duplicate.code, 409);
    assert.equal(await Student.countDocuments({ email: "student.auth@example.test" }), 1);
    assert.equal(await Teacher.countDocuments({ email: "student.auth@example.test" }), 0);
  });

  await t.test("Login issues an HttpOnly fixed-lifetime session", async () => {
    const studentLogin = await request("/login", { method: "POST", body: { email: studentInput.email, password } });
    assert.equal(studentLogin.code, 200);
    assert.match(studentLogin.setCookie, /edc_session=/);
    assert.match(studentLogin.setCookie, /HttpOnly/i);
    assert.match(studentLogin.setCookie, /SameSite=Lax/i);
    assert.match(studentLogin.setCookie, /Path=\/api/i);
    studentCookie = studentLogin.setCookie.split(";", 1)[0];

    const teacherLogin = await request("/login", { method: "POST", body: { email: teacherInput.email, password } });
    assert.equal(teacherLogin.code, 200);
    teacherCookie = teacherLogin.setCookie.split(";", 1)[0];
    const me = await request("/me", { cookie: studentCookie });
    assert.equal(me.code, 200);
    assert.equal(me.setCookie, "", "Protected requests must not silently renew unsupported sessions");
  });

  await t.test("Invalid, tampered and expired tokens are rejected", async () => {
    assert.equal((await request("/me", { cookie: "edc_session=not-a-jwt" })).code, 401);
    const token = studentCookie.slice("edc_session=".length);
    const parts = token.split(".");
    parts[2] = `${parts[2][0] === "a" ? "b" : "a"}${parts[2].slice(1)}`;
    assert.equal((await request("/me", { cookie: `edc_session=${parts.join(".")}` })).code, 401);

    const student = await Student.findOne({ email: "student.auth@example.test" }).select("+sessionVersion");
    const expired = jwt.sign(
      { userId: String(student._id), role: student.role, sv: student.sessionVersion },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: -1 },
    );
    assert.equal((await request("/me", { cookie: `edc_session=${expired}` })).code, 401);
  });

  await t.test("Disabled accounts cannot log in or continue an existing session", async () => {
    await Teacher.updateOne({ email: teacherInput.email }, { $set: { isActive: false } });
    assert.equal((await request("/login", { method: "POST", body: { email: teacherInput.email, password } })).code, 403);
    assert.equal((await request("/me", { cookie: teacherCookie })).code, 401);
  });

  await t.test("Logout clears the cookie and revokes the issued session", async () => {
    const logout = await request("/logout", { method: "POST", cookie: studentCookie });
    assert.equal(logout.code, 200);
    assert.match(logout.setCookie, /edc_session=;/);
    assert.match(logout.setCookie, /HttpOnly/i);
    assert.equal((await request("/me", { cookie: studentCookie })).code, 401);
  });
});

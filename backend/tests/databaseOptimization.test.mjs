import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import Admin from "../src/models/Admin.js";
import Student from "../src/models/Student.js";
import Teacher from "../src/models/Teacher.js";
import Assignment from "../src/models/Assignment.js";
import AssignmentSubmission from "../src/models/AssignmentSubmission.js";
import ContentAccess from "../src/models/ContentAccess.js";
import Course from "../src/models/Course.js";
import TeacherBook from "../src/models/TeacherBook.js";
import CourseQuiz from "../src/models/CourseQuiz.js";
import CourseReview from "../src/models/CourseReview.js";
import { StudentVerification, TeacherVerification } from "../src/models/IdentityVerification.js";
import Lesson from "../src/models/Lesson.js";
import LessonProgress from "../src/models/LessonProgress.js";
import Order from "../src/models/Order.js";
import PasswordResetToken from "../src/models/PasswordResetToken.js";
import QuizAttempt from "../src/models/QuizAttempt.js";
import ResearchRecord from "../src/models/ResearchRecord.js";
import SupportTicket from "../src/models/SupportTicket.js";
import TeacherEarning from "../src/models/TeacherEarning.js";

test("MongoDB indexes and bounded Admin pagination", { timeout: 120000 }, async (t) => {
  const database = `educonnect_indexes_test_${randomUUID().replaceAll("-", "")}`;
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
    CLIENT_ORIGIN: process.env.CLIENT_ORIGIN,
  };
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "database-index-test-secret-32-characters";
  process.env.CLIENT_ORIGIN = "http://localhost:5173";

  await mongoose.connect("mongodb://127.0.0.1:27017", {
    dbName: database,
    serverSelectionTimeoutMS: 5000,
  });
  const models = [
    Admin, Student, Teacher, Assignment, AssignmentSubmission, ContentAccess,
    Course, TeacherBook, CourseQuiz, CourseReview, StudentVerification,
    TeacherVerification, Lesson, LessonProgress, Order, PasswordResetToken,
    QuizAttempt, ResearchRecord, SupportTicket, TeacherEarning,
  ];
  await Promise.all(models.map((Model) => Model.init()));
  const { default: app } = await import("../src/app.js");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

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

  const indexCatalog = async (Model) => Model.collection.indexes();
  const findIndex = (indexes, key) => indexes.find((index) =>
    JSON.stringify(index.key) === JSON.stringify(key));

  await t.test("declared compound indexes match recurring filters and sorts", async () => {
    const expected = [
      [Admin, { createdAt: -1, email: 1 }],
      [Student, { isActive: 1, createdAt: -1 }],
      [Teacher, { lastLogin: -1 }],
      [Course, { teacherId: 1, createdAt: -1 }],
      [Course, { status: 1, published: 1, createdAt: -1 }],
      [TeacherBook, { teacherId: 1, createdAt: -1 }],
      [ContentAccess, { kind: 1, contentId: 1, studentId: 1 }],
      [ContentAccess, { kind: 1, createdAt: -1 }],
      [Lesson, { courseId: 1, order: 1, _id: 1 }],
      [Assignment, { courseId: 1, updatedAt: -1 }],
      [Assignment, { courseId: 1, published: 1, createdAt: 1 }],
      [AssignmentSubmission, { studentId: 1, courseId: 1 }],
      [CourseQuiz, { courseId: 1, published: 1, createdAt: 1 }],
      [CourseReview, { courseId: 1, moderated: 1, createdAt: -1 }],
      [CourseReview, { studentId: 1, updatedAt: -1 }],
      [StudentVerification, { status: 1, submittedAt: -1 }],
      [TeacherVerification, { status: 1, submittedAt: -1 }],
      [LessonProgress, { studentId: 1, createdAt: -1 }],
      [LessonProgress, { courseId: 1, studentId: 1 }],
      [Order, { studentId: 1, createdAt: -1 }],
      [PasswordResetToken, { userId: 1, role: 1, sessionVersion: 1 }],
      [QuizAttempt, { studentId: 1, courseId: 1, submittedAt: -1 }],
      [QuizAttempt, { courseId: 1, quizId: 1, submittedAt: 1 }],
      [ResearchRecord, { ownerId: 1, createdAt: -1, _id: -1 }],
      [ResearchRecord, { ownerId: 1, courseId: 1, createdAt: -1 }],
      [ResearchRecord, { ownerId: 1, type: 1, title: 1 }],
      [SupportTicket, { requesterEmail: 1, requesterRole: 1, createdAt: -1 }],
      [Teacher, { teacherStatus: 1, createdAt: -1 }],
      [TeacherEarning, { teacherId: 1, createdAt: -1 }],
    ];
    const catalogs = new Map();
    for (const [Model, key] of expected) {
      if (!catalogs.has(Model)) catalogs.set(Model, await indexCatalog(Model));
      assert.ok(findIndex(catalogs.get(Model), key), `${Model.modelName} is missing ${JSON.stringify(key)}`);
    }
  });

  await t.test("unique and TTL safety indexes remain enforced", async () => {
    const accessIndexes = await indexCatalog(ContentAccess);
    assert.equal(findIndex(accessIndexes, { studentId: 1, kind: 1, contentId: 1 })?.unique, true);
    const orderIndexes = await indexCatalog(Order);
    assert.equal(findIndex(orderIndexes, { studentId: 1, idempotencyKey: 1 })?.unique, true);
    assert.deepEqual(findIndex(orderIndexes, { studentId: 1, idempotencyKey: 1 })?.partialFilterExpression,
      { idempotencyKey: { $type: "string" } });
    const tokenIndexes = await indexCatalog(PasswordResetToken);
    assert.equal(findIndex(tokenIndexes, { expiresAt: 1 })?.expireAfterSeconds, 0);

    // Prefix-equivalent single-field declarations were removed for new
    // databases; production cleanup remains an explicit deployment action.
    assert.equal(findIndex(accessIndexes, { studentId: 1 }), undefined);
    assert.equal(findIndex(await indexCatalog(LessonProgress), { courseId: 1 }), undefined);
    assert.equal(findIndex(await indexCatalog(CourseReview), { studentId: 1 }), undefined);
  });

  await t.test("Admin pagination is correct without materializing every matching account", async () => {
    const password = "Index-test-password-123";
    const admin = await Admin.create({
      fullName: "Index Admin",
      email: "index.admin@example.test",
      password,
      role: "admin",
      teacherStatus: "not_applicable",
    });
    const start = Date.now() - 300_000;
    const studentRows = Array.from({ length: 230 }, (_, index) => ({
      fullName: `Indexed Student ${String(index).padStart(3, "0")}`,
      email: `indexed.student.${String(index).padStart(3, "0")}@example.test`,
      password: "not-used-by-this-test",
      role: "student",
      isActive: true,
      isVerified: false,
      teacherStatus: "not_applicable",
      sessionVersion: 0,
      createdAt: new Date(start + index * 1000),
      updatedAt: new Date(start + index * 1000),
    }));
    await Student.collection.insertMany(studentRows);
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: admin.email, password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";", 1)[0];
    const response = await fetch(`${base}/api/admin/users?page=3&limit=50`, {
      headers: { Origin: "http://localhost:5173", "X-Requested-With": "XMLHttpRequest", Cookie: cookie },
    });
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(data.total, 231);
    assert.equal(data.page, 3);
    assert.equal(data.pageCount, 5);
    assert.equal(data.users.length, 50);
    const timestamps = data.users.map((user) => new Date(user.createdAt).getTime());
    assert.deepEqual(timestamps, [...timestamps].sort((left, right) => right - left));

    const clamped = await fetch(`${base}/api/admin/users?page=999&limit=50`, {
      headers: { Origin: "http://localhost:5173", "X-Requested-With": "XMLHttpRequest", Cookie: cookie },
    });
    const clampedData = await clamped.json();
    assert.equal(clampedData.page, 5);
    assert.equal(clampedData.users.length, 31);
  });
});

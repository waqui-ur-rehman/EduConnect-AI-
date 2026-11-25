import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Student from "../src/models/Student.js";
import Teacher from "../src/models/Teacher.js";
import Admin from "../src/models/Admin.js";
import Course from "../src/models/Course.js";
import TeacherBook from "../src/models/TeacherBook.js";
import ContentFile from "../src/models/ContentFile.js";
import ContentAccess from "../src/models/ContentAccess.js";
import CourseQuiz from "../src/models/CourseQuiz.js";
import CourseReview from "../src/models/CourseReview.js";
import CartItem from "../src/models/CartItem.js";
import Order from "../src/models/Order.js";
import PaymentEvent from "../src/models/PaymentEvent.js";
import TeacherEarning from "../src/models/TeacherEarning.js";
import PasswordResetToken from "../src/models/PasswordResetToken.js";
import ResearchRecord from "../src/models/ResearchRecord.js";
import { TeacherVerification } from "../src/models/IdentityVerification.js";
import { removePrivateCnic, writePrivateCnic } from "../src/services/privateCnicStorage.js";
import { signatureOverFields } from "../src/services/payments/shared.js";

test("Previously uncovered API endpoints through real HTTP and isolated MongoDB", { timeout: 120000 }, async (t) => {
  const database = `educonnect_remaining_api_test_${randomUUID().replaceAll("-", "")}`;
  const previousEnv = { ...process.env };
  Object.assign(process.env, {
    NODE_ENV: "test",
    JWT_SECRET: "remaining-api-integration-secret-32-characters",
    CLIENT_ORIGIN: "http://localhost:5173",
    CNIC_ENCRYPTION_KEY: "22".repeat(32),
    PAYMENT_MODE: "sandbox",
    PAYMENTS_LIVE_ENABLED: "false",
    PAYMENT_DEMO_CHECKOUT: "false",
    EASYPAISA_STORE_ID: "fixture-easypaisa-store",
    EASYPAISA_MERCHANT_CREDENTIALS: "fixture-easypaisa-secret-32-characters",
    EASYPAISA_CHECKOUT_URL: "https://sandbox.invalid/easypaisa",
  });

  await mongoose.connect("mongodb://127.0.0.1:27017", {
    dbName: database,
    serverSelectionTimeoutMS: 5000,
  });
  const models = [
    Student, Teacher, Admin, Course, TeacherBook, ContentFile, ContentAccess,
    CourseQuiz, CourseReview, CartItem, Order, PaymentEvent, TeacherEarning,
    PasswordResetToken, ResearchRecord, TeacherVerification,
  ];
  await Promise.all(models.map((Model) => Model.init()));

  const { default: app } = await import("../src/app.js");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const createdContentPaths = [];
  const createdCnicPaths = [];

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await Promise.all(createdContentPaths.map((path) => unlink(path).catch(() => {})));
    await Promise.all(createdCnicPaths.map((path) => removePrivateCnic(path).catch(() => {})));
    assert.equal(mongoose.connection.name, database);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env, previousEnv);
  });

  async function request(path, { actor, method = "GET", body, form, headers = {} } = {}) {
    const isUrlEncoded = body instanceof URLSearchParams;
    const response = await fetch(base + path, {
      method,
      headers: {
        Origin: "http://localhost:5173",
        "X-Requested-With": "XMLHttpRequest",
        ...(actor ? { Cookie: cookies[actor] } : {}),
        ...(body && !isUrlEncoded ? { "Content-Type": "application/json" } : {}),
        ...(isUrlEncoded ? { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" } : {}),
        ...headers,
      },
      body: form || (isUrlEncoded ? body.toString() : body ? JSON.stringify(body) : undefined),
      redirect: "manual",
    });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : Buffer.from(await response.arrayBuffer());
    return { response, data, code: response.status, contentType };
  }

  const password = "Remaining-api-password-123";
  const accounts = {};
  for (const [name, Model, role] of [
    ["owner", Teacher, "teacher"],
    ["other", Teacher, "teacher"],
    ["student", Student, "student"],
    ["student2", Student, "student"],
    ["admin", Admin, "admin"],
    ["resetUser", Student, "student"],
  ]) {
    accounts[name] = await Model.create({
      fullName: `Remaining ${name}`,
      email: `${name}@remaining-api.test`,
      password,
      role,
      teacherStatus: role === "teacher" ? "pending" : "not_applicable",
    });
  }
  const cookies = {};
  for (const name of ["owner", "other", "student", "student2", "admin"]) {
    const login = await request("/api/auth/login", {
      method: "POST",
      body: { email: accounts[name].email, password },
    });
    assert.equal(login.code, 200, `Login failed for ${name}`);
    cookies[name] = login.response.headers.get("set-cookie").split(";", 1)[0];
  }

  const imageBytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.alloc(64, 3),
  ]);
  const storageName = randomUUID();
  const contentPath = fileURLToPath(new URL(`../uploads/content/${storageName}`, import.meta.url));
  await mkdir(fileURLToPath(new URL("../uploads/content/", import.meta.url)), { recursive: true });
  await writeFile(contentPath, imageBytes);
  createdContentPaths.push(contentPath);
  const image = await ContentFile.create({
    teacherId: accounts.owner._id,
    storageName,
    originalName: "synthetic-cover.png",
    mimeType: "image/png",
    kind: "image",
    size: imageBytes.length,
  });

  const approvedCourse = {
    title: "Remaining coverage course",
    description: "Approved course for the remaining endpoint coverage.",
    metadata: { category: "Testing", price: 50, thumbnail: String(image._id) },
    lessons: [{ id: "lesson-1", title: "Original lesson", content: "Approved content", order: 0 }],
  };
  const course = await Course.create({
    teacherId: accounts.owner._id,
    ...approvedCourse,
    status: "published",
    published: true,
    revision: 0,
    approvedVersion: approvedCourse,
  });
  const approvedBook = {
    title: "Remaining coverage book",
    description: "Approved book for direct list coverage.",
    metadata: { category: "Testing", price: 25 },
  };
  const book = await TeacherBook.create({
    teacherId: accounts.owner._id,
    ...approvedBook,
    status: "published",
    published: true,
    revision: 0,
    approvedVersion: approvedBook,
  });
  await ContentAccess.create({
    studentId: accounts.student._id,
    contentId: course._id,
    kind: "course",
    source: "free",
    price: 0,
  });

  await t.test("Root and health endpoints report a connected API", async () => {
    const root = await request("/");
    assert.equal(root.code, 200);
    assert.equal(root.data.success, true);
    const health = await request("/api/health");
    assert.equal(health.code, 200);
    assert.equal(health.data.database, "Connected");
  });

  await t.test("Profile update and student verification lookup are scoped and validated", async () => {
    assert.equal((await request("/api/auth/me/profile", { method: "PATCH", body: { fullName: "Anonymous" } })).code, 401);
    const updated = await request("/api/auth/me/profile", {
      actor: "student", method: "PATCH", body: { fullName: "Updated Student" },
    });
    assert.equal(updated.code, 200);
    assert.equal(updated.data.user.fullName, "Updated Student");
    const forbiddenFields = await request("/api/auth/me/profile", {
      actor: "student", method: "PATCH", body: { fullName: "Student", role: "admin" },
    });
    assert.equal(forbiddenFields.code, 400);
    assert.equal((await Student.findById(accounts.student._id)).role, "student");

    const lookup = await request(`/api/auth/profiles/student/${accounts.student.email}/verification`, { actor: "student2" });
    assert.equal(lookup.code, 200);
    assert.equal(lookup.data.profile.isIdentityVerified, false);
    assert.equal((await request("/api/auth/profiles/student/not-an-email/verification", { actor: "student2" })).code, 400);
    assert.equal((await request("/api/auth/profiles/student/missing@example.test/verification", { actor: "student2" })).code, 404);
    assert.equal((await request(`/api/auth/profiles/student/${accounts.student.email}/verification`)).code, 401);
  });

  await t.test("Forgot/reset password returns generic errors and consumes a valid fixture token once", async () => {
    const forgot = await request("/api/auth/forgot-password", {
      method: "POST", body: { email: "unknown@remaining-api.test" },
    });
    assert.equal(forgot.code, 200);
    assert.equal(forgot.data.success, true);
    assert.equal((await request("/api/auth/forgot-password", { method: "POST", body: { email: "invalid" } })).code, 200);
    assert.equal((await request("/api/auth/reset-password", {
      method: "POST", body: { token: "bad", password: "New-password-123" },
    })).code, 400);

    const rawToken = "ab".repeat(32);
    await PasswordResetToken.create({
      tokenHash: createHash("sha256").update(rawToken).digest("hex"),
      userId: accounts.resetUser._id,
      role: "student",
      sessionVersion: 0,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const reset = await request("/api/auth/reset-password", {
      method: "POST", body: { token: rawToken, password: "New-password-456" },
    });
    assert.equal(reset.code, 200);
    assert.equal((await request("/api/auth/reset-password", {
      method: "POST", body: { token: rawToken, password: "Another-password-789" },
    })).code, 400);
    assert.equal((await request("/api/auth/login", {
      method: "POST", body: { email: accounts.resetUser.email, password: "New-password-456" },
    })).code, 200);
  });

  await t.test("Public and owned content lists, image serving and free unenrollment", async () => {
    assert.equal((await request("/api/content/courses")).code, 401);
    const courses = await request("/api/content/courses", { actor: "student" });
    assert.equal(courses.code, 200);
    assert.equal(courses.data.items[0].id, String(course._id));
    const mine = await request("/api/content/courses/mine", { actor: "owner" });
    assert.equal(mine.code, 200);
    assert.equal(mine.data.items[0].teacherId, String(accounts.owner._id));
    assert.equal((await request("/api/content/courses/mine", { actor: "other" })).data.items.length, 0);
    assert.equal((await request("/api/content/courses/mine", { actor: "student" })).code, 403);
    const books = await request("/api/content/books", { actor: "student" });
    assert.equal(books.code, 200);
    assert.equal(books.data.items[0].id, String(book._id));

    const served = await request(`/api/content/images/${image._id}`);
    assert.equal(served.code, 200);
    assert.equal(served.contentType, "image/png");
    assert.deepEqual(served.data, imageBytes);
    assert.equal((await request("/api/content/images/not-an-id")).code, 400);

    assert.equal((await request("/api/content/enrollments", {
      actor: "student2", method: "DELETE", body: { kind: "course", contentId: String(course._id) },
    })).code, 200);
    assert.equal(await ContentAccess.countDocuments({ studentId: accounts.student._id, contentId: course._id }), 1);
    const removed = await request("/api/content/enrollments", {
      actor: "student", method: "DELETE", body: { kind: "course", contentId: String(course._id) },
    });
    assert.equal(removed.code, 200);
    assert.equal(await ContentAccess.countDocuments({ studentId: accounts.student._id, contentId: course._id }), 0);
    assert.equal((await request("/api/content/enrollments", {
      actor: "student", method: "DELETE", body: { kind: "course", contentId: "invalid" },
    })).code, 400);
  });

  await t.test("Lesson and quiz update routes enforce ownership, validation and revisions", async () => {
    assert.equal((await request(`/api/content/courses/${course._id}/lessons/lesson-1`, {
      actor: "other", method: "PATCH", body: { revision: 0, title: "Stolen lesson" },
    })).code, 403);
    const lesson = await request(`/api/content/courses/${course._id}/lessons/lesson-1`, {
      actor: "owner", method: "PATCH", body: {
        revision: 0, title: "Updated lesson", content: "Updated content", order: 0,
      },
    });
    assert.equal(lesson.code, 200, JSON.stringify(lesson.data));
    assert.equal(lesson.data.item.lessons[0].title, "Updated lesson");
    assert.equal((await request(`/api/content/courses/${course._id}/lessons/missing`, {
      actor: "owner", method: "PATCH", body: { revision: 1, title: "Missing" },
    })).code, 404);

    const quiz = await CourseQuiz.create({
      courseId: course._id,
      teacherId: accounts.owner._id,
      title: "Original quiz",
      passingScore: 60,
      questions: [{ id: "1", prompt: "Original?", options: ["A", "B", "C", "D"], correct: 0 }],
    });
    const quizBody = {
      revision: 0,
      title: "Updated quiz",
      passingScore: 70,
      timeLimit: 10,
      questions: [{ prompt: "Updated?", options: ["A", "B", "C", "D"], correct: 1 }],
    };
    assert.equal((await request(`/api/quizzes/courses/${course._id}/teacher/${quiz._id}`, {
      actor: "other", method: "PUT", body: quizBody,
    })).code, 403);
    const updated = await request(`/api/quizzes/courses/${course._id}/teacher/${quiz._id}`, {
      actor: "owner", method: "PUT", body: quizBody,
    });
    assert.equal(updated.code, 200, JSON.stringify(updated.data));
    assert.equal(updated.data.quiz.revision, 1);
    assert.equal(updated.data.quiz.published, false);
    assert.equal((await request(`/api/quizzes/courses/${course._id}/teacher/${quiz._id}`, {
      actor: "owner", method: "PUT", body: quizBody,
    })).code, 409);
  });

  await t.test("Cart item removal and marketplace payment configuration are scoped", async () => {
    await CartItem.create({ studentId: accounts.student._id, kind: "book", contentId: book._id });
    assert.equal((await request(`/api/marketplace/cart/book/${book._id}`, {
      actor: "student2", method: "DELETE",
    })).code, 200);
    assert.equal(await CartItem.countDocuments({ studentId: accounts.student._id, contentId: book._id }), 1);
    const removed = await request(`/api/marketplace/cart/book/${book._id}`, {
      actor: "student", method: "DELETE",
    });
    assert.equal(removed.code, 200);
    assert.equal(removed.data.items.length, 0);
    assert.equal((await request("/api/marketplace/cart/book/not-an-id", {
      actor: "student", method: "DELETE",
    })).code, 400);
    assert.equal((await request("/api/marketplace/payments/config")).code, 401);
    const config = await request("/api/marketplace/payments/config", { actor: "student" });
    assert.equal(config.code, 200);
    assert.equal(config.data.success, true);
  });

  await t.test("Easypaisa callback uses a signed local fixture and never contacts a provider", async () => {
    const orderNumber = "ORD-EASYFIXTURE01";
    await Order.create({
      studentId: accounts.student._id,
      orderNumber,
      items: [{
        kind: "course", contentId: course._id, title: approvedCourse.title,
        teacherId: accounts.owner._id, price: 50, currency: "PKR",
      }],
      total: 50,
      amountMinor: 5000,
      currency: "PKR",
      status: "pending",
      environment: "sandbox",
    });
    const fields = {
      storeId: process.env.EASYPAISA_STORE_ID,
      amount: "50.00",
      orderRefNum: orderNumber,
      postBackURL: "http://localhost:5173/payment/return",
      paymentType: "MA",
      status: "0000",
      transactionId: "fixture-easypaisa-transaction",
    };
    fields.transactionHash = signatureOverFields({
      storeId: fields.storeId,
      amount: fields.amount,
      orderRefNum: fields.orderRefNum,
      postBackURL: fields.postBackURL,
      paymentType: fields.paymentType,
    }, process.env.EASYPAISA_MERCHANT_CREDENTIALS, { exclude: ["transactionHash"], prefixSalt: true });
    const paid = await request("/api/payments/easypaisa/callback", {
      method: "POST", body: new URLSearchParams(fields),
    });
    assert.equal(paid.code, 200, JSON.stringify(paid.data));
    assert.equal(paid.data.result, "paid");
    assert.equal((await Order.findOne({ orderNumber })).status, "paid");
    assert.equal((await request("/api/payments/easypaisa/callback", {
      method: "POST", body: new URLSearchParams({ ...fields, transactionHash: "00".repeat(32) }),
    })).code, 401);
  });

  await t.test("Teacher review summaries, private review list and owner deletion", async () => {
    const review = await CourseReview.create({
      courseId: course._id,
      studentId: accounts.student._id,
      rating: 5,
      comment: "Direct remaining coverage review.",
    });
    const summary = await request(`/api/learning/reviews/teacher-summary/${accounts.owner._id}`);
    assert.equal(summary.code, 200);
    assert.equal(summary.data.summary.count, 1);
    assert.equal((await request("/api/learning/reviews/teacher-summary/not-an-id")).code, 400);
    assert.equal((await request("/api/learning/reviews/teacher", { actor: "student" })).code, 403);
    const teacherReviews = await request("/api/learning/reviews/teacher", { actor: "owner" });
    assert.equal(teacherReviews.code, 200);
    assert.equal(teacherReviews.data.reviews[0].id, String(review._id));
    assert.equal((await request(`/api/learning/reviews/mine/${course._id}`, {
      actor: "student2", method: "DELETE",
    })).code, 200);
    assert.equal(await CourseReview.countDocuments({ _id: review._id }), 1);
    assert.equal((await request("/api/learning/reviews/mine/not-an-id", {
      actor: "student", method: "DELETE",
    })).code, 400);
    assert.equal((await request(`/api/learning/reviews/mine/${course._id}`, {
      actor: "student", method: "DELETE",
    })).code, 200);
    assert.equal(await CourseReview.countDocuments({ _id: review._id }), 0);
  });

  await t.test("Admin teacher listing and encrypted Teacher CNIC document access", async () => {
    assert.equal((await request("/api/admin/teachers")).code, 401);
    assert.equal((await request("/api/admin/teachers", { actor: "student" })).code, 403);
    const teachers = await request("/api/admin/teachers", { actor: "admin" });
    assert.equal(teachers.code, 200);
    assert.ok(teachers.data.teachers.some((entry) => entry.email === accounts.owner.email));

    const cnicBytes = Buffer.concat([Buffer.from([255, 216, 255, 224]), Buffer.alloc(64, 4)]);
    const frontPath = await writePrivateCnic(cnicBytes);
    const backPath = await writePrivateCnic(cnicBytes);
    createdCnicPaths.push(frontPath, backPath);
    await TeacherVerification.create({
      accountId: accounts.owner._id,
      fullName: accounts.owner.fullName,
      email: accounts.owner.email,
      status: "pending",
      submittedAt: new Date(),
      documents: {
        front: { relativePath: frontPath, mimeType: "image/jpeg" },
        back: { relativePath: backPath, mimeType: "image/jpeg" },
      },
    });
    assert.equal((await request(`/api/admin/verifications/${accounts.owner._id}/document/front`, { actor: "owner" })).code, 403);
    const document = await request(`/api/admin/verifications/${accounts.owner._id}/document/front`, { actor: "admin" });
    assert.equal(document.code, 200);
    assert.equal(document.contentType, "image/jpeg");
    assert.deepEqual(document.data, cnicBytes);
    assert.equal((await request(`/api/admin/verifications/${accounts.owner._id}/document/middle`, { actor: "admin" })).code, 400);
    assert.equal((await request(`/api/admin/verifications/${new mongoose.Types.ObjectId()}/document/front`, { actor: "admin" })).code, 404);
  });

  await t.test("POST research update is validated and owner-scoped", async () => {
    const record = await ResearchRecord.create({
      ownerId: accounts.student._id,
      type: "project",
      title: "Original research project",
      payload: { question: "Original question", status: "Planning" },
      status: "Planning",
    });
    assert.equal((await request(`/api/research/records/${record._id}`, {
      actor: "student2", method: "POST", body: {
        type: "project", title: "Foreign update", payload: { question: "No" },
      },
    })).code, 404);
    assert.equal((await request("/api/research/records/not-an-id", {
      actor: "student", method: "POST", body: { type: "project", title: "Valid title" },
    })).code, 400);
    const updated = await request(`/api/research/records/${record._id}`, {
      actor: "student", method: "POST", body: {
        type: "project",
        title: "Updated research project",
        payload: { question: "Updated question", status: "In Progress" },
        tags: ["Coverage"],
      },
    });
    assert.equal(updated.code, 200, JSON.stringify(updated.data));
    assert.equal(updated.data.record.title, "Updated research project");
    assert.equal(updated.data.record.status, "In Progress");
    assert.deepEqual(updated.data.record.tags, ["coverage"]);
  });
});

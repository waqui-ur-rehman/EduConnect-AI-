import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID, createHmac } from "node:crypto";
import { unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Teacher from "../src/models/Teacher.js";
import Student from "../src/models/Student.js";
import Admin from "../src/models/Admin.js";
import Course from "../src/models/Course.js";
import TeacherBook from "../src/models/TeacherBook.js";
import ContentFile from "../src/models/ContentFile.js";
import ContentAccess from "../src/models/ContentAccess.js";
import CartItem from "../src/models/CartItem.js";
import Order from "../src/models/Order.js";
import TeacherEarning from "../src/models/TeacherEarning.js";
import PaymentEvent from "../src/models/PaymentEvent.js";

// Development-only demo checkout workflow. Every scenario is exercised through
// the existing API surface (marketplace cart, orders/checkout, demo-checkout,
// webhooks, /content/state, /marketplace/finance/overview) against the real
// MongoDB test database with the test-provider adapter — no network calls.
test("Demo checkout workflow: success, idempotency, security and audit", { timeout: 120000 }, async (t) => {
  const database = `educonnect_demo_test_${randomUUID().replaceAll("-", "")}`;
  const previousEnv = { ...process.env };
  process.env.NODE_ENV = "test";
  process.env.PAYMENT_DEMO_CHECKOUT = "true";
  process.env.PAYMENT_PROVIDER = "test-provider";
  process.env.PAYMENT_WEBHOOK_SECRET = "demo-test-webhook-secret-32-characters!!";
  process.env.PLATFORM_COMMISSION_RATE = "0.2";
  process.env.JWT_SECRET = "demo-test-integration-secret-32-chars";
  process.env.CLIENT_ORIGIN = "http://localhost:5173";
  await mongoose.connect("mongodb://127.0.0.1:27017", { dbName: database, serverSelectionTimeoutMS: 5000 });
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    for (const file of await ContentFile.find().lean()) {
      await unlink(fileURLToPath(new URL(`../uploads/content/${file.storageName}`, import.meta.url))).catch(() => {});
    }
    assert.equal(mongoose.connection.name, database);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    for (const [key, value] of Object.entries(previousEnv)) process.env[key] = value;
    for (const key of Object.keys(process.env)) {
      if (!(key in previousEnv)) delete process.env[key];
    }
  });
  await Promise.all([Teacher, Student, Admin, Course, TeacherBook, ContentFile, ContentAccess, CartItem, Order, TeacherEarning, PaymentEvent].map((Model) => Model.init()));
  const { default: app } = await import("../src/app.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const password = "Test-password-12345";
  const accounts = {};
  for (const [name, Model, role] of [["owner", Teacher, "teacher"], ["student", Student, "student"], ["student2", Student, "student"], ["student3", Student, "student"], ["admin", Admin, "admin"]]) {
    accounts[name] = await Model.create({ fullName: `Demo ${name}`, email: `${name}@demo.test`, password, role });
  }
  const cookies = {};
  const rawWebhook = async (payload, { sign = true } = {}) => {
    const body = typeof payload === "string" ? payload : JSON.stringify(payload);
    const headers = { Origin: "http://localhost:5173", "Content-Type": "application/json" };
    if (sign) headers["X-Educonnect-Signature"] = `sha256=${createHmac("sha256", process.env.PAYMENT_WEBHOOK_SECRET).update(body).digest("hex")}`;
    const response = await fetch(`${base}/payments/webhook/test-provider`, { method: "POST", headers, body });
    return { response, data: await response.json().catch(() => null), code: response.status };
  };
  const request = async (path, { actor, method = "GET", body } = {}) => {
    const response = await fetch(base + path, { method, headers: {
      Origin: "http://localhost:5173", "X-Requested-With": "XMLHttpRequest",
      ...(actor ? { Cookie: cookies[actor] } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    }, body: body ? JSON.stringify(body) : undefined });
    const data = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
    return { response, data, code: response.status };
  };
  for (const name of Object.keys(accounts)) {
    const login = await request("/auth/login", { method: "POST", body: { email: accounts[name].email, password } });
    assert.equal(login.code, 200, `Login failed for ${name}`);
    cookies[name] = login.response.headers.get("set-cookie").split(";")[0];
  }
  const checkout = async (actor, idempotencyKey) => (await request("/marketplace/orders/checkout", { actor, method: "POST", body: { idempotencyKey } })).data;
  const demoCheckout = async (actor, orderNumber) => {
    try {
      const result = await request(`/marketplace/payments/demo-checkout/${encodeURIComponent(orderNumber)}`, { actor, method: "POST", body: {} });
      return { code: result.code, data: result.data };
    } catch (error) {
      return { code: error.status, data: { code: error.code, message: error.message } };
    }
  };
  const addToCart = async (actor, courseId) => {
    const result = await request("/marketplace/cart", { actor, method: "POST", body: { items: [{ kind: "course", contentId: courseId }] } });
    assert.equal(result.code, 201, JSON.stringify(result.data));
  };
  const makeCourse = async (title, price, lessonCount = 2) => {
    const input = { title, description: `${title} description with enough content`,
      metadata: { category: "Development", price, learningOutcomes: ["Complete the course"] },
      lessons: Array.from({ length: lessonCount }, (_, index) => ({ id: `lesson-${index + 1}`, title: `Lesson ${index + 1}`, content: `Approved lesson ${index + 1} content`, order: index })) };
    let course = (await request("/content/courses", { actor: "owner", method: "POST", body: input })).data.item;
    course = (await request(`/content/courses/${course.id}/submit`, { actor: "owner", method: "POST", body: { revision: course.revision } })).data.item;
    course = (await request(`/content/courses/${course.id}/review`, { actor: "admin", method: "POST", body: { decision: "approve", revision: course.revision } })).data.item;
    return course;
  };

  let paidCourse;
  let secondCourse;
  let doubleClickOrder;

  await t.test("Successful demo payment marks the order paid and grants entitlements", async () => {
    paidCourse = await makeCourse("Demo paid course A", 500, 2);
    await addToCart("student", paidCourse.id);
    const created = await checkout("student", "demo-test-student-0001");
    assert.equal(created.order.status, "pending", "Orders start pending");
    const orderNumber = created.order.orderNumber;
    // Pending orders grant no access or earnings.
    assert.equal(await ContentAccess.countDocuments({ studentId: accounts.student._id, contentId: paidCourse._id }), 0, "Pending orders do not grant access");
    assert.equal(await TeacherEarning.countDocuments({ orderNumber }), 0, "Pending orders record no earnings");
    assert.equal(await CartItem.countDocuments({ studentId: accounts.student._id, contentId: paidCourse._id }), 1, "Paid carts are kept until payment completes");

    const paid = await demoCheckout("student", orderNumber);
    assert.equal(paid.code, 200, JSON.stringify(paid.data));
    assert.equal(paid.data.demo, true);
    assert.equal(paid.data.order.status, "paid");
    assert.equal(paid.data.order.provider, "demo");
    assert.ok(String(paid.data.order.providerTransactionId).startsWith("demo_"), "A demo transaction reference is stored");
    assert.ok(paid.data.order.paidAt, "Order timestamps are updated");

    const order = await Order.findOne({ orderNumber });
    assert.equal(order.status, "paid");
    assert.equal(order.provider, "demo");
    assert.equal(order.providerTransactionId, paid.data.order.providerTransactionId);
    assert.ok(order.paidAt);

    // MongoDB access creation for the purchased course.
    const access = await ContentAccess.findOne({ studentId: accounts.student._id, contentId: paidCourse._id });
    assert.ok(access, "ContentAccess is created for the purchased course");
    assert.equal(String(access.contentId), String(paidCourse._id));
    assert.equal(access.kind, "course");
    assert.equal(access.price, 500);

    // Correct teacher earnings calculation (20% platform commission) recorded as demo.
    const earnings = await TeacherEarning.find({ order: order._id }).lean();
    assert.equal(earnings.length, 1, "One earnings record per paid item");
    assert.equal(earnings[0].grossAmount, 500);
    assert.equal(earnings[0].commissionAmount, 100, "Platform commission is 20% of the gross amount");
    assert.equal(earnings[0].teacherAmount, 400);
    assert.equal(String(earnings[0].teacherId), String(paidCourse.teacherId));
    assert.equal(earnings[0].source, "demo", "Demo earnings are distinguishable from real-money earnings");

    // Shopping cart synchronization.
    assert.equal(await CartItem.countDocuments({ studentId: accounts.student._id, contentId: paidCourse._id }), 0, "Purchased items leave the cart");

    // Audit event recorded with the existing audit design.
    const audit = await PaymentEvent.find({ provider: "demo", orderNumber }).lean();
    assert.equal(audit.length, 1, "One demo audit event per payment");
    assert.equal(audit[0].eventId, order.providerTransactionId);
    assert.equal(audit[0].result, "processed");
    assert.equal(audit[0].type, "demo.demo_checkout");

    // Student My Learning shows the purchased course via /content/state.
    const state = await request("/content/state", { actor: "student" });
    assert.equal(state.code, 200);
    const accessIds = state.data.accesses.map((entry) => String(entry.contentId));
    assert.ok(accessIds.includes(String(paidCourse._id)), "Purchased course appears in My Learning");

    // Admin Financial Management shows the demo transaction and excludes demo from cash totals.
    const overview = await request("/marketplace/finance/overview", { actor: "admin" });
    assert.equal(overview.code, 200);
    const record = overview.data.records.find((entry) => entry.orderId === orderNumber);
    assert.ok(record, "The paid demo transaction appears in admin finance records");
    assert.equal(record.provider, "demo");
    assert.equal(record.status, "paid");
    assert.equal(record.environment, "demo");
    assert.ok(record.providerTransactionId);
    assert.ok(Number(record.commission) > 0, "Platform commission is shown for the demo transaction");
    assert.ok(Number(record.teacherEarnings) > 0, "Teacher earnings are shown for the demo transaction");
    assert.equal(overview.data.summary.grossSales, 0, "Demo sales are excluded from real cash revenue totals");
    assert.equal(overview.data.summary.teacherEarnings, 0);
    assert.equal(overview.data.summary.paidSales, 0);
  });

  await t.test("Failed payment never grants access or earnings", async () => {
    await addToCart("student2", paidCourse.id);
    const created = await checkout("student2", "demo-test-student2-0001");
    assert.equal(created.order.status, "pending");
    const orderNumber = created.order.orderNumber;
    const failed = await rawWebhook({ eventId: "evt-demo-failed-1", type: "payment.failed", orderNumber, transactionId: "txn-demo-failed-1", amount: 500, currency: "PKR" });
    assert.equal(failed.code, 200);
    const order = await Order.findOne({ orderNumber });
    assert.equal(order.status, "failed");
    assert.equal(await ContentAccess.countDocuments({ studentId: accounts.student2._id, contentId: paidCourse._id }), 0, "Failed payments grant no access");
    assert.equal(await TeacherEarning.countDocuments({ orderNumber }), 0, "Failed payments record no earnings");
  });

  await t.test("Duplicate checkout requests and double-click never duplicate payments", async () => {
    await addToCart("student2", paidCourse.id);
    const first = await checkout("student2", "demo-test-student2-0002");
    doubleClickOrder = first.order;
    assert.equal(doubleClickOrder.status, "pending");
    const repeat = await checkout("student2", "demo-test-student2-0002");
    assert.equal(repeat.alreadyCreated, true, "Duplicate checkout with the same idempotency key reuses the order");
    assert.equal(repeat.order.orderNumber, doubleClickOrder.orderNumber);
    const paid = await demoCheckout("student2", doubleClickOrder.orderNumber);
    assert.equal(paid.code, 200, JSON.stringify(paid.data));
    const second = await demoCheckout("student2", doubleClickOrder.orderNumber);
    assert.equal(second.code, 409, "Repeated demo checkout on a paid order is rejected");
    const order = await Order.findOne({ orderNumber: doubleClickOrder.orderNumber });
    assert.equal(order.status, "paid");
    assert.equal(await TeacherEarning.countDocuments({ order: order._id }), 1, "No duplicate earnings records");
    assert.equal(await ContentAccess.countDocuments({ studentId: accounts.student2._id, contentId: paidCourse._id, source: "payment" }), 1, "No duplicate access records");
  });

  await t.test("Already purchased course cannot be purchased again", async () => {
    await addToCart("student2", paidCourse.id);
    const created = await checkout("student2", "demo-test-student2-0003");
    const paid = await demoCheckout("student2", created.order.orderNumber);
    assert.equal(paid.code, 200, JSON.stringify(paid.data));
    const order = await Order.findOne({ orderNumber: created.order.orderNumber });
    assert.equal(order.status, "paid");
    assert.equal(await ContentAccess.countDocuments({ studentId: accounts.student2._id, contentId: paidCourse._id, source: "payment" }), 1, "No duplicate access records for an already purchased course");
    assert.equal(await TeacherEarning.countDocuments({ order: order._id }), 1, "No duplicate earnings records");
  });

  await t.test("Unrelated pending orders are not marked paid", async () => {
    secondCourse = await makeCourse("Demo paid course B", 250, 2);
    await addToCart("student3", paidCourse.id);
    const first = await checkout("student3", "demo-test-student3-0001");
    assert.equal(first.order.status, "pending");
    await request("/marketplace/cart", { actor: "student3", method: "DELETE" });
    await addToCart("student3", secondCourse.id);
    const second = await checkout("student3", "demo-test-student3-0002");
    assert.notEqual(second.order.orderNumber, first.order.orderNumber, "A different pending order is created for a different cart");
    const firstPaid = await demoCheckout("student3", first.order.orderNumber);
    assert.equal(firstPaid.code, 200, JSON.stringify(firstPaid.data));
    assert.equal((await Order.findOne({ orderNumber: first.order.orderNumber })).status, "paid");
    const secondAfter = await Order.findOne({ orderNumber: second.order.orderNumber });
    assert.equal(secondAfter.status, "pending", "Unrelated pending orders stay pending");
    const secondPaid = await demoCheckout("student3", second.order.orderNumber);
    assert.equal(secondPaid.code, 200, JSON.stringify(secondPaid.data));
    assert.equal((await Order.findOne({ orderNumber: second.order.orderNumber })).status, "paid");
  });

  await t.test("Incorrect order reference is rejected", async () => {
    const bogus = await demoCheckout("student", "ORD-DEADBEEFDEADBEEFDEADBEEFDEADBEEF");
    assert.equal(bogus.code, 404, "Unknown order numbers are rejected");
    const foreign = await demoCheckout("student", doubleClickOrder.orderNumber);
    assert.equal(foreign.code, 404, "Orders of other students are invisible");
  });

  await t.test("Unauthorized access is denied", async () => {
    assert.equal((await demoCheckout("owner", doubleClickOrder.orderNumber)).code, 403, "Teachers cannot run demo checkout");
    assert.equal((await demoCheckout("owner", "ORD-DEADBEEFDEADBEEFDEADBEEFDEADBEEF")).code, 403, "Teachers cannot run demo checkout at all");
    assert.equal((await demoCheckout("admin", doubleClickOrder.orderNumber)).code, 403, "Admins cannot run demo checkout");
  });

  await t.test("Demo payment is rejected in production and outside development/test", async () => {
    const order = await Order.findOne({ orderNumber: doubleClickOrder.orderNumber });
    const previousMode = process.env.NODE_ENV;
    const previousFlag = process.env.PAYMENT_DEMO_CHECKOUT;
    try {
      process.env.NODE_ENV = "production";
      const refused = await demoCheckout("student2", order.orderNumber);
      assert.equal(refused.code, 403, "Production refuses demo payments");
      assert.equal(refused.data.code, "demo_checkout_disabled");
      // Even with the flag on, production never processes demo payments.
      process.env.PAYMENT_DEMO_CHECKOUT = "true";
      assert.equal((await demoCheckout("student2", order.orderNumber)).code, 403, "Production rejects demo payments regardless of flag values");
    } finally {
      process.env.NODE_ENV = previousMode;
      process.env.PAYMENT_DEMO_CHECKOUT = previousFlag;
    }
    assert.equal((await demoCheckout("student2", order.orderNumber)).code, 409, "The already paid order cannot be paid again");
  });
});

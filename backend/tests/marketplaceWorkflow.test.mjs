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

test("Marketplace cart, orders, payments, earnings and security", { timeout: 120000 }, async (t) => {
  const database = `educonnect_marketplace_test_${randomUUID().replaceAll("-", "")}`;
  const previousEnv = { ...process.env };
  process.env.NODE_ENV = "test";
  process.env.PAYMENT_DEMO_CHECKOUT = "true";
  process.env.PAYMENT_PROVIDER = "test-provider";
  process.env.PAYMENT_WEBHOOK_SECRET = "marketplace-test-webhook-secret-32-characters";
  process.env.PLATFORM_COMMISSION_RATE = "0.2";
  process.env.JWT_SECRET = "marketplace-integration-test-only-secret-32-chars";
  process.env.CLIENT_ORIGIN = "http://localhost:5173";
  await mongoose.connect("mongodb://127.0.0.1:27017", { dbName: database, serverSelectionTimeoutMS: 5000 });
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    for (const file of await ContentFile.find().lean()) {
      await unlink(fileURLToPath(new URL(`../uploads/content/${file.storageName}`, import.meta.url))).catch(() => {});
    }
    assert.equal(mongoose.connection.name, database);
    assert.ok(database.startsWith("educonnect_marketplace_test_"));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    process.env.NODE_ENV = previousEnv.NODE_ENV;
    process.env.PAYMENT_DEMO_CHECKOUT = previousEnv.PAYMENT_DEMO_CHECKOUT;
    process.env.PAYMENT_PROVIDER = previousEnv.PAYMENT_PROVIDER;
    process.env.PAYMENT_WEBHOOK_SECRET = previousEnv.PAYMENT_WEBHOOK_SECRET;
    process.env.PLATFORM_COMMISSION_RATE = previousEnv.PLATFORM_COMMISSION_RATE;
    process.env.JWT_SECRET = previousEnv.JWT_SECRET;
    process.env.CLIENT_ORIGIN = previousEnv.CLIENT_ORIGIN;
  });
  await Promise.all([Teacher, Student, Admin, Course, TeacherBook, ContentFile, ContentAccess, CartItem, Order, TeacherEarning].map((Model) => Model.init()));
  const { default: app } = await import("../src/app.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const password = "Test-password-12345";
  const accounts = {};
  for (const [name, Model, role] of [["owner", Teacher, "teacher"], ["other", Teacher, "teacher"], ["student", Student, "student"], ["student2", Student, "student"], ["admin", Admin, "admin"]]) {
    accounts[name] = await Model.create({ fullName: `Test ${name}`, email: `${name}@example.test`, password, role });
  }
  const cookies = {};
  const rawWebhook = async (payload, { sign = true, secret = process.env.PAYMENT_WEBHOOK_SECRET, contentType = "application/json" } = {}) => {
    const body = typeof payload === "string" ? payload : JSON.stringify(payload);
    const headers = { Origin: "http://localhost:5173", "Content-Type": contentType };
    if (sign) headers["X-Educonnect-Signature"] = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    const response = await fetch(`${base}/payments/webhook/test-provider`, { method: "POST", headers, body });
    const data = await response.json().catch(() => null);
    return { response, data, code: response.status };
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
    assert.equal(login.code, 200);
    cookies[name] = login.response.headers.get("set-cookie").split(";")[0];
  }
  const makeCourse = async (title, price, lessonCount = 2) => {
    const input = { title, description: `${title} description with enough content`,
      metadata: { category: "Development", price, learningOutcomes: ["Complete the course"] },
      lessons: Array.from({ length: lessonCount }, (_, index) => ({ id: `lesson-${index + 1}`, title: `Lesson ${index + 1}`, content: `Approved lesson ${index + 1} content`, order: index })) };
    let course = (await request("/content/courses", { actor: "owner", method: "POST", body: input })).data.item;
    course = (await request(`/content/courses/${course.id}/submit`, { actor: "owner", method: "POST", body: { revision: course.revision } })).data.item;
    course = (await request(`/content/courses/${course.id}/review`, { actor: "admin", method: "POST", body: { decision: "approve", revision: course.revision } })).data.item;
    return course;
  };
  const freeCourse = await makeCourse("Free workflow course", 0, 1);
  const paidCourse = await makeCourse("Paid workflow course", 500, 2);
  const draftCourse = (await request("/content/courses", { actor: "owner", method: "POST", body: { title: "Draft-only course", description: "Not yet approved", metadata: { category: "Development", price: 100 }, lessons: [{ id: "lesson-1", title: "Lesson 1", content: "Content", order: 0 }] } })).data.item;
  const book = await TeacherBook.create({
    teacherId: accounts.owner._id, title: "Seeded approved eBook", description: "Approved seeded book",
    status: "published", published: true, revision: 1,
    approvedVersion: { title: "Seeded approved eBook", description: "Approved seeded book", metadata: { price: 300, isFree: false, category: "eBook" } },
  });
  const bookId = String(book._id);

  await t.test("Cart persists in MongoDB, rejects unavailable content and keeps duplicate-free entries", async () => {
    const added = await request("/marketplace/cart", { actor: "student", method: "POST", body: { items: [
      { kind: "course", contentId: freeCourse.id },
      { kind: "course", contentId: paidCourse.id },
      { kind: "book", contentId: bookId },
    ] } });
    assert.equal(added.code, 201, JSON.stringify(added.data));
    assert.equal(added.data.items.length, 3);
    assert.equal(added.data.total, 800);
    const read = await request("/marketplace/cart", { actor: "student" });
    assert.deepEqual(read.data.items.map((item) => item.title).sort(), [freeCourse.title, paidCourse.title, "Seeded approved eBook"].sort());
    await request("/marketplace/cart", { actor: "student", method: "POST", body: { items: [{ kind: "course", contentId: freeCourse.id }] } });
    const afterDuplicate = await request("/marketplace/cart", { actor: "student" });
    assert.equal(afterDuplicate.data.items.length, 3, "Duplicate adds are idempotent");
    const rejected = await request("/marketplace/cart", { actor: "student", method: "POST", body: { items: [{ kind: "course", contentId: draftCourse.id }] } });
    assert.equal(rejected.code, 409, "Unpublished courses cannot be added to the cart");
    const bogus = await request("/marketplace/cart", { actor: "student", method: "POST", body: { items: [{ kind: "course", contentId: "not-a-valid-id" }] } });
    assert.equal(bogus.code, 400);
    const cartCount = await CartItem.countDocuments({ studentId: accounts.student._id });
    assert.equal(cartCount, 3, "Cart entries are stored in MongoDB");
  });

  let pendingOrder;
  await t.test("Checkout validates server-side prices and is idempotent under duplicate requests", async () => {
    const first = await request("/marketplace/orders/checkout", { actor: "student", method: "POST", body: { idempotencyKey: "checkout-test-key-0001" } });
    assert.equal(first.code, 201, JSON.stringify(first.data));
    pendingOrder = first.data.order;
    assert.equal(pendingOrder.status, "pending");
    assert.equal(pendingOrder.total, 800, "Total is calculated server-side from approved prices");
    const replaySameKey = await request("/marketplace/orders/checkout", { actor: "student", method: "POST", body: { idempotencyKey: "checkout-test-key-0001" } });
    assert.equal(replaySameKey.data.alreadyCreated, true);
    assert.equal(replaySameKey.data.order.orderNumber, pendingOrder.orderNumber);
    const replayFingerprint = await request("/marketplace/orders/checkout", { actor: "student", method: "POST", body: { idempotencyKey: "checkout-test-key-0002" } });
    assert.equal(replayFingerprint.data.alreadyCreated, true, "The same pending cart reuses its in-flight order");
    assert.equal(replayFingerprint.data.order.orderNumber, pendingOrder.orderNumber);
    assert.equal(await Order.countDocuments({ studentId: accounts.student._id }), 1, "No duplicate orders are created");
    assert.equal(await CartItem.countDocuments({ studentId: accounts.student._id }), 3, "Cart is kept until payment completes");
  });

  await t.test("Unpaid orders grant no access and fake payment success is rejected", async () => {
    const paidB = await ContentAccess.exists({ studentId: accounts.student._id, contentId: paidCourse._id });
    assert.equal(Boolean(paidB), false, "Pending orders must not grant access");
    assert.equal((await rawWebhook({ eventId: "evt-unsigned-1", type: "payment.succeeded", orderNumber: pendingOrder.orderNumber, transactionId: "txn-test-1", amount: 800, currency: "PKR" }, { sign: false })).code, 401);
    assert.equal((await rawWebhook({ eventId: "evt-badamount-1", type: "payment.succeeded", orderNumber: pendingOrder.orderNumber, transactionId: "txn-test-2", amount: 100, currency: "PKR" })).code, 400, "Amount must match the server-side order total");
    assert.equal((await rawWebhook({ eventId: "evt-badcurrency-1", type: "payment.succeeded", orderNumber: pendingOrder.orderNumber, transactionId: "txn-test-3", amount: 800, currency: "USD" })).code, 400, "Currency must match the server-side order currency");
    assert.equal(await ContentAccess.countDocuments({ studentId: accounts.student._id }), 0, "Rejected payments never grant entitlements");
    const order = await Order.findOne({ orderNumber: pendingOrder.orderNumber });
    assert.equal(order.status, "pending");
  });

  await t.test("Students can view and cancel only their own orders", async () => {
    const other = await request(`/marketplace/orders/${pendingOrder.orderNumber}`, { actor: "student2" });
    assert.equal(other.code, 404, "Orders of another student are invisible");
    const cancelOther = await request(`/marketplace/orders/${pendingOrder.orderNumber}/cancel`, { actor: "student2", method: "POST" });
    assert.ok([403, 404, 409].includes(cancelOther.code), "Another student cannot cancel this order");
    const ownOrders = await request("/marketplace/orders", { actor: "student2" });
    assert.ok(ownOrders.data.orders.every((order) => order.orderNumber !== pendingOrder.orderNumber), "Own order list never leaks another student's orders");
  });

  await t.test("Verified provider webhook fulfills the order and replayed events are idempotent", async () => {
    const payload = { eventId: "evt-success-1", type: "payment.succeeded", orderNumber: pendingOrder.orderNumber, transactionId: "txn-test-success-1", amount: 800, currency: "PKR" };
    const processed = await rawWebhook(payload);
    assert.equal(processed.code, 200, JSON.stringify(processed.data));
    assert.equal(processed.data.result, "processed");
    assert.equal(await ContentAccess.countDocuments({ studentId: accounts.student._id }), 3, "Paid course, free course and eBook are granted");
    assert.equal(await CartItem.countDocuments({ studentId: accounts.student._id }), 0, "Purchased items are removed from the cart");
    const order = await Order.findOne({ orderNumber: pendingOrder.orderNumber });
    assert.equal(order.status, "paid");
    const earnings = await TeacherEarning.find({ order: order._id }).lean();
    assert.equal(earnings.length, 2, "One earnings record per paid item");
    const paidCourseEarning = earnings.find((entry) => String(entry.contentId) === paidCourse._id);
    assert.equal(paidCourseEarning.grossAmount, 500);
    assert.equal(paidCourseEarning.commissionAmount, 100, "Platform commission is 20% of gross");
    assert.equal(paidCourseEarning.teacherAmount, 400);
    const replay = await rawWebhook(payload);
    assert.equal(replay.code, 200);
    assert.equal(replay.data.alreadyProcessed, true, "Replayed events are handled without double-fulfillment");
    assert.equal(await TeacherEarning.countDocuments({ order: order._id }), 2);
    assert.equal(await ContentAccess.countDocuments({ studentId: accounts.student._id }), 3);
  });

  await t.test("Failed payments never grant entitlements", async () => {
    await request("/marketplace/cart", { actor: "student2", method: "POST", body: { items: [{ kind: "course", contentId: paidCourse.id }] } });
    const created = await request("/marketplace/orders/checkout", { actor: "student2", method: "POST", body: { idempotencyKey: "checkout-test-key-s2-0001" } });
    assert.equal(created.code, 201);
    const orderNumber = created.data.order.orderNumber;
    const failed = await rawWebhook({ eventId: "evt-failed-s2-1", type: "payment.failed", orderNumber, transactionId: "txn-test-failed-1", amount: 500, currency: "PKR" });
    assert.equal(failed.code, 200);
    const order = await Order.findOne({ orderNumber });
    assert.equal(order.status, "failed");
    assert.equal(await ContentAccess.countDocuments({ studentId: accounts.student2._id }), 0, "Failed payment grants no access");
  });

  await t.test("Free orders fulfill immediately at checkout", async () => {
    await request("/marketplace/cart", { actor: "student2", method: "DELETE" });
    await request("/marketplace/cart", { actor: "student2", method: "POST", body: { items: [{ kind: "course", contentId: freeCourse.id }] } });
    const created = await request("/marketplace/orders/checkout", { actor: "student2", method: "POST", body: { idempotencyKey: "checkout-test-key-s2-free" } });
    assert.equal(created.code, 201);
    assert.equal(created.data.order.status, "paid", "Zero-total orders are fulfilled immediately and server-side");
    assert.equal(await ContentAccess.countDocuments({ studentId: accounts.student2._id, contentId: freeCourse._id }), 1);
  });

  await t.test("Pending orders cannot be paid twice and cancellation is final", async () => {
    await request("/marketplace/cart", { actor: "student2", method: "DELETE" });
    await request("/marketplace/cart", { actor: "student2", method: "POST", body: { items: [{ kind: "course", contentId: paidCourse.id }] } });
    const created = await request("/marketplace/orders/checkout", { actor: "student2", method: "POST", body: { idempotencyKey: "checkout-test-key-s2-0002" } });
    const orderNumber = created.data.order.orderNumber;
    const cancel = await request(`/marketplace/orders/${orderNumber}/cancel`, { actor: "student2", method: "POST" });
    assert.equal(cancel.code, 200);
    assert.equal(cancel.data.order.status, "cancelled");
    assert.equal((await request(`/marketplace/orders/${orderNumber}/cancel`, { actor: "student2", method: "POST" })).code, 409);
    assert.equal((await request(`/marketplace/payments/demo-checkout/${orderNumber}`, { actor: "student2", method: "POST", body: {} })).code, 409, "Cancelled orders can never be paid");
  });

  await t.test("Teacher earnings derive from verified orders and are private to the teacher", async () => {
    const earnings = await request("/marketplace/earnings", { actor: "owner" });
    assert.equal(earnings.code, 200, JSON.stringify(earnings.data));
    assert.equal(earnings.data.summary.grossSales, 800);
    assert.equal(earnings.data.summary.commission, 160);
    assert.equal(earnings.data.summary.netEarnings, 640);
    assert.equal(earnings.data.summary.salesCount, 2);
    assert.equal(earnings.data.enrolledStudents, 2, "Free enrollments and paid purchases appear in enrollment counts");
    assert.ok(Array.isArray(earnings.data.byCourse));
    assert.equal((await request("/marketplace/earnings", { actor: "student" })).code, 403, "Students cannot read teacher earnings");
    assert.equal((await request("/marketplace/finance/overview", { actor: "other" })).code, 403, "Teachers cannot read platform finance");
    assert.equal((await request("/marketplace/finance/overview", { actor: "student" })).code, 403);
    const overview = await request("/marketplace/finance/overview", { actor: "admin" });
    assert.equal(overview.code, 200);
    assert.equal(overview.data.summary.grossSales, 800);
    assert.equal(overview.data.summary.paidSales, 2);
    assert.ok(overview.data.records.length >= 3);
  });

  await t.test("Refunds revoke paid entitlements and reverse earnings exactly once", async () => {
    await request("/marketplace/cart", { actor: "student2", method: "DELETE" });
    await request("/marketplace/cart", { actor: "student2", method: "POST", body: { items: [{ kind: "book", contentId: bookId }] } });
    const created = await request("/marketplace/orders/checkout", { actor: "student2", method: "POST", body: { idempotencyKey: "checkout-test-key-s2-book" } });
    const orderNumber = created.data.order.orderNumber;
    const paid = await request(`/marketplace/payments/demo-checkout/${orderNumber}`, { actor: "student2", method: "POST", body: {} });
    assert.equal(paid.code, 200, JSON.stringify(paid.data));
    assert.equal(await ContentAccess.countDocuments({ studentId: accounts.student2._id, contentId: bookId, source: "payment" }), 1);
    const refunded = await rawWebhook({ eventId: "evt-refund-1", type: "payment.refunded", orderNumber, transactionId: "refund-test-1", amount: 300, currency: "PKR" });
    assert.equal(refunded.code, 200);
    assert.equal(await ContentAccess.countDocuments({ studentId: accounts.student2._id, contentId: bookId, source: "payment" }), 0, "Paid entitlement is revoked after a provider-confirmed refund");
    const earning = await TeacherEarning.findOne({ orderNumber });
    assert.equal(earning.status, "refunded");
    const replay = await rawWebhook({ eventId: "evt-refund-1", type: "payment.refunded", orderNumber, transactionId: "refund-test-1", amount: 300, currency: "PKR" });
    assert.equal(replay.data.alreadyProcessed, true, "Refund replay is idempotent");
    const overview = await request("/marketplace/finance/overview", { actor: "admin" });
    // The refunded sale was a demo sale: real payout totals exclude it.
    assert.equal(Number(overview.data.summary.refundedSales), 0, "Demo refunds are excluded from real payout totals");
    assert.equal(Number(overview.data.summary.refundedGross), 0);
  });
});

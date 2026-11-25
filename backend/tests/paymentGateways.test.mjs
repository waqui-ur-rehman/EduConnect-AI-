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
import { signatureOverFields } from "../src/services/payments/shared.js";

test("Payment gateway sandbox flows, security and idempotency", { timeout: 180000 }, async (t) => {
  const database = `educonnect_gateways_test_${randomUUID().replaceAll("-", "")}`;
  const previousEnv = { ...process.env };
  process.env.NODE_ENV = "test";
  process.env.PAYMENT_MODE = "sandbox";
  process.env.PAYMENTS_LIVE_ENABLED = "false";
  process.env.PAYMENT_DEMO_CHECKOUT = "false";
  process.env.PAYMENT_WEBHOOK_SECRET = "gateway-test-webhook-secret-32-characters-minimum";
  process.env.JAZZCASH_MERCHANT_ID = "test-jazzcash-merchant";
  process.env.JAZZCASH_PASSWORD = "test-jazzcash-password";
  process.env.JAZZCASH_INTEGRITY_SALT = "test-jazzcash-integrity-salt-0123456789";
  process.env.EASYPAISA_STORE_ID = "test-easypaisa-store";
  process.env.EASYPAISA_MERCHANT_CREDENTIALS = "test-easypaisa-credentials-0123456789";
  process.env.SAFEPAY_API_KEY = "test-safepay-key";
  process.env.SAFEPAY_API_SECRET = "test-safepay-secret";
  process.env.SAFEPAY_WEBHOOK_SECRET = "test-safepay-webhook-secret-0123456789";
  process.env.SAFEPAY_CHECKOUT_URL = "http://127.0.0.1:1/unreachable-safepay-checkout";
  process.env.PLATFORM_COMMISSION_RATE = "0.2";
  process.env.JWT_SECRET = "gateway-integration-test-only-secret-32-chars";
  process.env.CLIENT_ORIGIN = "http://localhost:5173";
  process.env.FRONTEND_PUBLIC_URL = "http://localhost:5173";
  process.env.BACKEND_PUBLIC_URL = "http://localhost:5000";
  delete process.env.JAZZCASH_QUERY_URL;
  await mongoose.connect("mongodb://127.0.0.1:27017", { dbName: database, serverSelectionTimeoutMS: 5000 });
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    for (const file of await ContentFile.find().lean()) {
      await unlink(fileURLToPath(new URL(`../uploads/content/${file.storageName}`, import.meta.url))).catch(() => {});
    }
    assert.equal(mongoose.connection.name, database);
    assert.ok(database.startsWith("educonnect_gateways_test_"));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env, previousEnv);
  });
  await Promise.all([Teacher, Student, Admin, Course, TeacherBook, ContentFile, ContentAccess, CartItem, Order, TeacherEarning].map((Model) => Model.init()));
  const { default: app } = await import("../src/app.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const password = "Gateway-test-password-123";
  const accounts = {};
  for (const [name, Model, role] of [["owner", Teacher, "teacher"], ["student", Student, "student"], ["student2", Student, "student"], ["student3", Student, "student"], ["admin", Admin, "admin"]]) {
    accounts[name] = await Model.create({ fullName: `Test ${name}`, email: `${name}@gateways.test`, password, role });
  }
  const cookies = {};
  const request = async (path, { actor, method = "GET", body, raw, headers = {} } = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        Origin: "http://localhost:5173",
        ...(raw ? {} : { "X-Requested-With": "XMLHttpRequest" }),
        ...(actor ? { Cookie: cookies[actor] } : {}),
        ...(body && !raw ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: raw ? raw : body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    const data = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
    return { response, data, code: response.status };
  };
  for (const name of Object.keys(accounts)) {
    const login = await request("/auth/login", { method: "POST", body: { email: accounts[name].email, password } });
    assert.equal(login.code, 200);
    cookies[name] = login.response.headers.get("set-cookie").split(";")[0];
  }
  const makeCourse = async (title, price) => {
    const input = { title, description: `${title} description with enough content`,
      metadata: { category: "Development", price, learningOutcomes: ["Complete the course"] },
      lessons: [{ id: "lesson-1", title: "Lesson 1", content: `Approved lesson content for ${title}`, order: 0 }] };
    let course = (await request("/content/courses", { actor: "owner", method: "POST", body: input })).data.item;
    course = (await request(`/content/courses/${course.id}/submit`, { actor: "owner", method: "POST", body: { revision: course.revision } })).data.item;
    course = (await request(`/content/courses/${course.id}/review`, { actor: "admin", method: "POST", body: { decision: "approve", revision: course.revision } })).data.item;
    return course;
  };
  const paidCourse = await makeCourse("Gateway paid course", 500);
  const book = await TeacherBook.create({
    teacherId: accounts.owner._id, title: "Gateway eBook", description: "Approved gateway book",
    status: "published", published: true, revision: 1,
    approvedVersion: { title: "Gateway eBook", description: "Approved gateway book", metadata: { price: 300, isFree: false, category: "eBook" } },
  });
  const bookId = String(book._id);
  const seedCart = async (actor) => {
    await request("/marketplace/cart", { actor, method: "DELETE" });
    const added = await request("/marketplace/cart", { actor, method: "POST", body: { items: [{ kind: "course", contentId: paidCourse.id }, { kind: "book", contentId: bookId }] } });
    assert.equal(added.code, 201, JSON.stringify(added.data));
  };
  const signTestCallback = (payload) => {
    const canonical = Object.keys(payload).sort().map((key) => `${key}=${payload[key]}`).join("&");
    return createHmac("sha256", process.env.PAYMENT_WEBHOOK_SECRET).update(canonical).digest("hex");
  };
  const testCallback = async (payload, { sign = true } = {}) => {
    const body = { ...payload };
    if (sign) body.signature = signTestCallback(payload);
    const response = await fetch(`${base}/payments/test-provider/callback`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    return { code: response.status, data };
  };
  const safepayWebhook = async (event, { secret = process.env.SAFEPAY_WEBHOOK_SECRET } = {}) => {
    const raw = JSON.stringify(event);
    const signature = createHmac("sha256", secret).update(raw).digest("hex");
    const response = await fetch(`${base}/payments/safepay/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-safepay-signature": signature, Origin: "http://localhost:5173" }, body: raw });
    const data = await response.json().catch(() => null);
    return { code: response.status, data };
  };
  const jazzcashCallback = async (fields, salt = process.env.JAZZCASH_INTEGRITY_SALT) => {
    const withHash = { ...fields };
    delete withHash.pp_SecureHash;
    withHash.pp_SecureHash = signatureOverFields(withHash, salt, { exclude: ["pp_SecureHash"] });
    const response = await fetch(`${base}/payments/jazzcash/callback`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", Origin: "http://localhost:5173" }, body: new URLSearchParams(withHash).toString() });
    const data = await response.json().catch(() => null);
    return { code: response.status, data };
  };
  const checkout = async (actor, provider, key) => request("/payments/checkout", { actor, method: "POST", body: { provider, idempotencyKey: key } });
  const status = async (actor, orderNumber) => request(`/payments/orders/${orderNumber}/status`, { actor });

  await t.test("Providers are listed sandbox-ready without leaking credentials", async () => {
    const listed = await request("/payments/providers", { actor: "student" });
    assert.equal(listed.code, 200);
    assert.equal(listed.data.mode, "sandbox");
    assert.equal(listed.data.liveEnabled, false);
    const serialized = JSON.stringify(listed.data);
    for (const leaked of ["test-jazzcash-integrity-salt", "test-safepay-secret", "test-easypaisa-credentials"]) assert.equal(serialized.includes(leaked), false, "No secrets exposed");
    const byName = Object.fromEntries(listed.data.providers.map((entry) => [entry.name, entry]));
    assert.equal(byName.jazzcash.enabled, true);
    assert.equal(byName.easypaisa.enabled, true);
    assert.equal(byName.safepay.enabled, true); // sandbox endpoint configured to a dead URL for rejection testing
    assert.equal((await request("/payments/providers")).code, 401);
  });

  await t.test("Double-clicking Pay Now creates a single order per idempotency key", async () => {
    await seedCart("student");
    const [first, second] = await Promise.all([checkout("student", "test-provider", "gateway-double-click-0001"), checkout("student", "test-provider", "gateway-double-click-0001")]);
    assert.ok([200, 201].includes(first.code));
    assert.ok([200, 201].includes(second.code));
    assert.equal(first.data.orderNumber, second.data.orderNumber);
    const count = await Order.countDocuments({ studentId: accounts.student._id, idempotencyKey: "gateway-double-click-0001" });
    assert.equal(count, 1, "Concurrent checkout calls reuse one pending order");
  });

  await t.test("Browser refresh before callback returns the real pending order status", async () => {
    const listed = await request("/marketplace/orders", { actor: "student" });
    const pending = listed.data.orders.find((order) => order.status === "pending");
    assert.ok(pending, "Pending order is visible after refresh");
    const detail = await status("student", pending.orderNumber);
    assert.equal(detail.code, 200);
    assert.equal(detail.data.status, "pending");
    assert.equal(detail.data.amountMinor, 80000);
    assert.equal(detail.data.environment, "sandbox");
  });

  let orderNumber;
  await t.test("Successful provider callback fulfills the order exactly once", async () => {
    const listed = await request("/marketplace/orders", { actor: "student" });
    orderNumber = listed.data.orders.find((order) => order.status === "pending").orderNumber;
    const payload = { eventId: "evt-gw-success-1", type: "payment.succeeded", orderNumber, transactionId: "txn-gw-success-1", amountMinor: 80000, currency: "PKR" };
    const paid = await testCallback(payload);
    assert.equal(paid.code, 200, JSON.stringify(paid.data));
    assert.equal(await ContentAccess.countDocuments({ studentId: accounts.student._id }), 2);
    const order = await Order.findOne({ orderNumber });
    assert.equal(order.status, "paid");
    assert.equal(order.amountMinor, 80000);
    assert.ok(order.verification?.verifiedAt instanceof Date, "Verification details recorded");
    const earningCount = await TeacherEarning.countDocuments({ order: order._id });
    assert.equal(earningCount, 2);
    const replay = await testCallback(payload);
    assert.equal(replay.code, 200);
    assert.equal(replay.data.alreadyProcessed, true);
    assert.equal(await TeacherEarning.countDocuments({ order: order._id }), 2, "Replay never duplicates earnings");
    assert.equal(await ContentAccess.countDocuments({ studentId: accounts.student._id }), 2);
  });

  await t.test("Replayed webhook events are idempotent on the safepay path too", async () => {
    const event = { id: "evt-safepay-1", type: "payment.succeeded", data: { status: "succeeded", orderNumber, transactionId: "txn-sfpy-1", amountMinor: 80000, currency: "PKR" } };
    const first = await safepayWebhook(event);
    assert.equal(first.code, 200);
    assert.equal(first.data.alreadyProcessed, true, "Order is already paid; the event is acknowledged as a no-op");
    const second = await safepayWebhook(event);
    assert.equal(second.code, 200);
    assert.equal(second.data.alreadyProcessed, true);
    assert.equal(await TeacherEarning.countDocuments({ orderNumber }), 2);
  });

  await t.test("Invalid and missing signatures are rejected", async () => {
    const listed = await request("/marketplace/orders", { actor: "student2" });
    assert.equal(listed.data.orders.length, 0);
    const unsigned = await testCallback({ eventId: "evt-gw-x1", type: "payment.succeeded", orderNumber: "ORD-DOESNOTEXIST99", transactionId: "txn-x", amountMinor: 80000, currency: "PKR" }, { sign: false });
    assert.equal(unsigned.code, 401);
    const wrongEvent = { id: "evt-sfpy-badsig", type: "payment.succeeded", data: { status: "succeeded", orderNumber: "ORD-DOESNOTEXIST99", transactionId: "txn-sfpy-bad", amountMinor: 80000, currency: "PKR" } };
    const bad = await safepayWebhook(wrongEvent, { secret: "wrong-secret-wrong-secret-wrong-secret" });
    assert.equal(bad.code, 401);
    const badJazz = await jazzcashCallback({ pp_TxnRefNo: "ORD-DOESNOTEXIST99", pp_ResponseCode: "000", pp_Amount: "80000" }, "wrong-salt-wrong-salt-wrong-salt-wrong");
    assert.equal(badJazz.code, 401);
  });

  await t.test("Tampered amount and wrong order reference never fulfill", async () => {
    await seedCart("student2");
    const created = await checkout("student2", "test-provider", "gateway-tamper-0001");
    assert.equal(created.code, 201, JSON.stringify(created.data));
    orderNumber = created.data.orderNumber;
    const tampered = { eventId: "evt-gw-tamper-1", type: "payment.succeeded", orderNumber, transactionId: "txn-gw-tamper-1", amountMinor: 100, currency: "PKR" };
    const rejected = await testCallback(tampered);
    assert.equal(rejected.code, 400, "Amount must match the server-side order total");
    assert.equal(await ContentAccess.countDocuments({ studentId: accounts.student2._id }), 0);
    const unknown = await testCallback({ eventId: "evt-gw-unknown-1", type: "payment.succeeded", orderNumber: "ORD-UNKNOWN99AB", transactionId: "txn-gw-unknown-1", amountMinor: 80000, currency: "PKR" });
    assert.equal(unknown.code, 400, "Wrong order reference is rejected");
    const foreign = await status("student3", orderNumber);
    assert.equal(foreign.code, 404, "Another student cannot read this order's status");
  });

  await t.test("JazzCash form callback with valid signature fulfills; tampered amount rejected", async () => {
    await seedCart("student3");
    const created = await checkout("student3", "jazzcash", "gateway-jazzcash-0001");
    assert.equal(created.code, 201, JSON.stringify(created.data));
    assert.equal(created.data.mode, "form");
    assert.ok(created.data.url.includes("jazzcash"));
    assert.ok(created.data.fields.pp_SecureHash, "Signed hosted-form fields returned");
    const jcOrder = created.data.orderNumber;
    const good = await jazzcashCallback({ pp_TxnRefNo: jcOrder, pp_ResponseCode: "000", pp_Amount: "80000", pp_RetreivalReferenceNo: "RET-JC-1" });
    assert.equal(good.code, 200, JSON.stringify(good.data));
    assert.equal(await ContentAccess.countDocuments({ studentId: accounts.student3._id }), 2);
    // Replay the exact same callback: idempotent.
    const replay = await jazzcashCallback({ pp_TxnRefNo: jcOrder, pp_ResponseCode: "000", pp_Amount: "80000", pp_RetreivalReferenceNo: "RET-JC-1" });
    assert.ok([200, 409].includes(replay.code));
    const jcOrderDoc = await Order.findOne({ orderNumber: jcOrder });
    assert.equal(jcOrderDoc.status, "paid");
  });

  await t.test("Failed, cancelled and pending payments never grant access", async () => {
    await seedCart("student2");
    const a = await checkout("student2", "test-provider", "gateway-fail-0001");
    const failed = await testCallback({ eventId: "evt-gw-fail-1", type: "payment.failed", orderNumber: a.data.orderNumber, transactionId: "txn-gw-fail-1", amountMinor: 80000, currency: "PKR" });
    assert.equal(failed.code, 200);
    assert.equal((await Order.findOne({ orderNumber: a.data.orderNumber })).status, "failed");
    const b = await checkout("student2", "test-provider", "gateway-cancel-0001");
    const cancelled = await testCallback({ eventId: "evt-gw-cancel-1", type: "payment.cancelled", orderNumber: b.data.orderNumber, transactionId: "txn-gw-cancel-1", amountMinor: 80000, currency: "PKR" });
    assert.equal(cancelled.code, 200);
    assert.equal((await Order.findOne({ orderNumber: b.data.orderNumber })).status, "cancelled");
    const c = await checkout("student2", "test-provider", "gateway-pending-0001");
    const pendingEvent = await testCallback({ eventId: "evt-gw-pending-1", type: "payment.unknown", orderNumber: c.data.orderNumber, transactionId: "txn-gw-pending-1", amountMinor: 80000, currency: "PKR" });
    assert.equal(pendingEvent.code, 200);
    assert.equal((await Order.findOne({ orderNumber: c.data.orderNumber })).status, "pending");
    assert.equal(await ContentAccess.countDocuments({ studentId: accounts.student2._id }), 0, "No access from non-paid states");
    // Browser refresh while pending shows the order still pending (not paid).
    const refreshed = await status("student2", c.data.orderNumber);
    assert.equal(refreshed.data.status, "pending");
  });

  await t.test("Provider outage keeps the order pending and never marks it paid", async () => {
    await seedCart("student2");
    const outage = await checkout("student2", "safepay", "gateway-outage-0001");
    assert.equal(outage.code, 504, JSON.stringify(outage.data));
    assert.equal(outage.data.code, "provider_unavailable");
    const orders = await Order.find({ studentId: accounts.student2._id, status: "pending" }).select("orderNumber provider").lean();
    assert.ok(orders.length >= 1, "Order remains pending after provider failure");
    assert.equal(await ContentAccess.countDocuments({ studentId: accounts.student2._id }), 0);
  });

  await t.test("Unknown provider fails closed with a clear error", async () => {
    const unknown = await checkout("student2", "not-a-provider", "gateway-unknown-0001");
    assert.equal(unknown.code, 503);
    assert.equal(unknown.data.code, "provider_unconfigured");
  });

  await t.test("Free carts are refused by the gateway path", async () => {
    await request("/marketplace/cart", { actor: "student3", method: "DELETE" });
    const freeCourse = await makeCourse("Gateway free course", 0);
    await request("/marketplace/cart", { actor: "student3", method: "POST", body: { items: [{ kind: "course", contentId: freeCourse.id }] } });
    const attempt = await checkout("student3", "test-provider", "gateway-free-0001");
    assert.equal(attempt.code, 400);
    assert.equal(attempt.data.code, "free_cart");
  });

  await t.test("Refund webhook reverses exactly one settlement and revokes paid access", async () => {
    // student3 already paid via JazzCash above.
    const paidOrder = await Order.findOne({ studentId: accounts.student3._id, status: "paid", provider: "jazzcash" });
    assert.ok(paidOrder, "JazzCash order is paid before refund");
    const before = await TeacherEarning.countDocuments({ order: paidOrder._id, status: "earned" });
    assert.equal(before, 2);
    const event = { id: "evt-sfpy-refund-1", type: "payment.refunded", data: { status: "refunded", orderNumber: paidOrder.orderNumber, transactionId: "txn-sfpy-refund-1", amountMinor: Number(paidOrder.amountMinor), currency: "PKR" } };
    const refunded = await safepayWebhook(event);
    assert.equal(refunded.code, 200, JSON.stringify(refunded.data));
    const after = await Order.findOne({ _id: paidOrder._id });
    assert.equal(after.status, "refunded");
    assert.equal(await TeacherEarning.countDocuments({ order: paidOrder._id, status: "refunded" }), 2);
    assert.equal(await TeacherEarning.countDocuments({ order: paidOrder._id, status: "earned" }), 0);
    assert.equal(await ContentAccess.countDocuments({ studentId: accounts.student3._id, source: "payment" }), 0, "Paid entitlements revoked");
    const replay = await safepayWebhook(event);
    assert.equal(replay.code, 200);
    assert.equal(replay.data.alreadyProcessed, true);
  });

  await t.test("Already-paid order double-fulfillment is a no-op", async () => {
    const paidOrder = await Order.findOne({ studentId: accounts.student._id, status: "paid" });
    assert.ok(paidOrder);
    const refill = await testCallback({ eventId: "evt-gw-late-dup-1", type: "payment.succeeded", orderNumber: paidOrder.orderNumber, transactionId: paidOrder.providerTransactionId || "txn-gw-success-1", amountMinor: 80000, currency: "PKR" });
    assert.equal(refill.code, 200);
    assert.equal(refill.data.alreadyProcessed, true);
    assert.equal(await TeacherEarning.countDocuments({ order: paidOrder._id }), 2);
  });
});

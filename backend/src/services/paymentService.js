import crypto from "node:crypto";
import Order from "../models/Order.js";
import { paymentMode } from "./payments/providerConfig.js";
import ContentAccess from "../models/ContentAccess.js";
import TeacherEarning from "../models/TeacherEarning.js";
import { models } from "./contentService.js";
import CartItem from "../models/CartItem.js";

// Payment provider abstraction. A real provider (Stripe, JazzCash, Easypaisa...)
// is intentionally NOT wired in: connect it here, set PAYMENT_PROVIDER and
// PAYMENT_WEBHOOK_SECRET, and implement verifyWebhookSignature per the provider docs.
// Until then, real payments are pending and no live charge can be initiated.
export const MARKETPLACE_CURRENCY = () => String(process.env.MARKETPLACE_CURRENCY || "PKR").trim().toUpperCase().slice(0, 8) || "PKR";

export const COMMISSION_RATE = () => {
  const rate = Number(process.env.PLATFORM_COMMISSION_RATE ?? 0.2);
  return Number.isFinite(rate) && rate >= 0 && rate <= 0.9 ? rate : 0.2;
};

// Sandbox payment/checkout lives only in development or test environments and
// never in production: the flag alone can never enable it there.
export const demoCheckoutAllowed = () =>
  ["development", "test"].includes(process.env.NODE_ENV) &&
  String(process.env.PAYMENT_DEMO_CHECKOUT || "").trim().toLowerCase() === "true";

export const providerName = () => String(process.env.PAYMENT_PROVIDER || "none").trim().toLowerCase();

export const paymentConfigured = () => Boolean(process.env.PAYMENT_WEBHOOK_SECRET && process.env.PAYMENT_PROVIDER);

export const paymentStatusSummary = () => ({
  provider: providerName(),
  configured: paymentConfigured(),
  demoEnabled: demoCheckoutAllowed(),
  currency: MARKETPLACE_CURRENCY(),
  commissionRate: COMMISSION_RATE(),
});

// HMAC-SHA256 signature verification for provider callbacks. The webhook route
// receives the raw request body; the provider must sign it with the shared secret.
export function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return null; // Not configured: never treat as verified.
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = String(signatureHeader || "").replace(/^sha256=/i, "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(provided)) return false;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(provided, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const visible = { published: true, approvedVersion: { $ne: null }, status: { $ne: "deleted" } };

export function priceOf(item) {
  const meta = item?.approvedVersion?.metadata || {};
  if (meta.isFree === true) return 0;
  const price = Number(meta.price);
  return Number.isFinite(price) && price > 0 ? Math.min(price, 10000000) : 0;
}

export async function buildOrderItems(cartItems) {
  const unavailable = [];
  const items = [];
  for (const item of cartItems) {
    const doc = await models[item.kind].findOne({ _id: item.contentId, ...visible });
    if (!doc) { unavailable.push(String(item.contentId)); continue; }
    const price = priceOf(doc);
    items.push({
      kind: item.kind,
      contentId: doc._id,
      title: doc.approvedVersion?.title || doc.title || "Untitled",
      teacherId: doc.teacherId,
      price,
      currency: MARKETPLACE_CURRENCY(),
    });
  }
  if (unavailable.length) {
    const error = new Error("Some selected items are no longer approved or published.");
    error.status = 409;
    error.unavailable = unavailable;
    throw error;
  }
  return items;
}

const round2 = (value) => Math.round(value * 100) / 100;

export async function uniqueOrderNumber() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `ORD-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const exists = await Order.exists({ orderNumber: candidate });
    if (!exists) return candidate;
  }
  throw new Error("Could not allocate an order number.");
}

export const cartFingerprint = (items, total, currency) => crypto.createHash("sha256")
  .update(JSON.stringify({ items: items.map((item) => [item.kind, String(item.contentId), item.price]).sort(), total, currency }))
  .digest("hex");

export const toMinorUnits = (amount) => Math.round(Number(amount || 0) * 100);
export const fromMinorUnits = (minor) => Math.round(Number(minor || 0)) / 100;

// Shared by the plain checkout endpoint and the provider gateway so both create
// identical, idempotent pending orders from the server-validated cart.
export async function createPendingOrderForCart(studentId, idempotencyKey) {
  if (idempotencyKey) {
    const existing = await Order.findOne({ studentId, idempotencyKey }).lean();
    if (existing) return { order: existing, alreadyCreated: true };
  }
  const cartItems = await CartItem.find({ studentId }).lean();
  if (!cartItems.length) {
    const error = new Error("Your cart is empty.");
    error.status = 400;
    throw error;
  }
  const items = await buildOrderItems(cartItems);
  const currency = MARKETPLACE_CURRENCY();
  const total = items.reduce((sum, item) => sum + item.price, 0);
  const fingerprint = cartFingerprint(items, total, currency);
  const orderNumber = await uniqueOrderNumber();
  const environment = paymentMode() === "live" ? "live" : "sandbox";
  try {
    const order = await Order.create({
      studentId, orderNumber, items, total, currency,
      amountMinor: toMinorUnits(total), environment,
      status: "pending", fingerprint, ...(idempotencyKey ? { idempotencyKey } : {}),
    });
    return { order: order.toObject(), alreadyCreated: false };
  } catch (error) {
    if (error.code !== 11000) throw error;
    let existing = idempotencyKey ? await Order.findOne({ studentId, idempotencyKey }).lean() : null;
    if (!existing) existing = await Order.findOne({ studentId, fingerprint, status: { $in: ["pending", "initiated"] } }).lean();
    if (!existing) throw error;
    return { order: existing, alreadyCreated: true };
  }
}

// Fulfills a paid order idempotently: grants entitlements and records earnings.
// Safe to retry after a partial failure. Never grants access to failed/cancelled orders.
// `verification` records how the paid state was confirmed (provider signature, status poll...).
export async function fulfillOrder(order, verification = {}) {
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, status: { $in: ["pending", "initiated"] } },
    { $set: {
      status: "paid", paidAt: new Date(),
      ...(verification.method ? { verification: { verifiedAt: new Date(), method: String(verification.method).slice(0, 40), detail: String(verification.detail || "").slice(0, 200) } } : {}),
    } },
    { returnDocument: "after" },
  );
  if (!claimed) {
    const current = await Order.findById(order._id).lean();
    if (current?.status === "paid") return { order: current, fulfilled: false, alreadyPaid: true };
    return { order: current, fulfilled: false };
  }
  for (const item of claimed.items) {
    await ContentAccess.updateOne(
      { studentId: claimed.studentId, kind: item.kind, contentId: item.contentId },
      { $setOnInsert: { studentId: claimed.studentId, kind: item.kind, contentId: item.contentId, source: item.price > 0 ? "payment" : "free", price: item.price } },
      { upsert: true },
    ).catch((error) => { if (error.code !== 11000) throw error; });
    if (item.price <= 0) continue;
    const commission = round2(item.price * COMMISSION_RATE());
    await TeacherEarning.updateOne(
      { order: claimed._id, contentId: item.contentId },
      { $setOnInsert: {
          order: claimed._id, orderNumber: claimed.orderNumber, studentId: claimed.studentId,
          contentId: item.contentId, kind: item.kind, title: item.title, teacherId: item.teacherId,
          grossAmount: item.price, commissionAmount: commission, teacherAmount: round2(item.price - commission),
          currency: item.currency, status: "earned",
          source: claimed.provider === "demo" ? "demo" : "payment" } },
      { upsert: true },
    ).catch((error) => { if (error.code !== 11000) throw error; });
  }
  await CartItem.deleteMany({ studentId: claimed.studentId, contentId: { $in: claimed.items.map((item) => item.contentId) } });
  return { order: claimed, fulfilled: true };
}

// Refund policy: only provider-confirmed refunds revoke access and reverse earnings,
// one record per item, never double-counted. Free entitlements are kept.
export async function refundOrder(order, refundReference = "") {
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, status: "paid" },
    { $set: { status: "refunded", refundedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!claimed) return { order: await Order.findById(order._id).lean(), refunded: false };
  for (const item of claimed.items) {
    if (item.price <= 0) continue;
    await ContentAccess.deleteOne({ studentId: claimed.studentId, kind: item.kind, contentId: item.contentId, source: "payment" });
    await TeacherEarning.updateMany(
      { order: claimed._id, contentId: item.contentId, status: "earned" },
      { $set: { status: "refunded", refundedAt: new Date(), refundReference: String(refundReference || "").slice(0, 200) } },
    );
  }
  return { order: claimed, refunded: true };
}

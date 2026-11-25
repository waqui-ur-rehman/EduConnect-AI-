import { z } from "zod";
import Order from "../models/Order.js";
import PaymentEvent from "../models/PaymentEvent.js";
import CartItem from "../models/CartItem.js";
import { getAdapter, providerStatusSummary, paymentMode } from "../services/payments/index.js";
import { sanitizeForLog, isValidReturnUrl, ProviderError } from "../services/payments/shared.js";
import {
  buildOrderItems,
  createPendingOrderForCart,
  demoCheckoutAllowed,
  fulfillOrder,
  refundOrder,
} from "../services/paymentService.js";

const fail = (res, code, message, extra = {}) => res.status(code).json({ success: false, message, ...extra });
const handle = (action) => async (req, res, next) => {
  try { await action(req, res); } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, message: "Invalid fields or values.", issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })) });
    if (error instanceof ProviderError || error.status) return res.status(error.status || 502).json({ success: false, message: error.message, ...(error.code ? { code: error.code } : {}) });
    next(error);
  }
};

const ORDER_NUMBER = /^ORD-[A-Z0-9]{8,32}$/i;
const frontendUrl = () => {
  const explicit = String(process.env.FRONTEND_PUBLIC_URL || "").trim();
  if (isValidReturnUrl(explicit)) return explicit.replace(/\/+$/, "");
  const firstOrigin = String(process.env.CLIENT_ORIGIN || "").split(",")[0]?.trim();
  if (isValidReturnUrl(firstOrigin)) return firstOrigin.replace(/\/+$/, "");
  return "http://localhost:5173";
};
const returnUrlFor = (orderNumber) => `${frontendUrl()}/payment/return?order=${encodeURIComponent(orderNumber)}`;
const presentOrderStatus = (order) => ({
  orderNumber: order.orderNumber,
  status: order.status,
  provider: order.provider || "",
  environment: order.environment || "sandbox",
  total: order.total,
  amountMinor: order.amountMinor,
  currency: order.currency,
  paidAt: order.paidAt || null,
  items: (order.items || []).map((item) => ({ id: String(item.contentId), itemType: item.kind, title: item.title, price: item.price })),
});

// ---------------------------------------------------------------- checkout
const checkoutSchema = z.object({
  provider: z.string().trim().min(1).max(40),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
}).strict();

export const listProviders = handle(async (_req, res) => {
  res.json({ success: true, ...providerStatusSummary(), demoCheckout: demoCheckoutAllowed() });
});

export const gatewayCheckout = handle(async (req, res) => {
  const { provider, idempotencyKey } = checkoutSchema.parse(req.body);
  const name = provider.toLowerCase();
  const adapter = getAdapter(name);
  if (!adapter || !adapter.config()?.enabled) {
    const cfg = adapter?.config?.();
    const absent = [...(cfg?.missing || []), ...(cfg?.endpointsMissing || [])];
    const detail = absent.length ? `Missing: ${absent.join(", ")}.` : (cfg?.reason || "Set the provider credentials in the backend environment.");
    return fail(res, 503, `Payment provider "${name}" is not configured. ${detail}`, { provider: name, code: "provider_unconfigured" });
  }
  // Free carts belong to the zero-total marketplace checkout.
  const cartItems = await CartItem.find({ studentId: req.user._id }).lean();
  if (cartItems.length) {
    const items = await buildOrderItems(cartItems).catch(() => null);
    if (items && items.reduce((sum, item) => sum + item.price, 0) === 0) {
      return fail(res, 400, "This cart contains only free items. Complete it from the standard checkout.", { code: "free_cart" });
    }
  }
  const { order: leanOrder, alreadyCreated } = await createPendingOrderForCart(req.user._id, idempotencyKey);
  if (leanOrder.status === "paid") {
    return res.json({ success: true, alreadyPaid: true, order: presentOrderStatus(leanOrder) });
  }
  if (!["pending", "initiated"].includes(leanOrder.status)) {
    return fail(res, 409, `This order is not awaiting payment (status: ${leanOrder.status}).`, { code: "order_not_payable" });
  }
  const order = await Order.findById(leanOrder._id);
  order.provider = name;
  order.environment = paymentMode() === "live" ? "live" : "sandbox";
  await order.save();
  let session;
  try {
    session = await adapter.createCheckout({ order, returnUrl: returnUrlFor(order.orderNumber) });
  } catch (error) {
    if (error instanceof ProviderError || error.status) {
      console.error(`[payments] ${name} createCheckout failed for ${order.orderNumber}:`, sanitizeForLog({ message: error.message, code: error.code }));
      return fail(res, error.status || 502, "The payment provider could not start a checkout. Please try again or choose another method.", { code: error.code || "provider_error" });
    }
    throw error;
  }
  res.status(201).json({
    success: true, provider: name, environment: order.environment,
    mode: session.mode, url: session.url || null, fields: session.fields || null,
    orderNumber: order.orderNumber, amount: order.total, amountMinor: order.amountMinor, currency: order.currency, alreadyCreated,
  });
});

// ----------------------------------------------------------- order status
const statusChecks = new Map(); // orderNumber -> epoch ms of last provider poll
const STATUS_POLL_MS = 30_000;
const STATUS_CHECK_MAX = 5000;
const pruneStatusChecks = () => {
  if (statusChecks.size <= STATUS_CHECK_MAX) return;
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, ts] of statusChecks) if (ts < cutoff) statusChecks.delete(key);
  if (statusChecks.size > STATUS_CHECK_MAX) statusChecks.clear();
};

export const orderStatus = handle(async (req, res) => {
  const orderNumber = String(req.params.orderNumber || req.params.orderId || "").trim();
  if (!ORDER_NUMBER.test(orderNumber)) return fail(res, 400, "Invalid order number.");
  const order = await Order.findOne({ orderNumber, studentId: req.user._id });
  if (!order) return fail(res, 404, "Order not found.");
  // For orders that use a gateway adapter, an authoritative provider poll may confirm a
  // paid/failed state the browser never saw (tab closed, callback lost). Throttled per order.
  const adapter = order.provider ? getAdapter(order.provider) : null;
  pruneStatusChecks();
  const lastCheck = statusChecks.get(orderNumber) || 0;
  if (adapter && ["pending", "initiated"].includes(order.status) && Date.now() - lastCheck > STATUS_POLL_MS) {
    statusChecks.set(orderNumber, Date.now());
    try {
      const result = await adapter.queryTransactionStatus({ order });
      if (result?.supported && result.status === "paid") {
        if (result.providerTransactionId && !order.providerTransactionId) order.providerTransactionId = result.providerTransactionId;
        await order.save();
        await fulfillOrder(order, { method: "provider-status-poll", detail: `${order.provider} confirmed paid` });
        await Order.findByIdAndUpdate(order._id, { $set: { "verification.verifiedAt": new Date() } });
      } else if (result?.supported && ["failed", "cancelled"].includes(result.status)) {
        await Order.updateOne({ _id: order._id, status: { $in: ["pending", "initiated"] } }, { $set: { status: result.status } });
      }
    } catch (error) {
      console.error(`[payments] status poll failed for ${orderNumber}:`, sanitizeForLog({ message: String(error?.message || error) }));
    }
  }
  const fresh = await Order.findById(order._id).lean();
  res.json({ success: true, ...presentOrderStatus(fresh) });
});

// ------------------------------------------------------------- callbacks
const recordEvent = async ({ provider, eventId, type, orderNumber, result }) => {
  try {
    await PaymentEvent.create({ provider, eventId, type: String(type || "").slice(0, 80) || "unknown", orderNumber: String(orderNumber || "").slice(0, 40), result });
    return { fresh: true };
  } catch (error) {
    if (error.code === 11000) return { fresh: false };
    throw error;
  }
};
const markEvent = (provider, eventId, result) => PaymentEvent.updateOne({ provider, eventId }, { $set: { result } });

const respondCallback = (req, res, { browserFields, orderNumber, status, httpCode = 200, body }) => {
  const accept = String(req.get("accept") || "");
  const isBrowser = req.get("sec-fetch-mode") === "navigate" || accept.includes("text/html");
  if (isBrowser && orderNumber) {
    const target = `${returnUrlFor(orderNumber)}&status=${encodeURIComponent(status || "pending")}&browser=1`;
    return res.redirect(303, target);
  }
  return res.status(httpCode).json(body);
};

// Shared, amount/currency-checked transition used by every verified provider callback.
async function applyVerifiedPayment(req, res, { provider, parsed, source }) {
  const orderNumber = String(parsed.orderNumber || "").trim();
  if (!orderNumber || !ORDER_NUMBER.test(orderNumber)) return fail(res, 400, "Missing or invalid order reference.");
  if (!parsed.eventId) return fail(res, 400, "Missing provider event identifier; refusing to process.");
  const { fresh } = await recordEvent({ provider, eventId: parsed.eventId, type: parsed.type || `payment.${parsed.status}`, orderNumber, result: "ignored" });
  if (!fresh) return res.json({ received: true, alreadyProcessed: true });
  const order = await Order.findOne({ orderNumber });
  if (!order) { await markEvent(provider, parsed.eventId, "rejected"); return fail(res, 400, "Unknown order reference."); }

  const amountOk = parsed.amountMinor !== null && parsed.amountMinor !== undefined
    && Number.isFinite(Number(parsed.amountMinor)) && Math.abs(Number(parsed.amountMinor) - Number(order.amountMinor || 0)) === 0;
  const currencyOk = String(parsed.currency || "").toUpperCase() === String(order.currency || "").toUpperCase();
  const isPaidLike = parsed.status === "paid";
  if (isPaidLike && (!amountOk || !currencyOk)) {
    await markEvent(provider, parsed.eventId, "rejected");
    return fail(res, 400, "Payment details do not match the order.");
  }
  if (parsed.status === "refunded") {
    if (order.status !== "paid") { await markEvent(provider, parsed.eventId, "rejected"); return fail(res, 409, "Only a paid order can be refunded."); }
    if (!currencyOk) { await markEvent(provider, parsed.eventId, "rejected"); return fail(res, 400, "Refund currency does not match the order."); }
    await refundOrder(order, parsed.providerTransactionId || parsed.eventId);
    await markEvent(provider, parsed.eventId, "processed");
    return respondCallback(req, res, { orderNumber, status: "refunded", body: { received: true, result: "refunded" } });
  }
  if (parsed.status === "failed" || parsed.status === "cancelled") {
    await Order.updateOne({ _id: order._id, status: { $in: ["pending", "initiated"] } }, { $set: { status: parsed.status, provider } });
    await markEvent(provider, parsed.eventId, "processed");
    return respondCallback(req, res, { orderNumber, status: parsed.status, body: { received: true, result: parsed.status } });
  }
  if (parsed.status !== "paid") {
    await markEvent(provider, parsed.eventId, "ignored");
    return respondCallback(req, res, { orderNumber, status: "pending", body: { received: true, result: "ignored" } });
  }
  // paid
  if (order.status === "paid") { await markEvent(provider, parsed.eventId, "processed"); return res.json({ received: true, alreadyProcessed: true }); }
  if (!["pending", "initiated"].includes(order.status)) { await markEvent(provider, parsed.eventId, "rejected"); return fail(res, 409, "Order is not awaiting payment."); }
  if (order.providerTransactionId && parsed.providerTransactionId && order.providerTransactionId !== parsed.providerTransactionId) {
    await markEvent(provider, parsed.eventId, "rejected");
    return fail(res, 409, "A different transaction is already recorded for this order.");
  }
  try {
    if (parsed.providerTransactionId) order.providerTransactionId = parsed.providerTransactionId;
    order.provider = provider;
    await order.save();
  } catch (error) {
    if (error.code === 11000) { await markEvent(provider, parsed.eventId, "rejected"); return fail(res, 409, "This provider transaction is already linked to another order."); }
    throw error;
  }
  await fulfillOrder(order, { method: source, detail: `${provider} callback` });
  await markEvent(provider, parsed.eventId, "processed");
  return respondCallback(req, res, { orderNumber, status: "paid", body: { received: true, result: "paid" } });
}

// JazzCash / Easypaisa: hosted-form browser return, signature over posted fields.
const formCallback = (provider) => handle(async (req, res) => {
  const adapter = getAdapter(provider);
  const fields = req.body && typeof req.body === "object" ? req.body : {};
  if (!adapter?.verifyCallbackSignature || adapter.verifyCallbackSignature(fields) !== true) {
    console.error(`[payments] ${provider} callback signature rejected.`, sanitizeForLog({ keys: Object.keys(fields) }));
    return fail(res, 401, "Signature verification failed.");
  }
  const parsed = adapter.parseCallback(fields);
  parsed.type = `payment.${parsed.status}`;
  return applyVerifiedPayment(req, res, { provider, parsed, source: "provider-callback" });
});

// Test provider (NODE_ENV=test only): signed JSON body, no network.
const testProviderCallback = handle(async (req, res) => {
  if (process.env.NODE_ENV !== "test") return fail(res, 404, "Not found.");
  const adapter = getAdapter("test-provider");
  let parsedJson;
  try { parsedJson = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "")); } catch { return fail(res, 400, "Malformed callback payload."); }
  if (adapter.verifyCallbackSignature(parsedJson) !== true) return fail(res, 401, "Signature verification failed.");
  const parsed = adapter.parseCallback(parsedJson);
  return applyVerifiedPayment(req, res, { provider: "test-provider", parsed, source: "test-callback" });
});

// Safepay: raw JSON webhook authenticated by HMAC signature header.
const safepayWebhook = handle(async (req, res) => {
  const adapter = getAdapter("safepay");
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === "string" ? req.body : "");
  if (!raw.length) return fail(res, 400, "Empty webhook payload.");
  const signature = req.get(adapter.webhookSignatureHeader());
  if (adapter.verifyWebhookSignature(raw, signature) !== true) {
    console.error("[payments] safepay webhook signature rejected.", sanitizeForLog({ bytes: raw.length }));
    return fail(res, 401, "Signature verification failed.");
  }
  let event;
  try { event = JSON.parse(raw.toString("utf8")); } catch { return fail(res, 400, "Malformed webhook payload."); }
  const parsed = adapter.parseWebhook(event);
  return applyVerifiedPayment(req, res, { provider: "safepay", parsed, source: "safepay-webhook" });
});

export { formCallback, testProviderCallback, safepayWebhook };

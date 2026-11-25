// Deterministic adapter for automated integration tests.
// Registered ONLY in NODE_ENV=test. Never enabled in development or production.
// Signs/verifies callbacks with PAYMENT_WEBHOOK_SECRET so tests exercise the real
// signature-verification code path with known values. Makes NO network calls.
import { hmacSha256Hex, safeEqualHex, ProviderError } from "./shared.js";

export const name = "test-provider";
export const currency = "PKR";

export function config() {
  const enabled = process.env.NODE_ENV === "test" && Boolean(process.env.PAYMENT_WEBHOOK_SECRET);
  return { name, mode: "sandbox", credentials: {}, endpoints: {}, missing: enabled ? [] : ["NODE_ENV=test + PAYMENT_WEBHOOK_SECRET"], enabled, verified: true, liveEnabled: false };
}
export function readiness() {
  return { name, ready: config().enabled, mode: "sandbox", missing: config().missing, verified: true, notes: "Automated-test adapter. Never enabled outside NODE_ENV=test." };
}

export async function createCheckout({ order, returnUrl }) {
  const cfg = config();
  if (!cfg.enabled) throw new ProviderError("Test provider is unavailable outside NODE_ENV=test.", { status: 503, code: "provider_unconfigured" });
  if (!["pending", "initiated"].includes(order.status)) return { mode: "test", provider: name, url: `${returnUrl}&provider=test-provider&order=${order.orderNumber}` };
  return { mode: "test", provider: name, url: `${returnUrl}&provider=test-provider&order=${order.orderNumber}`, orderNumber: order.orderNumber };
}

export const signCallbackBody = (json) => hmacSha256Hex(process.env.PAYMENT_WEBHOOK_SECRET, json);

// Verifies a urlencoded/JSON callback body of shape
// { signature, eventId, type, orderNumber, transactionId, amountMinor, currency }
export function verifyCallbackSignature(parsed) {
  if (process.env.NODE_ENV !== "test") return false;
  const { signature, ...rest } = parsed || {};
  if (!signature || !process.env.PAYMENT_WEBHOOK_SECRET) return false;
  const provided = String(signature).replace(/^sha256=/i, "").trim();
  // Sign the canonical payload: sorted keys joined as key=value, stable stringify.
  const canonical = Object.keys(rest).sort().map((key) => `${key}=${rest[key]}`).join("&");
  const expected = hmacSha256Hex(process.env.PAYMENT_WEBHOOK_SECRET, canonical);
  return safeEqualHex(expected, provided);
}

export function parseCallback(parsed) {
  const amountMinor = Math.round(Number(parsed?.amountMinor ?? parsed?.amount ?? NaN));
  return {
    orderNumber: String(parsed?.orderNumber || "").trim().slice(0, 40),
    providerTransactionId: String(parsed?.transactionId || parsed?.transaction_id || "").trim().slice(0, 200),
    amountMinor: Number.isFinite(amountMinor) ? amountMinor : null,
    currency: String(parsed?.currency || "PKR").trim().toUpperCase().slice(0, 8),
    status: String(parsed?.type || "") === "payment.succeeded" ? "paid"
      : String(parsed?.type || "") === "payment.failed" ? "failed"
      : String(parsed?.type || "") === "payment.cancelled" ? "cancelled"
      : String(parsed?.type || "") === "payment.refunded" ? "refunded" : "pending",
    type: String(parsed?.type || ""),
    eventId: String(parsed?.eventId || "").slice(0, 200),
    rawStatus: String(parsed?.type || ""),
  };
}

export async function queryTransactionStatus() {
  return { supported: false };
}
export async function refundPayment() {
  throw new ProviderError("Test provider has no refund API; refunds are triggered via signed webhook in tests.", { status: 501, code: "refund_unsupported" });
}

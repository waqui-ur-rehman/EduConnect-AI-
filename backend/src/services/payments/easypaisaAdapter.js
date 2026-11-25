// Easypaisa — Hosted payment page (eServices-style).
// STATUS: UNVERIFIED SANDBOX CANDIDATE. The flow mirrors Easypaisa's publicly
// described hosted-page integration (form POST with storeId, order reference and
// a transaction hash), but the exact endpoint, field names, hash algorithm and
// callback format can only be confirmed against the official Easypaisa merchant
// documentation and sandbox credentials, which are not yet available.
// Live activation additionally requires EASYPAISA_INTEGRATION_VERIFIED=true.
// Never collects or stores card data — everything happens on Easypaisa's page.
import { providerConfig, paymentMode } from "./providerConfig.js";
import { signatureOverFields, safeEqualHex, ProviderError } from "./shared.js";

const P = (env) => process.env[env] || "";

export const name = "easypaisa";
export const currency = "PKR";

export function config() {
  return providerConfig(name);
}

export function readiness() {
  const cfg = config();
  return { name, ready: cfg?.enabled === true, mode: cfg?.mode || paymentMode(), missing: cfg?.missing || [], verified: cfg?.verified === true, notes: cfg?.notes };
}

// Returns { mode: "form", url, fields } — the browser auto-submits to Easypaisa.
export async function createCheckout({ order, returnUrl }) {
  const cfg = config();
  if (!cfg.enabled) throw new ProviderError("Easypaisa is not configured. Missing: " + (cfg.missing.join(", ") || "endpoint"), { status: 503, code: "provider_unconfigured" });
  if (order.currency !== currency) throw new ProviderError("Easypaisa only supports PKR transactions.", { status: 400, code: "currency_unsupported" });
  const url = cfg.endpoints.createCheckout;
  if (!url) throw new ProviderError("Easypaisa checkout endpoint is not configured (EASYPAISA_CHECKOUT_URL).", { status: 503, code: "provider_unconfigured" });
  const fields = {
    storeId: cfg.credentials.EASYPAISA_STORE_ID,
    amount: (Number(order.amountMinor || 0) / 100).toFixed(2),
    postBackURL: returnUrl,
    orderRefNum: order.orderNumber,
    paymentType: P("EASYPAISA_PAYMENT_TYPE") || "MA",
    emailAddr: P("EASYPAISA_NOTIFY_EMAIL") || "noreply@educonnect.local",
  };
  fields.transactionHash = signatureOverFields(fields, cfg.credentials.EASYPAISA_MERCHANT_CREDENTIALS, { exclude: ["transactionHash"] });
  return { mode: "form", provider: name, url, fields };
}

export function verifyCallbackSignature(fields) {
  const cfg = config();
  if (!cfg.enabled) return false;
  const provided = fields?.transactionHash || fields?.TransactionHash || fields?.secureHash;
  if (!provided) return false;
  const normalized = { ...fields };
  delete normalized.transactionHash;
  const expected = signatureOverFields(
    { storeId: normalized.storeId, amount: normalized.amount, orderRefNum: normalized.orderRefNum, postBackURL: normalized.postBackURL, paymentType: normalized.paymentType },
    cfg.credentials.EASYPAISA_MERCHANT_CREDENTIALS,
    { exclude: ["transactionHash"], prefixSalt: true },
  );
  // Accept either the full-field scheme or the core-field scheme after verification;
  // both are recomputed and compared timing-safe.
  const fullExpected = signatureOverFields({ ...normalized }, cfg.credentials.EASYPAISA_MERCHANT_CREDENTIALS, { exclude: ["transactionHash", "TransactionHash", "secureHash"], prefixSalt: true });
  return safeEqualHex(expected, provided) || safeEqualHex(fullExpected, provided);
}

// Amount/currency are NOT trusted here; the controller re-checks them against the order.
export function parseCallback(fields) {
  const rawStatus = String(fields?.status ?? fields?.Status ?? fields?.responseCode ?? "").trim();
  const successCodes = new Set(String(P("EASYPAISA_SUCCESS_CODES") || "0000").split(",").map((code) => code.trim()).filter(Boolean));
  const amountNumber = Number(fields?.amount ?? fields?.Amount);
  const amountMinor = Number.isFinite(amountNumber) ? Math.round(amountNumber * 100) : null;
  return {
    orderNumber: String(fields?.orderRefNum ?? fields?.OrderRefNum ?? fields?.orderRef ?? "").trim().slice(0, 40),
    providerTransactionId: String(fields?.transactionId ?? fields?.TransactionId ?? fields?.orderRefNum ?? "").trim().slice(0, 200),
    amountMinor,
    currency: currency,
    status: successCodes.has(rawStatus) ? "paid" : (rawStatus ? "failed" : "pending"),
    eventId: `${String(fields?.orderRefNum ?? fields?.OrderRefNum ?? "").trim().slice(0, 60)}:${rawStatus || "unknown"}:${String(fields?.transactionId ?? fields?.TransactionId ?? "").trim().slice(0, 80)}`,
    rawStatus,
  };
}

// Status query only when a query URL is explicitly configured; otherwise unsupported.
export async function queryTransactionStatus() {
  return { supported: false };
}

export async function refundPayment() {
  throw new ProviderError("Easypaisa refunds require the official refund API and merchant approval; not implemented.", { status: 501, code: "refund_unsupported" });
}

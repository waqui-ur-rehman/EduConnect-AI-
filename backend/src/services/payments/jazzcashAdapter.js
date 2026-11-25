// JazzCash — Hosted Payment Page (HTTP Payment Gateway style).
// STATUS: UNVERIFIED SANDBOX CANDIDATE. The flow mirrors JazzCash's publicly
// described hosted-form integration (HMAC-SHA256 pp_SecureHash over the sorted
// field values, prefixed/keyed with the integrity salt), but the exact endpoint,
// field set and hash order can only be confirmed against the official JazzCash
// merchant API documentation and sandbox credentials, which are not yet available.
// Live activation additionally requires JAZZCASH_INTEGRATION_VERIFIED=true.
// Never collects or stores card data — everything happens on JazzCash's page.
import { providerConfig, paymentMode } from "./providerConfig.js";
import { signatureOverFields, safeEqualHex, ProviderError, sanitizeForLog } from "./shared.js";

const P = (env) => process.env[env] || "";
const two = (n) => String(n).padStart(2, "0");
const txnDateTime = (date) => `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;

export const name = "jazzcash";
export const currency = "PKR";

export function config() {
  return providerConfig(name);
}

export function readiness() {
  const cfg = config();
  return { name, ready: cfg?.enabled === true, mode: cfg?.mode || paymentMode(), missing: cfg?.missing || [], verified: cfg?.verified === true, notes: cfg?.notes };
}

// Returns { mode: "form", url, fields } — the browser auto-submits to JazzCash.
export async function createCheckout({ order, returnUrl }) {
  const cfg = config();
  if (!cfg.enabled) throw new ProviderError("JazzCash is not configured. Missing: " + (cfg.missing.join(", ") || "endpoint"), { status: 503, code: "provider_unconfigured" });
  if (order.currency !== currency) throw new ProviderError("JazzCash only supports PKR transactions.", { status: 400, code: "currency_unsupported" });
  const url = cfg.endpoints.createCheckout;
  if (!url) throw new ProviderError("JazzCash checkout endpoint is not configured (JAZZCASH_CHECKOUT_URL).", { status: 503, code: "provider_unconfigured" });
  const fields = {
    pp_Version: P("JAZZCASH_PP_VERSION") || "1.1",
    pp_TxnType: P("JAZZCASH_TXN_TYPE") || "MPAY",
    pp_Language: "EN",
    pp_MerchantID: cfg.credentials.JAZZCASH_MERCHANT_ID,
    pp_Password: cfg.credentials.JAZZCASH_PASSWORD,
    pp_TxnRefNo: order.orderNumber,
    pp_Amount: String(order.amountMinor),
    pp_TxnCurrency: currency,
    pp_TxnDateTime: txnDateTime(new Date()),
    pp_BillReference: order.orderNumber,
    pp_Description: `EduConnect AI order ${order.orderNumber}`.slice(0, 100),
    pp_TxnExpiryDateTime: txnDateTime(new Date(Date.now() + 60 * 60 * 1000)),
    pp_ReturnURL: returnUrl,
  };
  fields.pp_SecureHash = signatureOverFields(fields, cfg.credentials.JAZZCASH_INTEGRITY_SALT, { exclude: ["pp_SecureHash"] });
  return { mode: "form", provider: name, url, fields };
}

// Verifies the callback signature. Returns false on any mismatch.
export function verifyCallbackSignature(fields) {
  const cfg = config();
  if (!cfg.enabled) return false;
  const provided = fields?.pp_SecureHash;
  if (!provided) return false;
  const expected = signatureOverFields(fields, cfg.credentials.JAZZCASH_INTEGRITY_SALT, { exclude: ["pp_SecureHash"] });
  return safeEqualHex(expected, provided);
}

// Maps a verified callback to a normalized result. Amount/currency are NOT trusted here;
// the controller re-checks them against the order.
export function parseCallback(fields) {
  const responseCode = String(fields?.pp_ResponseCode || "").trim();
  const successCodes = new Set(String(P("JAZZCASH_SUCCESS_CODES") || "000").split(",").map((code) => code.trim()).filter(Boolean));
  const amountNumber = Number(fields?.pp_Amount);
  return {
    orderNumber: String(fields?.pp_TxnRefNo || "").trim().slice(0, 40),
    providerTransactionId: String(fields?.pp_RetreivalReferenceNo || fields?.pp_TxnRefNo || "").trim().slice(0, 200),
    amountMinor: Number.isFinite(amountNumber) ? Math.round(amountNumber) : null,
    currency: currency,
    status: successCodes.has(responseCode) ? "paid" : (responseCode ? "failed" : "pending"),
    eventId: `${String(fields?.pp_TxnRefNo || "").trim().slice(0, 60)}:${responseCode || "unknown"}:${String(fields?.pp_RetreivalReferenceNo || "").trim().slice(0, 80)}`,
    rawStatus: responseCode,
  };
}

// Authoritative status query. Only active when JAZZCASH_QUERY_URL is explicitly configured.
export async function queryTransactionStatus({ order }) {
  const queryUrl = P("JAZZCASH_QUERY_URL");
  const cfg = config();
  if (!queryUrl || !cfg.enabled) return { supported: false };
  const fields = {
    pp_MerchantID: cfg.credentials.JAZZCASH_MERCHANT_ID,
    pp_Password: cfg.credentials.JAZZCASH_PASSWORD,
    pp_TxnRefNo: order.orderNumber,
    pp_Amount: String(order.amountMinor),
    pp_TxnDateTime: txnDateTime(new Date(order.createdAt || Date.now())),
    pp_Language: "EN",
    pp_Version: P("JAZZCASH_PP_VERSION") || "1.1",
  };
  fields.pp_SecureHash = signatureOverFields(fields, cfg.credentials.JAZZCASH_INTEGRITY_SALT, { exclude: ["pp_SecureHash"] });
  let data;
  try {
    const response = await fetch(queryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
      signal: AbortSignal.timeout(8000),
    });
    data = Object.fromEntries(new URLSearchParams(await response.text()));
  } catch {
    throw new ProviderError("JazzCash status query failed.", { status: 504, code: "provider_unavailable" });
  }
  if (!verifyCallbackSignature(data)) return { supported: true, status: "unknown" };
  const parsed = parseCallback(data);
  return { supported: true, status: parsed.status, providerTransactionId: parsed.providerTransactionId, amountMinor: parsed.amountMinor };
}

// Refunds: only after official docs + merchant approval. Not implemented.
export async function refundPayment() {
  throw new ProviderError("JazzCash refunds require the official refund API and merchant approval; not implemented.", { status: 501, code: "refund_unsupported" });
}

export const __testInternals = process.env.NODE_ENV === "test" ? { sanitizeForLog } : undefined;

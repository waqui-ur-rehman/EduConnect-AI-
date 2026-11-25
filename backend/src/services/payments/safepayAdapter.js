// Safepay — JSON API + hosted checkout + HMAC-signed webhook.
// STATUS: UNVERIFIED SANDBOX CANDIDATE. The request/response shapes and the webhook
// signature mapping below follow Safepay's publicly described architecture (API key +
// secret, hosted checkout, signed webhook), but the exact paths, signature header and
// payload schema can only be confirmed against the official Safepay developer docs and
// sandbox credentials, which are not yet available.
// Live activation additionally requires SAFEPAY_INTEGRATION_VERIFIED=true.
// Never collects or stores card data — everything happens on Safepay's page.
import { providerConfig, paymentMode } from "./providerConfig.js";
import { hmacSha256Hex, safeEqualHex, ProviderError } from "./shared.js";

const P = (env) => process.env[env] || "";

export const name = "safepay";
export const currency = () => String(process.env.MARKETPLACE_CURRENCY || "PKR").trim().toUpperCase().slice(0, 8) || "PKR";

export function config() {
  return providerConfig(name);
}

export function readiness() {
  const cfg = config();
  return { name, ready: cfg?.enabled === true, mode: cfg?.mode || paymentMode(), missing: cfg?.missing || [], verified: cfg?.verified === true, notes: cfg?.notes };
}

// Returns { mode: "redirect", url } — browser is sent to Safepay's hosted checkout.
// Requires SAFEPAY_CHECKOUT_URL to be explicitly configured (no fabricated path).
// The request body is the signed order envelope; the response may carry the URL under
// any of the commonly used keys (url, checkoutUrl, redirectUrl, session.url).
export async function createCheckout({ order, returnUrl }) {
  const cfg = config();
  if (!cfg.enabled) throw new ProviderError("Safepay is not configured. Missing: " + (cfg.missing.join(", ") || "SAFEPAY_CHECKOUT_URL"), { status: 503, code: "provider_unconfigured" });
  const url = P("SAFEPAY_CHECKOUT_URL");
  if (!url) throw new ProviderError("Safepay checkout endpoint is not configured (SAFEPAY_CHECKOUT_URL). Integration is BLOCKED until the official endpoint is confirmed.", { status: 503, code: "provider_unconfigured" });
  const orderCurrency = currency();
  const body = {
    client: cfg.credentials.SAFEPAY_API_KEY,
    mode: paymentMode(),
    orderNumber: order.orderNumber,
    amountMinor: Number(order.amountMinor) || 0,
    currency: orderCurrency,
    returnUrl,
    metadata: { orderNumber: order.orderNumber },
  };
  const payload = JSON.stringify(body);
  let data;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.credentials.SAFEPAY_API_KEY}`,
        "X-Safepay-Signature": hmacSha256Hex(cfg.credentials.SAFEPAY_API_SECRET, payload),
      },
      body: payload,
      signal: AbortSignal.timeout(8000),
    });
    data = await response.json().catch(() => null);
    if (!response.ok) throw new ProviderError(`Safepay checkout was rejected (HTTP ${response.status}).`, { status: 502, code: "provider_rejected" });
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("Safepay is temporarily unavailable.", { status: 504, code: "provider_unavailable" });
  }
  const redirect = data?.url || data?.checkoutUrl || data?.redirectUrl || data?.session?.url || data?.data?.url;
  if (!redirect || typeof redirect !== "string") {
    throw new ProviderError("Safepay did not return a checkout URL. Integration is BLOCKED until the official response schema is confirmed.", { status: 502, code: "provider_schema" });
  }
  return { mode: "redirect", provider: name, url: redirect };
}

// Webhook authenticity: HMAC-SHA256 of the raw body, compared against the signature header.
export function verifyWebhookSignature(rawBody, signatureHeader) {
  const cfg = config();
  if (!cfg.enabled) return false;
  const secret = cfg.credentials.SAFEPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const provided = String(signatureHeader || "").replace(/^sha256=/i, "").trim();
  return safeEqualHex(hmacSha256Hex(secret, rawBody), provided);
}
export const webhookSignatureHeader = () => String(P("SAFEPAY_WEBHOOK_SIGNATURE_HEADER") || "x-safepay-signature").toLowerCase();

// Normalizes a verified webhook payload. Amount/currency are re-checked by the controller.
export function parseWebhook(event) {
  const data = event?.data || event?.payload || event || {};
  const rawType = String(event?.type || event?.event || "").trim().toLowerCase();
  const rawStatus = String(data?.status || data?.payment_status || data?.state || "").trim().toLowerCase();
  const minor = Number(data?.amountMinor ?? data?.amount?.minor ?? NaN);
  const major = Number(data?.amount ?? NaN);
  const amountMinor = Number.isFinite(minor) ? Math.round(minor) : (Number.isFinite(major) ? Math.round(major * 100) : null);
  const orderNumber = String(
    data?.orderNumber || data?.order_number || data?.reference || data?.metadata?.orderNumber || "",
  ).trim().slice(0, 40);
  let type = "ignored";
  let status = "pending";
  if (/refund/.test(rawType) || /refund/.test(rawStatus)) { type = "payment.refunded"; status = "refunded"; }
  else if (/fail|declin|error/.test(rawType) || /fail|declin|error/.test(rawStatus)) { type = "payment.failed"; status = "failed"; }
  else if (/cancel/.test(rawType) || /cancel/.test(rawStatus)) { type = "payment.cancelled"; status = "cancelled"; }
  else if (/succeed|success|paid|complete|captured/.test(rawType) || /succeed|success|paid|complete|captured/.test(rawStatus)) { type = "payment.succeeded"; status = "paid"; }
  return {
    type,
    status,
    orderNumber,
    providerTransactionId: String(data?.transactionId || data?.transaction_id || data?.id || "").trim().slice(0, 200),
    amountMinor,
    currency: String(data?.currency || currency()).trim().toUpperCase().slice(0, 8),
    eventId: String(event?.id || event?.eventId || event?.event_id || `${orderNumber}:${rawType}:${String(data?.id || "")}`).slice(0, 200),
    rawStatus: rawStatus || rawType,
  };
}

// Authoritative status check — only when an explicit status URL is configured.
export async function queryTransactionStatus({ order }) {
  const cfg = config();
  const statusUrl = P("SAFEPAY_STATUS_URL");
  if (!statusUrl || !cfg.enabled) return { supported: false };
  const url = `${statusUrl.replace(/\/+$/, "")}/${encodeURIComponent(order.providerTransactionId || order.orderNumber)}`;
  let data;
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${cfg.credentials.SAFEPAY_API_KEY}` }, signal: AbortSignal.timeout(8000) });
    data = await response.json().catch(() => null);
    if (!response.ok) return { supported: true, status: "unknown" };
  } catch {
    throw new ProviderError("Safepay status query failed.", { status: 504, code: "provider_unavailable" });
  }
  const body = data?.data || data || {};
  const rawStatus = String(body?.status || body?.state || "").trim().toLowerCase();
  let status = "unknown";
  if (/succeed|success|paid|complete|captured/.test(rawStatus)) status = "paid";
  else if (/fail|declin|error/.test(rawStatus)) status = "failed";
  else if (/cancel/.test(rawStatus)) status = "cancelled";
  else if (/pending|created|initiated/.test(rawStatus)) status = "pending";
  return { supported: true, status, providerTransactionId: String(body?.transactionId || body?.id || order.providerTransactionId || "").slice(0, 200) };
}

export async function refundPayment() {
  throw new ProviderError("Safepay refunds require the official refund API and merchant approval; not implemented.", { status: 501, code: "refund_unsupported" });
}

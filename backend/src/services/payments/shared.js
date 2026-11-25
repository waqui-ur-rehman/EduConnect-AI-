import crypto from "node:crypto";

export const hmacSha256Hex = (secret, input) => crypto.createHmac("sha256", String(secret)).update(String(input)).digest("hex");

export function safeEqualHex(a, b) {
  const left = String(a || "").trim().toLowerCase();
  const right = String(b || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  const aBuf = Buffer.from(left, "hex");
  const bBuf = Buffer.from(right, "hex");
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
}

// Generic "sorted field values" HMAC scheme used by the hosted form gateways.
// NOTE: the exact official algorithm MUST be confirmed against the provider's
// merchant documentation before live use — see adapter notes. Never disable this check.
export function signatureOverFields(fields, secret, { exclude = [], prefixSalt = true } = {}) {
  const values = Object.keys(fields)
    .filter((key) => !exclude.includes(key) && fields[key] !== undefined && fields[key] !== null && String(fields[key]) !== "")
    .sort()
    .map((key) => String(fields[key]));
  const input = (prefixSalt ? `${secret}&${values.join("&")}` : values.join("&"));
  return hmacSha256Hex(secret, input);
}

// Strip anything that could carry secrets or card data before logging/persisting.
export function sanitizeForLog(value, depth = 0) {
  if (depth > 4) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 300);
  if (Array.isArray(value)) return value.slice(0, 30).map((entry) => sanitizeForLog(entry, depth + 1));
  if (typeof value === "object") {
    const clean = {};
    for (const [key, entry] of Object.entries(value)) {
      if (/password|secret|card|cvv|ccv|pan|pin|token|credential|salt|integrity/i.test(key)) { clean[key] = "[redacted]"; continue; }
      clean[key] = sanitizeForLog(entry, depth + 1);
    }
    return clean;
  }
  return String(value).slice(0, 300);
}

export class ProviderError extends Error {
  constructor(message, { status = 502, code = "provider_error" } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const isValidReturnUrl = (value) => {
  try { const url = new URL(String(value || "")); return ["https:", "http:"].includes(url.protocol); } catch { return false; }
};

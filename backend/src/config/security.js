import mongoose from "mongoose";
import { isIP } from "node:net";

export function trustedProxies(value = process.env.TRUST_PROXY) {
  if (!value || value === "false") return false;
  const entries = value.split(",").map((item) => item.trim());
  for (const entry of entries) {
    if (entry === "loopback") continue;
    const [address, bits, extra] = entry.split("/");
    const version = isIP(address);
    if (!version || extra || (bits !== undefined && (!/^\d+$/.test(bits) || Number(bits) < 1 || Number(bits) > (version === 4 ? 32 : 128)))) {
      throw new Error("TRUST_PROXY must contain specific proxy IP addresses or CIDRs.");
    }
  }
  return entries;
}

// Development accepts a comma-separated list of exact browser origins, including an explicit LAN URL.
export function clientOrigins(env = process.env) {
  const values = (env.CLIENT_ORIGIN || "http://localhost:5173").split(",").map((value) => value.trim());
  const origins = new Set();
  for (const value of values) {
    let url;
    try { url = new URL(value); } catch { throw new Error("CLIENT_ORIGIN must contain exact HTTP(S) origins."); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("CLIENT_ORIGIN must contain exact HTTP(S) origins.");
    if (env.NODE_ENV === "production" && (url.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("Production CLIENT_ORIGIN requires public HTTPS origins.");
    origins.add(url.origin);
    if (env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname)) {
      url.hostname = url.hostname === "localhost" ? "127.0.0.1" : "localhost";
      origins.add(url.origin);
    }
  }
  return origins;
}

export function validateEnvironment(env = process.env) {
  if (!["development", "test", "production"].includes(env.NODE_ENV)) throw new Error("Set NODE_ENV to development, test or production.");
  trustedProxies(env.TRUST_PROXY);
  const origins = clientOrigins(env);
  if (env.NODE_ENV !== "production") return;
  if (!env.CLIENT_ORIGIN) throw new Error("Production CLIENT_ORIGIN is required.");
  const secret = env.JWT_SECRET || "";
  if (Buffer.byteLength(secret) < 32 || new Set(secret).size < 12 || /change.?me|replace.?me|your[_-]?secret|example|12345/i.test(secret)) throw new Error("Production JWT_SECRET must be a strong independent secret of at least 32 bytes.");
  if (env.PASSWORD_RESET_DEV_LINK === "true" || env.CONTENT_DEMO_CHECKOUT === "true") throw new Error("Development reset logging and demo checkout must be disabled in production.");
  const resetOrigin = env.PASSWORD_RESET_FRONTEND_ORIGIN || [...origins][0];
  if (!origins.has(resetOrigin)) throw new Error("PASSWORD_RESET_FRONTEND_ORIGIN must match a trusted CLIENT_ORIGIN.");
  for (const field of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]) {
    if (!env[field] || /[\r\n]/.test(env[field])) throw new Error(`Production ${field} is required.`);
  }
  const port = Number(env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid SMTP_PORT.");
  if (env.SESSION_HOURS && (!Number.isFinite(Number(env.SESSION_HOURS)) || Number(env.SESSION_HOURS) <= 0 || Number(env.SESSION_HOURS) > 168)) throw new Error("SESSION_HOURS must be between 0 and 168 hours.");
  let options;
  try { options = new mongoose.mongo.MongoClient(env.MONGO_URI).options; }
  catch { throw new Error("A valid production MONGO_URI is required."); }
  if (!options.credentials || (!options.credentials.username && options.credentials.mechanism !== "MONGODB-X509")) throw new Error("Production MongoDB authentication is required.");
  if (!options.tls || options.tlsInsecure || options.tlsAllowInvalidCertificates || options.tlsAllowInvalidHostnames) throw new Error("Production MongoDB requires TLS with certificate verification.");
}

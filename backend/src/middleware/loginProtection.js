import { createHash } from "node:crypto";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { rateLimitStore } from "./rateLimitStore.js";

const WINDOW_MS = 15 * 60 * 1000;
const deny = (_req, res) => res.status(429).json({
  success: false,
  message: "Too many login attempts. Please try again later."
});

// Count failed attempts. Successful 2xx responses don't consume the quota.
// Development: in-memory counters reset on backend restart.
export const loginIpLimiter = rateLimit({
  ...rateLimitStore("login-ip"),
  windowMs: WINDOW_MS,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: deny
});

// Limit failures per IP + normalized email without storing raw email in keys.
// A per-IP/email key avoids account-wide lockouts caused by other IPs.
export const loginAccountLimiter = rateLimit({
  ...rateLimitStore("login-account"),
  windowMs: WINDOW_MS,
  limit: 6,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase().slice(0, 254)
      : "invalid";
    const ip = ipKeyGenerator(req.ip || "127.0.0.1", 56);
    const hashed = createHash("sha256").update(email).digest("hex");
    return `${ip}:${hashed}`;
  },
  handler: deny
});

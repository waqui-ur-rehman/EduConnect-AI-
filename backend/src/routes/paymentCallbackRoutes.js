import { Router } from "express";
import express from "express";
import rateLimit from "express-rate-limit";
import { rateLimitStore } from "../middleware/rateLimitStore.js";
import { formCallback, testProviderCallback, safepayWebhook } from "../controllers/paymentGatewayController.js";

// Provider callbacks/webhooks. Mounted BEFORE the browser CSRF middleware: these are
// server-to-server calls or hosted-page browser returns without X-Requested-With.
// Authenticity comes from the provider signature, never from cookies.
const callbackLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false, ...rateLimitStore("payments-callbacks") });
const urlencoded = express.urlencoded({ extended: false, limit: "64kb" });
const rawJson = express.raw({ type: ["application/json", "application/*+json"], limit: "256kb" });

const router = Router();
router.use(callbackLimiter);
router.post("/jazzcash/callback", urlencoded, formCallback("jazzcash"));
router.post("/easypaisa/callback", urlencoded, formCallback("easypaisa"));
router.post("/safepay/webhook", rawJson, safepayWebhook);
if (process.env.NODE_ENV === "test") router.post("/test-provider/callback", rawJson, testProviderCallback);
export default router;

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { rateLimitStore } from "../middleware/rateLimitStore.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { listProviders, gatewayCheckout, orderStatus } from "../controllers/paymentGatewayController.js";

const checkoutLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false, ...rateLimitStore("payments-checkout") });
const statusLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 180, standardHeaders: "draft-8", legacyHeaders: false, ...rateLimitStore("payments-status") });

const router = Router();
router.use(protect);
router.get("/providers", authorize("student"), listProviders);
router.post("/checkout", authorize("student"), checkoutLimiter, gatewayCheckout);
router.get("/orders/:orderNumber/status", authorize("student"), statusLimiter, orderStatus);
export default router;

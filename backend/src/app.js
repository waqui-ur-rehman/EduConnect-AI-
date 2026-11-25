/* global process */
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/authRoutes.js";
import contentRoutes from "./routes/contentRoutes.js";
import quizRoutes from "./routes/quizRoutes.js";
import assignmentRoutes from "./routes/assignmentRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import teacherVerificationRoutes from "./routes/teacherVerificationRoutes.js";
import studentVerificationRoutes from "./routes/studentVerificationRoutes.js";
import learningRoutes from "./routes/learningRoutes.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import marketplaceRoutes from "./routes/marketplaceRoutes.js";
import paymentWebhookRoutes from "./routes/paymentWebhookRoutes.js";
import paymentCallbackRoutes from "./routes/paymentCallbackRoutes.js";
import paymentGatewayRoutes from "./routes/paymentGatewayRoutes.js";
import supportTicketRoutes from "./routes/supportTicketRoutes.js";
import recommendationRoutes from "./routes/recommendationRoutes.js";
import researchRoutes from "./routes/researchRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import moderationRoutes from "./routes/moderationRoutes.js";
import { clientOrigins as configuredClientOrigins, trustedProxies } from "./config/security.js";
import { rateLimitStore } from "./middleware/rateLimitStore.js";
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", trustedProxies());
app.use(helmet());
const clientOrigins = configuredClientOrigins();
app.use(cors({ origin: [...clientOrigins], credentials: true }));
app.use(cookieParser());
app.use("/api", (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false, ...rateLimitStore("api") }));
// Provider payment webhooks: raw body, HMAC-signature authenticated, no browser CSRF headers.
app.use("/api/payments/webhook", express.raw({ type: "application/json", limit: "256kb" }), paymentWebhookRoutes);
// Phase 6 gateway callbacks (JazzCash/Easypaisa/Safepay/test): signature-authenticated, mounted before browser CSRF middleware.
app.use("/api/payments", paymentCallbackRoutes);
// Cookie-authenticated requests must come from the configured frontend origin.
// Require an AJAX-only header on every authenticated mutation to prevent form CSRF.
app.use("/api", (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && !clientOrigins.has(origin)) {
    return res.status(403).json({ success: false, message: "Origin not allowed." });
  }
  if (!origin && process.env.NODE_ENV === "production") {
    return res.status(403).json({ success: false, message: "Origin required." });
  }
  if (req.get("X-Requested-With") !== "XMLHttpRequest") {
    return res.status(403).json({ success: false, message: "Request verification header missing." });
  }
  next();
});
app.use("/api/content", express.json({ limit: "12mb" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.get("/", (req, res) => res.json({ success: true, message: "Welcome to EduConnect AI Backend" }));
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/marketplace", marketplaceRoutes);
// Authenticated gateway API (provider list, checkout, order status). Requires the browser CSRF header on mutations.
app.use("/api/payments", paymentGatewayRoutes);
app.use("/api/learning", learningRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/support", supportTicketRoutes);
// Phase 7: personalized recommendations, research workspace, notifications
// and role-scoped learning analytics (each router applies protect + authorize).
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/research", researchRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/moderation", moderationRoutes);
app.use("/api/teacher/verification", teacherVerificationRoutes);
app.use("/api/student/verification", studentVerificationRoutes);
app.use(notFound);
app.use(errorHandler);
export default app;

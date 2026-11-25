import express from "express";
import rateLimit from "express-rate-limit";
import { rateLimitStore } from "../middleware/rateLimitStore.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { uploadCnic } from "../middleware/cnicUploadMiddleware.js";
import { getVerificationStatus, submitVerification } from "../controllers/teacherVerificationController.js";

const router = express.Router();
router.use(protect, authorize("teacher"));
router.get("/", getVerificationStatus);
router.post(
  "/submit",
  rateLimit({ ...rateLimitStore("teacher-cnic"), windowMs: 60 * 60 * 1000, limit: 3, keyGenerator: (req) => String(req.user._id), skipFailedRequests: true, standardHeaders: "draft-8", legacyHeaders: false }),
  uploadCnic,
  submitVerification
);
export default router;

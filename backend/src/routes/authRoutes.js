
import express from "express";
import rateLimit from "express-rate-limit";
import { rateLimitStore } from "../middleware/rateLimitStore.js";
import { forgotPassword, resetPassword } from "../controllers/passwordResetController.js";

import {
  register,
  login,
  logout,
  getMe,
  getStudentProfileVerification
} from "../controllers/authController.js";

import { protect } from "../middleware/authMiddleware.js";
import { updateMyProfile } from "../controllers/myProfileController.js";
import { loginIpLimiter, loginAccountLimiter } from "../middleware/loginProtection.js";

const router = express.Router();

// Student / Teacher Registration
router.post("/register", register);

// Student / Teacher / Admin Login
router.post("/login", loginIpLimiter, loginAccountLimiter, login);

// Password recovery: separate per-IP limits; generic request response.
const recoveryLimiter = rateLimit({
  ...rateLimitStore("password-recovery"),
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later." }
});
const resetLimiter = rateLimit({
  ...rateLimitStore("password-reset"),
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later." }
});
router.post("/forgot-password", recoveryLimiter, forgotPassword);
router.post("/reset-password", resetLimiter, resetPassword);

// Logged-in User Profile and Verification Status
router.get("/me", protect, getMe);
// Only update the authenticated account; ignores any requested userId or role.
router.patch("/me/profile", protect, updateMyProfile);
router.post("/logout", protect, logout);
router.get("/profiles/student/:email/verification", protect, getStudentProfileVerification);

export default router;

import express from "express";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { submitModerationReport } from "../controllers/moderationController.js";

const router = express.Router();
router.use(protect);
router.post("/reports", authorize("student", "teacher"), submitModerationReport);

export default router;

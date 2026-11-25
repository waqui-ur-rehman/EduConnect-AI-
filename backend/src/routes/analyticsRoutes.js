import { Router } from "express";
import { protect, authorize } from "../middleware/authMiddleware.js";
import {
  getStudentAnalytics,
  getTeacherAnalytics,
  getAdminAnalytics,
} from "../controllers/analyticsController.js";

// Learning Analytics: each role sees only its own learning data.
const router = Router();
router.use(protect);
router.get("/student", authorize("student"), getStudentAnalytics);
router.get("/teacher", authorize("teacher"), getTeacherAnalytics);
router.get("/admin", authorize("admin"), getAdminAnalytics);
export default router;

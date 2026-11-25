import { Router } from "express";
import { protect, authorize } from "../middleware/authMiddleware.js";
import {
  getStudentRecommendations,
  getStudentInterests,
  updateStudentInterests,
} from "../controllers/recommendationsController.js";

// Personalized recommendations: authenticated students only. Every response is
// computed from this student's own MongoDB profile, progress and access rows.
const router = Router();
router.use(protect, authorize("student"));
router.get("/", getStudentRecommendations);
router.get("/profile", getStudentInterests);
router.put("/profile", updateStudentInterests);
export default router;

import { Router } from "express";
import { protect, authorize } from "../middleware/authMiddleware.js";
import {
  myProgress,
  setLessonProgress,
  courseReviews,
  teacherSummary,
  myReviews,
  teacherReviews,
  saveReview,
  deleteMyReview,
  moderateReview,
  myCertificates,
  verifyCertificate,
  issueCertificate,
} from "../controllers/learningController.js";

const router = Router();
// Public, read-only aggregates safe to expose without a session.
router.get("/certificates/verify/:certificateId", verifyCertificate);
router.get("/reviews/course/:courseId", courseReviews);
router.get("/reviews/teacher-summary/:teacherId", teacherSummary);
router.use(protect);
router.get("/progress", authorize("student"), myProgress);
router.post("/progress/lessons", authorize("student"), setLessonProgress);
router.get("/reviews/mine", authorize("student"), myReviews);
router.get("/reviews/teacher", authorize("teacher"), teacherReviews);
router.post("/reviews", authorize("student"), saveReview);
router.delete("/reviews/mine/:courseId", authorize("student"), deleteMyReview);
router.patch("/reviews/:id/moderate", authorize("admin"), moderateReview);
router.get("/certificates/mine", authorize("student"), myCertificates);
router.post("/certificates/issue", authorize("student"), issueCertificate);
export default router;

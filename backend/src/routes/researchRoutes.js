import { Router } from "express";
import { protect, authorize } from "../middleware/authMiddleware.js";
import {
  listResearchRecords,
  getResearchRecord,
  createResearchRecord,
  updateResearchRecord,
  deleteResearchRecord,
  archiveResearchRecord,
  importResearchRecords,
  listCourseResearch,
} from "../controllers/researchController.js";

// Research Workspace: students and teachers keep their own records. Every
// read and write is scoped to ownerId = req.user._id inside the controller.
const router = Router();
router.use(protect, authorize("student", "teacher"));
router.get("/records", listResearchRecords);
router.post("/records", createResearchRecord);
router.post("/import", importResearchRecords);
router.get("/courses/:courseId/records", listCourseResearch);
router.get("/records/:id", getResearchRecord);
router.patch("/records/:id", updateResearchRecord);
router.post("/records/:id", updateResearchRecord);
router.post("/records/:id/archive", archiveResearchRecord);
router.delete("/records/:id", deleteResearchRecord);
export default router;

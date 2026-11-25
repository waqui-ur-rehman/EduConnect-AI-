import { Router } from "express";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { loadContent, loadCourseForLesson } from "../middleware/contentGuards.js";
import { listPublic, listMine, listAdmin, createContent, getContent, updateContent, deleteContent, listLessons, createLesson, updateLesson, deleteLesson, publicCatalog, sessionState, submitContent, reviewContent, enroll, unenroll } from "../controllers/contentController.js";
import { uploadContentFile, serveContentFile } from "../controllers/contentFileController.js";

const router = Router();
// Public listings expose only the last Admin-approved, published snapshot.
router.get("/catalog", publicCatalog);
router.get("/images/:id", (req, res, next) => req.cookies?.edc_session ? protect(req, res, next) : next(), serveContentFile(true));
router.use(protect);
router.get("/state", sessionState);
router.post("/files/:kind", authorize("teacher"), uploadContentFile);
router.get("/files/:id", serveContentFile());
router.post("/enrollments", authorize("student"), enroll);
router.delete("/enrollments", authorize("student"), unenroll);
for (const [plural, type] of [["courses", "course"], ["books", "book"]]) {
  router.get(`/${plural}`, listPublic(type));
  router.get(`/${plural}/mine`, authorize("teacher"), listMine(type));
  router.get(`/${plural}/admin`, authorize("admin"), listAdmin(type));
  router.post(`/${plural}`, authorize("teacher"), createContent(type));
  router.post(`/${plural}/:id/submit`, authorize("teacher"), loadContent(type, { edit: true }), submitContent(type));
  router.post(`/${plural}/:id/review`, authorize("admin"), reviewContent(type));
  router.get(`/${plural}/:id`, loadContent(type), getContent);
  router.patch(`/${plural}/:id`, authorize("teacher"), loadContent(type, { edit: true }), updateContent);
  router.delete(`/${plural}/:id`, authorize("teacher"), loadContent(type, { edit: true }), deleteContent(type));
}
router.get("/courses/:courseId/lessons", loadCourseForLesson(), listLessons);
router.post("/courses/:courseId/lessons", authorize("teacher"), loadCourseForLesson({ edit: true }), createLesson);
router.patch("/courses/:courseId/lessons/:lessonId", authorize("teacher"), loadCourseForLesson({ edit: true }), updateLesson);
router.delete("/courses/:courseId/lessons/:lessonId", authorize("teacher"), loadCourseForLesson({ edit: true }), deleteLesson);
export default router;

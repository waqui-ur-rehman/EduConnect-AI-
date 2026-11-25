import { Router } from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  streamNotifications,
} from "../controllers/notificationsController.js";

// Notification inbox: any signed-in role, strictly scoped to the caller's own
// recipientId (enforced inside every controller query).
const router = Router();
router.use(protect);
router.get("/", listNotifications);
router.get("/unread-count", getUnreadCount);
router.get("/stream", streamNotifications);
router.patch("/read-all", markAllNotificationsRead);
router.patch("/:id/read", markNotificationRead);
router.delete("/:id", deleteNotification);
export default router;

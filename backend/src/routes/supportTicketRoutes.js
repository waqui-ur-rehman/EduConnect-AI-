import { Router } from "express";
import { protect } from "../middleware/authMiddleware.js";
import { submitSupportTicket, listMySupportTickets, updateMySupportTicketStatus, submitSupportTicketReply } from "../controllers/adminSupportController.js";

// Student and Teacher facing support ticket routes (controller authorizes the role).
const router = Router();
router.use(protect);
router.post("/tickets", submitSupportTicket);
router.get("/tickets/mine", listMySupportTickets);
router.patch("/tickets/:id", updateMySupportTicketStatus);
router.post("/tickets/:id/replies", submitSupportTicketReply);
export default router;

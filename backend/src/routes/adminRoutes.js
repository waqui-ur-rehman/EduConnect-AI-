import express from "express";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { getAllTeachers, getPendingTeachers, approveTeacher, rejectTeacher } from "../controllers/adminController.js";
import { getPendingVerifications, viewVerificationImage, reviewVerification } from "../controllers/adminVerificationController.js";

import { getPendingVerifications as getPendingStudentVerifications, viewVerificationImage as viewStudentVerificationImage, reviewVerification as reviewStudentVerification } from "../controllers/adminStudentVerificationController.js";

import { listUsers, getUserProfile, suspendOrReactivateUser } from "../controllers/adminUserController.js";
import { listAuditLogs } from "../controllers/adminAuditController.js";
import { reportsOverview, reportsFinance, reportsTickets } from "../controllers/adminReportsController.js";
import {
  listSupportTickets,
  getSupportTicket,
  updateSupportTicketStatus,
  updateSupportTicketPriority,
  assignSupportTicket,
  addSupportTicketReply,
  listSupportTicketStats,
} from "../controllers/adminSupportController.js";
import {
  deleteAdminQueueRecord,
  importAdminQueue,
  listAdminQueue,
  saveAdminQueueRecord,
} from "../controllers/adminQueueController.js";

const router = express.Router();
router.use(protect);

// Teacher management: authenticated Admin only.
router.get("/teachers/pending", authorize("admin"), getPendingTeachers);
router.get("/teachers", authorize("admin"), getAllTeachers);
router.patch("/teachers/:id/approve", authorize("admin"), approveTeacher);
router.patch("/teachers/:id/reject", authorize("admin"), rejectTeacher);

// Identity verification: authenticated Admin only.
router.get("/verifications", authorize("admin"), getPendingVerifications);
router.get("/verifications/:id/document/:side", authorize("admin"), viewVerificationImage);
router.patch("/verifications/:id/:decision", authorize("admin"), reviewVerification);

// Student identity verification, Admin-only
router.get("/student-verifications", authorize("admin"), getPendingStudentVerifications);
router.get("/student-verifications/:id/document/:side", authorize("admin"), viewStudentVerificationImage);
router.patch("/student-verifications/:id/:decision", authorize("admin"), reviewStudentVerification);

// Support tickets: admin routes (registered before the requester routes of the
// /api/support mount so "stats" and list views are distinct from ticket details).
router.get("/support/tickets/stats", authorize("admin"), listSupportTicketStats);
router.get("/support/tickets", authorize("admin"), listSupportTickets);
router.get("/support/tickets/:id", authorize("admin"), getSupportTicket);
router.patch("/support/tickets/:id/status", authorize("admin"), updateSupportTicketStatus);
router.patch("/support/tickets/:id/priority", authorize("admin"), updateSupportTicketPriority);
router.patch("/support/tickets/:id/assign", authorize("admin"), assignSupportTicket);
router.post("/support/tickets/:id/replies", authorize("admin"), addSupportTicketReply);

// Operational review queues without a dedicated domain model: authenticated Admin only.
router.get("/queues/:queue", authorize("admin"), listAdminQueue);
router.post("/queues/:queue/import", authorize("admin"), importAdminQueue);
router.put("/queues/:queue/:recordId", authorize("admin"), saveAdminQueueRecord);
router.delete("/queues/:queue/:recordId", authorize("admin"), deleteAdminQueueRecord);

// User Management (MongoDB-backed): Admin only.
router.get("/users", authorize("admin"), listUsers);
router.get("/users/:id", authorize("admin"), getUserProfile);
router.patch("/users/:id/status", authorize("admin"), suspendOrReactivateUser);

// Audit Logs (MongoDB-backed): Admin only.
router.get("/audit-logs", authorize("admin"), listAuditLogs);

// Reporting and Analytics (MongoDB-backed): Admin only.
router.get("/reports/overview", authorize("admin"), reportsOverview);
router.get("/reports/finance", authorize("admin"), reportsFinance);
router.get("/reports/tickets", authorize("admin"), reportsTickets);

export default router;

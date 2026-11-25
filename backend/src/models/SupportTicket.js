// Support tickets stored in MongoDB. Student and Teacher requests are visible
// to the requester; admins can list, review, reply, assign and resolve them.
import mongoose from "mongoose";

const CATEGORY_VALUES = [
  "Account & Access", "Course Access", "PDF/eBook Problem", "Video Lecture Problem",
  "Enrollment Issue", "Account Problem", "AI Tutor Problem", "Teacher Communication",
  "Certificate Problem", "Payment Failed", "Payment Completed but Course Locked",
  "Duplicate Payment", "Incorrect Purchase Status", "Payment Problem", "Refund Request",
  "Transaction Not Found", "Technical Issue", "Course Upload Error", "PDF/eBook Upload Error",
  "Course Approval Delay", "Teacher Profile Problem", "Student Communication Issue",
  "Earnings Query", "General Inquiry", "Other",
  "Course Content", "Billing & Payment", "Moderation & Appeal",
];

const STATUS_VALUES = ["Open", "In Progress", "Waiting for User", "Resolved", "Closed"];
const PRIORITY_VALUES = ["Low", "Medium", "High", "Urgent"];

const responseSchema = new mongoose.Schema({
  id: { type: String, required: true },
  message: { type: String, required: true, trim: true, minlength: 2, maxlength: 2000 },
  type: { type: String, enum: ["response", "internal_note"], default: "response" },
  author: { type: String, maxlength: 160, default: "" },
  authorRole: { type: String, enum: ["Student", "Teacher", "Admin"], default: "Student" },
  createdAt: { type: Date, default: Date.now },
});

const schema = new mongoose.Schema({
  ticketId: { type: String, required: true, unique: true, maxlength: 120 },
  subject: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
  description: { type: String, required: true, trim: true, minlength: 5, maxlength: 5000 },
  category: { type: String, required: true, maxlength: 60, enum: CATEGORY_VALUES, default: "General Inquiry" },
  priority: { type: String, required: true, maxlength: 20, enum: PRIORITY_VALUES, default: "Medium" },
  status: { type: String, required: true, maxlength: 40, enum: STATUS_VALUES, default: "Open" },
  requesterName: { type: String, maxlength: 120, default: "User" },
  requesterEmail: { type: String, lowercase: true, trim: true, maxlength: 254 },
  requesterRole: { type: String, enum: ["Student", "Teacher"], required: true },
  relatedRecordId: { type: String, maxlength: 254, default: "" },
  relatedRecordTitle: { type: String, maxlength: 300, default: "" },
  assignedStaff: { type: String, maxlength: 160, default: "" },
  assignedBy: { type: String, maxlength: 160, default: "" },
  assignedAt: Date,
  responses: { type: [responseSchema], default: [] },
  resolvedAt: Date,
  closedAt: Date,
}, { timestamps: true });

schema.index({ status: 1, createdAt: -1 });
schema.index({ category: 1, status: 1, createdAt: -1 });
schema.index({ requesterEmail: 1, requesterRole: 1, createdAt: -1 });
schema.index({ relatedRecordId: 1 });
schema.index({ priority: 1, status: 1, createdAt: -1 });

export const SUPPORT_TICKET_STATUSES = STATUS_VALUES;
export const SUPPORT_TICKET_PRIORITIES = PRIORITY_VALUES;
export const SUPPORT_TICKET_CATEGORIES = CATEGORY_VALUES;
export default mongoose.model("SupportTicket", schema, "support_tickets");

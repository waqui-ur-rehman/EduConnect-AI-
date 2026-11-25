import mongoose from "mongoose";

// One earnings record per purchased item per order. Derived from verified paid orders.
const schema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, immutable: true },
  orderNumber: { type: String, required: true, immutable: true, maxlength: 40, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  contentId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  kind: { type: String, enum: ["course", "book"], required: true, immutable: true },
  title: { type: String, required: true, maxlength: 160 },
  teacherId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  grossAmount: { type: Number, required: true, min: 0 },
  commissionAmount: { type: Number, required: true, min: 0 },
  teacherAmount: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, maxlength: 8, default: "PKR" },
  // "demo" marks sandbox-checkout sales; real money is "payment".
  source: { type: String, enum: ["demo", "payment"], default: "payment" },
  status: { type: String, enum: ["earned", "refunded"], default: "earned", index: true },
  refundReference: { type: String, maxlength: 200, default: "" },
  refundedAt: Date,
}, { timestamps: true });
schema.index({ order: 1, contentId: 1 }, { unique: true });
schema.index({ teacherId: 1, createdAt: -1 });
export default mongoose.model("TeacherEarning", schema);

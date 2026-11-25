import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  kind: { type: String, enum: ["course", "book"], required: true, immutable: true },
  contentId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  title: { type: String, required: true, maxlength: 160 },
  teacherId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  price: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, maxlength: 8, default: "PKR" },
}, { _id: false });

const schema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  orderNumber: { type: String, required: true, unique: true, immutable: true, maxlength: 40 },
  items: { type: [itemSchema], required: true, validate: [(value) => value.length > 0 && value.length <= 100, "Order must contain 1-100 items."] },
  total: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, maxlength: 8, default: "PKR" },
  status: { type: String, enum: ["initiated", "pending", "paid", "failed", "cancelled", "refunded", "expired"], default: "pending" },
  amountMinor: { type: Number, min: 0, default: 0 },
  environment: { type: String, enum: ["sandbox", "live"], default: "sandbox" },
  providerOrderId: { type: String, maxlength: 120, default: null },
  verification: {
    verifiedAt: Date,
    method: { type: String, maxlength: 40, default: "" },
    detail: { type: String, maxlength: 200, default: "" },
  },
  idempotencyKey: { type: String, maxlength: 128 },
  fingerprint: { type: String, maxlength: 64 },
  provider: { type: String, maxlength: 40, default: "" },
  providerTransactionId: { type: String, maxlength: 200, default: null },
  paidAt: Date,
  cancelledAt: Date,
  refundedAt: Date,
}, { timestamps: true });
// One in-flight order per student per identical cart keeps double-checkout safe.
schema.index({ studentId: 1, fingerprint: 1 }, { unique: true, partialFilterExpression: { status: "pending" } });
schema.index({ studentId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } });
schema.index({ status: 1, createdAt: -1 });
schema.index({ studentId: 1, createdAt: -1 });
// One provider transaction can settle exactly one order, ever.
schema.index({ provider: 1, providerTransactionId: 1 }, { unique: true, partialFilterExpression: { providerTransactionId: { $type: "string" } } });
export default mongoose.model("Order", schema);

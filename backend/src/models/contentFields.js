import mongoose from "mongoose";

// Working content and the last reviewed snapshot live in the same document.
// One conditional write prevents partially published lessons or stale reviews.
export const contentFields = {
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true, immutable: true },
  title: { type: String, trim: true, required: true, maxlength: 160 },
  description: { type: String, default: "", maxlength: 5000 },
  status: { type: String, enum: ["draft", "pending", "approved", "published", "rejected", "suspended", "deleted"], default: "draft" },
  revision: { type: Number, default: 0 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  approvedVersion: { type: mongoose.Schema.Types.Mixed, default: null },
  published: { type: Boolean, default: false },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  reviewedAt: Date,
  submittedAt: Date,
  rejectionReason: { type: String, default: "" },
  legacyId: String,
};

export function contentIndexes(schema) {
  schema.index({ published: 1, createdAt: -1 });
  // Teacher dashboards list owned content newest-first, while reporting uses
  // exact publication states. Keep these separate from the legacy-id unique
  // index, whose middle key cannot support either sort.
  schema.index({ teacherId: 1, createdAt: -1 });
  schema.index({ status: 1, published: 1, createdAt: -1 });
  schema.index({ teacherId: 1, legacyId: 1 }, { unique: true, partialFilterExpression: { legacyId: { $type: "string" } } });
}

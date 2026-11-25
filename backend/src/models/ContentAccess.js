import mongoose from "mongoose";

const schema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  contentId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  kind: { type: String, enum: ["course", "book"], required: true, immutable: true },
  source: { type: String, enum: ["free", "demo", "payment", "admin"], required: true },
  price: { type: Number, required: true, min: 0 },
}, { timestamps: true });
schema.index({ studentId: 1, kind: 1, contentId: 1 }, { unique: true });
// Course rosters, teacher analytics and enrollment aggregates start from the
// content side rather than the student side.
schema.index({ kind: 1, contentId: 1, studentId: 1 });
schema.index({ kind: 1, createdAt: -1 });
export default mongoose.model("ContentAccess", schema);

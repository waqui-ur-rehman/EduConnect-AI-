import mongoose from "mongoose";

const schema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  type: { type: String, enum: ["project", "paper", "matrix", "reference", "dataset", "experiment"], required: true },
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  courseId: { type: mongoose.Schema.Types.ObjectId, default: null },
  tags: { type: [String], default: [] },
  status: { type: String, maxlength: 40, default: "" },
}, { timestamps: true });

schema.index({ ownerId: 1, type: 1, createdAt: -1 });
schema.index({ ownerId: 1, createdAt: -1, _id: -1 });
schema.index({ ownerId: 1, courseId: 1, createdAt: -1 });
schema.index({ ownerId: 1, tags: 1 });
schema.index({ ownerId: 1, type: 1, title: 1 });

export default mongoose.model("ResearchRecord", schema, "research_records");

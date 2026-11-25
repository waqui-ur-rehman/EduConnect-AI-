import mongoose from "mongoose";
const schema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true, trim: true, minlength: 3, maxlength: 1000 },
  moderated: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ courseId: 1, studentId: 1 }, { unique: true });
schema.index({ courseId: 1, moderated: 1, createdAt: -1 });
schema.index({ studentId: 1, updatedAt: -1 });
export default mongoose.model("CourseReview", schema);


import mongoose from "mongoose";
const schema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  lessonId: { type: String, required: true, maxlength: 160 },
  completedAt: { type: Date, default: Date.now },
}, { timestamps: true });
schema.index({ studentId: 1, courseId: 1, lessonId: 1 }, { unique: true });
schema.index({ studentId: 1, createdAt: -1 });
schema.index({ courseId: 1, studentId: 1 });
export default mongoose.model("LessonProgress", schema);

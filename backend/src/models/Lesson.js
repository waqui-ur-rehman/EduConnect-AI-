import mongoose from "mongoose";
const lessonSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "OwnedCourse", required: true, immutable: true },
  title: { type: String, trim: true, required: true, maxlength: 160 },
  content: { type: String, default: "", maxlength: 20000 },
  order: { type: Number, min: 0, max: 10000, default: 0 },
}, { timestamps: true, strict: "throw" });
lessonSchema.index({ courseId: 1, order: 1, _id: 1 });
export default mongoose.model("OwnedLesson", lessonSchema, "owned_lessons");

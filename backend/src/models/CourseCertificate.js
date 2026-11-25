import mongoose from "mongoose";
const schema = new mongoose.Schema({
  certificateId: { type: String, required: true, unique: true, immutable: true, maxlength: 32 },
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true, index: true },
  courseTitle: { type: String, required: true, maxlength: 160 },
  studentName: { type: String, required: true, maxlength: 100 },
  completedAt: { type: Date, required: true },
  issuedAt: { type: Date, default: Date.now },
}, { timestamps: true });
schema.index({ studentId: 1, courseId: 1 }, { unique: true });
export default mongoose.model("CourseCertificate", schema);

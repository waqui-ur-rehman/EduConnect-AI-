import mongoose from "mongoose";
const schema = new mongoose.Schema({
  quizId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  sessionId: { type: String, required: true, immutable: true },
  revision: { type: Number, required: true, immutable: true },
  startedAt: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
schema.index({ quizId: 1, studentId: 1, sessionId: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });
export default mongoose.model("QuizSession", schema);

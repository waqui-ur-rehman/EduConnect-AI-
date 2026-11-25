import mongoose from "mongoose";
const schema = new mongoose.Schema({
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: "CourseQuiz", required: true, immutable: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  sessionId: { type: String, required: true, maxlength: 100, immutable: true },
  quizRevision: { type: Number, required: true },
  answers: { type: mongoose.Schema.Types.Mixed, required: true },
  correct: Number, total: Number, percentage: Number, passed: Boolean,
  submittedAt: { type: Date, default: Date.now },
}, { timestamps: true });
schema.index({ quizId: 1, studentId: 1, sessionId: 1 }, { unique: true });
schema.index({ quizId: 1, submittedAt: -1 });
schema.index({ studentId: 1, courseId: 1, submittedAt: -1 });
schema.index({ courseId: 1, quizId: 1, submittedAt: 1 });
export default mongoose.model("QuizAttempt", schema);


import mongoose from "mongoose";
const questionSchema = new mongoose.Schema({
  id: { type: String, required: true, maxlength: 100 },
  prompt: { type: String, required: true, maxlength: 2000 },
  options: { type: [String], required: true, validate: v => v.length === 4 },
  correct: { type: Number, required: true, min: 0, max: 3 },
}, { _id: false });
const schema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "OwnedCourse", required: true, immutable: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true, immutable: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  passingScore: { type: Number, min: 0, max: 100, default: 60 },
  timeLimit: { type: Number, min: 0, max: 180, default: 0 },
  questions: { type: [questionSchema], required: true },
  published: { type: Boolean, default: false },
  revision: { type: Number, default: 0 },
  legacyId: { type: String, maxlength: 100, immutable: true },
}, { timestamps: true });
schema.index({ teacherId: 1, courseId: 1, updatedAt: -1 });
schema.index({ courseId: 1, published: 1, createdAt: 1 });
schema.index({ teacherId: 1, courseId: 1, legacyId: 1 }, { unique: true, partialFilterExpression: { legacyId: { $type: "string" } } });
const CourseQuiz = mongoose.model("CourseQuiz", schema);
export default CourseQuiz;

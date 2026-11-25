import mongoose from "mongoose";

const curriculumSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "OwnedCourse", required: true, immutable: true, unique: true, index: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true, immutable: true, index: true },
  curriculum: { type: mongoose.Schema.Types.Mixed, required: true },
  approvedCurriculum: { type: mongoose.Schema.Types.Mixed, default: null },
  courseRevision: { type: Number, required: true, min: 0 },
  status: { type: String, required: true },
  published: { type: Boolean, default: false },
}, { timestamps: true, strict: "throw" });

export default mongoose.model("CourseCurriculum", curriculumSchema, "course_curriculums");

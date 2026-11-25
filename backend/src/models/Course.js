import mongoose from "mongoose";
import { contentFields, contentIndexes } from "./contentFields.js";
const courseSchema = new mongoose.Schema({
  ...contentFields,
  // Undefined distinguishes original Part C records using owned_lessons.
  lessons: { type: [mongoose.Schema.Types.Mixed], default: undefined },
}, { timestamps: true, strict: "throw" });
contentIndexes(courseSchema);
export default mongoose.model("OwnedCourse", courseSchema, "owned_courses");

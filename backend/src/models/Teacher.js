import mongoose from "mongoose";
import { userSchema } from "./User.js";

const teacherSchema = userSchema.clone();
teacherSchema.index({ teacherStatus: 1, createdAt: -1 });
const Teacher = mongoose.model("Teacher", teacherSchema, "teachers");
export default Teacher;

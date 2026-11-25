import mongoose from "mongoose";
import { userSchema } from "./User.js";

const Student = mongoose.model("Student", userSchema.clone().add({
  interests: { type: [String], default: [], trim: true },
  learningGoals: { type: [String], default: [], trim: true },
}), "students");
export default Student;

import mongoose from "mongoose";
import { contentFields, contentIndexes } from "./contentFields.js";
const bookSchema = new mongoose.Schema({
  ...contentFields,
}, { timestamps: true, strict: "throw" });
contentIndexes(bookSchema);
export default mongoose.model("OwnedTeacherBook", bookSchema, "owned_teacher_books");

import mongoose from "mongoose";

const documentSchema = new mongoose.Schema({
  relativePath: { type: String, required: true },
  mimeType: { type: String, enum: ["image/jpeg", "image/png", "image/webp"], required: true },
}, { _id: false });

function createVerificationModel(name, collection, accountModel) {
  const schema = new mongoose.Schema({
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: accountModel, required: true, unique: true, immutable: true },
    fullName: { type: String, required: true },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    status: { type: String, enum: ["not_submitted", "pending", "verified", "rejected"], default: "not_submitted" },
    documents: {
      front: documentSchema,
      back: documentSchema,
    },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    rejectionReason: { type: String, default: "" },
  }, { timestamps: true });

  schema.index({ status: 1, submittedAt: -1 });

  return mongoose.model(name, schema, collection);
}

export const StudentVerification = createVerificationModel("StudentVerification", "student_verifications", "Student");
export const TeacherVerification = createVerificationModel("TeacherVerification", "teacher_verifications", "Teacher");

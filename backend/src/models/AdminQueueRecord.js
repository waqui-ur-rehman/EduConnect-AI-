import mongoose from "mongoose";

const adminQueueRecordSchema = new mongoose.Schema(
  {
    queue: {
      type: String,
      required: true,
      enum: [
        "knowledge",
        "moderation-reports",
        "moderation-policies",
        "tutor-profiles",
        "tutor-bookings",
      ],
      index: true,
    },
    recordId: { type: String, required: true, trim: true, maxlength: 300 },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    createdBy: { type: String, trim: true, maxlength: 254, default: "admin" },
    updatedBy: { type: String, trim: true, maxlength: 254, default: "admin" },
  },
  { timestamps: true },
);

adminQueueRecordSchema.index({ queue: 1, recordId: 1 }, { unique: true });

export default mongoose.models.AdminQueueRecord
  || mongoose.model("AdminQueueRecord", adminQueueRecordSchema);

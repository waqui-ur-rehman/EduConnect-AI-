import mongoose from "mongoose";

const schema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, required: true },
  type: { type: String, required: true, maxlength: 60 },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  message: { type: String, required: true, trim: true, maxlength: 500 },
  link: { type: String, maxlength: 200, default: "" },
  read: { type: Boolean, default: false },
  idempotencyKey: { type: String, trim: true, maxlength: 160 },
}, { timestamps: true });

schema.index({ recipientId: 1, createdAt: -1 });
schema.index({ recipientId: 1, read: 1, createdAt: -1 });
// Unique per supplied key (keys are recipient-scoped by the service). The
// partial filter keeps documents without a key out of the unique index.
schema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } });

export default mongoose.model("Notification", schema, "notifications");

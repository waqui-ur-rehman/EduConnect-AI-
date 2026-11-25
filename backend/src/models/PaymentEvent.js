import mongoose from "mongoose";

// Replay protection for provider callbacks. Stores no card or credential data.
const schema = new mongoose.Schema({
  provider: { type: String, required: true, immutable: true, maxlength: 40 },
  eventId: { type: String, required: true, immutable: true, maxlength: 200 },
  type: { type: String, required: true, maxlength: 80 },
  orderNumber: { type: String, maxlength: 40, default: "" },
  result: { type: String, enum: ["processed", "ignored", "rejected"], default: "ignored" },
}, { timestamps: true });
schema.index({ provider: 1, eventId: 1 }, { unique: true });
export default mongoose.model("PaymentEvent", schema);

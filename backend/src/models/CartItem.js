import mongoose from "mongoose";

// Digital products carry no quantity: presence in the cart is the unit.
const schema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  kind: { type: String, enum: ["course", "book"], required: true, immutable: true },
  contentId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
}, { timestamps: true });
schema.index({ studentId: 1, kind: 1, contentId: 1 }, { unique: true });
export default mongoose.model("CartItem", schema);

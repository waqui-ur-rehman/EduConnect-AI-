import mongoose from "mongoose";

const schema = new mongoose.Schema({
  teacherId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true, index: true },
  storageName: { type: String, required: true, immutable: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  kind: { type: String, enum: ["video", "pdf", "preview", "image", "document"], required: true },
}, { timestamps: true });
export default mongoose.model("ContentFile", schema);

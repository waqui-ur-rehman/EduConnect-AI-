import mongoose from "mongoose";

// Centralized admin audit trail. No passwords, tokens, card data or raw documents.
const schema = new mongoose.Schema({
  actorEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  actorRole: { type: String, required: true, maxlength: 40 },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  action: { type: String, required: true, trim: true, maxlength: 160 },
  category: { type: String, required: true, maxlength: 40 },
  module: { type: String, maxlength: 80, default: "" },
  entityType: { type: String, maxlength: 80, default: "" },
  entityId: { type: String, maxlength: 160, default: "" },
  targetId: { type: String, maxlength: 160, default: "" },
  targetName: { type: String, maxlength: 160, default: "" },
  result: { type: String, maxlength: 80, default: "" },
  description: { type: String, maxlength: 1000, default: "" },
  details: { type: mongoose.Schema.Types.Mixed, default: null },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: true });

schema.index({ category: 1, timestamp: -1 });
schema.index({ action: 1, timestamp: -1 });
schema.index({ actorId: 1, timestamp: -1 });
schema.index({ actorEmail: 1, timestamp: -1 });
schema.index({ timestamp: -1 });
schema.index({ entityType: 1, entityId: 1, timestamp: -1 });
schema.index({ result: 1, timestamp: -1 });

export default mongoose.model("AuditLog", schema, "audit_logs");

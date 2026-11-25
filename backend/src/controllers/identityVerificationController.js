import mongoose from "mongoose";
import { detectImageType, writePrivateCnic, readPrivateCnic, removePrivateCnic } from "../services/privateCnicStorage.js";
import { getAccountVerification, verificationModelForRole } from "../services/verificationRecords.js";
import { recordAdminAction } from "../services/auditService.js";

function publicStatus(record, account) {
  const status = record?.status || "not_submitted";
  return {
    cnicStatus: status,
    submittedAt: record?.submittedAt || null,
    reviewedAt: record?.reviewedAt || null,
    rejectionReason: status === "rejected" ? record.rejectionReason || "" : "",
    isIdentityVerified: status === "verified",
    ...(account.role === "teacher" ? { teacherStatus: account.teacherStatus, canUploadContent: true } : {}),
  };
}

export function createVerificationHandlers(Model) {
  const Verification = verificationModelForRole(Model.modelName === "Student" ? "student" : "teacher");
  async function getVerificationStatus(req, res, next) {
    try {
      const account = await Model.findById(req.user._id);
      if (!account) return res.status(404).json({ success: false, message: "Account not found." });
      const record = await getAccountVerification(account);
      res.json({ success: true, verification: publicStatus(record, account) });
    } catch (error) { next(error); }
  }

  async function submitVerification(req, res, next) {
    const newPaths = [];
    let committed = false;
    try {
      const account = await Model.findById(req.user._id);
      if (!account) return res.status(404).json({ success: false, message: "Account not found." });
      const previous = await getAccountVerification(account);
      if (["pending", "verified"].includes(previous?.status)) {
        return res.status(409).json({ success: false, message: "Verification is already under review or verified." });
      }
      const front = req.files?.cnicFront?.[0];
      const back = req.files?.cnicBack?.[0];
      if (!front || !back) return res.status(400).json({ success: false, message: "Both front and back images are required." });
      for (const file of [front, back]) {
        if (!detectImageType(file.buffer) || detectImageType(file.buffer) !== file.mimetype || file.buffer.length < 32) {
          return res.status(400).json({ success: false, message: "Invalid image content. Use JPG, PNG or WebP images." });
        }
      }

      const frontPath = await writePrivateCnic(front.buffer);
      newPaths.push(frontPath);
      const backPath = await writePrivateCnic(back.buffer);
      newPaths.push(backPath);
      const updated = await Verification.findOneAndUpdate({
        accountId: account._id,
        status: { $nin: ["pending", "verified"] },
      }, { $set: {
        fullName: account.fullName,
        email: account.email,
        documents: {
          front: { relativePath: frontPath, mimeType: front.mimetype },
          back: { relativePath: backPath, mimeType: back.mimetype },
        },
        status: "pending",
        submittedAt: new Date(),
        reviewedAt: null,
        reviewedBy: null,
        rejectionReason: "",
      } }, { upsert: true, returnDocument: "after", runValidators: true });

      committed = true;
      const oldPaths = [previous?.documents?.front?.relativePath, previous?.documents?.back?.relativePath].filter(Boolean);
      await Promise.all(oldPaths.map(savedPath => removePrivateCnic(savedPath).catch(error => {
        console.error("Could not remove replaced CNIC file", error.code);
      })));
      res.status(201).json({ success: true, message: "Verification submitted for Admin review.", verification: publicStatus(updated, account) });
    } catch (error) {
      if (!committed) await Promise.all(newPaths.map(savedPath => removePrivateCnic(savedPath).catch(() => {})));
      if (error.code === 11000) return res.status(409).json({ success: false, message: "Another verification request has already been submitted." });
      next(error);
    }
  }

  async function getPendingVerifications(req, res, next) {
    try {
      const records = await Verification.find({ status: "pending" })
        .select("accountId status submittedAt reviewedAt rejectionReason")
        .populate({ path: "accountId", select: "fullName email role teacherStatus" })
        .sort({ submittedAt: -1 });
      const verifications = records.filter(record => record.accountId).map(record => ({
        id: record.accountId._id,
        verificationId: record._id,
        fullName: record.accountId.fullName,
        email: record.accountId.email,
        role: record.accountId.role,
        ...publicStatus(record, record.accountId),
      }));
      res.json({ success: true, count: verifications.length, verifications });
    } catch (error) { next(error); }
  }

  async function viewVerificationImage(req, res, next) {
    try {
      const { id, side } = req.params;
      if (!mongoose.isValidObjectId(id) || !["front", "back"].includes(side)) {
        return res.status(400).json({ success: false, message: "Invalid document request." });
      }
      const account = await Model.findById(id);
      const record = account && await getAccountVerification(account);
      const document = record?.documents?.[side];
      if (!document?.relativePath) return res.status(404).json({ success: false, message: "Document not found." });
      const buffer = await readPrivateCnic(document.relativePath);
      res.set({ "Content-Type": document.mimeType, "Content-Disposition": "inline", "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" });
      res.send(buffer);
    } catch (error) { next(error); }
  }

  async function reviewVerification(req, res, next) {
    try {
      const { id, decision } = req.params;
      if (!mongoose.isValidObjectId(id) || !["approve", "reject"].includes(decision)) {
        return res.status(400).json({ success: false, message: "Invalid verification decision." });
      }
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      if (decision === "reject" && (reason.length < 5 || reason.length > 500)) {
        return res.status(400).json({ success: false, message: "Please provide a review reason (5–500 characters)." });
      }
      const account = await Model.findById(id);
      if (!account) return res.status(404).json({ success: false, message: "Account not found." });
      const record = await getAccountVerification(account);
      if (record?.status !== "pending") {
        return res.status(409).json({ success: false, message: "Only pending verification requests can be reviewed." });
      }
      const documents = record.documents;
      if (!documents?.front?.relativePath || !documents?.back?.relativePath) {
        return res.status(409).json({ success: false, message: "Verification documents are missing." });
      }
      if (decision === "approve") {
        await Promise.all([documents.front, documents.back].map(async document => {
          const buffer = await readPrivateCnic(document.relativePath);
          if (detectImageType(buffer) !== document.mimeType) throw new Error("Verification document is unreadable.");
        }));
      }
      const updated = await Verification.findOneAndUpdate({
        _id: record._id,
        status: "pending",
        submittedAt: record.submittedAt,
      }, { $set: {
        status: decision === "approve" ? "verified" : "rejected",
        reviewedAt: new Date(),
        reviewedBy: req.user._id,
        rejectionReason: decision === "reject" ? reason : "",
      } }, { returnDocument: "after", runValidators: true });
      if (!updated) return res.status(409).json({ success: false, message: "This verification request has already been reviewed. Refresh the list." });
      await recordAdminAction({
        actorEmail: req.user.email, actorRole: req.user.role, actorId: req.user._id,
        action: decision === "approve" ? "Identity verification approved" : "Identity verification rejected",
        category: Model.modelName === "Teacher" ? "teacher-verification" : "student-verification",
        module: "Identity Verification",
        entityType: Model.modelName === "Teacher" ? "Teacher Verification" : "Student Verification",
        entityId: String(account._id), targetId: String(account._id),
        targetName: account.email, result: decision === "approve" ? "Verified" : "Rejected",
        description: `${req.user.fullName || req.user.email} ${decision === "approve" ? "approved" : "rejected"} the ${Model.modelName.toLowerCase()} verification of ${account.email}.`,
        details: { before: { status: record?.status || "pending" }, after: { status: updated.status } },
      });
      res.json({ success: true, message: `Verification ${decision === "approve" ? "approved" : "rejected"}.`, verification: publicStatus(updated, account) });
    } catch (error) { next(error); }
  }

  return { getVerificationStatus, submitVerification, getPendingVerifications, viewVerificationImage, reviewVerification };
}

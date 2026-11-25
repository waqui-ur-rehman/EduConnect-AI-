import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import { StudentVerification, TeacherVerification } from "../models/IdentityVerification.js";

export function verificationModelForRole(role) {
  if (role === "student") return StudentVerification;
  if (role === "teacher") return TeacherVerification;
  throw new Error("Identity verification is available for students and teachers.");
}

function legacyDocument(document) {
  if (!document) return undefined;
  return { relativePath: document.relativePath || document.fileId, mimeType: document.mimeType };
}

function legacyRecord(account) {
  const status = account.cnicVerification?.status || "not_submitted";
  const documents = {
    front: legacyDocument(account.verificationDocuments?.front),
    back: legacyDocument(account.verificationDocuments?.back),
  };
  if (status === "not_submitted" && !documents.front?.relativePath && !documents.back?.relativePath) return null;
  return {
    accountId: account._id,
    fullName: account.fullName,
    email: account.email,
    status,
    documents,
    submittedAt: account.cnicVerification?.submittedAt || null,
    reviewedAt: account.cnicVerification?.reviewedAt || null,
    reviewedBy: account.cnicVerification?.reviewedBy || null,
    rejectionReason: account.cnicVerification?.rejectionReason || "",
  };
}

async function copyLegacyRecord(Verification, record) {
  try {
    return await Verification.updateOne({ accountId: record.accountId }, { $setOnInsert: record }, { upsert: true, runValidators: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    // A concurrent migration or submission has already created this account's record.
    return { upsertedCount: 0 };
  }
}

async function migrateLegacyAccount(Account, Verification, account) {
  const record = legacyRecord(account);
  if (!record) return { upsertedCount: 0 };
  const result = await copyLegacyRecord(Verification, record);
  const saved = await Verification.findOne({ accountId: account._id });
  const sameDocuments = ["front", "back"].every(side =>
    (saved?.documents?.[side]?.relativePath || "") === (record.documents?.[side]?.relativePath || ""),
  );
  if (saved?.status === record.status && sameDocuments &&
      String(saved.submittedAt || "") === String(record.submittedAt || "") &&
      String(saved.reviewedAt || "") === String(record.reviewedAt || "")) {
    await Account.collection.updateOne({
      _id: account._id,
      cnicVerification: account.cnicVerification || { $exists: false },
      verificationDocuments: account.verificationDocuments || { $exists: false },
    }, { $unset: { cnicVerification: "", verificationDocuments: "" } });
  }
  return result;
}

export async function getAccountVerification(account) {
  const Verification = verificationModelForRole(account.role);
  const existing = await Verification.findOne({ accountId: account._id });
  if (existing) return existing;

  const Account = account.role === "student" ? Student : Teacher;
  const previous = await Account.collection.findOne({ _id: account._id }, {
    projection: { fullName: 1, email: 1, cnicVerification: 1, verificationDocuments: 1 },
  });
  if (!previous || !legacyRecord(previous)) return null;
  await migrateLegacyAccount(Account, Verification, previous);
  return Verification.findOne({ accountId: account._id });
}

export async function migrateVerificationRecords() {
  const counts = { students: 0, teachers: 0 };
  for (const [role, Account] of [["student", Student], ["teacher", Teacher]]) {
    const Verification = verificationModelForRole(role);
    await Verification.init();
    const cursor = Account.collection.find({ $or: [
      { "cnicVerification.status": { $in: ["pending", "verified", "rejected"] } },
      { "verificationDocuments.front.relativePath": { $exists: true } },
      { "verificationDocuments.back.relativePath": { $exists: true } },
      { "verificationDocuments.front.fileId": { $exists: true } },
      { "verificationDocuments.back.fileId": { $exists: true } },
    ] }, { projection: { fullName: 1, email: 1, cnicVerification: 1, verificationDocuments: 1 } });
    try {
      for await (const account of cursor) {
        const result = await migrateLegacyAccount(Account, Verification, account);
        counts[`${role}s`] += result.upsertedCount || 0;
      }
    } finally { await cursor.close(); }
  }
  return counts;
}

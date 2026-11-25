import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { passwordInput } from "../utils/passwordPolicy.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import Admin from "../models/Admin.js";
import PasswordResetToken from "../models/PasswordResetToken.js";
import { sendResetEmail } from "../services/passwordResetMailer.js";
import { clearSessionCookie } from "../utils/sessionCookie.js";

const models = { student: Student, teacher: Teacher, admin: Admin };
const genericMessage = "If an account exists for that email, password reset instructions will be sent.";
const requestSchema = z.object({ email: z.email() }).strict();
const resetSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i),
  password: passwordInput(10)
}).strict();
const sha256 = value => createHash("sha256").update(value).digest("hex");

async function findAccount(email) {
  for (const Model of Object.values(models)) {
    const account = await Model.findOne({ email }).select("+sessionVersion");
    if (account) return account;
  }
  return null;
}

export async function forgotPassword(req, res, next) {
  const body = requestSchema.safeParse(req.body);
  // Finish every public response before account lookup or SMTP work. SMTP delay
  // and failures must not disclose whether an email address has an account.
  res.json({ success: true, message: genericMessage });
  if (!body.success) return;
  setImmediate(async () => {
    let tokenHash;
    try {
      const email = body.data.email.trim().toLowerCase();
      const user = await findAccount(email);
      if (!user?.isActive) return;
      const rawToken = randomBytes(32).toString("hex");
      tokenHash = sha256(rawToken);
      await PasswordResetToken.deleteMany({ userId: user._id, role: user.role });
      await PasswordResetToken.create({ tokenHash, userId: user._id, role: user.role,
        sessionVersion: user.sessionVersion || 0, expiresAt: new Date(Date.now() + 20 * 60 * 1000) });
      await sendResetEmail(email, rawToken);
    } catch {
      if (tokenHash) await PasswordResetToken.deleteOne({ tokenHash }).catch(() => {});
      console.error("Password reset delivery unavailable.");
    }
  });
}

export async function resetPassword(req, res, next) {
  try {
    const body = resetSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ success: false, message: "Invalid reset request. Use at least 10 characters and at most 72 UTF-8 bytes." });

    const tokenHash = sha256(body.data.token.toLowerCase());
    // Atomic consumption prevents the same token being used twice.
    const reset = await PasswordResetToken.findOneAndDelete({ tokenHash, expiresAt: { $gt: new Date() }, sessionVersion: { $type: "number" } });
    if (!reset) return res.status(400).json({ success: false, message: "Reset link is invalid or expired. Request a new link." });

    const Model = models[reset.role];
    const password = await bcrypt.hash(body.data.password, 12);
    const version = reset.sessionVersion === 0 ? { $or: [{ sessionVersion: 0 }, { sessionVersion: { $exists: false } }] }
      : { sessionVersion: reset.sessionVersion };
    // Password replacement and session revocation are one conditional write.
    // A concurrent logout or another reset cannot move the session counter back.
    const user = Model && await Model.findOneAndUpdate({ _id: reset.userId, isActive: true, ...version },
      { $set: { password }, $inc: { sessionVersion: 1 } }, { returnDocument: "after", runValidators: true });
    if (!user) return res.status(400).json({ success: false, message: "Reset link is invalid or expired. Request a new link." });
    await PasswordResetToken.deleteMany({ userId: user._id, role: user.role, sessionVersion: { $lte: reset.sessionVersion } });
    clearSessionCookie(res);
    res.json({ success: true, message: "Password updated. Please log in using your new password." });
  } catch (error) { next(error); }
}

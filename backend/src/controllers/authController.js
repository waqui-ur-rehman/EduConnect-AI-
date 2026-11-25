
import { z } from "zod";
import bcrypt from "bcryptjs";

import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import Admin from "../models/Admin.js";
import generateToken from "../utils/generateToken.js";
import { setSessionCookie, clearSessionCookie } from "../utils/sessionCookie.js";
import { getAccountVerification } from "../services/verificationRecords.js";
import { passwordInput } from "../utils/passwordPolicy.js";

const accountModels = [Student, Teacher, Admin];

// Comparing against an artificial hash when an email is not registered
// reduces the difference between unknown-email and wrong-password responses.
// It is not a guarantee of identical timing, and should be combined with limits.
const dummyLoginHash = bcrypt.hashSync("EduConnect-invalid-account-timing", 12);
const invalidLogin = (res) => res.status(401).json({
  success: false,
  message: "Invalid email or password"
});

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.email(),
  password: passwordInput(8),
  role: z.enum(["student", "teacher"])
}).strict();

const loginSchema = z.object({
  email: z.email(),
  password: passwordInput(1)
}).strict();

const findAccount = async (email) => {
  for (const Model of accountModels) {
    const user = await Model.findOne({ email })
      .select("+password +sessionVersion");

    if (user) return user;
  }

  return null;
};

// Only return safe profile and verification status fields.
// Do not expose CNIC documents or sensitive identity data.
const publicUser = async (user) => {
  const data = {
    id: user._id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    isVerified: user.isVerified,
    teacherStatus: user.teacherStatus
  };

  if (["teacher", "student"].includes(user.role)) {
    const record = await getAccountVerification(user);
    const cnicStatus = record?.status || "not_submitted";

    data.cnicVerification = {
      status: cnicStatus,
      submittedAt:
        record?.submittedAt || null,
      reviewedAt:
        record?.reviewedAt || null,
      rejectionReason: cnicStatus === "rejected" ? record.rejectionReason || "" : ""
    };

    data.isIdentityVerified = cnicStatus === "verified";
    data.isVerified = data.isIdentityVerified;
    if (user.role === "teacher") data.canUploadContent = true;
  }

  return data;
};

// Student and Teacher Registration
export const register = async (req, res, next) => {
  try {
    const result = registerSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid registration details"
      });
    }

    const { fullName, password, role } = result.data;
    const email = result.data.email.trim().toLowerCase();

    const existingUser = await findAccount(email);

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message:
          "This email is already registered. Please log in."
      });
    }

    const Model = role === "teacher" ? Teacher : Student;

    const user = await Model.create({
      fullName,
      email,
      password,
      role,
      teacherStatus:
        role === "teacher" ? "pending" : "not_applicable"
    });

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      user: await publicUser(user)
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Email already registered"
      });
    }

    next(error);
  }
};

// Student, Teacher and Admin Login
export const login = async (req, res, next) => {
  try {
    const result = loginSchema.safeParse(req.body);

    if (!result.success) {
      // Do not reveal whether a registered account exists.
      return invalidLogin(res);
    }

    const email = result.data.email.trim().toLowerCase();
    const user = await findAccount(email);

    if (!user) {
      await bcrypt.compare(result.data.password, dummyLoginHash);
      return invalidLogin(res);
    }

    const correctPassword = await user.comparePassword(
      result.data.password
    );

    if (!correctPassword) {
      return invalidLogin(res);
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account is disabled"
      });
    }

    user.lastLogin = new Date();
    await user.save();

    setSessionCookie(res, generateToken(user));
    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: await publicUser(user)
    });
  } catch (error) {
    next(error);
  }
};

// Return current logged-in user
export const getMe = async (req, res, next) => {
  try {
    return res.status(200).json({ success: true, user: await publicUser(req.user) });
  } catch (error) { next(error); }
};

export const getStudentProfileVerification = async (req, res, next) => {
  try {
    const email = String(req.params.email || "").trim().toLowerCase();
    if (!z.email().safeParse(email).success) {
      return res.status(400).json({ success: false, message: "Invalid student email." });
    }
    const student = await Student.findOne({ email, isActive: true }).select("_id role");
    if (!student) return res.status(404).json({ success: false, message: "Student profile not found." });
    const record = await getAccountVerification(student);
    res.json({ success: true, profile: { isIdentityVerified: record?.status === "verified" } });
  } catch (error) { next(error); }
};

// Logout revokes all currently issued sessions for this account.
export const logout = async (req, res, next) => {
  try {
    await req.user.constructor.updateOne({ _id: req.user._id }, { $inc: { sessionVersion: 1 } });
    clearSessionCookie(res);
    res.json({ success: true, message: "Logged out" });
  } catch (error) { next(error); }
};

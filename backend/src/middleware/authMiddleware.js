import jwt from "jsonwebtoken";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import Admin from "../models/Admin.js";
import { sessionCookieName } from "../utils/sessionCookie.js";
const accountModels = [Student, Teacher, Admin];

export const protect = async (req, res, next) => {
  try {
    const token = req.cookies?.[sessionCookieName];
    if (!token) return res.status(401).json({ success: false, message: "Session missing. Please log in." });
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (!decoded.userId || !decoded.role || !Number.isInteger(decoded.sv)) throw Error("Invalid session claims");
    const accountModel = accountModels.find((Model) => Model.modelName.toLowerCase() === decoded.role);
    if (!accountModel) throw Error("Invalid session role");
    const user = await accountModel.findById(decoded.userId).select("+sessionVersion");
    if (!user || !user.isActive || user.role !== decoded.role || (user.sessionVersion ?? 0) !== decoded.sv) {
      return res.status(401).json({ success: false, message: "Session expired or revoked." });
    }
    req.user = user;
    next();
  } catch { return res.status(401).json({ success: false, message: "Invalid or expired session." }); }
};
export const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ success: false, message: "Access denied." });
  next();
};
export const approvedTeacher = (req, res, next) => {
  if (!req.user || req.user.role !== "teacher") return res.status(403).json({ success: false, message: "Teacher access required." });
  next();
};

import mongoose from "mongoose";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import Admin from "../models/Admin.js";
import { getAccountVerification } from "../services/verificationRecords.js";
import { recordAdminAction } from "../services/auditService.js";

const USER_MODELS = [Student, Teacher, Admin];
const fail = (res, code, message, extra = {}) => res.status(code).json({ success: false, message, ...extra });
const handle = (action) => async (req, res, next) => {
  try { await action(req, res); }
  catch (error) {
    if (error instanceof mongoose.CastError) return res.status(400).json({ success: false, message: "Invalid identifier." });
    if (error.status) return res.status(error.status).json({ success: false, message: error.message, ...(error.code ? { code: error.code } : {}) });
    next(error);
  }
};

const capitalize = (value) => {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
};

const toBooleanFilter = (value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const presentUser = async (user) => {
  const verification = await getAccountVerification(user).catch(() => null);
  return {
    id: String(user._id),
    name: user.fullName || "",
    email: user.email,
    role: capitalize(user.role),
    status: user.isActive === true ? "active" : user.isActive === false ? "suspended" : "unknown",
    isActive: user.isActive === true,
    isVerified: user.isVerified === true,
    teacherStatus: user.teacherStatus || "not_applicable",
    verification: { status: verification?.status || "not_submitted", submittedAt: verification?.submittedAt || null },
    lastLogin: user.lastLogin || null,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
    activity: { lastLogin: user.lastLogin || null, accountStatus: user.isActive === true ? "active" : user.isActive === false ? "suspended" : "unknown" },
  };
};

async function findUser(id) {
  for (const Model of USER_MODELS) {
    const user = await Model.findById(id);
    if (user) return user;
  }
  return null;
}

export const listUsers = handle(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20) || 20));
  const search = String(req.query.q || req.query.search || "").trim().toLowerCase();
  const role = capitalize(req.query.role);
  const status = String(req.query.status || "").trim().toLowerCase();
  const verified = toBooleanFilter(req.query.verified);
  const teacherStatus = String(req.query.teacherStatus || "").trim();

  const pattern = search ? new RegExp(escapeRegExp(search), "i") : null;
  const sources = USER_MODELS.flatMap((Model) => {
    // Role filter: only the matching model is queried when a role is requested.
    if (role && role !== "All" && Model.modelName !== role) return [];
    const filter = {};
    if (role && role !== "All" && Model.modelName === role) filter.role = Model.modelName.toLowerCase();
    if (status === "suspended") filter.isActive = false;
    if (status === "active") filter.isActive = true;
    if (verified !== undefined) filter.isVerified = verified;
    if (teacherStatus && teacherStatus !== "all") filter.teacherStatus = teacherStatus;
    if (pattern) filter.$or = [{ fullName: pattern }, { email: pattern }];
    return [{ Model, filter }];
  });

  // Count first so an out-of-range page can be clamped without loading every
  // matching account into application memory. Fetching the first N rows from
  // each role collection is sufficient to compute the globally newest N rows.
  const counts = await Promise.all(sources.map(({ Model, filter }) => Model.countDocuments(filter)));
  const total = counts.reduce((sum, count) => sum + count, 0);
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, pageCount);
  const fetchLimit = safePage * limit;
  const matched = (await Promise.all(sources.map(({ Model, filter }) => Model.find(filter)
    .sort({ createdAt: -1, email: 1 })
    .limit(fetchLimit)
    .lean()))).flat()
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0)
      || String(left.email || "").localeCompare(String(right.email || "")));
  const pageUsers = matched.slice((safePage - 1) * limit, safePage * limit);
  const users = [];
  for (const user of pageUsers) users.push(await presentUser(user));

  res.json({ success: true, users, total, page: safePage, pageCount, limit });
});

export const getUserProfile = handle(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid user ID.");
  const user = await findUser(req.params.id);
  if (!user) return fail(res, 404, "User not found.");
  res.json({ success: true, user: await presentUser(user) });
});

export const suspendOrReactivateUser = handle(async (req, res) => {
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) return fail(res, 400, "Invalid user ID.");
  const target = await findUser(id);
  if (!target) return fail(res, 404, "User not found.");

  const isSelf = String(target._id) === String(req.user._id);
  if (isSelf) return fail(res, 403, "An admin cannot suspend or reactivate their own account.");
  if (target.role === "admin") return fail(res, 403, "Admin accounts cannot be suspended through this endpoint. The last active admin account cannot be suspended; other admins require separate admin approval.");

  const desired = req.body?.status;
  if (desired !== "suspended" && desired !== "active") {
    return fail(res, 400, "Use status \"suspended\" to disable the account or \"active\" to reactivate it.");
  }
  if (desired === "suspended" && !target.isActive) return fail(res, 409, "This account is already suspended.");
  if (desired === "active" && target.isActive) return fail(res, 409, "This account is already active.");

  const wasActive = target.isActive === true;
  target.isActive = desired === "active";
  await target.save();

  const resultStatus = desired === "suspended" ? "Suspended" : "Active";
  await recordAdminAction({
    actorEmail: req.user.email, actorRole: req.user.role, actorId: req.user._id,
    action: desired === "suspended" ? "User suspended" : "User reactivated",
    category: "user-management", module: "User Management",
    entityType: "User", entityId: String(target._id), targetId: String(target._id),
    targetName: target.fullName || target.email, result: resultStatus,
    description: `${desired === "suspended" ? "Suspended" : "Reactivated"} ${target.role} ${target.email}.`,
    details: { before: { isActive: wasActive, status: wasActive ? "active" : "suspended" }, after: { isActive: target.isActive, status: resultStatus } },
  });

  res.json({ success: true, message: desired === "suspended" ? "User account suspended." : "User account reactivated.", user: await presentUser(target) });
});

import mongoose from "mongoose";
import ResearchRecord from "../models/ResearchRecord.js";
import Course from "../models/Course.js";
import Teacher from "../models/Teacher.js";
import { hasAccess } from "../services/contentService.js";

const FAIL = (res, code, message, extra = {}) => {
  res.status(code).json({ success: false, message, ...extra });
  return null;
};
const handle = (action) => async (req, res, next) => {
  try { await action(req, res, next); }
  catch (error) {
    if (error instanceof mongoose.CastError) return FAIL(res, 400, "Invalid identifier.");
    if (error.status) return FAIL(res, error.status, error.message);
    next(error);
  }
};

const clip = (value, max) => String(value ?? "").trim().slice(0, max);
const validUrl = (value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

// Rebuilds the payload from the section definition so unknown keys are dropped
// and values are bounded. Text is trimmed; URLs are validated.
const SECTION_FIELDS = {
  project: [{ key: "question", text: true }, { key: "notes", text: true }, { key: "status", enum: ["Planning", "In Progress", "Completed", "Archived"], default: "Planning" }],
  paper: [{ key: "authors", text: true }, { key: "year", text: true, max: 8 }, { key: "url", url: true }, { key: "summary", text: true }],
  matrix: [{ key: "method", text: true }, { key: "findings", text: true }, { key: "limitations", text: true }, { key: "gap", text: true }],
  reference: [{ key: "authors", text: true }, { key: "year", text: true, max: 8 }, { key: "source", text: true }, { key: "doi", url: true }, { key: "notes", text: true }],
  dataset: [{ key: "source", text: true }, { key: "url", url: true }, { key: "format", text: true }, { key: "description", text: true }],
  experiment: [{ key: "date", text: true, max: 10 }, { key: "hypothesis", text: true }, { key: "method", text: true }, { key: "results", text: true }, { key: "status", enum: ["Planned", "Running", "Completed", "Archived"], default: "Planned" }],
};

function buildPayload(type, input) {
  const fields = SECTION_FIELDS[type] || [];
  const payload = {};
  for (const field of fields) {
    let value = String(input[field.key] ?? field.default ?? "").trim();
    if (field.enum && field.enum.includes(value)) { payload[field.key] = value; continue; }
    if (field.url) {
      if (value && !validUrl(value)) throw Object.assign(new Error(`The ${field.key} must be a valid http:// or https:// link.`), { status: 400 });
      payload[field.key] = value; continue;
    }
    if (field.text && value) payload[field.key] = value.slice(0, field.max || 2000);
  }
  return payload;
}

const toResearchPublic = (record, titles) => ({
  id: String(record._id),
  type: record.type,
  title: record.title,
  payload: record.payload,
  courseId: record.courseId ? String(record.courseId) : null,
  courseTitle: titles.get(String(record.courseId || "")) || "",
  tags: record.tags || [],
  status: record.status || "",
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

async function titlesFor(courseIds) {
  const map = new Map();
  if (courseIds.length) {
    const courses = await Course.find({ _id: { $in: courseIds }, status: { $ne: "deleted" } }).select("title").lean();
    courses.forEach((course) => map.set(String(course._id), course.title || ""));
  }
  return map;
}

// hasAccess() requires the full user document (it checks user.role).
async function courseAccessCheck(user, courseId) {
  return Boolean(await hasAccess(user, "course", courseId));
}

async function teacherCourseCheck(teacherId, courseId) {
  const course = await Course.findOne({ _id: courseId, status: { $ne: "deleted" } }).select("teacherId").lean();
  return Boolean(course && String(course.teacherId) === String(teacherId));
}

const validateCommon = (req, res) => {
  const type = String(req.body?.type || "").trim();
  const title = clip(req.body?.title, 200);
  if (!SECTION_FIELDS[type]) return FAIL(res, 400, "Select a valid research record type.", { validTypes: Object.keys(SECTION_FIELDS) });
  if (title.length < 3) return FAIL(res, 400, "The research record title must be at least 3 characters.");
  return { type, title };
};

async function resolveCourse(req, res, courseId) {
  if (courseId) {
    if (!mongoose.isValidObjectId(courseId)) return FAIL(res, 400, "Invalid course ID.");
    if (req.user.role === "teacher") {
      if (!(await teacherCourseCheck(req.user._id, courseId))) return FAIL(res, 403, "You can only link research resources to courses you teach.");
    } else if (!(await courseAccessCheck(req.user, courseId))) {
      return FAIL(res, 403, "You can only link research resources to courses you have access to.");
    }
    const course = await Course.findById(courseId).select("title").lean();
    if (!course) return FAIL(res, 404, "Course not found.");
    return course;
  }
  return null;
}

async function findOwnedRecord(req, res, id) {
  if (!mongoose.isValidObjectId(id)) { FAIL(res, 400, "Invalid research record ID."); return null; }
  const record = await ResearchRecord.findOne({ _id: id, ownerId: req.user._id }).lean();
  if (!record) { FAIL(res, 404, "Research record not found."); return null; }
  return record;
}

const STATUS_WHITELIST = {
  project: ["Planning", "In Progress", "Completed", "Archived"],
  paper: ["Planned", "Running", "Completed", "Archived"],
  matrix: [],
  reference: [],
  dataset: [],
  experiment: ["Planned", "Running", "Completed", "Archived"],
};

const DEFAULT_STATUS = { project: "Planning", paper: "Planned", matrix: "", reference: "", dataset: "", experiment: "Planned" };

// Returns the stored status for a record type: empty when the type has no
// status lifecycle, a default when none was supplied, or an error message
// when the supplied value is not allowed for the type.
function resolveStatus(type, requested) {
  const allowed = STATUS_WHITELIST[type];
  if (!allowed || !allowed.length) return { status: "" };
  const value = clip(requested, 40);
  if (!value) return { status: DEFAULT_STATUS[type] || allowed[0] };
  if (!allowed.includes(value)) return { error: "Select a valid status for this research type." };
  return { status: value };
}

// ---- endpoints ------------------------------------------------------------

// GET /api/research/records — the user's own research records (students and teachers).
export const listResearchRecords = handle(async (req, res) => {
  const type = clip(req.query.type, 30);
  const courseId = clip(req.query.courseId, 24);
  const q = clip(req.query.q || req.query.search, 300).toLowerCase();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const filter = { ownerId: req.user._id };
  if (type && type !== "all") filter.type = type;
  if (courseId) filter.courseId = new mongoose.Types.ObjectId(courseId);
  if (q) {
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [{ title: new RegExp(safe, "i") }, { "payload.question": new RegExp(safe, "i") }];
  }
  const [total, records] = await Promise.all([
    ResearchRecord.countDocuments(filter),
    ResearchRecord.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
  ]);
  const titles = await titlesFor(records.map((record) => record.courseId));
  res.json({ success: true, records: records.map((record) => toResearchPublic(record, titles)), total, page, pageCount: Math.max(1, Math.ceil(total / limit)), limit });
});

// GET /api/research/records/:id — one owned record.
export const getResearchRecord = handle(async (req, res) => {
  const record = await findOwnedRecord(req, res, req.params.id);
  if (!record) return;
  const titles = await titlesFor([record.courseId]);
  res.json({ success: true, record: toResearchPublic(record, titles) });
});

// POST /api/research/records — create a research record.
export const createResearchRecord = handle(async (req, res) => {
  const common = validateCommon(req, res);
  if (!common) return;
  const course = await resolveCourse(req, res, clip(req.body?.courseId, 24) || null);
  if (!course && clip(req.body?.courseId, 24)) return;
  const payload = buildPayload(common.type, req.body?.payload || {});
  const resolved = resolveStatus(common.type, req.body?.status || payload.status);
  if (resolved.error) return FAIL(res, 400, resolved.error);
  const statusValue = resolved.status;
  const tags = parseTagList(req.body?.tags);
  const record = await ResearchRecord.create({
    ownerId: req.user._id,
    type: common.type,
    title: common.title,
    payload: { ...payload, ...(statusValue ? { status: statusValue } : {}) },
    courseId: course ? course._id : null,
    tags,
    status: statusValue,
  });
  const titles = await titlesFor([record.courseId]);
  res.status(201).json({ success: true, record: toResearchPublic(record, titles) });
});

function parseTagList(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const seen = new Set();
  const tags = [];
  for (const tag of list) {
    const text = clip(tag, 50).toLowerCase();
    if (text && !seen.has(text)) { seen.add(text); tags.push(text); }
  }
  return tags.slice(0, 20);
}

// POST /api/research/records/:id — update a record you own.
export const updateResearchRecord = handle(async (req, res) => {
  const record = await findOwnedRecord(req, res, req.params.id);
  if (!record) return;
  const common = validateCommon(req, res);
  if (!common) return;
  const payload = buildPayload(common.type, req.body?.payload || {});
  const retainedStatus = STATUS_WHITELIST[common.type].includes(record.status) ? record.status : "";
  const resolved = resolveStatus(common.type, req.body?.status || payload.status || retainedStatus);
  if (resolved.error) return FAIL(res, 400, resolved.error);
  const statusValue = resolved.status;
  const updates = {
    title: common.title,
    type: common.type,
    payload: { ...payload, ...(statusValue ? { status: statusValue } : {}) },
    tags: parseTagList(req.body?.tags ?? record.tags),
    status: statusValue || "",
  };
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "courseId")) {
    const rawCourseId = clip(req.body?.courseId, 24);
    if (!rawCourseId) {
      updates.courseId = null;
    } else {
      const course = await resolveCourse(req, res, rawCourseId);
      if (!course) return; // resolveCourse already sent the error
      updates.courseId = course._id;
    }
  }
  const refreshed = await ResearchRecord.findByIdAndUpdate(record._id, { $set: updates }, { returnDocument: "after" }).lean();
  const titles = await titlesFor([refreshed.courseId]);
  res.json({ success: true, record: toResearchPublic(refreshed, titles) });
});

// DELETE /api/research/records/:id — permanently delete a record you own.
export const deleteResearchRecord = handle(async (req, res) => {
  const record = await findOwnedRecord(req, res, req.params.id);
  if (!record) return;
  await ResearchRecord.deleteOne({ _id: record._id });
  res.json({ success: true, message: "Research record deleted." });
});

// POST /api/research/records/:id/archive — archive (soft status) a record.
export const archiveResearchRecord = handle(async (req, res) => {
  const record = await findOwnedRecord(req, res, req.params.id);
  if (!record) return;
  const allowed = STATUS_WHITELIST[record.type] || [];
  const requested = clip(req.body?.status || "Archived", 40);
  const statusValue = !allowed.length ? requested
    : allowed.includes(requested) ? requested
    : allowed.includes("Archived") ? "Archived" : allowed[0];
  await ResearchRecord.findByIdAndUpdate(record._id, { $set: { status: statusValue } });
  const refreshed = await ResearchRecord.findById(record._id).lean();
  res.json({ success: true, record: toResearchPublic(refreshed, await titlesFor([refreshed.courseId])) });
});

// POST /api/research/import — duplicate-aware import of browser-saved research records.
export const importResearchRecords = handle(async (req, res) => {
  const rows = Array.isArray(req.body?.records) ? req.body.records.slice(0, 100) : [];
  let imported = 0;
  let skipped = 0;
  const errors = [];
  for (const [index, raw] of rows.entries()) {
    const record = raw && typeof raw === "object" ? raw : null;
    if (!record) { skipped += 1; continue; }
    const type = clip(record.type, 30);
    const title = clip(record.title, 200);
    if (!SECTION_FIELDS[type]) { errors.push(`Row ${index + 1}: invalid type.`); skipped += 1; continue; }
    if (title.length < 3) { errors.push(`Row ${index + 1}: title must be at least 3 characters.`); skipped += 1; continue; }
    let payload;
    try {
      payload = buildPayload(type, record.payload || {});
    } catch (error) {
      errors.push(`Row ${index + 1}: ${error.message}`); skipped += 1; continue;
    }
    const statusResolved = resolveStatus(type, record.status || payload.status);
    if (statusResolved.error) {
      errors.push(`Row ${index + 1}: invalid status.`);
      skipped += 1;
      continue;
    }
    const statusValue = statusResolved.status;
    // Course links obey the same access rules as direct creation.
    let courseId = null;
    const rawCourseId = clip(record.courseId, 24);
    if (rawCourseId) {
      if (!mongoose.isValidObjectId(rawCourseId)) { errors.push(`Row ${index + 1}: invalid course ID.`); skipped += 1; continue; }
      const linked = await Course.findOne({ _id: rawCourseId, status: { $ne: "deleted" } }).select("_id").lean();
      const allowed = linked && (req.user.role === "teacher"
        ? await teacherCourseCheck(req.user._id, rawCourseId)
        : await courseAccessCheck(req.user, rawCourseId));
      if (!allowed) { errors.push(`Row ${index + 1}: you cannot link research to this course.`); skipped += 1; continue; }
      courseId = linked._id;
    }
    const data = { ownerId: req.user._id, type, title, payload: { ...payload, ...(statusValue ? { status: statusValue } : {}) }, courseId, tags: parseTagList(record.tags), status: statusValue };
    const providedId = clip(record.id, 60);
    if (providedId && mongoose.isValidObjectId(providedId)) {
      const candidate = new mongoose.Types.ObjectId(providedId);
      // Only skip when this exact record is already owned by this user; a
      // foreign _id falls through to create() which reports the key clash.
      if (await ResearchRecord.exists({ ownerId: req.user._id, _id: candidate })) { skipped += 1; continue; }
      data._id = candidate;
    } else if (await ResearchRecord.exists({ ownerId: req.user._id, type, title })) {
      skipped += 1;
      continue;
    }
    try {
      await ResearchRecord.create(data);
      imported += 1;
    } catch (error) {
      if (error.code === 11000) { skipped += 1; continue; }
      errors.push(`Row ${index + 1}: could not be saved.`);
      skipped += 1;
    }
  }
  res.json({ success: true, imported, skipped, errors });
});

// GET /api/research/records/:id/linked — research records linked to the given course.
export const listCourseResearch = handle(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.courseId)) return FAIL(res, 400, "Invalid course ID.");
  if (req.user.role === "teacher") {
    if (!(await teacherCourseCheck(req.user._id, req.params.courseId))) return FAIL(res, 403, "You can only view research resources linked to your courses.");
  } else if (!(await courseAccessCheck(req.user, req.params.courseId))) {
    return FAIL(res, 403, "You can only view research resources linked to courses you have access to.");
  }
  const records = await ResearchRecord.find({ ownerId: req.user._id, courseId: new mongoose.Types.ObjectId(req.params.courseId) }).sort({ createdAt: -1 }).lean();
  const titles = await titlesFor([req.params.courseId]);
  res.json({ success: true, records: records.map((record) => toResearchPublic(record, titles)), count: records.length });
});

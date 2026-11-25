import { randomUUID } from "node:crypto";
import { z } from "zod";
import mongoose from "mongoose";
import ContentAccess from "../models/ContentAccess.js";
import CourseCurriculum from "../models/CourseCurriculum.js";
import { recordAdminAction } from "../services/auditService.js";
import { models, contentSchema, lessonSchema, contentError, workingVersion, validateFiles,
  validateSubmission, writeRevision, present, hasAccess, cleanCurriculum } from "../services/contentService.js";

const visible = { published: true, approvedVersion: { $ne: null }, status: { $ne: "deleted" } };
async function syncCourseCurriculum(course, curriculum, approvedCurriculum) {
  if (!curriculum) return;
  const changes = { teacherId: course.teacherId, curriculum, courseRevision: course.revision || 0,
    status: course.status, published: course.published === true };
  if (approvedCurriculum !== undefined) changes.approvedCurriculum = approvedCurriculum;
  await CourseCurriculum.findOneAndUpdate({ courseId: course._id }, { $set: changes, $setOnInsert: { courseId: course._id } },
    { upsert: true, returnDocument: "after", runValidators: true });
}
const handle = (action) => async (req, res, next) => {
  try { await action(req, res); }
  catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, message: "Invalid fields or values.", issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })) });
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
};
async function catalog(type, user) {
  const items = await models[type].find(visible).sort({ createdAt: -1 });
  return Promise.all(items.map(async (item) => present(item, type, { access: await hasAccess(user, type, item._id) })));
}
export const listPublic = (type) => handle(async (req, res) => {
  res.json({ success: true, items: await catalog(type, req.user) });
});
export const publicCatalog = handle(async (_req, res) => {
  res.json({ success: true, courses: await catalog("course"), books: await catalog("book") });
});
async function managed(type, user) {
  const filter = { status: { $ne: "deleted" }, ...(user.role === "admin" ? {} : { teacherId: user._id }) };
  const items = await models[type].find(filter).sort({ createdAt: -1 });
  return Promise.all(items.map((item) => present(item, type, { working: true })));
}
export const sessionState = handle(async (req, res) => {
  const user = req.user;
  const canManage = ["admin", "teacher"].includes(user.role);
  const accesses = user.role === "student" ? await ContentAccess.find({ studentId: user._id,
    ...(process.env.NODE_ENV === "production" ? { source: { $ne: "demo" } } : {}) }).lean() : [];
  res.set("Cache-Control", "no-store");
  res.json({ success: true, accountId: String(user._id), role: user.role, email: user.email,
    courses: await catalog("course", user), books: await catalog("book", user),
    managedCourses: canManage ? await managed("course", user) : [],
    managedBooks: canManage ? await managed("book", user) : [], accesses });
});
export const listMine = (type) => handle(async (req, res) => {
  res.json({ success: true, items: await managed(type, req.user) });
});
export const listAdmin = listMine;

export const createContent = (type) => handle(async (req, res) => {
  const values = contentSchema.parse(req.body);
  if (type === "book" && values.lessons) throw contentError(400, "Books cannot contain course lessons.");
  if (values.lessons && new Set(values.lessons.map((lesson) => lesson.id)).size !== values.lessons.length) throw contentError(400, "Lesson IDs must be unique.");
  await validateFiles(values, req.user._id);
  let item;
  if (values.legacyId) item = await models[type].findOne({ teacherId: req.user._id, legacyId: values.legacyId });
  if (!item) {
    try { item = await models[type].create({ ...values, teacherId: req.user._id, status: "draft" }); }
    catch (error) {
      if (error.code !== 11000 || !values.legacyId) throw error;
      item = await models[type].findOne({ teacherId: req.user._id, legacyId: values.legacyId });
    }
  }
  if (type === "course") await syncCourseCurriculum(item, values.metadata?.curriculum);
  res.status(201).json({ success: true, item: await present(item, type, { working: true }) });
});
export const getContent = handle(async (req, res) => {
  const item = req.contentResource;
  const working = req.user.role === "admin" || (req.user.role === "teacher" && String(item.teacherId) === String(req.user._id));
  res.json({ success: true, item: await present(item, req.contentType, { working, access: await hasAccess(req.user, req.contentType, item._id) }) });
});
export const updateContent = handle(async (req, res) => {
  const { revision, ...body } = req.body;
  const parsed = contentSchema.omit({ legacyId: true }).partial().parse(body);
  const values = Object.fromEntries(Object.keys(body).map((key) => [key, parsed[key]]));
  if (req.contentType === "book" && values.lessons) throw contentError(400, "Books cannot contain lessons.");
  const current = await workingVersion(req.contentResource, req.contentType);
  const next = { ...current, ...values };
  if (values.lessons || values.metadata?.curriculum) cleanCurriculum(next);
  if (next.lessons && new Set(next.lessons.map((lesson) => lesson.id)).size !== next.lessons.length) throw contentError(400, "Lesson IDs must be unique.");
  await validateFiles(next, req.user._id);
  const item = await writeRevision(req.contentResource, revision,
    { ...next, status: "draft", rejectionReason: "" }, { teacherId: req.user._id });
  if (req.contentType === "course") await syncCourseCurriculum(item, next.metadata?.curriculum);
  res.json({ success: true, item: await present(item, req.contentType, { working: true }) });
});
export const deleteContent = (type) => handle(async (req, res) => {
  const item = await writeRevision(req.contentResource, Number(req.get("If-Match")), { status: "deleted", published: false }, { teacherId: req.user._id });
  if (type === "course") await CourseCurriculum.updateOne({ courseId: item._id }, { $set: { status: "deleted", published: false, courseRevision: item.revision } });
  res.json({ success: true, message: "Content removed. Stored records and files were retained." });
});
export const submitContent = (type) => handle(async (req, res) => {
  const version = await workingVersion(req.contentResource, type);
  validateSubmission(version, type);
  await validateFiles(version, req.user._id);
  const item = await writeRevision(req.contentResource, req.body.revision,
    { ...version, status: "pending", submittedAt: new Date(), rejectionReason: "" }, { teacherId: req.user._id });
  if (type === "course") await syncCourseCurriculum(item, version.metadata?.curriculum);
  res.json({ success: true, item: await present(item, type, { working: true }) });
});
export const reviewContent = (type) => handle(async (req, res) => {
  const input = z.object({ decision: z.enum(["approve", "reject", "unpublish", "publish", "return"]), revision: z.number().int().nonnegative(), reason: z.string().trim().max(5000).default("") }).strict().parse(req.body);
  if (!mongoose.isValidObjectId(req.params.id)) throw contentError(400, "Invalid resource ID.");
  const resource = await models[type].findById(req.params.id);
  if (!resource || resource.status === "deleted") throw contentError(404, "Content not found.");
  const changes = { reviewedBy: req.user._id, reviewedAt: new Date() };
  if (["approve", "reject"].includes(input.decision) && resource.status !== "pending") throw contentError(409, "Only a pending submission can be reviewed.");
  if (input.decision === "approve") {
    const version = await workingVersion(resource, type);
    validateSubmission(version, type);
    await validateFiles(version, resource.teacherId);
    Object.assign(changes, { approvedVersion: version, published: true, status: "published", rejectionReason: "" });
  } else if (input.decision === "reject") {
    if (!input.reason) throw contentError(400, "Enter a rejection reason.");
    Object.assign(changes, { status: "rejected", rejectionReason: input.reason });
  } else if (input.decision === "publish") {
    if (!resource.approvedVersion) throw contentError(400, "Admin approval is required before publication.");
    Object.assign(changes, { published: true, status: resource.status === "suspended" ? "published" : resource.status });
  } else if (input.decision === "unpublish") {
    Object.assign(changes, { published: false, status: "suspended" });
  } else {
    Object.assign(changes, { status: "pending", rejectionReason: "" });
  }
  const item = await writeRevision(resource, input.revision, changes);
  if (type === "course") {
    const working = await workingVersion(item, type);
    await syncCourseCurriculum(item, working.metadata?.curriculum,
      input.decision === "approve" ? item.approvedVersion?.metadata?.curriculum || null : undefined);
  }
  const label = type === "course" ? "Course" : "Book";
  const decisionLabel = input.decision === "approve" ? "approved"
    : input.decision === "reject" ? "rejected"
    : input.decision === "publish" ? "published"
    : input.decision === "unpublish" ? "unpublished" : "returned for changes";
  await recordAdminAction({
    actorEmail: req.user.email, actorRole: req.user.role, actorId: req.user._id,
    action: `${label} ${decisionLabel}`,
    category: type === "course" ? "course-review" : "book-approvals",
    module: type === "course" ? "Course Review" : "Course & Books",
    entityType: label, entityId: String(resource._id), targetId: String(resource._id),
    targetName: resource.title, result: input.decision === "approve" ? "Published" : input.decision === "reject" ? "Rejected" : "Reviewed",
    description: `${req.user.fullName || req.user.email} ${decisionLabel} ${label.toLowerCase()} ${resource.title}.`,
    details: { decision: input.decision, reason: input.reason || "" },
  });
  res.json({ success: true, item: await present(item, type, { working: true }) });
});
export const listLessons = handle(async (req, res) => {
  const course = req.parentCourse;
  const working = req.user.role === "admin" || (req.user.role === "teacher" && String(course.teacherId) === String(req.user._id));
  const item = await present(course, "course", { working, access: await hasAccess(req.user, "course", course._id) });
  res.json({ success: true, items: item.lessons });
});
export const mutateLesson = (operation) => handle(async (req, res) => {
  const course = req.parentCourse;
  const version = await workingVersion(course, "course");
  const index = version.lessons.findIndex((lesson) => lesson.id === req.params.lessonId);
  if (operation !== "create" && index < 0) throw contentError(404, "Lesson not found.");
  if (operation === "delete") version.lessons.splice(index, 1);
  else {
    const { revision, ...body } = req.body;
    const lesson = lessonSchema.parse({ ...(operation === "update" ? version.lessons[index] : { id: randomUUID() }), ...body });
    if (operation === "update" && lesson.id !== req.params.lessonId) throw contentError(400, "Lesson IDs cannot be changed.");
    if (version.lessons.some((entry, position) => entry.id === lesson.id && position !== index)) throw contentError(400, "Lesson IDs must be unique.");
    if (operation === "create") version.lessons.push(lesson);
    else version.lessons[index] = lesson;
  }
  cleanCurriculum(version);
  await validateFiles(version, req.user._id);
  const item = await writeRevision(course, operation === "delete" ? Number(req.get("If-Match")) : req.body.revision,
    { ...version, status: "draft", rejectionReason: "" }, { teacherId: req.user._id });
  await syncCourseCurriculum(item, version.metadata?.curriculum);
  res.json({ success: true, item: await present(item, "course", { working: true }) });
});
export const createLesson = mutateLesson("create");
export const updateLesson = mutateLesson("update");
export const deleteLesson = mutateLesson("delete");

export const enroll = handle(async (req, res) => {
  const { items } = z.object({ items: z.array(z.object({ id: z.string().refine((id) => mongoose.isValidObjectId(id)), kind: z.enum(["course", "book"]) }).strict()).min(1).max(100) }).strict().parse(req.body);
  const ready = [];
  for (const entry of items) {
    const item = await models[entry.kind].findOne({ _id: entry.id, ...visible });
    if (!item) throw contentError(404, "Content is not approved and published.");
    const meta = item.approvedVersion.metadata || {};
    const price = meta.isFree ? 0 : Number(meta.price || 0);
    const paidDemo = price > 0 && ["development", "test"].includes(process.env.NODE_ENV) && process.env.CONTENT_DEMO_CHECKOUT === "true";
    if (price > 0 && !paidDemo && !(await hasAccess(req.user, entry.kind, item._id))) throw contentError(402, "A verified payment is required. Paid checkout is not configured.");
    ready.push({ studentId: req.user._id, contentId: item._id, kind: entry.kind, source: paidDemo ? "demo" : "free", price });
  }
  for (const value of ready) {
    try { await ContentAccess.updateOne({ studentId: value.studentId, kind: value.kind, contentId: value.contentId }, { $setOnInsert: value }, { upsert: true }); }
    catch (error) { if (error.code !== 11000) throw error; }
  }
  res.json({ success: true, message: "Access saved.", demo: ready.some((entry) => entry.source === "demo") });
});
export const unenroll = handle(async (req, res) => {
  const { kind, contentId } = z.object({ kind: z.enum(["course", "book"]), contentId: z.string().refine((id) => mongoose.isValidObjectId(id), "Invalid content ID.") }).strict().parse(req.body);
  const existing = await ContentAccess.findOne({ studentId: req.user._id, kind, contentId });
  if (!existing) return res.json({ success: true, message: "Enrollment not found." });
  if (existing.source !== "free" || existing.price > 0) throw contentError(403, "A purchased enrollment cannot be removed here.");
  await ContentAccess.deleteOne({ _id: existing._id });
  res.json({ success: true, message: "Enrollment removed." });
});

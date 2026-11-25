import { z } from "zod";
import Course from "../models/Course.js";
import TeacherBook from "../models/TeacherBook.js";
import Lesson from "../models/Lesson.js";
import Teacher from "../models/Teacher.js";
import ContentFile from "../models/ContentFile.js";
import ContentAccess from "../models/ContentAccess.js";

export const models = { course: Course, book: TeacherBook };
export function contentError(status, message) {
  return Object.assign(new Error(message), { status });
}
const text = z.string().max(5000);
const short = z.string().max(300);
const fileId = z.string().regex(/^[a-f0-9]{24}$/i).or(z.literal(""));
const list = z.union([text, z.array(short).max(100)]);
const metadata = z.object({
  curriculum: z.object({
    sections: z.array(z.object({ id: short, title: short, lessonIds: z.array(short).max(500) }).strict()).max(100),
    resources: z.array(z.object({ id: short, fileId, lessonId: short, name: short, size: z.number().nonnegative() }).strict()).max(500),
    links: z.array(z.object({ sectionId: short, type: z.enum(["quiz", "assignment"]), id: short }).strict()).max(500),
  }).strict().optional(),
  category: short.optional(), level: short.optional(), price: z.number().min(0).max(10000000).optional(),
  thumbnail: fileId.optional(), requirements: list.optional(), learningOutcomes: list.optional(),
  outcomes: list.optional(), objectives: list.optional(), whatYouWillLearn: list.optional(),
  educationLevel: short.optional(), targetLevel: short.optional(), classNumber: z.union([short, z.number()]).optional(),
  intermediateYear: z.union([short, z.number()]).optional(), stream: short.optional(), degreeLevel: short.optional(),
  program: short.optional(), subjects: list.optional(), subject: list.optional(), specialization: list.optional(),
  language: short.optional(), author: short.optional(), classOrProgram: short.optional(), semester: short.optional(),
  pages: z.number().int().min(0).max(100000).optional(), isFree: z.boolean().optional(),
  downloadAllowed: z.boolean().optional(), pdfFileId: fileId.optional(), previewFileId: fileId.optional(), coverFileId: fileId.optional(),
  fileName: short.optional(), previewFileName: short.optional(),
}).strict();
export const lessonSchema = z.object({
  id: z.string().min(1).max(160), title: z.string().trim().min(2).max(160),
  description: text.optional(), content: z.string().max(20000).optional(),
  duration: z.union([short, z.number().nonnegative()]).optional(),
  order: z.number().int().min(0).max(10000).optional(), isFreePreview: z.boolean().optional(),
  videoFileId: fileId.optional(), fileId: fileId.optional(),
  type: short.optional(), section: short.optional(), sectionId: short.optional(),
  needsUpload: z.boolean().optional(),
}).strict();
export const contentSchema = z.object({
  title: z.string().trim().min(2).max(160), description: text.default(""),
  metadata: metadata.default({}), lessons: z.array(lessonSchema).max(500).optional(),
  legacyId: z.string().min(1).max(200).optional(),
}).strict();

export async function workingVersion(resource, type) {
  const value = resource.toObject ? resource.toObject() : resource;
  let lessons = value.lessons;
  if (type === "course" && !Array.isArray(lessons)) {
    lessons = (await Lesson.find({ courseId: value._id }).sort({ order: 1, _id: 1 }).lean())
      .map((lesson) => ({ id: String(lesson._id), title: lesson.title, content: lesson.content, order: lesson.order }));
  }
  return { title: value.title, description: value.description || "", metadata: value.metadata || {},
    ...(type === "course" ? { lessons: lessons || [] } : {}) };
}

export function fileReferences(version) {
  const meta = version.metadata || {};
  return [meta.thumbnail, meta.pdfFileId, meta.previewFileId, meta.coverFileId,
    ...(meta.curriculum?.resources || []).map((resource) => resource.fileId),
    ...(version.lessons || []).flatMap((lesson) => [lesson.videoFileId, lesson.fileId])].filter(Boolean);
}

export async function validateFiles(version, teacherId) {
  // Reserve room for both the working and approved versions in one MongoDB document.
  if (Buffer.byteLength(JSON.stringify(version)) > 7 * 1024 * 1024) throw contentError(413, "Content text exceeds 7 MB. Move large lesson material into uploaded files.");
  const refs = [...new Set(fileReferences(version))];
  const files = await ContentFile.find({ _id: { $in: refs }, teacherId }).lean();
  if (files.length !== refs.length) throw contentError(400, "An uploaded file is missing or belongs to another teacher.");
  const kinds = new Map(files.map((file) => [String(file._id), file.kind]));
  const meta = version.metadata || {};
  for (const [key, kind] of [["thumbnail", "image"], ["coverFileId", "image"], ["pdfFileId", "pdf"], ["previewFileId", "preview"]]) {
    if (meta[key] && kinds.get(meta[key]) !== kind) throw contentError(400, "Invalid file type for this field.");
  }
  for (const lesson of version.lessons || []) {
    if (lesson.videoFileId && kinds.get(lesson.videoFileId) !== "video") throw contentError(400, "Choose an uploaded lesson video.");
  }
  for (const resource of meta.curriculum?.resources || []) {
    if (resource.lessonId && !(version.lessons || []).some((lesson) => lesson.id === resource.lessonId)) throw contentError(400, "An attachment refers to a missing lesson.");
  }
}

export function validateSubmission(version, type) {
  if (!version.description.trim()) throw contentError(400, "Add a description before submitting.");
  if (type === "book" && !version.metadata.pdfFileId) throw contentError(400, "Upload the book PDF before submitting.");
  if (type === "course" && (!version.lessons?.length || version.lessons.some((lesson) =>
    !lesson.title?.trim() || lesson.needsUpload || !(lesson.videoFileId || lesson.fileId || lesson.content?.trim() ||
      version.metadata.curriculum?.resources.some((resource) => resource.lessonId === lesson.id && resource.fileId))))) {
    throw contentError(400, "Add lesson content, a video or a file to every lesson before submitting.");
  }
}

export function cleanCurriculum(version) {
  const curriculum = version.metadata.curriculum;
  if (!curriculum) return;
  const ids = new Set((version.lessons || []).map((lesson) => lesson.id));
  const assigned = new Set();
  const sectionIds = new Set(curriculum.sections.map((section) => section.id));
  const linked = new Set();
  version.metadata = { ...version.metadata, curriculum: { ...curriculum,
    sections: curriculum.sections.map((section) => ({ ...section, lessonIds: section.lessonIds.filter((id) => {
      if (!ids.has(id) || assigned.has(id)) return false;
      assigned.add(id);
      return true;
    }) })),
    links: curriculum.links.filter((link) => {
      const key = `${link.sectionId}:${link.type}:${link.id}`;
      if (!sectionIds.has(link.sectionId) || linked.has(key)) return false;
      linked.add(key);
      return true;
    }),
    resources: curriculum.resources.filter((resource) => !resource.lessonId || ids.has(resource.lessonId)),
  } };
}

export function revisionFilter(resource, expected) {
  if (!Number.isInteger(expected) || expected !== (resource.revision || 0)) {
    throw contentError(409, "Content changed. Refresh and review the latest version before saving.");
  }
  return { _id: resource._id, ...(expected === 0
    ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] }
    : { revision: expected }) };
}

export async function writeRevision(resource, expected, changes, extra = {}) {
  const item = await resource.constructor.findOneAndUpdate(
    { ...revisionFilter(resource, expected), ...extra },
    { $set: changes, $inc: { revision: 1 } }, { returnDocument: "after", runValidators: true });
  if (!item) throw contentError(409, "Content changed during this action. Refresh and try again.");
  return item;
}

export async function hasAccess(user, kind, contentId) {
  if (!user || user.role !== "student") return false;
  const filter = { studentId: user._id, kind, contentId };
  if (process.env.NODE_ENV === "production") filter.source = { $ne: "demo" };
  return Boolean(await ContentAccess.exists(filter));
}

const labels = { draft: "Draft", pending: "Pending Approval", approved: "Approved", published: "Published", rejected: "Rejected", suspended: "Suspended", deleted: "Deleted" };
export async function present(resource, type, { working = false, access = false } = {}) {
  const version = working ? await workingVersion(resource, type) : resource.approvedVersion;
  if (!version) return null;
  const teacher = await Teacher.findById(resource.teacherId).select("fullName email").lean();
  const meta = version.metadata || {};
  const status = ["published", "approved"].includes(resource.status) && !resource.approvedVersion ? "draft" : resource.status;
  const lessons = (version.lessons || []).map((lesson, order) => {
    const value = { ...lesson, order, courseId: String(resource._id) };
    if (!working && !access && !lesson.isFreePreview) {
      delete value.content;
      delete value.videoFileId;
      delete value.fileId;
    }
    return value;
  });
  return { ...meta, id: String(resource._id), _id: String(resource._id), mongoContent: true,
    title: version.title, description: version.description,
    ...(type === "course" ? { lessons } : {}),
    teacherId: String(resource.teacherId), teacherEmail: teacher?.email || "", teacherName: teacher?.fullName || "Teacher",
    instructorName: teacher?.fullName || "Teacher", status: working ? (type === "book" && status === "suspended" ? "Unpublished" : labels[status]) : "Published",
    revision: resource.revision || 0, rejectionReason: working ? resource.rejectionReason : "",
    revisionNotes: working ? resource.rejectionReason : "", submittedAt: resource.submittedAt,
    reviewedBy: working ? resource.reviewedBy : undefined, reviewedAt: resource.reviewedAt,
    createdAt: resource.createdAt, updatedAt: resource.updatedAt,
    hasApprovedVersion: Boolean(resource.approvedVersion), published: resource.published === true,
    ...(working && resource.legacyId ? { legacyId: resource.legacyId } : {}),
  };
}

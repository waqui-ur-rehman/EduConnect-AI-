import { loadContentFile } from "../../utils/contentApi";
import { isModerationVisible } from "../../utils/moderationVisibility.js";
import { studentQuizLibrary } from "../../utils/studentQuizzes.js";
import { studentAssignmentLibrary } from "../assignments/studentAssignmentHelpers.js";

const norm = value => String(value ?? "").trim().toLowerCase();
const matchesReference = (record, id) => [record?.id, record?._id, record?.legacyId].some(value => value !== undefined && String(value) === String(id));
export const curriculumCourseKey = course => `${norm(course.teacherEmail || course.instructorEmail || "demo")}::${course.id}`;
export const curriculumStorageKey = course => `educonnect.curriculum.v1.${encodeURIComponent(norm(course.teacherEmail || course.instructorEmail))}.${encodeURIComponent(String(course.id))}`;
export const curriculumBookmarksKey = email => `educonnect.student.${norm(email)}.learningBookmarks`;
export const CURRICULUM_BOOKMARK_EVENT = "educonnect:learning-bookmarks-changed";
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } };

export function subscribeStudentCurriculum(callback) {
  const events = ["storage", "focus", "educonnect:curriculum-updated", "educonnect:quizzes-updated", "educonnect:assignments-updated", "educonnect:teacher-courses-changed", "educonnect:student-data-changed", "educonnect:moderation-visibility-changed", CURRICULUM_BOOKMARK_EVENT];
  events.forEach(event => window.addEventListener(event, callback));
  return () => events.forEach(event => window.removeEventListener(event, callback));
}

export function lessonDurationSeconds(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+:\d{2}(:\d{2})?$/.test(text)) {
    const parts = text.split(":").map(Number);
    if (parts.slice(1).some(part => part >= 60)) return null;
    const seconds = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
    return seconds > 0 ? seconds : null;
  }
  const minutes = Number(text);
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : null;
}
export function curriculumDurationLabel(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "Not recorded";
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), remainder = seconds % 60;
  return [hours ? `${hours}h` : "", minutes ? `${minutes}m` : "", !hours && remainder ? `${remainder}s` : ""].filter(Boolean).join(" ");
}
const durationSummary = lessons => {
  const recorded = lessons.filter(entry => entry.duration !== null);
  const seconds = recorded.reduce((sum, entry) => sum + entry.duration, 0);
  return { seconds, recorded: recorded.length, complete: lessons.length > 0 && recorded.length === lessons.length, label: curriculumDurationLabel(seconds) };
};

export function studentCurriculumCourses(courses, publishedCourses = []) {
  const seen = new Set();
  return courses.flatMap(enrolled => {
    const key = curriculumCourseKey(enrolled);
    if (seen.has(key)) return [];
    seen.add(key);
    const published = publishedCourses.find(course => curriculumCourseKey(course) === key);
    const source = Array.isArray(published?.lessons) ? published.lessons : Array.isArray(enrolled.lessonItems) ? enrolled.lessonItems : Array.isArray(enrolled.lessons) ? enrolled.lessons : [];
    return [{ ...published, ...enrolled, key, thumbnail: published?.thumbnail || enrolled.thumbnail, image: published?.image || enrolled.image, lessonItems: source, lessons: source.length }];
  });
}

export function buildStudentCurriculum(email, course, remoteAssessments) {
  const stored = course.mongoContent ? course.curriculum || {} : read(curriculumStorageKey(course), {});
  const saved = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  const source = Array.isArray(course.lessonItems) ? course.lessonItems : [];
  const completedCount = Math.min(source.length, Math.max(0, Math.floor(Number(course.completedLessons) || 0)));
  const seenLessons = new Set();
  const lessons = source.flatMap((lesson, index) => {
    if (!lesson || typeof lesson.title !== "string" || !lesson.title.trim()) return [];
    const key = String(lesson.id ?? `index:${index}`);
    if (seenLessons.has(key)) return [];
    seenLessons.add(key);
    const visible = isModerationVisible("video", `${norm(course.teacherEmail || course.instructorEmail || "demo")}::${course.id}::${lesson.id ?? index}`);
    return [{ key, lesson, index, duration: lessonDurationSeconds(lesson.duration), completed: index < completedCount, locked: index > completedCount, visible }];
  });
  const byId = new Map(lessons.map(entry => [entry.key, entry]));
  const quizzes = remoteAssessments ? (remoteAssessments.quizzes || []).map(quiz => ({ quiz, attempts: quiz.attempts || [] })) : studentQuizLibrary(email, [course]);
  const assignments = remoteAssessments ? (remoteAssessments.assignments || []).map(assignment => {
    const submissions = (remoteAssessments.submissions || []).filter(item => String(item.assignmentId) === String(assignment.id || assignment._id));
    const latest = submissions.sort((left, right) => new Date(right.submittedAt || 0) - new Date(left.submittedAt || 0))[0];
    return { assignment, latest };
  }) : studentAssignmentLibrary(email, [course]);
  const used = new Set(), moduleIds = new Set();
  const sections = (Array.isArray(saved.sections) ? saved.sections : []).flatMap(section => {
    if (!section || section.id === undefined || typeof section.title !== "string" || !section.title.trim() || moduleIds.has(String(section.id))) return [];
    const key = String(section.id); moduleIds.add(key);
    const items = (Array.isArray(section.lessonIds) ? section.lessonIds : []).flatMap(id => { const item = byId.get(String(id)); if (!item || used.has(item.key)) return []; used.add(item.key); return [item]; });
    const assessments = (Array.isArray(saved.links) ? saved.links : []).filter(link => String(link?.sectionId) === key).flatMap(link => {
      const entry = (link.type === "quiz" ? quizzes : link.type === "assignment" ? assignments : []).find(item => matchesReference(link.type === "quiz" ? item.quiz : item.assignment, link.id));
      if (!entry) return [];
      return [{ type: link.type, record: link.type === "quiz" ? entry.quiz : entry.assignment, done: link.type === "quiz" ? entry.attempts.some(attempt => attempt.passed) : !!entry.latest?.gradedAt }];
    }).filter((item, index, rows) => rows.findIndex(other => other.type === item.type && String(other.record.id) === String(item.record.id)) === index);
    return [{ key: `module:${key}`, title: section.title, authored: true, lessons: items, assessments, duration: durationSummary(items), completed: items.filter(item => item.completed).length }];
  });
  const moduleCount = sections.length;
  const remaining = lessons.filter(entry => !used.has(entry.key));
  if (remaining.length) sections.push({ key: "course-lessons", title: "Course Lessons", authored: false, lessons: remaining, assessments: [], duration: durationSummary(remaining), completed: remaining.filter(item => item.completed).length });
  const seenResources = new Set();
  const resources = (Array.isArray(saved.resources) ? saved.resources : []).filter(resource => {
    if (!resource?.id || typeof resource.name !== "string" || !resource.name.trim() || seenResources.has(String(resource.id))) return false;
    if (resource.lessonId !== null && resource.lessonId !== undefined && resource.lessonId !== "" && !byId.has(String(resource.lessonId))) return false;
    if (/\.pdf$/i.test(resource.name) && !isModerationVisible("pdf", `${norm(course.teacherEmail || course.instructorEmail)}::${course.id}::${resource.id}`)) return false;
    seenResources.add(String(resource.id)); return true;
  });
  const completed = lessons.filter(entry => entry.completed).length;
  return { course, lessons, sections, moduleCount, resources, completed, total: lessons.length, remaining: lessons.length - completed,
    percent: lessons.length ? Math.round(completed / lessons.length * 100) : 0, duration: durationSummary(lessons),
    next: lessons.find(entry => !entry.completed && !entry.locked && entry.visible) || lessons.find(entry => entry.completed && entry.visible) || null };
}

export function readCurriculumBookmarks(email) {
  const stored = read(curriculumBookmarksKey(email), []);
  return Array.isArray(stored) ? stored : [];
}
export function toggleCurriculumBookmark(email, course) {
  const key = curriculumCourseKey(course), previous = readCurriculumBookmarks(email);
  const next = previous.includes(key) ? previous.filter(item => item !== key) : [...previous, key];
  localStorage.setItem(curriculumBookmarksKey(email), JSON.stringify(next));
  window.dispatchEvent(new Event(CURRICULUM_BOOKMARK_EVENT));
  return next.includes(key);
}

export async function loadStudentCurriculumFile(resource) {
  // MongoDB resources carry an authored id plus a fileId referencing an authenticated,
  // access-gated ContentFile. Local browser resources carry only the IndexedDB key.
  const fileId = resource && typeof resource === "object" ? resource.fileId : resource;
  const fileText = String(fileId || "");
  const bare = fileText.replace(/^remote:/, "");
  if (/^[a-f0-9]{24}$/i.test(bare)) return loadContentFile(bare);
  if (fileText.startsWith("remote:")) return loadContentFile(fileText);
  const id = String(resource && typeof resource === "object" ? resource.id : resource);
  if (!globalThis.indexedDB) throw new Error("File storage is unavailable in this browser.");
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("educonnect-curriculum-resources", 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("files")) request.result.createObjectStore("files"); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try {
    const file = await new Promise((resolve, reject) => { const tx = db.transaction("files", "readonly"), request = tx.objectStore("files").get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); tx.onerror = () => reject(tx.error); });
    if (!file) throw new Error("This uploaded file is no longer available in this browser.");
    return file;
  } finally { db.close(); }
}

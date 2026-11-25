import { courseLessonCount } from "../../utils/courseNotes.js";
import { studentQuizLibrary } from "../../utils/studentQuizzes.js";
import { studentAssignmentLibrary } from "../assignments/studentAssignmentHelpers.js";

export const LEARNING_PATH_EVENT = "educonnect:learning-paths-updated";
const norm = value => String(value ?? "").trim().toLowerCase();
export const learningPathKey = email => `educonnect.learningPaths.v1.${encodeURIComponent(norm(email))}`;
export const pathCourseKey = course => `${norm(course.teacherEmail || course.instructorEmail)}::${String(course.id)}`;
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function readLearningPaths(email) {
  try { const rows = JSON.parse(localStorage.getItem(learningPathKey(email)) || "[]"); return Array.isArray(rows) ? rows : []; }
  catch { return []; }
}
export function writeLearningPaths(email, paths) {
  localStorage.setItem(learningPathKey(email), JSON.stringify(paths));
  window.dispatchEvent(new Event(LEARNING_PATH_EVENT));
}
export function subscribeLearningPaths(callback) {
  const events = ["storage", "focus", LEARNING_PATH_EVENT, "educonnect:quizzes-updated", "educonnect:assignments-updated", "educonnect:teacher-courses-changed", "educonnect:student-data-changed"];
  events.forEach(event => window.addEventListener(event, callback));
  return () => events.forEach(event => window.removeEventListener(event, callback));
}

export function coursePathProgress(course, email) {
  const videosTotal = courseLessonCount(course);
  const videosDone = Math.min(videosTotal, Math.max(0, Math.floor(Number(course.completedLessons) || 0)));
  const quizzes = studentQuizLibrary(email, [course]);
  const assignments = studentAssignmentLibrary(email, [course]);
  const quizDone = quizzes.filter(entry => entry.attempts.some(attempt => attempt.passed)).length;
  const assignmentsDone = assignments.filter(entry => entry.submissions.some(record => record.gradedAt && record.marks !== null && record.marks !== undefined)).length;
  const required = videosTotal + quizzes.length + assignments.length, done = videosDone + quizDone + assignmentsDone;
  return { videosTotal, videosDone, quizzesTotal: quizzes.length, quizDone, assignmentsTotal: assignments.length, assignmentsDone, required, done,
    percent: required ? Math.round(done / required * 100) : 0, completed: required > 0 && done === required,
    started: done > 0 || quizzes.some(entry => entry.draft || entry.attempts.length) || assignments.some(entry => entry.draft || entry.submissions.length) };
}

export function evaluateLearningPaths(email, courses, publishedCourses = []) {
  const owned = new Map(courses.map(enrolled => {
    const published = publishedCourses.find(course => pathCourseKey(course) === pathCourseKey(enrolled));
    return [pathCourseKey(enrolled), { ...published, ...enrolled, thumbnail: published?.thumbnail || enrolled.thumbnail, image: published?.image || enrolled.image }];
  }));
  const progress = new Map([...owned].map(([key, course]) => [key, coursePathProgress(course, email)]));
  const seen = new Set();
  return readLearningPaths(email).filter(path => path && path.id && typeof path.title === "string" && Array.isArray(path.courseKeys)).flatMap(path => {
    if (seen.has(String(path.id))) return [];
    seen.add(String(path.id));
    const keys = [...new Set(path.courseKeys.filter(key => typeof key === "string"))];
    const steps = keys.map(key => ({ key, course: owned.get(key) || null, progress: progress.get(key) || null }));
    const allCompleted = steps.length > 0 && steps.every(step => step.progress?.completed);
    const started = !!path.startedAt || steps.some(step => step.progress?.started);
    const required = steps.reduce((total, step) => total + (step.progress?.required || 0), 0), done = steps.reduce((total, step) => total + (step.progress?.done || 0), 0);
    const available = steps.filter(step => step.course), missing = steps.length - available.length;
    const next = steps.find(step => step.course && step.progress.required && !step.progress.completed) || null;
    const recommended = !started && !allCompleted && !missing && !!next;
    const categories = [...new Set(available.map(step => step.course.category).filter(value => typeof value === "string" && value.trim()))];
    const levels = [...new Set(available.map(step => step.course.level || step.course.difficulty).filter(value => typeof value === "string" && value.trim()))];
    return [{ ...path, courseKeys: keys, steps, next, missing, categories, levels, allCompleted, started, recommended,
      completedCourses: steps.filter(step => step.progress?.completed).length, required, done, percent: required ? Math.round(done / required * 100) : 0,
      status: allCompleted ? "completed" : started ? "progress" : "new" }];
  });
}

export function learningPathStats(paths) {
  return { total: paths.length, progress: paths.filter(path => path.status === "progress").length, completed: paths.filter(path => path.allCompleted).length, recommended: paths.filter(path => path.recommended).length };
}
export function filterLearningPaths(paths, { view = "all", category = "all", search = "" } = {}) {
  const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return paths.filter(path => {
    if (view === "recommended" ? !path.recommended : view !== "all" && path.status !== view) return false;
    if (category !== "all" && !path.categories.includes(category)) return false;
    const text = [path.title, path.description, ...path.categories, ...path.steps.map(step => step.course?.title)].filter(Boolean).join(" ").toLowerCase();
    return words.every(word => text.includes(word));
  });
}

export function saveLearningPath(email, courses, { id = "", title, description = "", courseKeys }, now = new Date().toISOString()) {
  const paths = readLearningPaths(email), previous = id ? paths.find(path => path?.id === id) : null;
  if (id && !previous) throw new Error("This learning path is no longer available.");
  const name = String(title || "").trim(), details = String(description || "").trim();
  if (!name || name.length > 100) throw new Error("Enter a path name between 1 and 100 characters.");
  if (details.length > 500) throw new Error("Keep the description to 500 characters or fewer.");
  const keys = [...new Set(Array.isArray(courseKeys) ? courseKeys : [])];
  if (!keys.length) throw new Error("Choose at least one enrolled course.");
  const known = new Set(courses.map(pathCourseKey));
  if (keys.some(key => !known.has(key) && !previous?.courseKeys?.includes(key))) throw new Error("Choose courses from your current enrollments.");
  const path = { ...previous, id: previous?.id || uid(), title: name, description: details, courseKeys: keys,
    createdAt: previous?.createdAt || now, updatedAt: now, completedAt: previous?.completedAt || null };
  writeLearningPaths(email, previous ? paths.map(item => item?.id === id ? path : item) : [...paths, path]);
  return path;
}
export function deleteLearningPath(email, id) {
  const paths = readLearningPaths(email);
  if (!paths.some(path => path?.id === id)) throw new Error("This learning path is no longer available.");
  writeLearningPaths(email, paths.filter(path => path?.id !== id));
}
export function startLearningPath(email, id, now = new Date().toISOString()) {
  const paths = readLearningPaths(email), path = paths.find(item => item?.id === id);
  if (!path) throw new Error("This learning path is no longer available.");
  if (!path.startedAt) writeLearningPaths(email, paths.map(item => item?.id === id ? { ...item, startedAt: now } : item));
}
export function recordPathCompletions(email, evaluated, now = new Date().toISOString()) {
  const completed = new Set(evaluated.filter(path => path.allCompleted).map(path => path.id));
  const paths = readLearningPaths(email); let changed = false;
  const next = paths.map(path => { if (path && completed.has(path.id) && !path.completedAt) { changed = true; return { ...path, completedAt: now }; } return path; });
  if (changed) writeLearningPaths(email, next);
}

import { ASSIGNMENT_EVENT, assignmentKey, submissionKey, norm, read, save, uid, putAttachment, deleteAttachment } from "./assignmentStorage.js";

export const assignmentCourseKey = course => `${norm(course.teacherEmail || course.instructorEmail)}::${course.id}`;
export const assignmentDraftKey = (email, assignment) => `educonnect.assignmentDraft.v1.${encodeURIComponent(norm(email))}.${encodeURIComponent(norm(assignment.teacherEmail))}.${encodeURIComponent(String(assignment.courseId))}.${encodeURIComponent(String(assignment.id))}`;
export const assignmentClosed = (assignment, now = Date.now()) => !!assignment.dueAt && Number.isFinite(Date.parse(assignment.dueAt)) && Date.parse(assignment.dueAt) <= now;
const matchesAssignment = (record, assignment) => String(record.assignmentId) === String(assignment.id) && String(record.courseId) === String(assignment.courseId) && norm(record.teacherEmail) === norm(assignment.teacherEmail);
const emit = () => window.dispatchEvent(new Event(ASSIGNMENT_EVENT));
export function subscribeStudentAssignments(callback) {
  [ASSIGNMENT_EVENT, "storage", "focus"].forEach(event => window.addEventListener(event, callback));
  return () => [ASSIGNMENT_EVENT, "storage", "focus"].forEach(event => window.removeEventListener(event, callback));
}

export function readStudentSubmissions(email, assignment) {
  return read(submissionKey(email, assignment.id)).filter(record => record && matchesAssignment(record, assignment) && norm(record.studentEmail) === norm(email))
    .sort((a, b) => (Date.parse(b.submittedAt) || 0) - (Date.parse(a.submittedAt) || 0));
}

export function readAssignmentDraft(email, assignment) {
  try {
    const draft = JSON.parse(localStorage.getItem(assignmentDraftKey(email, assignment)) || "null");
    if (!draft || !draft.id || typeof draft.answer !== "string" || !matchesAssignment(draft, assignment) || norm(draft.studentEmail) !== norm(email)) return null;
    if (readStudentSubmissions(email, assignment).some(record => record.sourceDraftId === draft.id)) return null;
    return draft;
  } catch { return null; }
}

export function validPublishedAssignment(assignment, course) {
  return !!(assignment?.id && assignment.published && String(assignment.courseId) === String(course.id) && norm(assignment.teacherEmail) === norm(course.teacherEmail || course.instructorEmail) &&
    typeof assignment.title === "string" && assignment.title.trim() && typeof assignment.instructions === "string" && assignment.instructions.trim() &&
    Number.isFinite(Number(assignment.maxMarks)) && Number(assignment.maxMarks) > 0);
}

export function studentAssignmentLibrary(email, courses, publishedCourses = [], now = Date.now()) {
  const seen = new Set();
  return courses.flatMap(enrolled => {
    const teacher = enrolled.teacherEmail || enrolled.instructorEmail;
    if (!teacher) return [];
    const published = publishedCourses.find(course => assignmentCourseKey(course) === assignmentCourseKey(enrolled));
    const course = { ...published, ...enrolled, thumbnail: published?.thumbnail || enrolled.thumbnail, image: published?.image || enrolled.image };
    return read(assignmentKey(teacher, course.id)).filter(assignment => validPublishedAssignment(assignment, course)).flatMap(assignment => {
      const key = `${assignmentCourseKey(course)}::${assignment.id}`;
      if (seen.has(key)) return [];
      seen.add(key);
      const submissions = readStudentSubmissions(email, assignment), latest = submissions[0] || null, draft = readAssignmentDraft(email, assignment);
      const closed = assignmentClosed(assignment, now);
      const status = latest?.gradedAt ? "graded" : latest ? "submitted" : closed ? "overdue" : draft ? "progress" : "pending";
      return [{ key, course, assignment, submissions, latest, draft, closed, status }];
    });
  });
}

export function assignmentLibraryStats(entries) {
  return { total: entries.length, pending: entries.filter(entry => !entry.latest).length,
    submitted: entries.filter(entry => entry.status === "submitted").length, graded: entries.filter(entry => entry.status === "graded").length };
}

export function filterStudentAssignments(entries, { search = "", course = "all", status = "all", sort = "due" } = {}) {
  const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return entries.filter(entry => {
    if (course !== "all" && assignmentCourseKey(entry.course) !== course) return false;
    if (status === "pending" ? !!entry.latest : status !== "all" && entry.status !== status) return false;
    const text = [entry.assignment.title, entry.assignment.instructions, entry.course.title, entry.course.instructor, entry.course.instructorName].filter(Boolean).join(" ").toLowerCase();
    return words.every(word => text.includes(word));
  }).sort((a, b) => {
    if (sort === "title") return a.assignment.title.localeCompare(b.assignment.title);
    if (sort === "latest") return (Date.parse(b.assignment.updatedAt || b.assignment.createdAt) || 0) - (Date.parse(a.assignment.updatedAt || a.assignment.createdAt) || 0);
    if (sort === "marks") return Number(b.assignment.maxMarks) - Number(a.assignment.maxMarks);
    const aDue = Date.parse(a.assignment.dueAt), bDue = Date.parse(b.assignment.dueAt);
    return (Number.isFinite(aDue) ? aDue : Infinity) - (Number.isFinite(bDue) ? bDue : Infinity) || a.assignment.title.localeCompare(b.assignment.title);
  });
}

function currentAssignment(entry, submitting = false) {
  const assignment = read(assignmentKey(entry.assignment.teacherEmail, entry.assignment.courseId)).find(record => String(record.id) === String(entry.assignment.id) && validPublishedAssignment(record, entry.course));
  if (!assignment) throw new Error("This assignment is no longer available. Your saved work has been kept.");
  if (submitting && assignmentClosed(assignment)) throw new Error("The submission deadline has passed. Your saved draft has been kept.");
  return assignment;
}

function validateWork(answer, file, retained) {
  const text = String(answer || "").trim();
  if (text.length > 20000) throw new Error("Your answer must be 20,000 characters or fewer.");
  if (!text && !file && !retained?.fileId) throw new Error("Write an answer or attach a file before saving.");
  if (file && file.size > 10 * 1024 * 1024) throw new Error("Files must be 10 MB or smaller.");
  return text;
}

export async function saveStudentAssignmentDraft(email, entry, { answer, file = null, keepAttachment = true }, attachments = { put: putAttachment, remove: deleteAttachment }) {
  const assignment = currentAssignment(entry), previous = readAssignmentDraft(email, assignment);
  const retained = keepAttachment ? previous : null;
  const text = validateWork(answer, file, retained);
  const id = previous?.id || uid(), uploaded = file ? `assignment-draft-${uid()}` : null;
  try {
    if (file) await attachments.put(uploaded, file);
    currentAssignment(entry);
    const draft = { id, assignmentId: assignment.id, courseId: assignment.courseId, teacherEmail: assignment.teacherEmail, studentEmail: email,
      answer: text, fileId: uploaded || retained?.fileId || null, fileName: file?.name || retained?.fileName || "", fileSize: file ? file.size : retained?.fileSize || 0,
      createdAt: previous?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    localStorage.setItem(assignmentDraftKey(email, assignment), JSON.stringify(draft)); emit();
    if (previous?.fileId && previous.fileId !== draft.fileId) try { await attachments.remove(previous.fileId); } catch { /* The new draft is already saved. */ }
    return draft;
  } catch (error) { if (uploaded) try { await attachments.remove(uploaded); } catch { /* Keep the original save error. */ } throw error; }
}

export async function submitStudentAssignment(email, entry, { id = uid(), answer, file = null, keepAttachment = true }, attachments = { put: putAttachment, remove: deleteAttachment }) {
  const previous = readStudentSubmissions(email, entry.assignment).find(record => record.id === id);
  if (previous) return { record: previous, isNew: false };
  let assignment = currentAssignment(entry, true);
  const draft = readAssignmentDraft(email, assignment), retained = keepAttachment ? draft : null;
  const text = validateWork(answer, file, retained), uploaded = file ? `assignment-${id}` : null;
  let committed = false;
  try {
    if (file) await attachments.put(uploaded, file);
    assignment = currentAssignment(entry, true);
    const record = { id, assignmentId: assignment.id, assignmentTitle: assignment.title, courseId: assignment.courseId, teacherEmail: assignment.teacherEmail, studentEmail: email,
      answer: text, fileId: uploaded || retained?.fileId || null, fileName: file?.name || retained?.fileName || "", fileSize: file ? file.size : retained?.fileSize || 0,
      submittedAt: new Date().toISOString(), late: false, maxMarks: assignment.maxMarks, marks: null, feedback: "", gradedAt: null, sourceDraftId: draft?.id || null };
    const key = submissionKey(email, assignment.id);
    save(key, [...read(key), record]); committed = true;
    try { localStorage.removeItem(assignmentDraftKey(email, assignment)); } catch { /* sourceDraftId also hides a submitted draft. */ }
    if (draft?.fileId && draft.fileId !== record.fileId) try { await attachments.remove(draft.fileId); } catch { /* The submission has already succeeded. */ }
    emit(); return { record, isNew: true };
  } catch (error) { if (uploaded && !committed) try { await attachments.remove(uploaded); } catch { /* Keep the original submission error. */ } throw error; }
}

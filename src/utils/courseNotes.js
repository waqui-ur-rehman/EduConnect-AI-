export const COURSE_NOTES_EVENT = "educonnect:course-notes-changed";
export const courseNotesKey = email => `educonnect.student.${String(email).trim().toLowerCase()}.courseNotes.v1`;
export const noteCourseKey = course => `${String(course?.teacherEmail || course?.instructorEmail || "demo").trim().toLowerCase()}::${String(course?.id || "")}`;
const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function readCourseNotes(email) {
  try {
    const saved = JSON.parse(localStorage.getItem(courseNotesKey(email)) || "{}");
    const data = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    return { ...data, notes: Array.isArray(data.notes) ? data.notes : [], bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : [] };
  } catch { return { notes: [], bookmarks: [] }; }
}

export function saveCourseNotes(email, data) {
  try {
    const next = { ...data, updatedAt: new Date().toISOString() };
    localStorage.setItem(courseNotesKey(email), JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(COURSE_NOTES_EVENT, { detail: { key: courseNotesKey(email) } }));
    return next;
  } catch { return null; }
}

export function subscribeCourseNotes(email, callback) {
  const key = courseNotesKey(email);
  const changed = event => { if (event.detail?.key === key) callback(); };
  const stored = event => { if (!event.key || event.key === key) callback(); };
  window.addEventListener(COURSE_NOTES_EVENT, changed);
  window.addEventListener("storage", stored);
  window.addEventListener("focus", callback);
  return () => { window.removeEventListener(COURSE_NOTES_EVENT, changed); window.removeEventListener("storage", stored); window.removeEventListener("focus", callback); };
}

export function courseLessonCount(course) {
  if (course?.lessonItems?.length) return course.lessonItems.length;
  if (Array.isArray(course?.lessons)) return course.lessons.length;
  return Math.max(0, Number(course?.lessons) || 0);
}

export function savedLessonIndex(course, record) {
  if (record.lessonId !== undefined && record.lessonId !== null && Array.isArray(course?.lessonItems)) {
    return course.lessonItems.findIndex(lesson => String(lesson.id) === String(record.lessonId));
  }
  if (record.lessonIndex === null || record.lessonIndex === undefined || record.lessonIndex === "") return -1;
  const index = Number(record.lessonIndex);
  return Number.isInteger(index) && index >= 0 && index < courseLessonCount(course) ? index : -1;
}

export function savedLessonTitle(course, record) {
  const index = savedLessonIndex(course, record);
  const lesson = index >= 0 ? course?.lessonItems?.[index] || (Array.isArray(course?.lessons) ? course.lessons[index] : null) : null;
  return lesson?.title || record.lessonTitle || (index >= 0 ? `Lesson ${index + 1}` : record.lessonIndex === null ? "General course note" : "Saved lesson unavailable");
}

export const noteHasTimestamp = note => typeof note.seconds === "number" && Number.isFinite(note.seconds) && note.seconds >= 0;
export const noteDisplayTitle = note => String(note.title || "").trim() || String(note.text || "").trim().split(/\r?\n/)[0].slice(0, 100);
export const formatNoteTime = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function saveNoteRecord(data, { id = "", course, lessonIndex = null, title = "", text, seconds = null }, now = new Date().toISOString()) {
  if (!course?.id) throw new Error("Choose one of your enrolled courses.");
  const clean = String(text || "").trim();
  if (!clean || clean.length > 5000) throw new Error("Write a note between 1 and 5,000 characters.");
  if (String(title).trim().length > 100) throw new Error("Note titles must be 100 characters or fewer.");
  const index = lessonIndex === null || lessonIndex === "" ? null : Number(lessonIndex);
  if (index !== null && (!Number.isInteger(index) || index < 0 || index >= courseLessonCount(course))) throw new Error("Choose an available lesson or save a general course note.");
  const previous = id ? data.notes.find(note => note.id === id) : null;
  if (id && !previous) throw new Error("This note is no longer available.");
  const key = noteCourseKey(course);
  const lesson = index === null ? null : course.lessonItems?.[index] || (Array.isArray(course.lessons) ? course.lessons[index] : null);
  const sameLesson = previous && previous.courseKey === key && savedLessonIndex(course, previous) === index;
  const timestamp = index === null ? null : previous ? (sameLesson && noteHasTimestamp(previous) ? previous.seconds : null) : (typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : null);
  const note = { ...previous, id: previous?.id || makeId(), courseKey: key, courseTitle: course.title,
    lessonIndex: index, lessonId: lesson?.id ?? null, lessonTitle: lesson?.title || (index === null ? "" : `Lesson ${index + 1}`),
    title: String(title).trim(), text: clean, seconds: timestamp, createdAt: previous?.createdAt || now, updatedAt: now };
  return { ...data, notes: previous ? data.notes.map(item => item.id === id ? note : item) : [note, ...data.notes] };
}

export function deleteNoteRecord(data, id) {
  if (!data.notes.some(note => note.id === id)) throw new Error("This note is no longer available.");
  return { ...data, notes: data.notes.filter(note => note.id !== id) };
}

export function togglePinnedNote(data, id, now = new Date().toISOString()) {
  if (!data.notes.some(note => note.id === id)) throw new Error("This note is no longer available.");
  return { ...data, notes: data.notes.map(note => note.id === id ? { ...note, pinned: !note.pinned, updatedAt: now } : note) };
}

export function isLessonBookmarked(data, course, index) {
  return data.bookmarks.some(record => record.courseKey === noteCourseKey(course) && savedLessonIndex(course, record) === index);
}

export function toggleLessonBookmark(data, course, index, now = new Date().toISOString()) {
  if (!course?.id || !Number.isInteger(index) || index < 0 || index >= courseLessonCount(course)) throw new Error("This lesson is no longer available.");
  const key = noteCourseKey(course);
  const existing = data.bookmarks.filter(record => record.courseKey === key && savedLessonIndex(course, record) === index);
  if (existing.length) return { ...data, bookmarks: data.bookmarks.filter(record => !existing.some(item => item.key === record.key)) };
  const lesson = course.lessonItems?.[index] || (Array.isArray(course.lessons) ? course.lessons[index] : null);
  return { ...data, bookmarks: [...data.bookmarks, { key: `${key}::${lesson?.id !== undefined ? `lesson:${String(lesson.id)}` : index}`, courseKey: key,
    courseTitle: course.title, lessonIndex: index, lessonId: lesson?.id ?? null,
    lessonTitle: lesson?.title || `Lesson ${index + 1}`, createdAt: now }] };
}

export const removeLessonBookmark = (data, key) => ({ ...data, bookmarks: data.bookmarks.filter(bookmark => bookmark.key !== key) });

export function notesLibrary(data, courses) {
  const known = new Map(courses.map(course => [noteCourseKey(course), course]));
  const notes = data.notes.filter(note => note && known.has(note.courseKey) && typeof note.text === "string").map(note => ({ note, course: known.get(note.courseKey), index: savedLessonIndex(known.get(note.courseKey), note) }));
  const bookmarks = data.bookmarks.filter(record => record && known.has(record.courseKey)).map(bookmark => ({ bookmark, course: known.get(bookmark.courseKey), index: savedLessonIndex(known.get(bookmark.courseKey), bookmark) }));
  return { notes, bookmarks };
}

export function filterStudyNotes(entries, { search = "", course = "all", sort = "latest", bookmarks = false } = {}) {
  const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return entries.filter(entry => {
    const record = bookmarks ? entry.bookmark : entry.note;
    if (course !== "all" && record.courseKey !== course) return false;
    const text = [entry.course.title, savedLessonTitle(entry.course, record), record.title, record.text].filter(Boolean).join(" ").toLowerCase();
    return words.every(word => text.includes(word));
  }).sort((a, b) => {
    const first = bookmarks ? a.bookmark : a.note, second = bookmarks ? b.bookmark : b.note;
    if (sort === "title") return (bookmarks ? savedLessonTitle(a.course, first) : noteDisplayTitle(first)).localeCompare(bookmarks ? savedLessonTitle(b.course, second) : noteDisplayTitle(second));
    if (sort === "pinned" && Boolean(first.pinned) !== Boolean(second.pinned)) return Number(Boolean(second.pinned)) - Number(Boolean(first.pinned));
    const difference = (new Date(second.updatedAt || second.createdAt).getTime() || 0) - (new Date(first.updatedAt || first.createdAt).getTime() || 0);
    return sort === "oldest" ? -difference : difference;
  });
}

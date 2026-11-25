// Frontend-only shared Q&A store. Same browser + origin, not a real server.
export const DISCUSSIONS_KEY = "educonnect.course.discussions.v1";
export const DISCUSSIONS_EVENT = "educonnect:course-discussions-changed";
export function readDiscussions() {
  try {
    const data = JSON.parse(localStorage.getItem(DISCUSSIONS_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}
export function saveDiscussions(items) {
  try {
    localStorage.setItem(DISCUSSIONS_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(DISCUSSIONS_EVENT));
    return true;
  } catch (error) {
    console.error("Could not save discussions", error);
    return false;
  }
}
export function subscribeDiscussions(callback) {
  const onStorage = event => { if (event.key === DISCUSSIONS_KEY) callback(); };
  window.addEventListener(DISCUSSIONS_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(DISCUSSIONS_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}
export function courseDiscussionKey(course) {
  return `${String(course?.teacherEmail || course?.instructorEmail || "demo").toLowerCase()}::${String(course?.id || "")}`;
}
export function makeDiscussionId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

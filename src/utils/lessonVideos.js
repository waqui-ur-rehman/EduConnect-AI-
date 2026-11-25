// Browser-only video storage. Videos remain on this device/origin.
const DB_NAME = "educonnect-lesson-videos";
const STORE = "videos";
function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export function lessonVideoKey(teacherEmail, courseId, lessonId) {
  return JSON.stringify([String(teacherEmail).toLowerCase(), String(courseId), String(lessonId)]);
}
async function transaction(mode, action) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = action(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export async function saveLessonVideo(key, file) {
  if (!file || !['video/mp4', 'video/webm'].includes(file.type)) throw new Error('Select an MP4 or WebM video.');
  await transaction('readwrite', store => store.put(file, key));
}
export async function loadLessonVideo(key) {
  return (await transaction('readonly', store => store.get(key))) || null;
}
export async function deleteLessonVideo(key) {
  await transaction('readwrite', store => store.delete(key));
}

import { getContentState, refreshContent, saveContent, uploadContentFile } from "./contentApi";
import { loadLessonVideo, lessonVideoKey } from "./lessonVideos";
import { loadBookFile, BOOKS_STORAGE_KEY } from "./books";
import { loadCurriculumResource } from "./studentRecommendations";

const read = (key) => {
  const value = JSON.parse(localStorage.getItem(key) || "[]");
  if (!Array.isArray(value)) throw new Error("The browser backup is not a content list.");
  return value;
};
const dataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

export async function importBrowserContent(kind, email) {
  await refreshContent();
  const state = getContentState();
  if (state.role !== "teacher" || state.email.toLowerCase() !== email.toLowerCase()) throw new Error("Log in as the owner before importing.");
  const original = kind === "courses" ? read(`educonnect.teacher.${email}.courses`)
    : read(BOOKS_STORAGE_KEY).filter((book) => String(book.teacherEmail).toLowerCase() === email.toLowerCase());
  const managed = kind === "courses" ? state.managedCourses : state.managedBooks;
  const records = original.filter((record) => !managed.some((item) => item.legacyId === String(record.id)));
  if (!records.length) return "All saved browser records have already been imported.";
  if (!window.confirm(`Back up and import ${records.length} browser ${kind} as Drafts? Original browser records and files will be retained. Imported content needs Admin approval.`)) return "Import cancelled.";
  const blobs = new Map();
  const backupFiles = {};
  for (const record of records) {
    if (kind === "courses") {
      const key = `educonnect.curriculum.v1.${encodeURIComponent(email.toLowerCase())}.${encodeURIComponent(String(record.id))}`;
      const curriculum = JSON.parse(localStorage.getItem(key) || "{}");
      record.curriculum = { sections: curriculum.sections || [], resources: curriculum.resources || [], links: curriculum.links || [] };
      for (const resource of record.curriculum.resources) {
        const file = await loadCurriculumResource(resource.id);
        if (!file) throw new Error(`The original attachment ${resource.name} is missing. Import stopped.`);
        blobs.set(resource.id, file);
      }
      for (const lesson of record.lessons || []) {
        if (!lesson.hasLocalVideo) continue;
        const key = lessonVideoKey(email, record.id, lesson.id);
        const file = await loadLessonVideo(key);
        if (!file) throw new Error(`The original video for ${lesson.title} is missing. Import stopped before writing content.`);
        blobs.set(key, file);
      }
    } else {
      for (const field of ["pdfFileId", "previewFileId", "coverFileId"]) {
        if (!record[field]) continue;
        const file = await loadBookFile(record[field]);
        if (!file) throw new Error(`The original file for ${record.title} is missing. Import stopped before writing content.`);
        blobs.set(record[field], file);
      }
    }
  }
  for (const [id, file] of blobs) backupFiles[id] = { name: file.name || "", type: file.type, data: await dataUrl(file) };
  const backup = new Blob([JSON.stringify({ format: "educonnect-content-backup-v1", owner: email, exportedAt: new Date().toISOString(), kind, records, files: backupFiles })], { type: "application/json" });
  const url = URL.createObjectURL(backup);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `educonnect-${kind}-backup-${Date.now()}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  if (!window.confirm("Confirm that the backup JSON has downloaded before importing. Cancel to keep only the backup.")) return "Backup prepared. Import cancelled.";

  let completed = 0;
  try {
    for (const record of records) {
      const next = { ...record, mongoContent: false };
      if (kind === "courses") {
        const resources = [];
        for (const resource of record.curriculum.resources) {
          const fileId = await uploadContentFile("document", blobs.get(resource.id));
          resources.push({ id: `remote:${fileId}`, fileId, lessonId: String(resource.lessonId || ""), name: resource.name, size: resource.size || blobs.get(resource.id).size });
        }
        next.curriculum = { ...record.curriculum, resources };
        next.lessons = [];
        for (const lesson of record.lessons || []) {
          const copy = { ...lesson };
          if (lesson.videoUrl || lesson.video || lesson.url) copy.needsUpload = true;
          if (lesson.hasLocalVideo) copy.videoFileId = await uploadContentFile("video", blobs.get(lessonVideoKey(email, record.id, lesson.id)));
          next.lessons.push(copy);
        }
      } else {
        for (const [field, type] of [["pdfFileId", "pdf"], ["previewFileId", "preview"], ["coverFileId", "image"]]) {
          if (record[field]) next[field] = await uploadContentFile(type, blobs.get(record[field]));
        }
      }
      await saveContent(kind, next);
      completed += 1;
    }
  } catch (error) {
    throw new Error(`${completed} records imported. ${error.message} Originals and backup were retained. Retrying skips completed records.`);
  }
  return `${completed} records imported as Drafts. Review and submit them for Admin approval.`;
}

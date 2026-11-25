import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck, Clock3, NotebookPen, Pencil, Play, Save, Trash2 } from "lucide-react";
import { deleteNoteRecord, formatNoteTime, isLessonBookmarked, noteCourseKey, noteHasTimestamp, notesLibrary, readCourseNotes, saveCourseNotes, savedLessonTitle, saveNoteRecord, subscribeCourseNotes, toggleLessonBookmark } from "../../utils/courseNotes";
import NotesBookmarksWorkspace from "./NotesBookmarksWorkspace";
import "./CourseNotes.css";

function LessonNotes({ email, activeCourse, activeLessonIndex = 0, currentTime = 0, canTimestamp = false, onJump }) {
  const [data, setData] = useState(() => readCourseNotes(email));
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState("");
  const [saveTime, setSaveTime] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => { const refresh = () => setData(readCourseNotes(email)); refresh(); return subscribeCourseNotes(email, refresh); }, [email]);
  const library = notesLibrary(data, activeCourse ? [activeCourse] : []);
  const notes = library.notes.filter(entry => entry.index === activeLessonIndex);
  const bookmarks = library.bookmarks.filter(entry => entry.index === activeLessonIndex);
  const bookmarked = activeCourse && isLessonBookmarked(data, activeCourse, activeLessonIndex);
  const title = savedLessonTitle(activeCourse, { lessonIndex: activeLessonIndex });
  const commit = transform => {
    try { const next = saveCourseNotes(email, transform(readCourseNotes(email))); if (!next) throw new Error("Could not save. Browser storage may be full or disabled."); setData(next); setNotice(""); return true; }
    catch (error) { setNotice(error.message); return false; }
  };
  const cancelEdit = () => { setEditingId(""); setDraft(""); setSaveTime(false); };
  const save = event => {
    event.preventDefault();
    if (commit(current => saveNoteRecord(current, { id: editingId, course: activeCourse, lessonIndex: activeLessonIndex, title: current.notes.find(note => note.id === editingId)?.title || "", text: draft, seconds: canTimestamp && saveTime ? currentTime : null }))) cancelEdit();
  };
  const toggleBookmark = () => commit(current => toggleLessonBookmark(current, activeCourse, activeLessonIndex));
  return <section className="edc-notes edc-notes-compact">
    <header className="edc-notes-header"><NotebookPen size={21} /><div><h3>Notes & Bookmarks</h3><p>Private notes saved in this browser</p></div></header>
    {activeCourse && <><div className="edc-notes-filters"><button type="button" className="edc-notes-bookmark" aria-pressed={!!bookmarked} onClick={toggleBookmark}>{bookmarked ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}{bookmarked ? "Bookmarked" : "Bookmark lesson"}</button></div><form onSubmit={save} className="edc-notes-form"><label className="edc-notes-sr-only" htmlFor="edc-lesson-note">Your note for {title}</label><textarea id="edc-lesson-note" required maxLength={5000} rows={3} placeholder={`Write a note for ${title}...`} value={draft} onChange={event => setDraft(event.target.value)} />{canTimestamp && !editingId && <label className="edc-notes-timestamp"><input type="checkbox" checked={saveTime} onChange={event => setSaveTime(event.target.checked)} /> Save video time ({formatNoteTime(Number.isFinite(currentTime) ? currentTime : 0)})</label>}<div className="edc-notes-actions"><button type="submit" className="edc-notes-primary"><Save size={16} />{editingId ? "Update note" : "Save note"}</button>{editingId && <button type="button" onClick={cancelEdit}>Cancel edit</button>}</div></form></>}
    {notice && <p role="alert" className="edc-notes-error">{notice}</p>}
    <h4>Saved Notes ({notes.length})</h4>{!notes.length && <p className="edc-notes-help">No notes saved for this lesson yet.</p>}
    <div className="edc-notes-list">{notes.map(({ note, course, index }) => <article key={note.id} className="edc-notes-item"><div className="edc-notes-meta">{course.title} · {savedLessonTitle(course, note)}{noteHasTimestamp(note) && <span><Clock3 size={13} />{formatNoteTime(note.seconds)}</span>}</div>{note.title && <strong>{note.title}</strong>}<p>{note.text}</p><div className="edc-notes-actions">{noteHasTimestamp(note) && onJump && <button type="button" onClick={() => onJump(course.id, index, note.seconds)}><Play size={14} />Jump to {formatNoteTime(note.seconds)}</button>}<button type="button" onClick={() => { setEditingId(note.id); setDraft(note.text); setSaveTime(false); }}><Pencil size={14} /> Edit</button><button type="button" onClick={() => { if (window.confirm("Delete this note? This cannot be undone.")) { if (commit(current => deleteNoteRecord(current, note.id)) && editingId === note.id) cancelEdit(); } }}><Trash2 size={14} /> Delete</button></div></article>)}</div>
    <h4>Bookmarked Lessons ({bookmarks.length})</h4>{!bookmarks.length && <p className="edc-notes-help">This lesson has not been bookmarked.</p>}
    <div className="edc-notes-list">{bookmarks.map(({ bookmark, course, index }) => <div className="edc-notes-item edc-notes-bookmark-item" key={bookmark.key}><span><BookmarkCheck size={16} />{course.title} · {savedLessonTitle(course, bookmark)}</span><div className="edc-notes-actions">{onJump && <button type="button" onClick={() => onJump(course.id, index, 0)}><Play size={14} /> Open</button>}<button type="button" onClick={toggleBookmark}><Trash2 size={14} /> Remove</button></div></div>)}</div>
  </section>;
}

export default function CourseNotes({ compact = false, email = "student", activeCourse, activeLessonIndex = 0, ...props }) {
  return compact ? <LessonNotes key={`${email}::${noteCourseKey(activeCourse)}::${activeLessonIndex}`} email={email} activeCourse={activeCourse} activeLessonIndex={activeLessonIndex} {...props} /> : <NotesBookmarksWorkspace key={email} email={email} {...props} />;
}

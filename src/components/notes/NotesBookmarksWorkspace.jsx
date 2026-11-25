import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, BookOpen, CalendarDays, ChevronLeft, ChevronRight, Clock3, FileText, GraduationCap, MoreVertical, Pencil, Play, Plus, Search, Trash2, X } from "lucide-react";
import { courseLessonCount, deleteNoteRecord, filterStudyNotes, formatNoteTime, noteCourseKey, noteDisplayTitle, noteHasTimestamp, notesLibrary, readCourseNotes, removeLessonBookmark, saveCourseNotes, savedLessonIndex, savedLessonTitle, saveNoteRecord, subscribeCourseNotes, togglePinnedNote } from "../../utils/courseNotes";
import notesArt from "../../assets/student-notes.svg";
import "./NotesBookmarksWorkspace.css";

const PAGE_SIZE = 4;
const dateLabel = value => { const date = new Date(value); return value && Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "Not recorded"; };
const recordDate = record => new Date(record.updatedAt || record.createdAt).getTime() || 0;

function CourseCover({ course, lesson }) {
  const [failedSource, setFailedSource] = useState(null);
  const source = lesson?.thumbnail || course.thumbnail || course.image;
  const duration = /^\d+:\d{2}$/.test(String(lesson?.duration || "")) ? lesson.duration : Number(lesson?.duration) > 0 ? formatNoteTime(Math.round(Number(lesson.duration) * 60)) : "";
  return <span className="edc-nb-cover">{source && source !== failedSource ? <img src={source} alt="" onError={() => setFailedSource(source)} /> : <BookOpen size={25} />}<span className="edc-nb-cover-time">{duration}</span></span>;
}

function Pagination({ count, page, onChange, label }) {
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const visible = [...new Set([1, page - 1, page, page + 1, pages])].filter(value => value >= 1 && value <= pages).sort((a, b) => a - b);
  return <footer className="edc-nb-pagination"><span>{count ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, count)} of ${count} ${label}` : `0 ${label}`}</span><nav aria-label={`${label} pages`}><button type="button" aria-label={`Previous ${label} page`} disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={15} /></button>{visible.map((value, index) => <span key={value}>{index > 0 && value - visible[index - 1] > 1 && <span className="edc-nb-ellipsis">…</span>}<button type="button" aria-label={`${label} page ${value}`} aria-current={page === value ? "page" : undefined} onClick={() => onChange(value)}>{value}</button></span>)}<button type="button" aria-label={`Next ${label} page`} disabled={page >= pages} onClick={() => onChange(page + 1)}><ChevronRight size={15} /></button></nav></footer>;
}

export default function NotesBookmarksWorkspace({ email = "student", courses = [], publishedCourses = [], onJump, onNavigate }) {
  const [data, setData] = useState(() => readCourseNotes(email));
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [activeView, setActiveView] = useState("notes");
  const [noteSort, setNoteSort] = useState("latest");
  const [bookmarkSort, setBookmarkSort] = useState("latest");
  const [notePage, setNotePage] = useState(1);
  const [bookmarkPage, setBookmarkPage] = useState(1);
  const [showCourses, setShowCourses] = useState(false);
  const [menu, setMenu] = useState(null);
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ courseKey: "", lessonIndex: "", title: "", text: "" });
  const [formError, setFormError] = useState("");
  const dialog = useRef(null), notesPanel = useRef(null), bookmarksPanel = useRef(null);

  useEffect(() => { const refresh = () => setData(readCourseNotes(email)); refresh(); return subscribeCourseNotes(email, refresh); }, [email]);
  useEffect(() => { if (modal && !dialog.current?.open) dialog.current?.showModal(); else if (!modal && dialog.current?.open) dialog.current.close(); }, [modal]);
  useEffect(() => {
    if (!menu) return;
    const close = event => { if (!event.target.closest(".edc-nb-menu")) setMenu(null); };
    const escape = event => { if (event.key === "Escape") setMenu(null); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [menu]);

  const owned = useMemo(() => courses.map(course => {
    const published = publishedCourses.find(item => noteCourseKey(item) === noteCourseKey(course));
    return { ...published, ...course, thumbnail: course.thumbnail || course.image || published?.thumbnail || published?.image };
  }), [courses, publishedCourses]);
  const library = useMemo(() => notesLibrary(data, owned), [data, owned]);
  const notes = useMemo(() => filterStudyNotes(library.notes, { search, course: courseFilter, sort: noteSort }), [library.notes, search, courseFilter, noteSort]);
  const bookmarks = useMemo(() => filterStudyNotes(library.bookmarks, { search, course: courseFilter, sort: bookmarkSort, bookmarks: true }), [library.bookmarks, search, courseFilter, bookmarkSort]);
  const currentNotePage = Math.min(notePage, Math.max(1, Math.ceil(notes.length / PAGE_SIZE)));
  const currentBookmarkPage = Math.min(bookmarkPage, Math.max(1, Math.ceil(bookmarks.length / PAGE_SIZE)));
  const courseGroups = owned.map(course => ({ course, count: library.notes.filter(entry => entry.note.courseKey === noteCourseKey(course)).length })).filter(group => group.count);
  const latest = [...library.notes.map(entry => ({ record: entry.note, view: "notes" })), ...library.bookmarks.map(entry => ({ record: entry.bookmark, view: "bookmarks" }))].sort((a, b) => recordDate(b.record) - recordDate(a.record))[0];
  const selectedCourse = owned.find(course => noteCourseKey(course) === form.courseKey);
  const reader = modal?.mode === "read" ? library.notes.find(entry => entry.note.id === modal.id) : null;

  const filter = (setter, value) => { setter(value); setNotePage(1); setBookmarkPage(1); setMenu(null); };
  const focusPanel = view => { setActiveView(view); (view === "notes" ? notesPanel : bookmarksPanel).current?.focus({ preventScroll: true }); };
  const commit = (transform, message = "") => {
    try { const next = saveCourseNotes(email, transform(readCourseNotes(email))); if (!next) throw new Error("Could not save. Browser storage may be full or disabled."); setData(next); setNotice(message); return true; }
    catch (error) { setNotice(error.message); return false; }
  };
  const openEditor = (entry = null, bookmarkEntry = null) => {
    const course = entry?.course || bookmarkEntry?.course || owned.find(item => noteCourseKey(item) === courseFilter) || owned[0];
    if (!course) { setNotice("Enroll in a course to add your first note."); return; }
    setForm({ courseKey: noteCourseKey(course), lessonIndex: entry ? entry.note.lessonIndex === null ? "" : entry.index >= 0 ? String(entry.index) : "unavailable" : bookmarkEntry ? String(bookmarkEntry.index) : "", title: entry?.note.title || "", text: entry?.note.text || "" });
    setFormError(""); setMenu(null); setModal({ mode: "edit", id: entry?.note.id || "" });
  };
  const save = event => {
    event.preventDefault();
    try {
      const next = saveNoteRecord(readCourseNotes(email), { id: modal.id, course: selectedCourse, lessonIndex: form.lessonIndex, title: form.title, text: form.text });
      const saved = saveCourseNotes(email, next);
      if (!saved) throw new Error("Could not save. Browser storage may be full or disabled.");
      setData(saved); setModal(null); setNotice(modal.id ? "Note updated." : "Note saved."); setNotePage(1); focusPanel("notes");
    } catch (error) { setFormError(error.message); }
  };
  const openLesson = entry => {
    setMenu(null);
    const record = entry.note || entry.bookmark;
    const index = savedLessonIndex(entry.course, record);
    if (index < 0) { setNotice("This saved lesson is no longer available. Your saved content has been kept."); return; }
    if (onJump) { setModal(null); onJump(entry.course.id, index, noteHasTimestamp(record) ? record.seconds : 0); }
  };
  const deleteNote = entry => {
    if (window.confirm("Delete this note? This cannot be undone.")) {
      if (commit(current => deleteNoteRecord(current, entry.note.id), "Note deleted.") && modal?.id === entry.note.id) setModal(null);
    }
  };
  const empty = (kind, filtered) => <div className="edc-nb-empty">{kind === "notes" ? <FileText size={27} /> : <Bookmark size={27} />}<strong>{filtered ? "No matching results" : kind === "notes" ? "Your notes start here" : "No bookmarked lessons yet"}</strong><p>{filtered ? "Try a different search or course filter." : kind === "notes" ? "Save your own ideas and key points from your courses." : "Bookmark a lesson in your learning player to find it here."}</p>{filtered ? <button type="button" onClick={() => { filter(setSearch, ""); filter(setCourseFilter, "all"); }}>Clear filters</button> : kind === "notes" && owned.length ? <button type="button" onClick={() => openEditor()}><Plus size={14} /> Add your first note</button> : onNavigate && <button type="button" onClick={() => onNavigate("learning")}>Go to My Learning <ChevronRight size={14} /></button>}</div>;

  return <section className={`edc-study-notes ${activeView === "bookmarks" ? "edc-nb-bookmarks-selected" : ""}`}>
    <header className="edc-nb-heading"><h2><Bookmark size={29} /> Notes & Bookmarks</h2><p>Keep your study notes and saved lessons in one place for quick access.</p><img src={notesArt} alt="" /></header>

    <div className="edc-nb-stats">
      <button type="button" className="edc-nb-stat" onClick={() => focusPanel("notes")}><span><FileText size={26} /></span><span><small>Total Notes</small><strong>{library.notes.length}</strong></span></button>
      <button type="button" className="edc-nb-stat edc-nb-stat-green" onClick={() => focusPanel("bookmarks")}><span><Bookmark size={26} /></span><span><small>Bookmarked Lessons</small><strong>{library.bookmarks.length}</strong></span></button>
      <button type="button" className="edc-nb-stat edc-nb-stat-amber" aria-expanded={showCourses} onClick={() => setShowCourses(value => !value)}><span><BookOpen size={27} /></span><span><small>Courses with Notes</small><strong>{courseGroups.length}</strong></span></button>
      <button type="button" className="edc-nb-stat edc-nb-stat-blue edc-nb-stat-date" disabled={!latest} onClick={() => { filter(setSearch, ""); filter(setCourseFilter, "all"); setNoteSort("latest"); setBookmarkSort("latest"); focusPanel(latest.view); }}><span><Clock3 size={26} /></span><span><small>Last Updated</small><strong>{latest ? dateLabel(latest.record.updatedAt || latest.record.createdAt) : "No activity yet"}</strong></span></button>
    </div>
    {showCourses && <section className="edc-nb-course-groups" aria-label="Courses with notes"><header><h3>Courses with Notes</h3><button type="button" aria-label="Close course list" onClick={() => setShowCourses(false)}><X size={17} /></button></header>{courseGroups.length ? <div>{courseGroups.map(({ course, count }) => <button type="button" key={noteCourseKey(course)} onClick={() => { filter(setCourseFilter, noteCourseKey(course)); setShowCourses(false); focusPanel("notes"); }}><BookOpen size={18} /><span>{course.title}<small>{count} {count === 1 ? "note" : "notes"}</small></span><ChevronRight size={15} /></button>)}</div> : <p>Courses will appear here when you save a note.</p>}</section>}

    <div className="edc-nb-toolbar"><div className="edc-nb-tabs" aria-label="Choose notes or bookmarks"><button type="button" aria-pressed={activeView === "notes"} onClick={() => focusPanel("notes")}><FileText size={18} /> My Notes ({library.notes.length})</button><button type="button" aria-pressed={activeView === "bookmarks"} onClick={() => focusPanel("bookmarks")}><Bookmark size={18} /> My Bookmarks ({library.bookmarks.length})</button></div><div className="edc-nb-filters"><label className="edc-nb-search"><Search size={16} /><input type="search" aria-label="Search notes or bookmarks" placeholder="Search notes or bookmarks..." value={search} onChange={event => filter(setSearch, event.target.value)} />{search && <button type="button" aria-label="Clear search" onClick={() => filter(setSearch, "")}><X size={14} /></button>}</label><select aria-label="Filter notes and bookmarks by course" value={courseFilter} onChange={event => filter(setCourseFilter, event.target.value)}><option value="all">All Courses</option>{owned.map(course => <option key={noteCourseKey(course)} value={noteCourseKey(course)}>{course.title}</option>)}</select><button type="button" className="edc-nb-primary" disabled={!owned.length} onClick={() => openEditor()}><Plus size={17} /> Add Note</button></div></div>
    {notice && <p className="edc-nb-notice" role="status">{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice("")}><X size={14} /></button></p>}

    <div className="edc-nb-columns">
      <section ref={notesPanel} tabIndex={-1} className={`edc-nb-panel edc-nb-notes-panel ${activeView === "notes" ? "selected" : ""}`} aria-label="Saved Notes"><header><h3><FileText size={20} /> Saved Notes</h3><label><span className="edc-nb-sr-only">Sort notes</span><select value={noteSort} onChange={event => { setNoteSort(event.target.value); setNotePage(1); }}><option value="latest">Sort: Latest</option><option value="oldest">Sort: Oldest</option><option value="title">Sort: Title</option><option value="pinned">Sort: Pinned</option></select></label></header>
        <div className="edc-nb-records">{notes.length ? notes.slice((currentNotePage - 1) * PAGE_SIZE, currentNotePage * PAGE_SIZE).map(({ note, course, index }) => <article className="edc-nb-row" key={note.id}><CourseCover course={course} /><div className="edc-nb-row-copy"><button type="button" className="edc-nb-record-title" onClick={() => setModal({ mode: "read", id: note.id })}>{noteDisplayTitle(note)}</button><p>{note.text}</p><div className="edc-nb-record-meta"><button type="button" className="edc-nb-course-tag" title={course.title} onClick={() => filter(setCourseFilter, note.courseKey)}><GraduationCap size={12} />{course.title}</button><time dateTime={note.updatedAt || note.createdAt}><CalendarDays size={12} />{dateLabel(note.updatedAt || note.createdAt)}</time>{noteHasTimestamp(note) && index >= 0 && <button type="button" onClick={() => openLesson({ note, course, index })}><Play size={11} />{formatNoteTime(note.seconds)}</button>}</div></div><div className="edc-nb-row-actions"><button type="button" aria-label={`Edit note: ${noteDisplayTitle(note)}`} title="Edit note" onClick={() => openEditor({ note, course, index })}><Pencil size={15} /></button><button type="button" aria-label={`Delete note: ${noteDisplayTitle(note)}`} title="Delete note" onClick={() => deleteNote({ note, course, index })}><Trash2 size={15} /></button><button type="button" aria-label={`${note.pinned ? "Unpin" : "Pin"} note: ${noteDisplayTitle(note)}`} title={note.pinned ? "Unpin note" : "Pin note"} aria-pressed={!!note.pinned} onClick={() => commit(current => togglePinnedNote(current, note.id))}><Bookmark size={16} fill={note.pinned ? "currentColor" : "none"} /></button></div></article>) : empty("notes", !!search || courseFilter !== "all")}</div>
        <Pagination count={notes.length} page={currentNotePage} onChange={setNotePage} label="notes" />
      </section>

      <section ref={bookmarksPanel} tabIndex={-1} className={`edc-nb-panel edc-nb-bookmarks-panel ${activeView === "bookmarks" ? "selected" : ""}`} aria-label="Bookmarked Lessons"><header><h3><Bookmark size={20} /> Bookmarked Lessons</h3><label><span className="edc-nb-sr-only">Sort bookmarks</span><select value={bookmarkSort} onChange={event => { setBookmarkSort(event.target.value); setBookmarkPage(1); }}><option value="latest">Sort: Latest</option><option value="oldest">Sort: Oldest</option><option value="title">Sort: Title</option></select></label></header>
        <div className="edc-nb-records">{bookmarks.length ? bookmarks.slice((currentBookmarkPage - 1) * PAGE_SIZE, currentBookmarkPage * PAGE_SIZE).map(({ bookmark, course, index }) => {
          const lesson = index >= 0 ? course.lessonItems?.[index] || (Array.isArray(course.lessons) ? course.lessons[index] : null) : null;
          const entry = { bookmark, course, index };
          return <article className="edc-nb-row edc-nb-bookmark-row" key={bookmark.key}><button type="button" className="edc-nb-open-cover" aria-label={`Open ${savedLessonTitle(course, bookmark)}`} disabled={index < 0 || !onJump} onClick={() => openLesson(entry)}><CourseCover course={course} lesson={lesson} /></button><div className="edc-nb-row-copy"><button type="button" className="edc-nb-record-title" disabled={index < 0 || !onJump} onClick={() => openLesson(entry)}>{savedLessonTitle(course, bookmark)}</button><p className="edc-nb-bookmark-course"><GraduationCap size={12} />{course.title}</p><div className="edc-nb-record-meta"><span><Play size={12} />{index >= 0 ? `Lesson ${index + 1}` : "Lesson unavailable"}</span>{(lesson?.sectionTitle || lesson?.section) && <span>Section: {lesson.sectionTitle || lesson.section}</span>}</div></div><div className="edc-nb-menu"><button type="button" aria-label={`Options for ${savedLessonTitle(course, bookmark)}`} aria-expanded={menu === bookmark.key} onClick={() => setMenu(menu === bookmark.key ? null : bookmark.key)}><MoreVertical size={18} /></button>{menu === bookmark.key && <div className="edc-nb-menu-options"><button type="button" disabled={index < 0 || !onJump} onClick={() => openLesson(entry)}><Play size={14} /> Open lesson</button><button type="button" disabled={index < 0} onClick={() => openEditor(null, entry)}><Plus size={14} /> Add lesson note</button><button type="button" onClick={() => { commit(current => removeLessonBookmark(current, bookmark.key), "Bookmark removed."); setMenu(null); }}><Trash2 size={14} /> Remove bookmark</button></div>}</div></article>;
        }) : empty("bookmarks", !!search || courseFilter !== "all")}</div>
        <Pagination count={bookmarks.length} page={currentBookmarkPage} onChange={setBookmarkPage} label="bookmarks" />
      </section>
    </div>
    <p className="edc-nb-storage-note">Your notes and bookmarks are private and saved in this browser.</p>

    <dialog ref={dialog} className="edc-nb-dialog" aria-labelledby="edc-nb-dialog-title" onCancel={() => setModal(null)} onClick={event => { if (event.target === dialog.current && (event.clientX < dialog.current.getBoundingClientRect().left || event.clientX > dialog.current.getBoundingClientRect().right || event.clientY < dialog.current.getBoundingClientRect().top || event.clientY > dialog.current.getBoundingClientRect().bottom)) setModal(null); }}>
      <header><span><FileText size={21} /><h3 id="edc-nb-dialog-title">{modal?.mode === "read" ? "Your saved note" : modal?.id ? "Edit Note" : "Add Note"}</h3></span><button type="button" aria-label="Close note" onClick={() => setModal(null)}><X size={20} /></button></header>
      {modal?.mode === "read" ? reader ? <div className="edc-nb-reader"><h4>{noteDisplayTitle(reader.note)}</h4><p className="edc-nb-reader-meta">{reader.course.title} · {savedLessonTitle(reader.course, reader.note)}</p><time>{dateLabel(reader.note.updatedAt || reader.note.createdAt)}</time><p className="edc-nb-full-note">{reader.note.text}</p><footer>{reader.index >= 0 && onJump && <button type="button" className="edc-nb-secondary" onClick={() => openLesson(reader)}><Play size={15} />{noteHasTimestamp(reader.note) ? `Open at ${formatNoteTime(reader.note.seconds)}` : "Open lesson"}</button>}<button type="button" className="edc-nb-primary" onClick={() => openEditor(reader)}><Pencil size={15} /> Edit Note</button></footer></div> : <p className="edc-nb-notice">This note is no longer available.</p> : modal && <form onSubmit={save}><div className="edc-nb-form-pair"><label>Course<select required value={form.courseKey} onChange={event => setForm({ ...form, courseKey: event.target.value, lessonIndex: "" })}>{owned.map(course => <option key={noteCourseKey(course)} value={noteCourseKey(course)}>{course.title}</option>)}</select></label><label>Lesson<select value={form.lessonIndex} onChange={event => setForm({ ...form, lessonIndex: event.target.value })}><option value="">General course note</option>{form.lessonIndex === "unavailable" && <option value="unavailable" disabled>Saved lesson unavailable — choose a lesson</option>}{Array.from({ length: courseLessonCount(selectedCourse) }, (_, index) => <option key={index} value={index}>{savedLessonTitle(selectedCourse, { lessonIndex: index })}</option>)}</select></label></div><label>Title <small>(optional)</small><input autoFocus maxLength={100} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Give your note a title" /></label><label>Your note<textarea required maxLength={5000} rows={7} value={form.text} onChange={event => setForm({ ...form, text: event.target.value })} placeholder="Write your own course notes here..." /></label><span className="edc-nb-character-count">{form.text.length.toLocaleString()} / 5,000</span>{formError && <p role="alert" className="edc-nb-form-error">{formError}</p>}<footer><button type="button" className="edc-nb-secondary" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="edc-nb-primary"><FileText size={15} />{modal.id ? "Save Changes" : "Save Note"}</button></footer></form>}
    </dialog>
  </section>;
}

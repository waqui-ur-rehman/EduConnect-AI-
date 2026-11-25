import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, BookOpen, ChartNoAxesCombined, Check, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, Clock3, Download, FileText, Folder, GraduationCap, Layers, LockKeyhole, NotebookPen, Play, UserRound, X } from "lucide-react";
import { readCourseNotes, saveCourseNotes, saveNoteRecord } from "../../utils/courseNotes";
import { downloadFile } from "../assignments/assignmentStorage";
import { buildStudentCurriculum, curriculumCourseKey, curriculumDurationLabel, loadStudentCurriculumFile, readCurriculumBookmarks, studentCurriculumCourses, subscribeStudentCurriculum, toggleCurriculumBookmark } from "./studentCurriculumHelpers";
import { isMongoId, studentQuizzes as loadStudentQuizzes } from "../../utils/mongoQuizApi";
import { studentAssignments as loadStudentAssignments } from "../../utils/mongoAssignmentApi";
import "./StudentCourseCurriculum.css";

function CurriculumDialog({ title, onClose, children }) {
  const dialog = useRef(null);
  useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={dialog} className="edc-cc-dialog" aria-labelledby="edc-cc-dialog-title" onCancel={onClose}><header><span><BookOpen size={21} /><h3 id="edc-cc-dialog-title">{title}</h3></span><button type="button" aria-label="Close curriculum dialog" onClick={onClose}><X size={20} /></button></header>{children}</dialog>;
}

function CourseNoteForm({ email, data, onClose, onSaved }) {
  const [title, setTitle] = useState(""), [text, setText] = useState(""), [lessonIndex, setLessonIndex] = useState(""), [error, setError] = useState("");
  const save = event => {
    event.preventDefault();
    try {
      const next = saveNoteRecord(readCourseNotes(email), { course: data.course, lessonIndex, title, text });
      if (!saveCourseNotes(email, next)) throw new Error("Could not save your note. Browser storage may be full or disabled.");
      onSaved();
    } catch (failure) { setError(failure.message); }
  };
  return <CurriculumDialog title="Add Course Note" onClose={onClose}><form className="edc-cc-note-form" onSubmit={save}><p>{data.course.title}</p><label>Lesson<select value={lessonIndex} onChange={event => setLessonIndex(event.target.value)}><option value="">General course note</option>{data.lessons.map(entry => <option key={entry.key} value={entry.index}>{entry.lesson.title}</option>)}</select></label><label>Title <small>(optional)</small><input autoFocus maxLength={100} value={title} onChange={event => setTitle(event.target.value)} placeholder="Give your note a title" /></label><label>Your Note<textarea required maxLength={5000} rows={6} value={text} onChange={event => setText(event.target.value)} placeholder="Write your own course notes here..." /></label><small>{text.length.toLocaleString()} / 5,000</small>{error && <p className="edc-cc-error" role="alert">{error}</p>}<footer><button type="button" className="edc-cc-secondary" onClick={onClose}>Cancel</button><button type="submit" className="edc-cc-primary"><NotebookPen size={14} />Save Note</button></footer></form></CurriculumDialog>;
}

function CourseCover({ course }) {
  const [failed, setFailed] = useState(null);
  const image = course.thumbnail || course.image;
  return <span className="edc-cc-cover">{image && image !== failed ? <img src={image} alt="" onError={() => setFailed(image)} /> : <GraduationCap size={49} strokeWidth={1.5} />}<span><Play size={11} fill="currentColor" /></span></span>;
}

function CourseCurriculumView({ email, data, onOpenLesson, onOpenQuiz, onNavigate }) {
  const { course, sections } = data;
  const [expanded, setExpanded] = useState(() => [sections.find(section => section.lessons.length)?.key || sections[0]?.key].filter(Boolean));
  const [message, setMessage] = useState(""), [modal, setModal] = useState(""), [downloading, setDownloading] = useState("");
  const curriculumPanel = useRef(null), resourcesPanel = useRef(null);
  const saved = readCurriculumBookmarks(email).includes(curriculumCourseKey(course));
  const allExpanded = sections.length > 0 && sections.every(section => expanded.includes(section.key));
  const level = course.level || course.difficulty || "Not specified";
  const instructor = course.instructorName || course.instructor || course.teacherEmail || course.instructorEmail;
  const download = async resource => {
    if (downloading) return;
    setDownloading(String(resource.id)); setMessage("");
    try { const file = await loadStudentCurriculumFile(resource); downloadFile(file); }
    catch (failure) { setMessage(failure.message || "Could not download this resource."); }
    finally { setDownloading(""); }
  };
  const bookmark = () => { try { const active = toggleCurriculumBookmark(email, course); setMessage(active ? "Course added to your bookmarks in My Learning." : "Course bookmark removed."); } catch { setMessage("Could not save this bookmark. Please try again."); } };
  const focusCurriculum = () => { setExpanded(sections.map(section => section.key)); curriculumPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" }); curriculumPanel.current?.focus({ preventScroll: true }); };
  const openLesson = entry => { if (!entry.locked && entry.visible && onOpenLesson) onOpenLesson(course.id, entry.index); };

  return <><section className="edc-cc-course-banner"><CourseCover course={course} /><div className="edc-cc-course-copy"><h3>{course.title}</h3><div>{instructor && <span><UserRound size={14} />By {instructor}</span>}{course.category && <span><Layers size={14} />{course.category}</span>}{(course.level || course.difficulty) && <span><ChartNoAxesCombined size={14} />{level}</span>}</div></div><div className="edc-cc-banner-progress"><div><span>Your Progress</span><strong>{data.percent}% Completed</strong></div><div className="edc-cc-track" role="progressbar" aria-label={`${course.title} lesson progress`} aria-valuenow={data.percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${data.percent}%` }} /></div><small>{data.completed} of {data.total} lessons completed</small></div></section>
    <div className="edc-cc-metrics"><button type="button" onClick={focusCurriculum}><span><CirclePlayIcon /></span><span><small>Modules</small><strong>{data.moduleCount}</strong></span></button><button type="button" onClick={focusCurriculum}><span><BookOpen size={24} /></span><span><small>Lessons</small><strong>{data.total}</strong></span></button><button type="button" onClick={() => setModal("info")}><span><Clock3 size={24} /></span><span><small>{data.duration.complete ? "Total Duration" : "Recorded Duration"}</small><strong className="edc-cc-metric-text">{data.duration.label}</strong></span></button><button type="button" onClick={() => setModal("info")}><span><ChartNoAxesCombined size={24} /></span><span><small>Level</small><strong className="edc-cc-metric-text">{level}</strong></span></button><button type="button" onClick={() => { resourcesPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" }); resourcesPanel.current?.focus({ preventScroll: true }); }}><span><FileText size={24} /></span><span><small>Resources</small><strong>{data.resources.length}</strong></span></button></div>
    {message && <p className="edc-cc-notice" role="status">{message}<button type="button" aria-label="Dismiss message" onClick={() => setMessage("")}><X size={14} /></button></p>}
    <div className="edc-cc-layout"><section className="edc-cc-panel edc-cc-curriculum" tabIndex={-1} ref={curriculumPanel} aria-label="Course curriculum modules"><header><h3>Course Curriculum</h3><button type="button" disabled={!sections.length} onClick={() => setExpanded(allExpanded ? [] : sections.map(section => section.key))}>{allExpanded ? "Collapse All" : "Expand All"}</button></header>{sections.length ? <div className="edc-cc-module-list">{sections.map((section, moduleIndex) => {
      const open = expanded.includes(section.key), contentId = `edc-cc-${encodeURIComponent(course.key)}-${encodeURIComponent(section.key)}`;
      return <article className={`edc-cc-module ${open ? "expanded" : ""}`} key={section.key}><h4><button type="button" aria-expanded={open} aria-controls={contentId} onClick={() => setExpanded(previous => open ? previous.filter(key => key !== section.key) : [...previous, section.key])}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<Folder size={18} /><strong>{section.authored && !/^module\b/i.test(section.title) ? `Module ${moduleIndex + 1}: ${section.title}` : section.title}</strong><span>{section.completed} / {section.lessons.length} Completed</span>{section.duration.recorded > 0 && <small title={section.duration.complete ? "Module duration" : "Duration for lessons with a recorded length"}><Clock3 size={12} />{section.duration.label}{!section.duration.complete ? " recorded" : ""}</small>}</button></h4>{open && <div className="edc-cc-module-body" id={contentId}>{section.lessons.length ? section.lessons.map((entry, lessonIndex) => <div className={`edc-cc-lesson ${entry.completed ? "completed" : ""}`} key={entry.key}><span className="edc-cc-lesson-dot">{entry.completed ? <Check size={10} /> : null}</span><span className="edc-cc-lesson-icon"><Play size={13} /></span><button type="button" className="edc-cc-lesson-title" disabled={entry.locked || !entry.visible || !onOpenLesson} onClick={() => openLesson(entry)}><span>{section.authored ? `${moduleIndex + 1}.${lessonIndex + 1}` : lessonIndex + 1}</span>{entry.lesson.title}</button><span className="edc-cc-lesson-duration"><Clock3 size={12} />{entry.duration === null ? "—" : curriculumDurationLabel(entry.duration)}</span><button type="button" className={`edc-cc-watch ${entry.completed ? "complete" : ""}`} disabled={entry.locked || !entry.visible || !onOpenLesson} onClick={() => openLesson(entry)} title={!entry.visible ? "This lesson is temporarily unavailable." : entry.locked ? "Complete previous lessons to unlock this lesson." : entry.completed ? "Review this completed lesson" : "Open lesson"}>{!entry.visible ? "Unavailable" : entry.completed ? <><Check size={12} />Completed</> : entry.locked ? <><LockKeyhole size={11} />Locked</> : <><Play size={11} />Watch Now</>}</button></div>) : <p className="edc-cc-module-empty">No lessons have been added to this module yet.</p>}{section.assessments.length > 0 && <div className="edc-cc-assessments">{section.assessments.map(item => <div key={`${item.type}-${item.record.id}`}><ClipboardList size={14} /><span>{item.type === "quiz" ? "Quiz" : "Assignment"}: {item.record.title}</span>{item.done && <small><CheckCircle2 size={12} />{item.type === "quiz" ? "Passed" : "Graded"}</small>}<button type="button" disabled={item.type === "quiz" ? !onOpenQuiz : !onNavigate} onClick={() => item.type === "quiz" ? onOpenQuiz(item.record) : onNavigate("course-assignments")}>{item.type === "quiz" ? "Open Quiz" : "View Assignment"}</button></div>)}</div>}</div>}</article>;
    })}</div> : <div className="edc-cc-empty"><BookOpen size={28} /><strong>No curriculum content yet</strong><p>Your instructor’s published lessons and modules will appear here.</p></div>}</section>
      <aside className="edc-cc-sidebar"><section className="edc-cc-panel edc-cc-progress-panel"><h3>Course Progress</h3><div><div className="edc-cc-progress-ring" style={{ background: `conic-gradient(var(--student-circle-color, #2791F5) ${data.percent}%, var(--student-circle-track, #DFEFFF) 0)` }} role="img" aria-label={`${data.percent}% of lessons completed`}><span>{data.percent}%</span></div><dl><div><dt><CheckCircle2 size={13} />Completed Lessons</dt><dd>{data.completed}</dd></div><div><dt><Play size={13} />Remaining Lessons</dt><dd>{data.remaining}</dd></div><div><dt><Clock3 size={13} />Total Lessons</dt><dd>{data.total}</dd></div></dl></div></section><section className="edc-cc-panel edc-cc-actions"><h3>Course Actions</h3><button type="button" className="edc-cc-primary" disabled={!data.next || !onOpenLesson} onClick={() => openLesson(data.next)}><Play size={14} fill="currentColor" />{data.total && data.completed === data.total ? "Review Lessons" : "Continue Learning"}</button><button type="button" className="edc-cc-secondary" aria-pressed={saved} onClick={bookmark}>{saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}{saved ? "Remove Bookmark" : "Add to Bookmarks"}</button><button type="button" className="edc-cc-secondary" onClick={() => setModal("note")}><NotebookPen size={14} />Add Notes</button></section><section className="edc-cc-panel edc-cc-resources" ref={resourcesPanel} tabIndex={-1} aria-label="Course resources"><h3><Folder size={17} />Course Resources</h3>{data.resources.length ? <div>{data.resources.map(resource => <button type="button" key={resource.id} disabled={!!downloading} onClick={() => download(resource)}><FileText size={15} /><span>{resource.name}</span><Download size={15} /><small>{downloading === String(resource.id) ? "Downloading..." : "Download"}</small></button>)}</div> : <p>No resources have been uploaded for this course yet.</p>}</section></aside>
    </div>
    {modal === "note" && <CourseNoteForm email={email} data={data} onClose={() => setModal("")} onSaved={() => { setModal(""); setMessage("Note saved. You can find it in Notes & Bookmarks."); }} />}
    {modal === "info" && <CurriculumDialog title="Course Information" onClose={() => setModal("")}><div className="edc-cc-info"><h4>{course.title}</h4>{course.description && <p>{course.description}</p>}<dl><div><dt>Modules</dt><dd>{data.moduleCount}</dd></div><div><dt>Lessons</dt><dd>{data.total}</dd></div><div><dt>Level</dt><dd>{level}</dd></div><div><dt>Recorded Duration</dt><dd>{data.duration.label}</dd></div></dl><p>{data.duration.recorded} of {data.total} lessons have a recorded duration. Modules reflect the sections created by your instructor.</p><footer><button type="button" className="edc-cc-primary" onClick={() => setModal("")}>Done</button></footer></div></CurriculumDialog>}
  </>;
}

function CirclePlayIcon() { return <span className="edc-cc-circle-play"><Play size={13} fill="currentColor" /></span>; }

export default function StudentCourseCurriculum({ email, courses = [], publishedCourses = [], onOpenLesson, onOpenQuiz, onNavigate }) {
  const [version, setVersion] = useState(0), [selectedKey, setSelectedKey] = useState("");
  const [remoteAssessments, setRemoteAssessments] = useState({});
  useEffect(() => subscribeStudentCurriculum(() => setVersion(value => value + 1)), []);
  const owned = useMemo(() => { void version; return studentCurriculumCourses(courses, publishedCourses); }, [courses, publishedCourses, version]);
  const mongoCourseIds = owned.filter(item => isMongoId(item.id || item._id)).map(item => String(item.id || item._id)).join(",");
  useEffect(() => {
    void version;
    const mongoCourses = owned.filter(item => isMongoId(item.id || item._id));
    if (!mongoCourses.length) return;
    let active = true;
    Promise.allSettled(mongoCourses.map(async item => {
      const id = String(item.id || item._id);
      const [quizData, assignmentData] = await Promise.all([loadStudentQuizzes(id), loadStudentAssignments(id)]);
      return [item.key, {
        quizzes: (quizData.quizzes || []).map(quiz => ({ ...quiz, courseId: id, teacherEmail: item.teacherEmail || item.instructorEmail })),
        assignments: (assignmentData.assignments || []).map(assignment => ({ ...assignment, courseId: id, teacherEmail: item.teacherEmail || item.instructorEmail })),
        submissions: assignmentData.submissions || [],
      }];
    })).then(results => {
      if (!active) return;
      setRemoteAssessments(Object.fromEntries(results.flatMap(result => result.status === "fulfilled" ? [result.value] : [])));
    });
    return () => { active = false; };
  // `mongoCourseIds` is the stable identity list; owned objects can be recreated by dashboard refreshes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mongoCourseIds, version]);
  const course = owned.find(item => item.key === selectedKey) || owned[0];
  const data = useMemo(() => { void version; return course ? buildStudentCurriculum(email, course,
    remoteAssessments[course.key] || (course.mongoContent ? { quizzes: [], assignments: [], submissions: [] } : undefined)) : null; }, [email, course, remoteAssessments, version]);
  return <section className="edc-student-curriculum"><header className="edc-cc-heading"><div><h2>Course Curriculum</h2><p>Explore the complete course content, lessons, and your progress.</p></div>{owned.length > 0 && <label>Course<select aria-label="Select curriculum course" value={course.key} onChange={event => setSelectedKey(event.target.value)}>{owned.map(item => <option key={item.key} value={item.key}>{item.title}</option>)}</select></label>}</header>{data ? <CourseCurriculumView key={`${email}-${course.key}`} email={email} data={data} onOpenLesson={onOpenLesson} onOpenQuiz={onOpenQuiz} onNavigate={onNavigate} /> : <section className="edc-cc-enroll-empty"><GraduationCap size={34} /><h3>No enrolled courses yet</h3><p>Your course curriculum will appear here after you enroll.</p>{onNavigate && <button type="button" className="edc-cc-secondary" onClick={() => onNavigate("learning")}><BookOpen size={15} />My Learning</button>}</section>}</section>;
}

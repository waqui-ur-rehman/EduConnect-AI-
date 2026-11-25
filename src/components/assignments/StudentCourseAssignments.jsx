import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Award, BadgeCheck, BookOpen, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock3, Download, Eye, FileText, GraduationCap, Layers, LayoutGrid, List, Play, Save, Search, Send, Star, TrendingUp, Upload, X } from "lucide-react";
import { addDemoNotification } from "../../utils/demoNotifications";
import { downloadFile, getAttachment, uid } from "./assignmentStorage";
import { assignmentCourseKey, assignmentLibraryStats, filterStudentAssignments, saveStudentAssignmentDraft, studentAssignmentLibrary, submitStudentAssignment, subscribeStudentAssignments } from "./studentAssignmentHelpers";
import assignmentsArt from "../../assets/student-assignments.svg";
import "./StudentCourseAssignments.css";

const STATUS = { pending: "Pending", progress: "In Progress", submitted: "Submitted", graded: "Graded", overdue: "Overdue" };
const STATUS_ICONS = { pending: Clock3, progress: Clock3, submitted: Send, graded: Check, overdue: AlertTriangle };
const dateLabel = (value, time = false) => { const date = new Date(value); return value && Number.isFinite(date.getTime()) ? date.toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", ...(time ? { hour: "numeric", minute: "2-digit" } : {}) }) : "No deadline"; };
const gradePercent = entry => {
  if (!entry.latest?.gradedAt) return null;
  const rawMarks = entry.latest.marks, rawMaxMarks = entry.latest.maxMarks ?? entry.assignment.maxMarks;
  if (rawMarks == null || String(rawMarks).trim() === "" || rawMaxMarks == null || String(rawMaxMarks).trim() === "") return null;
  const marks = Number(rawMarks), maxMarks = Number(rawMaxMarks);
  return Number.isFinite(marks) && Number.isFinite(maxMarks) && maxMarks > 0 && marks >= 0 && marks <= maxMarks
    ? marks / maxMarks * 100
    : null;
};
function CourseIcon({ course }) {
  const [failed, setFailed] = useState(null);
  const image = course.thumbnail || course.image;
  return <span className="edc-sa-course-icon">{image && image !== failed ? <img src={image} alt="" onError={() => setFailed(image)} /> : <GraduationCap size={17} />}</span>;
}

export default function StudentCourseAssignments({ email, courses = [], publishedCourses = [], onNavigate, dashboardLayout = false }) {
  const [version, setVersion] = useState(0), [now, setNow] = useState(() => Date.now());
  const [search, setSearch] = useState(""), [courseFilter, setCourseFilter] = useState("all"), [statusFilter, setStatusFilter] = useState("all"), [sort, setSort] = useState("due");
  const [view, setView] = useState("grid"), [page, setPage] = useState(1);
  const [modal, setModal] = useState(null), [answer, setAnswer] = useState(""), [file, setFile] = useState(null), [keepAttachment, setKeepAttachment] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState(""), [message, setMessage] = useState(""), [modalMessage, setModalMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef(null), fileInput = useRef(null), busyRef = useRef(false), submissionToken = useRef("");
  useEffect(() => { const refresh = () => { setVersion(value => value + 1); setNow(Date.now()); }; const unsubscribe = subscribeStudentAssignments(refresh); const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => { unsubscribe(); window.clearInterval(timer); }; }, []);
  useEffect(() => { if (modal && !dialog.current?.open) dialog.current?.showModal(); else if (!modal && dialog.current?.open) dialog.current.close(); }, [modal]);
  const entries = useMemo(() => { void version; return studentAssignmentLibrary(email, courses, publishedCourses, now); }, [email, courses, publishedCourses, now, version]);
  const stats = assignmentLibraryStats(entries);
  const gradedEntries = entries.filter(entry => gradePercent(entry) !== null);
  const averageGrade = gradedEntries.length
    ? Math.round(gradedEntries.reduce((total, entry) => total + gradePercent(entry), 0) / gradedEntries.length)
    : null;
  const gradeBands = [
    { label: "A", range: "90–100%", count: gradedEntries.filter(entry => gradePercent(entry) >= 90).length },
    { label: "B", range: "80–89%", count: gradedEntries.filter(entry => gradePercent(entry) >= 80 && gradePercent(entry) < 90).length },
    { label: "C", range: "70–79%", count: gradedEntries.filter(entry => gradePercent(entry) >= 70 && gradePercent(entry) < 80).length },
    { label: "D", range: "60–69%", count: gradedEntries.filter(entry => gradePercent(entry) >= 60 && gradePercent(entry) < 70).length },
    { label: "F", range: "Below 60%", count: gradedEntries.filter(entry => gradePercent(entry) < 60).length },
  ];
  const missedCount = entries.filter(entry => entry.status === "overdue").length;
  const filtered = filterStudentAssignments(entries, {
    search,
    course: courseFilter,
    status: dashboardLayout && statusFilter === "submitted" ? "all" : statusFilter,
    sort,
  }).filter(entry => !dashboardLayout || statusFilter !== "submitted" || Boolean(entry.latest));
  const pageSize = dashboardLayout ? 5 : 6;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)), currentPage = Math.min(page, pages);
  const pageNumbers = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, pages])].filter(value => value >= 1 && value <= pages).sort((a, b) => a - b);
  const selected = modal ? entries.find(entry => entry.key === modal.key) : null;
  const submission = selected?.submissions.find(record => record.id === selectedSubmission) || selected?.latest;
  const retainedFile = selected?.draft?.fileId && keepAttachment && !file ? selected.draft : null;
  const filter = (setter, value) => { setter(value); setPage(1); };
  const metricFilter = value => { setStatusFilter(value); setCourseFilter("all"); setSearch(""); setPage(1); };
  const close = () => { if (!busyRef.current) setModal(null); };
  const open = (entry, mode = "details") => {
    if (busyRef.current) return;
    setModal({ key: entry.key, mode }); setAnswer(entry.draft?.answer || ""); setFile(null); setKeepAttachment(true); setSelectedSubmission(entry.latest?.id || ""); setModalMessage(""); submissionToken.current = uid();
    if (fileInput.current) fileInput.current.value = "";
  };
  const getFile = async record => {
    try { const attachment = await getAttachment(record.fileId); if (!attachment) throw new Error("This attachment is not available in this browser."); downloadFile(attachment); }
    catch (error) { setModalMessage(error.message || "Could not download the attachment."); }
  };
  const saveWork = async (event, asDraft = false) => {
    event.preventDefault();
    if (busyRef.current || !selected) return;
    busyRef.current = true; setBusy(true); setModalMessage("");
    try {
      const work = { answer, file, keepAttachment, id: submissionToken.current };
      if (asDraft) { await saveStudentAssignmentDraft(email, selected, work); setMessage("Draft saved. Choose Continue Work to pick up where you left off."); }
      else {
        const outcome = await submitStudentAssignment(email, selected, work);
        setMessage("Assignment submitted successfully.");
        if (outcome.isNew) try { addDemoNotification("teacher", selected.assignment.teacherEmail, { id: `assignment-submission:${outcome.record.id}`, type: "assignment", title: "New assignment submission", message: `${email} submitted ${selected.assignment.title}.`, link: "course-assignments" }); } catch { /* Submission remains saved if notifications fail. */ }
      }
      setModal(null); setAnswer(""); setFile(null);
    } catch (error) { setModalMessage(error.message || "Could not save your work. Please try again."); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const primaryAction = entry => entry.status === "graded" ? { label: "View Feedback", icon: Star, mode: "feedback" } : entry.status === "submitted" ? { label: "View Submission", icon: FileText, mode: "submission" } : entry.closed ? { label: "Deadline Passed", icon: Clock3, mode: "details", disabled: true } : entry.status === "progress" ? { label: "Continue Work", icon: Play, mode: "submit" } : { label: "Submit Assignment", icon: Upload, mode: "submit" };

  return <section className={`edc-student-assignments${dashboardLayout ? " edc-sa-dashboard" : ""}`}><header className="edc-sa-heading"><h2>{dashboardLayout ? "Assignments & Grades" : "Course Assignments"}</h2><p>{dashboardLayout ? "View, submit, and track your course assignments with grades and feedback." : "View, submit, and track all your course assignments in one place."}</p><img src={assignmentsArt} alt="" /></header>
    <div className="edc-sa-stats">
      <button type="button" className="edc-sa-stat" aria-pressed={statusFilter === "all"} onClick={() => metricFilter("all")}><span><ClipboardList size={27} /></span><span><small>Total Assignments</small><strong>{stats.total}</strong></span></button>
      <button type="button" className="edc-sa-stat blue" aria-pressed={statusFilter === "submitted"} onClick={() => metricFilter("submitted")}><span><CheckCircle2 size={27} /></span><span><small>Submitted</small><strong>{entries.filter(entry => Boolean(entry.latest)).length}</strong></span></button>
      <button type="button" className="edc-sa-stat amber" aria-pressed={statusFilter === "pending"} onClick={() => metricFilter("pending")}><span><Clock3 size={27} /></span><span><small>Pending</small><strong>{stats.pending}</strong></span></button>
      <button type="button" className="edc-sa-stat green" aria-pressed={statusFilter === "graded"} onClick={() => metricFilter("graded")}><span><Award size={28} /></span><span><small>Average Grade</small><strong>{averageGrade === null ? "—" : `${averageGrade}%`}</strong></span></button>
    </div>
    {dashboardLayout && <div className="edc-sa-dashboard-toolbar">
      <nav className="edc-sa-dashboard-tabs" aria-label="Filter assignments">
        {[["all", "All Assignments", stats.total], ["submitted", "Submitted", entries.filter(entry => Boolean(entry.latest)).length], ["pending", "Pending", stats.pending], ["graded", "Graded", stats.graded]].map(([value, label, count]) => (
          <button type="button" key={value} className={statusFilter === value ? "active" : ""} aria-pressed={statusFilter === value} onClick={() => metricFilter(value)}>{label} <span>({count})</span></button>
        ))}
      </nav>
      <label className="edc-sa-dashboard-search"><Search size={16} /><input type="search" aria-label="Search assignments" value={search} onChange={event => filter(setSearch, event.target.value)} placeholder="Search assignments..." />{search && <button type="button" aria-label="Clear assignment search" onClick={() => filter(setSearch, "")}><X size={14} /></button>}</label>
      <select aria-label="Filter assignments by course" value={courseFilter} onChange={event => filter(setCourseFilter, event.target.value)}><option value="all">All Courses</option>{courses.map(course => <option key={assignmentCourseKey(course)} value={assignmentCourseKey(course)}>{course.title}</option>)}</select>
    </div>}
    {dashboardLayout && <div className="edc-sa-dashboard-layout">
      <section className="edc-sa-dashboard-list">
        <header><h3><ClipboardList size={18} />Assignments</h3><label>Sort: <select aria-label="Sort assignments" value={sort} onChange={event => filter(setSort, event.target.value)}><option value="latest">Latest</option><option value="due">Due Date</option><option value="title">Title</option><option value="marks">Marks</option></select></label></header>
        {message && <p className="edc-sa-notice" role="status">{message}<button type="button" aria-label="Dismiss message" onClick={() => setMessage("")}><X size={14} /></button></p>}
        {filtered.length ? <div className="edc-sa-dashboard-rows">{filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(entry => {
          const { assignment, course, status } = entry, StatusIcon = STATUS_ICONS[status], action = primaryAction(entry);
          const grade = gradePercent(entry);
          return <article className="edc-sa-dashboard-row" key={entry.key} tabIndex={0} aria-label={`${assignment.title}. Open assignment details.`} onClick={event => { if (!event.target.closest("button, a")) open(entry, status === "graded" ? "feedback" : "details"); }} onKeyDown={event => { if (event.target === event.currentTarget && ["Enter", " "].includes(event.key)) { event.preventDefault(); open(entry, status === "graded" ? "feedback" : "details"); } }}>
            <CourseIcon course={course} />
            <div className="edc-sa-dashboard-row-copy"><button type="button" onClick={() => open(entry, status === "graded" ? "feedback" : "details")}>{assignment.title}</button><small>{course.title}</small></div>
            <span className="edc-sa-dashboard-due"><CalendarDays size={14} />{dateLabel(assignment.dueAt)}</span>
            <span className={`edc-sa-status ${status}`}><StatusIcon size={12} />{STATUS[status]}</span>
            {grade !== null ? <button type="button" className="edc-sa-dashboard-grade" aria-label={`View grade ${Math.round(grade)} percent`} onClick={() => open(entry, "feedback")}>{Math.round(grade)}%</button> : <button type="button" className="edc-sa-dashboard-action" disabled={action.disabled} onClick={() => open(entry, action.mode)}>{action.label === "Submit Assignment" ? "Submit" : action.label}</button>}
          </article>;
        })}</div> : <section className="edc-sa-empty"><ClipboardList size={30} /><h3>{entries.length ? "No assignments match your filters" : "No published assignments yet"}</h3><p>{entries.length ? "Try another search or filter." : courses.length ? "Assignments appear here when instructors publish them for your enrolled courses." : "Enroll in a course to access assignments from its instructor."}</p>{entries.length > 0 && <button type="button" className="edc-sa-secondary" onClick={() => metricFilter("all")}>Clear Filters</button>}</section>}
        <footer className="edc-sa-pagination"><span>{filtered.length ? `Showing ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)} of ${filtered.length} assignments` : "0 assignments"}</span><nav aria-label="Assignment pages"><button type="button" aria-label="Previous assignment page" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button>{pageNumbers.map((number, index) => <span key={number}>{index > 0 && number - pageNumbers[index - 1] > 1 && <span>…</span>}<button type="button" aria-label={`Assignment page ${number}`} aria-current={currentPage === number ? "page" : undefined} onClick={() => setPage(number)}>{number}</button></span>)}<button type="button" aria-label="Next assignment page" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></nav></footer>
      </section>
      <aside className="edc-sa-performance">
        <section><header><h3><TrendingUp size={18} />Grades &amp; Performance</h3></header>
          <div className="edc-sa-performance-summary">
            <div className="edc-sa-grade-ring" style={{ "--grade": `${averageGrade ?? 0}%` }}><strong>{averageGrade === null ? "—" : `${averageGrade}%`}</strong><small>Overall Grade</small></div>
            <dl><div><dt><CheckCircle2 size={14} />Graded Assignments</dt><dd>{stats.graded}</dd></div><div><dt><Clock3 size={14} />Pending Assignments</dt><dd>{stats.pending}</dd></div><div><dt><AlertTriangle size={14} />Missed Assignments</dt><dd>{missedCount}</dd></div><div><dt><ClipboardList size={14} />Total Assignments</dt><dd>{stats.total}</dd></div></dl>
          </div>
          <div className="edc-sa-grade-breakdown"><h4>Grade Breakdown</h4>{gradedEntries.length ? gradeBands.map(band => <div key={band.label}><span>{band.label} ({band.range})</span><i><b style={{ width: `${Math.round(band.count / gradedEntries.length * 100)}%` }} /></i><strong>{Math.round(band.count / gradedEntries.length * 100)}%</strong></div>) : <p>Grade breakdown will appear after your instructor grades an assignment.</p>}</div>
        </section>
      </aside>
    </div>}
    {!dashboardLayout && <div className="edc-sa-toolbar"><label className="edc-sa-search"><Search size={17} /><input type="search" aria-label="Search assignments" value={search} onChange={event => filter(setSearch, event.target.value)} placeholder="Search assignments..." />{search && <button type="button" aria-label="Clear assignment search" onClick={() => filter(setSearch, "")}><X size={14} /></button>}</label><select aria-label="Filter assignments by course" value={courseFilter} onChange={event => filter(setCourseFilter, event.target.value)}><option value="all">All Courses</option>{courses.map(course => <option key={assignmentCourseKey(course)} value={assignmentCourseKey(course)}>{course.title}</option>)}</select><select aria-label="Filter assignments by status" value={statusFilter} onChange={event => filter(setStatusFilter, event.target.value)}><option value="all">All Status</option><option value="pending">Pending Work</option><option value="progress">In Progress</option><option value="submitted">Submitted</option><option value="graded">Graded</option><option value="overdue">Overdue</option></select><select aria-label="Sort assignments" value={sort} onChange={event => filter(setSort, event.target.value)}><option value="due">Sort by: Due Date</option><option value="latest">Sort by: Latest</option><option value="title">Sort by: Title</option><option value="marks">Sort by: Marks</option></select><div className="edc-sa-view-buttons" aria-label="Assignment layout"><button type="button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}><LayoutGrid size={18} /></button><button type="button" aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={19} /></button></div></div>}
    {!dashboardLayout && <>{message && <p className="edc-sa-notice" role="status">{message}<button type="button" aria-label="Dismiss message" onClick={() => setMessage("")}><X size={14} /></button></p>}
    {filtered.length ? <div className={`edc-sa-cards ${view === "list" ? "list" : ""}`}>{filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(entry => {
      const { assignment, course, status } = entry, StatusIcon = STATUS_ICONS[status], action = primaryAction(entry), ActionIcon = action.icon;
      return <article className={`edc-sa-card ${status}`} key={entry.key} tabIndex={0} aria-label={`${assignment.title}. Press Enter to view details.`} onClick={event => { if (!event.target.closest("button, a")) open(entry); }} onKeyDown={event => { if (event.target === event.currentTarget && ["Enter", " "].includes(event.key)) { event.preventDefault(); open(entry); } }}><div className="edc-sa-card-top"><button type="button" className="edc-sa-course" title={course.title} onClick={() => filter(setCourseFilter, assignmentCourseKey(course))}><CourseIcon course={course} /><span>{course.title}</span></button><span className={`edc-sa-status ${status}`}><StatusIcon size={12} />{STATUS[status]}</span></div><div className="edc-sa-card-copy"><h3><button type="button" onClick={() => open(entry)}>{assignment.title}</button></h3><p>{assignment.instructions}</p></div><div className="edc-sa-card-meta"><span className={entry.closed && !entry.latest ? "late" : ""}><CalendarDays size={15} /><span>Due: <time dateTime={assignment.dueAt || undefined}>{dateLabel(assignment.dueAt)}</time></span></span><span><Layers size={15} />Marks: {assignment.maxMarks}</span></div><div className="edc-sa-card-actions"><button type="button" className={status === "submitted" ? "edc-sa-secondary" : "edc-sa-primary"} disabled={action.disabled} onClick={() => open(entry, action.mode)}><ActionIcon size={13} />{action.label}</button><button type="button" className="edc-sa-secondary" onClick={() => open(entry)}><Eye size={13} /> View Details</button></div></article>;
    })}</div> : <section className="edc-sa-empty"><ClipboardList size={33} /><h3>{entries.length ? "No assignments match your filters" : "No published assignments yet"}</h3><p>{entries.length ? "Try another search, course, or status." : courses.length ? "Assignments will appear here when instructors publish them for your enrolled courses." : "Enroll in a course to access assignments from its instructor."}</p>{entries.length ? <button type="button" className="edc-sa-secondary" onClick={() => metricFilter("all")}>Clear Filters</button> : onNavigate && <button type="button" className="edc-sa-secondary" onClick={() => onNavigate("learning")}><BookOpen size={15} /> My Learning</button>}</section>}
    <footer className="edc-sa-pagination"><span>{filtered.length ? `Showing ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)} of ${filtered.length} assignments` : "0 assignments"}</span><nav aria-label="Assignment pages"><button type="button" aria-label="Previous assignment page" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button>{pageNumbers.map((number, index) => <span key={number}>{index > 0 && number - pageNumbers[index - 1] > 1 && <span>…</span>}<button type="button" aria-label={`Assignment page ${number}`} aria-current={currentPage === number ? "page" : undefined} onClick={() => setPage(number)}>{number}</button></span>)}<button type="button" aria-label="Next assignment page" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></nav></footer></>}

    <dialog ref={dialog} className="edc-sa-dialog" aria-labelledby="edc-sa-dialog-title" onCancel={event => { if (busyRef.current) event.preventDefault(); else close(); }}><header><span><ClipboardList size={22} /><h3 id="edc-sa-dialog-title">{modal?.mode === "submit" ? "Your Assignment" : modal?.mode === "feedback" ? "Assignment Feedback" : modal?.mode === "submission" ? "Your Submission" : "Assignment Details"}</h3></span><button type="button" aria-label="Close assignment" disabled={busy} onClick={close}><X size={20} /></button></header>{selected ? <div className="edc-sa-dialog-body"><div className="edc-sa-dialog-assignment"><span>{selected.course.title}</span><h4>{selected.assignment.title}</h4><div><span><CalendarDays size={14} />{dateLabel(selected.assignment.dueAt, true)}</span><span><Layers size={14} />{selected.assignment.maxMarks} marks</span></div></div><nav className="edc-sa-dialog-tabs" aria-label="Assignment sections"><button type="button" disabled={busy} aria-pressed={modal.mode === "details"} onClick={() => setModal({ ...modal, mode: "details" })}>Details</button>{selected.latest && <button type="button" disabled={busy} aria-pressed={["submission", "feedback"].includes(modal.mode)} onClick={() => setModal({ ...modal, mode: selected.latest.gradedAt ? "feedback" : "submission" })}>{selected.latest.gradedAt ? "Submission & Feedback" : "Submission"}</button>}{!selected.closed && <button type="button" disabled={busy} aria-pressed={modal.mode === "submit"} onClick={() => setModal({ ...modal, mode: "submit" })}>{selected.latest ? "Resubmit" : "Your Work"}</button>}</nav>
      {modal.mode === "details" && <section className="edc-sa-instructions"><h5>Instructions</h5><p>{selected.assignment.instructions}</p>{selected.closed && !selected.latest && <p className="edc-sa-deadline-note">The deadline has passed. Contact your instructor if you need an extension.</p>}{!selected.closed && <button type="button" className="edc-sa-primary" onClick={() => setModal({ ...modal, mode: "submit" })}><Upload size={14} />{selected.latest ? "Resubmit Assignment" : selected.draft ? "Continue Work" : "Submit Assignment"}</button>}</section>}
      {["submission", "feedback"].includes(modal.mode) && submission && <section className="edc-sa-submission"><label>Saved submissions<select value={submission.id} disabled={busy} onChange={event => setSelectedSubmission(event.target.value)}>{selected.submissions.map(record => <option key={record.id} value={record.id}>{dateLabel(record.submittedAt, true)}{record.gradedAt ? " — Graded" : " — Submitted"}</option>)}</select></label><h5>Your Submitted Work</h5>{submission.answer && <p>{submission.answer}</p>}{submission.fileId && <button type="button" className="edc-sa-download" onClick={() => getFile(submission)}><Download size={15} />{submission.fileName || "Download attachment"}</button>}{submission.gradedAt ? <div className="edc-sa-feedback"><span><BadgeCheck size={20} /> Graded</span><strong>{submission.marks} / {submission.maxMarks ?? selected.assignment.maxMarks} marks</strong><h5>Instructor Feedback</h5><p>{submission.feedback || "Your instructor has recorded a grade without written feedback."}</p></div> : <p className="edc-sa-review-pending"><Clock3 size={15} />Submitted — awaiting instructor review.</p>}</section>}
      {modal.mode === "submit" && <form className="edc-sa-work-form" onSubmit={saveWork}><details><summary>Assignment instructions</summary><p>{selected.assignment.instructions}</p></details><label>Your answer<textarea rows={7} maxLength={20000} disabled={busy} value={answer} onChange={event => setAnswer(event.target.value)} placeholder="Write your response here..." /></label><small className="edc-sa-answer-count">{answer.length.toLocaleString()} / 20,000</small><label>Attachment <small>(optional, up to 10 MB)</small><input ref={fileInput} type="file" disabled={busy} onChange={event => { const chosen = event.target.files?.[0] || null; if (chosen && chosen.size > 10 * 1024 * 1024) { setModalMessage("Files must be 10 MB or smaller."); event.target.value = ""; setFile(null); } else { setFile(chosen); setModalMessage(""); } }} /></label>{(file || retainedFile) && <div className="edc-sa-chosen-file"><FileText size={16} /><span>{file?.name || retainedFile.fileName}</span><button type="button" aria-label="Remove selected attachment" disabled={busy} onClick={() => { setFile(null); setKeepAttachment(false); if (fileInput.current) fileInput.current.value = ""; }}><X size={15} /></button></div>}{selected.closed && <p className="edc-sa-deadline-note">The submission deadline has passed. You can still save your draft.</p>}<footer><button type="button" className="edc-sa-secondary" disabled={busy} onClick={event => saveWork(event, true)}><Save size={14} />Save Draft</button><button type="submit" className="edc-sa-primary" disabled={busy || selected.closed}><Upload size={14} />{busy ? "Saving..." : "Submit Assignment"}</button></footer></form>}
      {modalMessage && <p className="edc-sa-modal-message" role="alert">{modalMessage}</p>}
    </div> : <p className="edc-sa-modal-message">This assignment is no longer available. Your saved submissions and drafts have been kept.</p>}</dialog>
  </section>;
}

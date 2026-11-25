import { useEffect, useRef, useState } from "react";
import { ArrowRight, Award, BookOpen, Bookmark, BookmarkCheck, ChartNoAxesCombined, Check, CheckCircle2, Clock3, Code2, Database, GraduationCap, LayoutGrid, List, MoreVertical, NotebookPen, Play, RotateCcw, Search, Trash2, UserRound, X } from "lucide-react";
import reactLogo from "../../assets/partners/react.svg";
import pythonLogo from "../../assets/partners/python.svg";
import figmaLogo from "../../assets/partners/figma.svg";
import { matchesCourseSearch } from "../../utils/studentSearch";
import "./StudentLearning.css";

const courseKey = course => `${String(course.teacherEmail || "demo").trim().toLowerCase()}::${course.id}`;
const readBookmarks = key => {
  try { const saved = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(saved) ? saved : []; }
  catch { return []; }
};
const durationLabel = value => {
  if (!value) return "";
  if (/^\d+:\d{2}$/.test(String(value))) return String(value);
  const seconds = Math.round(Number(value) * 60);
  return Number.isFinite(seconds) && seconds > 0 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "";
};

function CourseThumbnail({ course }) {
  const [failed, setFailed] = useState(false);
  const title = `${course.title} ${course.category}`.toLowerCase();
  const image = course.thumbnail || course.image;
  const javascript = /javascript|java script/.test(title);
  const logo = title.includes("react") ? reactLogo : title.includes("python") ? pythonLogo : /figma|ui\/ux|design/.test(title) ? figmaLogo : null;
  const Icon = /database|sql/.test(title) ? Database : Code2;
  const currentLesson = course.lessonItems?.[Math.min(course.completedLessons || 0, Math.max(0, (course.lessonItems?.length || 1) - 1))];
  const duration = durationLabel(currentLesson?.duration);
  return <span className={`edc-ml-thumbnail${javascript ? " edc-ml-thumbnail-js" : ""}`}>
    {image && !failed ? <img className="edc-ml-cover-photo" src={image} alt="" loading="lazy" onError={() => setFailed(true)}/> : logo ? <img className="edc-ml-cover-logo" src={logo} alt=""/> : javascript ? <b>JS</b> : <Icon size={40} strokeWidth={1.6}/>}
    <span className="edc-ml-video-icon"><Play size={10} fill="currentColor"/></span>
    {duration && <small>{duration}</small>}
  </span>;
}

export default function StudentLearning({ email, courses = [], publishedCourses = [], activity = {}, initialFilter = "all", searchQuery = "", onSearchChange, onClearSearch, onResume, onCertificate, onUndo, onRemove, onNavigate, onExplore, children }) {
  const bookmarkKey = `educonnect.student.${email.trim().toLowerCase()}.learningBookmarks`;
  const [bookmarks, setBookmarks] = useState(() => readBookmarks(bookmarkKey));
  const [filter, setFilter] = useState(initialFilter);
  const [view, setView] = useState("list");
  const [openMenu, setOpenMenu] = useState("");
  const [showSamples, setShowSamples] = useState(false);
  const [notice, setNotice] = useState("");
  const samples = useRef(null);
  const searchInput = useRef(null);
  const clearSearch = () => { onClearSearch?.(); searchInput.current?.focus(); };
  useEffect(() => {
    const refresh = () => setBookmarks(readBookmarks(bookmarkKey));
    const outside = event => { if (!event.target.closest(".edc-ml-course-menu")) setOpenMenu(""); };
    const escape = event => { if (event.key === "Escape") setOpenMenu(""); };
    window.addEventListener("storage", refresh);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("storage", refresh);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [bookmarkKey]);
  const courseList = courses.map(course => {
    const published = publishedCourses.find(item => courseKey(item) === courseKey(course));
    return { ...published, ...course, thumbnail: published?.thumbnail || course.thumbnail, image: published?.image || course.image };
  });
  const inProgress = courseList.filter(course => course.progress > 0 && course.progress < 100);
  const completed = courseList.filter(course => course.progress === 100);
  const savedCourses = courseList.filter(course => bookmarks.includes(courseKey(course)));
  const filteredCourses = filter === "progress" ? inProgress : filter === "completed" ? completed : filter === "bookmarks" ? savedCourses : courseList;
  const visible = filteredCourses.filter(course => matchesCourseSearch(course, searchQuery));
  const hours = (Math.max(0, Number(activity.totalSeconds) || 0) / 3600).toLocaleString(undefined, { maximumFractionDigits: 1 });
  const changeFilter = value => { setFilter(value); setOpenMenu(""); };
  const toggleBookmark = course => {
    const key = courseKey(course);
    const next = bookmarks.includes(key) ? bookmarks.filter(item => item !== key) : [...bookmarks, key];
    try { localStorage.setItem(bookmarkKey, JSON.stringify(next)); setBookmarks(next); setNotice(""); }
    catch { setNotice("The course could not be bookmarked. Please try again."); }
    setOpenMenu("");
  };
  const revealSamples = () => {
    setShowSamples(true);
    window.requestAnimationFrame(() => samples.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const tabs = [
    { id: "all", label: "All Courses", count: courseList.length, icon: GraduationCap },
    { id: "progress", label: "In Progress", count: inProgress.length, icon: Play },
    { id: "completed", label: "Completed", count: completed.length, icon: CheckCircle2 },
    { id: "bookmarks", label: "Bookmarks", count: savedCourses.length, icon: Bookmark },
  ];
  const emptyTitle = searchQuery.trim() ? "No matching courses" : filter === "completed" ? "No completed courses yet" : filter === "progress" ? "No courses in progress" : filter === "bookmarks" ? "No bookmarked courses yet" : "Your learning journey starts here";
  const emptyDescription = searchQuery.trim() ? "Try another course, subject, or instructor, or clear your search." : filter === "completed" ? "Finish your course lessons to unlock your completion certificate." : filter === "progress" ? "Start a lesson in one of your enrolled courses to keep learning." : filter === "bookmarks" ? "Use the course menu to bookmark a course you want to revisit." : "Enroll in a course and find all your learning in one place.";

  return <div className="edc-my-learning">
    <header className="edc-ml-heading"><h2>My Learning</h2><p>All your enrolled courses in one place. Continue learning, track progress, and complete your goals.</p></header>
    <section className="edc-ml-stats" aria-label="My learning summary">
      {[{ label: "Enrolled Courses", value: courseList.length, color: "purple", icon: BookOpen, action: () => changeFilter("all") }, { label: "In Progress", value: inProgress.length, color: "amber", icon: Play, action: () => changeFilter("progress") }, { label: "Completed", value: completed.length, color: "blue", icon: CheckCircle2, action: () => changeFilter("completed") }, { label: "Total Learning Hours", value: `${hours} hrs`, color: "green", icon: Clock3, action: () => onNavigate("analytics") }].map(stat => <button type="button" key={stat.label} className={`edc-ml-stat edc-ml-stat-${stat.color}`} onClick={stat.action}><span className="edc-ml-stat-icon"><stat.icon size={27} strokeWidth={1.8}/></span><span><small>{stat.label}</small><strong>{stat.value}</strong></span></button>)}
    </section>
    <form className="edc-ml-search" role="search" aria-label="Search enrolled courses" onSubmit={event => { event.preventDefault(); setOpenMenu(""); }}>
      <button type="submit" aria-label="Search my courses"><Search size={18}/></button>
      <input ref={searchInput} type="search" autoComplete="off" aria-label="Search courses, subjects, and instructors" placeholder="Search courses, subjects, instructors..." value={searchQuery} onChange={event => { onSearchChange?.(event.target.value); setOpenMenu(""); }}/>
      {searchQuery.trim() && <span className="edc-ml-search-count" role="status" aria-live="polite">{visible.length} {visible.length === 1 ? "course" : "courses"}</span>}
      {searchQuery && <button type="button" aria-label="Clear course search" onClick={clearSearch}><X size={16}/></button>}
    </form>
    <div className="edc-ml-toolbar"><nav className="edc-ml-tabs" aria-label="Filter enrolled courses">{tabs.map(tab => <button type="button" key={tab.id} className={filter === tab.id ? "active" : ""} aria-pressed={filter === tab.id} onClick={() => changeFilter(tab.id)}><tab.icon size={17}/><span>{tab.label} ({tab.count})</span></button>)}</nav><div className="edc-ml-view-toggle" aria-label="Course layout"><button type="button" aria-label="Grid view" aria-pressed={view === "grid"} className={view === "grid" ? "active" : ""} onClick={() => { setView("grid"); setOpenMenu(""); }}><LayoutGrid size={18}/></button><button type="button" aria-label="List view" aria-pressed={view === "list"} className={view === "list" ? "active" : ""} onClick={() => { setView("list"); setOpenMenu(""); }}><List size={18}/></button></div></div>
    {notice && <p className="edc-ml-notice" role="status">{notice}</p>}
    <section className={`edc-ml-courses edc-ml-courses-${view}`} aria-label={`${tabs.find(tab => tab.id === filter)?.label} courses`}>
      {visible.map(course => {
        const key = courseKey(course);
        const done = course.progress === 100;
        const saved = bookmarks.includes(key);
        return <article className="edc-ml-course" key={key}>
          <div className="edc-ml-course-info"><button type="button" className="edc-ml-cover-button" onClick={() => onResume(course.id)} disabled={!course.lessons} aria-label={`Open ${course.title}`}><CourseThumbnail course={course}/></button><div className="edc-ml-course-copy"><button type="button" className="edc-ml-course-title" onClick={() => onResume(course.id)} disabled={!course.lessons}>{course.title}</button><div className="edc-ml-course-meta"><span><UserRound size={12}/>{course.instructor || course.instructorName || "EduConnect Instructor"}</span><span><Code2 size={13}/>{course.category || "General"}</span><span><ChartNoAxesCombined size={13}/>{course.lessons} {course.lessons === 1 ? "Lesson" : "Lessons"}</span></div></div></div>
          <div className="edc-ml-course-progress"><span>Progress</span><div className="edc-ml-progress-line"><div className="edc-ml-progress-track" role="progressbar" aria-label={`${course.title} lesson progress`} aria-valuenow={course.progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${course.progress}%` }}/></div><strong>{course.progress}%</strong></div></div>
          <div className="edc-ml-course-actions">{done ? <><span className="edc-ml-completed"><Check size={13}/> Completed</span><button type="button" className="edc-ml-certificate" onClick={() => onCertificate(course)}><Award size={14}/> View Certificate</button></> : <button type="button" className="edc-ml-primary" onClick={() => onResume(course.id)} disabled={!course.lessons}><Play size={13} fill="currentColor"/>{course.lessons ? "Continue Learning" : "Lessons Coming Soon"}</button>}</div>
          <div className="edc-ml-course-menu"><button type="button" className="edc-ml-more" aria-label={`More actions for ${course.title}`} aria-expanded={openMenu === key} aria-haspopup="menu" onClick={() => setOpenMenu(openMenu === key ? "" : key)}><MoreVertical size={20}/></button>{openMenu === key && <div className="edc-ml-menu" role="menu"><button type="button" role="menuitem" onClick={() => toggleBookmark(course)}>{saved ? <BookmarkCheck size={15}/> : <Bookmark size={15}/>} {saved ? "Remove Bookmark" : "Bookmark Course"}</button><button type="button" role="menuitem" onClick={() => { setOpenMenu(""); onNavigate("notes"); }}><NotebookPen size={15}/> Notes &amp; Bookmarks</button><button type="button" role="menuitem" disabled={!course.completedLessons} onClick={() => { setOpenMenu(""); onUndo(course.id); }}><RotateCcw size={15}/> Undo Last Lesson</button><button type="button" role="menuitem" className="danger" onClick={() => { setOpenMenu(""); onRemove(course.id); }}><Trash2 size={15}/> Remove Enrollment</button></div>}</div>
        </article>;
      })}
      {!visible.length && <div className="edc-ml-empty">{filter === "bookmarks" ? <Bookmark size={30}/> : filter === "completed" ? <Award size={30}/> : <BookOpen size={30}/>}<h3>{emptyTitle}</h3><p>{emptyDescription}</p><div>{searchQuery.trim() ? <button type="button" className="edc-ml-primary" onClick={onClearSearch}>Clear Search <X size={14}/></button> : filter !== "all" && courseList.length > 0 ? <button type="button" className="edc-ml-primary" onClick={() => changeFilter("all")}>View All Courses <ArrowRight size={14}/></button> : <><button type="button" className="edc-ml-primary" onClick={onExplore}>Explore Courses <ArrowRight size={14}/></button><button type="button" className="edc-ml-secondary" onClick={revealSamples}>Try a Sample Course</button></>}</div></div>}
    </section>
    {courseList.length > 0 && <footer className="edc-ml-footer"><span>{visible.length} {visible.length === 1 ? "course" : "courses"} shown</span><div><button type="button" onClick={revealSamples}>Try a Sample Course</button><button type="button" onClick={onExplore}>Explore More Courses <ArrowRight size={13}/></button></div></footer>}
    {showSamples && <section className="edc-ml-samples" ref={samples}><div className="edc-ml-samples-heading"><div><h3>Explore Sample Courses</h3><p>Try a sample course and get familiar with your learning workspace.</p></div><button type="button" aria-label="Close sample courses" onClick={() => setShowSamples(false)}><X size={18}/></button></div>{children}</section>}
  </div>;
}

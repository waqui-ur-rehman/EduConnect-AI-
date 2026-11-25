import { useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileVideo,
  Filter,
  ListOrdered,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import "./TeacherLessons.css";
import { contentFileUrl } from "../../utils/contentApi";

const courseStatusLabel = status => {
  const normalized = String(status || "Draft").trim().toLowerCase();
  if (normalized === "published") return "Published";
  if (normalized === "approved") return "Approved";
  if (normalized.includes("pending")) return "In Review";
  return "Draft";
};

const durationLabel = value => {
  const duration = String(value ?? "").trim();
  if (!duration) return "—";
  return /^\d+(?:\.\d+)?$/.test(duration) ? `${duration} min` : duration;
};

const lessonHasVideo = lesson => Boolean(lesson.videoFileId || lesson.hasLocalVideo || lesson.videoUrl || lesson.video || lesson.url);

export default function TeacherLessons({
  courses = [],
  courseAnalytics = [],
  preferredCourseId = "",
  onCourseChange,
  onAddLesson,
  onEditLesson,
  onDeleteLesson,
  onMoveLesson,
  onCreateCourse,
}) {
  const courseFilter = preferredCourseId === "all"
    ? "all"
    : courses.some(course => String(course.id) === String(preferredCourseId))
      ? String(preferredCourseId)
      : String(courses[0]?.id ?? "all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [videoOnly, setVideoOnly] = useState(false);

  const lessonRows = useMemo(() => courses.flatMap(course => (
    Array.isArray(course.lessons)
      ? course.lessons.map((lesson, index) => ({
          course,
          lesson,
          index,
          courseStatus: courseStatusLabel(course.status),
          published: String(course.status || "").toLowerCase() === "published",
          hasVideo: lessonHasVideo(lesson),
        }))
      : []
  )), [courses]);

  const totalLessons = lessonRows.length;
  const publishedLessons = lessonRows.filter(row => row.published).length;
  const unpublishedLessons = totalLessons - publishedLessons;
  const videoLessons = lessonRows.filter(row => row.hasVideo).length;
  const selectedCourse = courses.find(course => String(course.id) === courseFilter) || courses[0] || null;
  const selectedCourseRows = selectedCourse
    ? lessonRows.filter(row => String(row.course.id) === String(selectedCourse.id))
    : [];
  const selectedAnalytics = selectedCourse
    ? courseAnalytics.find(course => String(course.id) === String(selectedCourse.id))
    : null;
  const enrollments = selectedAnalytics?.enrollmentRecords || [];
  const averageProgress = enrollments.length
    ? Math.round(enrollments.reduce((sum, student) => sum + (Number(student.progress) || 0), 0) / enrollments.length)
    : null;

  const visibleRows = lessonRows.filter(row => (
    (courseFilter === "all" || String(row.course.id) === courseFilter)
    && (statusFilter === "all" || (statusFilter === "published" ? row.published : !row.published))
    && (!videoOnly || row.hasVideo)
    && (!search.trim() || `${row.lesson.title || ""} ${row.lesson.description || ""} ${row.course.title || ""}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()))
  ));

  const selectCourse = value => {
    onCourseChange?.(value);
  };
  const chooseMetric = metric => {
    setVideoOnly(metric === "videos" ? !videoOnly : false);
    setStatusFilter(metric === "published" || metric === "unpublished" ? metric : "all");
  };
  const openAddLesson = () => {
    if (selectedCourse) onAddLesson?.(selectedCourse.id);
  };
  const openVideoUpload = () => {
    if (!selectedCourse) return;
    onAddLesson?.(selectedCourse.id);
    window.requestAnimationFrame(() => document.getElementById("edc-lesson-video")?.focus());
  };
  const scrollToLessons = () => document.getElementById("edc-lessons-table")?.scrollIntoView({ behavior: "smooth", block: "start" });

  const metrics = [
    { key: "all", label: "Total Lessons", value: totalLessons, icon: BookOpen, color: "purple" },
    { key: "published", label: "Published", value: publishedLessons, icon: CheckCircle2, color: "gold" },
    { key: "unpublished", label: "Unpublished", value: unpublishedLessons, icon: Clock3, color: "purple" },
    { key: "videos", label: "Videos Added", value: videoLessons, icon: FileVideo, color: "gold" },
  ];

  return (
    <section className="edc-teacher-lessons">
      <header className="edc-tl-header">
        <div>
          <h1><BookOpen size={29} /> Lessons Management</h1>
          <p>Create, upload, and manage lessons using your saved course content.</p>
        </div>
        <button type="button" className="edc-tl-add" disabled={!courses.length} onClick={openAddLesson}>
          <Plus size={17} /> Add New Lesson
        </button>
      </header>

      <section className="edc-tl-stats" aria-label="Lesson summary">
        {metrics.map(({ key, label, value, icon: Icon, color }) => {
          const active = key === "videos"
            ? videoOnly
            : key === "all"
              ? statusFilter === "all" && !videoOnly
              : key === statusFilter && !videoOnly;
          return (
            <button
              type="button"
              className={`edc-tl-stat ${color}${active ? " active" : ""}`}
              key={key}
              onClick={() => chooseMetric(key)}
              aria-pressed={active}
              aria-label={`Filter by ${label.toLowerCase()}: ${value}`}
            >
              <span className="edc-tl-stat-icon"><Icon size={25} /></span>
              <span className="edc-tl-stat-copy"><small>{label}</small><strong>{value.toLocaleString()}</strong></span>
            </button>
          );
        })}
      </section>

      {!courses.length ? (
        <div className="edc-tl-empty">
          <BookOpen size={36} />
          <h2>No courses yet</h2>
          <p>Create a course before adding lessons.</p>
          <button type="button" onClick={onCreateCourse}><Plus size={16} /> Create Course</button>
        </div>
      ) : (
        <div className="edc-tl-layout">
          <section className="edc-tl-main" aria-label="Manage lessons">
            <div className="edc-tl-toolbar">
              <label className="edc-tl-course-select">
                <span>Select Course</span>
                <select aria-label="Select course" value={courseFilter} onChange={event => selectCourse(event.target.value)}>
                  <option value="all">All Courses</option>
                  {courses.map(course => <option key={course.id} value={String(course.id)}>{course.title || "Untitled course"}</option>)}
                </select>
              </label>
              <label className="edc-tl-search">
                <Search size={16} />
                <input type="search" aria-label="Search lessons" placeholder="Search lessons..." value={search} onChange={event => setSearch(event.target.value)} />
              </label>
              <label className="edc-tl-status-select">
                <Filter size={15} />
                <select aria-label="Filter lesson status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
                  <option value="all">All Status</option>
                  <option value="published">Published</option>
                  <option value="unpublished">Unpublished</option>
                </select>
              </label>
            </div>

            <div className="edc-tl-table-wrap" id="edc-lessons-table">
              <table className="edc-tl-table">
                <thead>
                  <tr><th>#</th><th>Lesson Title</th><th>Duration</th><th>Video</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {visibleRows.map(({ course, lesson, index, courseStatus, published, hasVideo }) => {
                    const lessonId = lesson.id;
                    const lessonKey = `${course.id}:${lessonId ?? index}`;
                    const lessons = Array.isArray(course.lessons) ? course.lessons : [];
                    return (
                      <tr key={lessonKey}>
                        <td className="edc-tl-number">{index + 1}</td>
                        <td>
                          <div className="edc-tl-title-cell">
                            <span className="edc-tl-lesson-icon">{hasVideo ? <FileVideo size={20} /> : <BookOpen size={20} />}</span>
                            <span>
                              <strong>{lesson.title || "Untitled lesson"}</strong>
                              {lesson.videoFileId && <a href={contentFileUrl(lesson.videoFileId)} target="_blank" rel="noreferrer">Preview video</a>}
                              <small>{courseFilter === "all" ? (course.title || "Untitled course") : (lesson.description || "No description")}</small>
                            </span>
                          </div>
                        </td>
                        <td>{durationLabel(lesson.duration)}</td>
                        <td><span className={`edc-tl-video-state${hasVideo ? " attached" : ""}`}>{hasVideo ? "Attached" : "—"}</span></td>
                        <td><span className={`edc-tl-status ${published ? "published" : courseStatus.toLowerCase().replace(/\s+/g, "-")}`}>{courseStatus}</span></td>
                        <td>
                          <div className="edc-tl-actions">
                            <button type="button" title="Move up" aria-label={`Move ${lesson.title || "lesson"} up`} disabled={index === 0 || lessonId == null} onClick={() => onMoveLesson?.(course.id, lessonId, -1)}><ChevronUp size={16} /></button>
                            <button type="button" title="Move down" aria-label={`Move ${lesson.title || "lesson"} down`} disabled={index === lessons.length - 1 || lessonId == null} onClick={() => onMoveLesson?.(course.id, lessonId, 1)}><ChevronDown size={16} /></button>
                            <button type="button" title="Edit lesson" aria-label={`Edit ${lesson.title || "lesson"}`} disabled={lessonId == null} onClick={() => onEditLesson?.(course.id, lesson)}><Pencil size={15} /></button>
                            <button type="button" className="delete" title="Delete lesson" aria-label={`Delete ${lesson.title || "lesson"}`} disabled={lessonId == null} onClick={() => onDeleteLesson?.(course.id, lessonId)}><Trash2 size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!visibleRows.length && (
                    <tr><td className="edc-tl-no-results" colSpan={6}>
                      {totalLessons ? "No lessons match these filters." : "No lessons have been added to your courses yet."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="edc-tl-sidebar">
            <section className="edc-tl-panel">
              <h2><BookOpen size={19} /> Course Progress</h2>
              {selectedCourse ? (
                <>
                  <strong className="edc-tl-panel-course">{selectedCourse.title || "Untitled course"}</strong>
                  <div className="edc-tl-progress-line">
                    <span><span style={{ width: `${averageProgress ?? 0}%` }} /></span>
                    <strong>{averageProgress === null ? "—" : `${averageProgress}%`}</strong>
                  </div>
                  {averageProgress === null && <small className="edc-tl-no-progress">No enrollment progress recorded for this course yet.</small>}
                  <dl className="edc-tl-course-facts">
                    <div><dt><BookOpen size={15} /> Lessons</dt><dd>{selectedCourseRows.length}</dd></div>
                    <div><dt><CheckCircle2 size={15} /> Published</dt><dd>{selectedCourseRows.filter(row => row.published).length}</dd></div>
                    <div><dt><Users size={15} /> Enrolled Students</dt><dd>{enrollments.length}</dd></div>
                  </dl>
                </>
              ) : <p className="edc-tl-no-progress">No course data available.</p>}
            </section>

            <section className="edc-tl-panel edc-tl-quick-actions">
              <h2><Clock3 size={19} /> Quick Actions</h2>
              <div>
                <button type="button" disabled={!selectedCourse} onClick={openAddLesson}><Plus size={19} /><span>Add Lesson</span></button>
                <button type="button" disabled={!selectedCourse} onClick={openVideoUpload}><Upload size={19} /><span>Upload Video</span></button>
                <button type="button" disabled={!visibleRows.length} onClick={scrollToLessons}><ListOrdered size={19} /><span>Reorder Lessons</span></button>
              </div>
            </section>
          </aside>
        </div>
      )}
    </section>
  );
}

import { Fragment, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  CheckCircle2,
  Edit3,
  Eye,
  Filter,
  GraduationCap,
  Layers3,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Send,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import "./TeacherCourses.css";

const primaryStatuses = ["Published", "Draft", "Pending Approval"];

function CourseCover({ course }) {
  const [failedSource, setFailedSource] = useState("");
  const source = course.thumbnail || "";

  return (
    <span className="edc-tc-cover">
      {source && source !== failedSource ? (
        <img src={source} alt="" onError={() => setFailedSource(source)} />
      ) : (
        <BookOpen size={32} />
      )}
    </span>
  );
}

function lessonCount(course) {
  if (Array.isArray(course.lessons)) return course.lessons.length;
  const count = Number(course.lessons);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

function updatedDate(course) {
  const dates = [course.updatedAt, course.publishedAt, course.createdAt]
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  if (!dates.length) return null;
  return new Date(Math.max(...dates));
}

export default function TeacherCourses({
  courses,
  data,
  onCreate,
  onEdit,
  onAnalytics,
  onLessons,
  onPreview,
  onPublish,
  onSubmit,
  onDelete,
  children,
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [expandedCourse, setExpandedCourse] = useState(null);
  const byCourse = new Map(data.map((course) => [String(course.id), course]));
  const totalStudents = new Set(
    data.flatMap((course) => course.studentEmails),
  ).size;
  const ratings = data.flatMap((course) => course.ratings);
  const averageRating = ratings.length
    ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
    : null;
  const stats = [
    { label: "Total Courses", value: courses.length.toLocaleString(), icon: BookOpen },
    {
      label: "Total Lessons",
      value: courses.reduce((total, course) => total + lessonCount(course), 0).toLocaleString(),
      icon: Play,
      gold: true,
    },
    { label: "Total Students", value: totalStudents.toLocaleString(), icon: Users },
    {
      label: "Avg. Rating",
      value: averageRating === null ? "—" : averageRating.toFixed(1),
      suffix: averageRating === null ? "" : "/5",
      icon: Star,
      gold: true,
    },
  ];
  const categories = [...new Set(courses.map((course) => course.category).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const statuses = [
    ...primaryStatuses,
    ...new Set(courses.map((course) => course.status || "Draft")
      .filter((value) => !primaryStatuses.includes(value))),
  ];
  const query = search.trim().toLowerCase();
  const filtered = courses.filter((course) =>
    String(course.title || "").toLowerCase().includes(query)
    && (!category || course.category === category)
    && (!status || (course.status || "Draft") === status),
  );

  return (
    <div className="edc-teacher-courses">
      <div className="edc-to-heading edc-tc-heading">
        <div>
          <h1><GraduationCap size={36} />My Courses</h1>
          <p>Create, manage and track the performance of your courses.</p>
        </div>
        <button type="button" className="edc-to-gold-button edc-tc-create" onClick={onCreate}>
          <Plus size={21} />Create New Course
        </button>
      </div>

      <section className="edc-to-stats edc-tc-stats" aria-label="Your course totals">
        {stats.map(({ label, value, suffix, icon: Icon, gold }) => (
          <div className={`edc-to-stat${gold ? " gold" : ""}`} key={label}>
            <span className="edc-to-stat-icon"><Icon size={31} /></span>
            <span><span className="edc-to-stat-label">{label}</span>
              <strong>{value}{suffix && <small>{suffix}</small>}</strong>
            </span>
          </div>
        ))}
      </section>

      {children}

      <div className="edc-tc-toolbar">
        <div className="edc-tc-tabs" role="group" aria-label="Filter courses by status">
          {["", ...statuses].map((value) => (
            <button type="button" key={value} aria-pressed={status === value}
              className={status === value ? "active" : ""}
              onClick={() => setStatus(value)}>
              {value === "" ? "All Courses" : value === "Pending Approval" ? "Under Review" : value}
              <span>({value ? courses.filter((course) => (course.status || "Draft") === value).length : courses.length})</span>
            </button>
          ))}
        </div>
        <div className="edc-tc-filters">
          <label className="edc-tc-search"><Search size={20} />
            <input type="search" aria-label="Search your courses" placeholder="Search your courses..."
              value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <label className="edc-tc-category"><Filter size={18} />
            <select aria-label="Course category" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">All Categories</option>
              {categories.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>
      </div>

      <section className="edc-to-panel edc-tc-table-panel" aria-label="Your courses">
        <div className="edc-tc-table-wrap">
          <table className="edc-tc-table">
            <thead><tr>
              <th scope="col">Course</th><th scope="col">Students</th>
              <th scope="col">Lessons</th><th scope="col">Rating</th>
              <th scope="col">Status</th><th scope="col">Last Updated</th>
              <th scope="col">Actions</th>
            </tr></thead>
            <tbody>
              {filtered.map((course) => {
                const details = byCourse.get(String(course.id));
                const date = updatedDate(course);
                const courseStatus = course.status || "Draft";
                const expanded = expandedCourse === String(course.id);
                const actionId = `teacher-course-actions-${course.id}`;
                return (
                  <Fragment key={course.id}>
                    <tr>
                      <td><div className="edc-tc-course">
                        <CourseCover course={course} />
                        <div><strong>{course.title || "Untitled course"}</strong>
                          <div className="edc-tc-tags">
                            {course.category && <span>{course.category}</span>}
                            {course.level && <span className="level">{course.level}</span>}
                          </div>
                        </div>
                      </div></td>
                      <td><span className="edc-tc-metric"><Users size={17} />{(details?.students || 0).toLocaleString()}</span></td>
                      <td><span className="edc-tc-metric"><Layers3 size={16} />{lessonCount(course)}</span></td>
                      <td><span className="edc-to-table-rating"><Star size={18} fill={details?.ratings.length ? "currentColor" : "none"} />{details?.ratings.length ? details.rating.toFixed(1) : "—"}</span></td>
                      <td><span className={`edc-to-course-status ${courseStatus.toLowerCase().replaceAll(" ", "-")}`}>{courseStatus === "Pending Approval" ? "Under Review" : courseStatus}</span></td>
                      <td><span className="edc-tc-date"><CalendarDays size={17} />
                        {date ? <time dateTime={date.toISOString()}>{date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })}</time> : "—"}
                      </span></td>
                      <td><div className="edc-to-row-actions edc-tc-row-actions">
                        <button type="button" aria-label={`Edit ${course.title}`} title="Edit course" onClick={() => onEdit(course)}><Edit3 size={18} /></button>
                        <button type="button" aria-label={`View analytics for ${course.title}`} title="Course analytics" onClick={() => onAnalytics(course)}><ChartNoAxesCombined size={19} /></button>
                        <button type="button" aria-label={`More actions for ${course.title}`} title="More actions" aria-expanded={expanded} aria-controls={actionId} onClick={() => setExpandedCourse(expanded ? null : String(course.id))}><MoreHorizontal size={20} /></button>
                      </div></td>
                    </tr>
                    {expanded && <tr className="edc-tc-expanded-row"><td colSpan={7}>
                      <div id={actionId} className="edc-tc-expanded">
                        <div className="edc-tc-course-details">
                          <strong>PKR {Math.max(0, Number(course.price) || 0).toLocaleString()}</strong>
                          {typeof course.revisionNotes === "string" && course.revisionNotes.trim() && <p><b>Admin revision notes</b>{course.revisionNotes}</p>}
                        </div>
                        <div className="edc-tc-more-actions">
                          <button type="button" onClick={() => onPreview(course)}><Eye size={15} />Preview</button>
                          <button type="button" onClick={() => onLessons(course)}><BookOpen size={15} />Lessons</button>
                          <button type="button" disabled={courseStatus !== "Approved"} onClick={() => onPublish(course.id)}><CheckCircle2 size={15} />Publish</button>
                          <button type="button" disabled={["Pending Approval", "Approved", "Published"].includes(courseStatus)} onClick={() => onSubmit(course.id)}><Send size={15} />Submit for Approval</button>
                          <button type="button" className="delete" onClick={() => onDelete(course.id)}><Trash2 size={15} />Delete</button>
                        </div>
                      </div>
                    </td></tr>}
                  </Fragment>
                );
              })}
              {!filtered.length && <tr><td colSpan={7}>
                <div className="edc-to-empty edc-tc-empty"><BookOpen size={39} />
                  <h2>{courses.length ? "No matching courses" : "Create your first course"}</h2>
                  <p>{courses.length ? "Try another search, category or status." : "Your courses will appear here after you create them."}</p>
                  {courses.length ? <button type="button" className="edc-to-gold-button" onClick={() => {setSearch(""); setCategory(""); setStatus("");}}>Clear Filters</button> : <button type="button" className="edc-to-gold-button" onClick={onCreate}><Plus size={17} />Create New Course</button>}
                </div>
              </td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

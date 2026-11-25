import { useMemo, useState } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Download,
  Mail,
  Search,
  Users,
} from "lucide-react";
import "./TeacherStudents.css";

const normalize = value => String(value || "").trim().toLowerCase();

const progressStatus = progress => {
  if (progress >= 100) return "completed";
  if (progress > 0) return "in-progress";
  return "not-started";
};

const formatDate = value => {
  const date = new Date(value || "");
  return value && Number.isFinite(date.getTime())
    ? date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "—";
};

const csvValue = value => `"${String(value ?? "").replace(/"/g, '""')}"`;

function exportCsv(students, filename, includeProgress) {
  const columns = includeProgress
    ? ["Student", "Email", "Courses", "Enrolled On", "Completed Lessons", "Total Lessons", "Average Progress", "Status"]
    : ["Student", "Email", "Courses", "Enrolled On", "Status"];
  const rows = students.map(student => includeProgress
    ? [student.name, student.email, student.courseTitles.join("; "), student.enrolledAt, student.completedLessons, student.totalLessons, `${student.progress}%`, student.statusLabel]
    : [student.name, student.email, student.courseTitles.join("; "), student.enrolledAt, student.statusLabel]);
  const content = [columns, ...rows].map(row => row.map(csvValue).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function TeacherStudents({ enrollments = [], onViewStudent }) {
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const students = useMemo(() => {
    const groups = new Map();
    enrollments.forEach(enrollment => {
      const email = normalize(enrollment.email);
      const key = email || String(enrollment.id || `${enrollment.name || "student"}:${enrollment.courseId || ""}`);
      const group = groups.get(key) || { key, name: enrollment.name || "Student", email, enrollments: [] };
      group.enrollments.push(enrollment);
      if (!group.email && enrollment.email) group.email = String(enrollment.email);
      groups.set(key, group);
    });

    return [...groups.values()].map(group => {
      const courseTitles = [...new Set(group.enrollments.map(enrollment => enrollment.courseTitle).filter(Boolean))];
      const totalLessons = group.enrollments.reduce((sum, enrollment) => sum + (Number(enrollment.totalLessons) || 0), 0);
      const completedLessons = group.enrollments.reduce((sum, enrollment) => sum + (Number(enrollment.completedLessons) || 0), 0);
      const progress = group.enrollments.length
        ? Math.round(group.enrollments.reduce((sum, enrollment) => sum + (Number(enrollment.progress) || 0), 0) / group.enrollments.length)
        : 0;
      const validDates = group.enrollments
        .map(enrollment => enrollment.enrolledAt)
        .filter(value => value && Number.isFinite(new Date(value).getTime()))
        .sort((left, right) => new Date(left).getTime() - new Date(right).getTime());
      const statuses = group.enrollments.map(enrollment => progressStatus(Number(enrollment.progress) || 0));
      const status = statuses.every(value => value === "completed")
        ? "completed"
        : statuses.some(value => value === "in-progress" || value === "completed")
          ? "in-progress"
          : "not-started";
      return {
        ...group,
        courseTitles,
        courseTitle: courseTitles.join(", "),
        completedLessons,
        totalLessons,
        progress,
        enrolledAt: validDates[0] || "—",
        status,
        statusLabel: status === "in-progress" ? "In Progress" : status === "not-started" ? "Not Started" : "Completed",
      };
    }).sort((left, right) => left.name.localeCompare(right.name));
  }, [enrollments]);

  const totalStudents = students.length;
  const inProgressCount = students.filter(student => student.status === "in-progress").length;
  const completedCount = students.filter(student => student.status === "completed").length;
  const notStartedCount = students.filter(student => student.status === "not-started").length;
  const averageProgress = totalStudents
    ? Math.round(students.reduce((sum, student) => sum + student.progress, 0) / totalStudents)
    : null;
  const courseOptions = [...new Set(enrollments.map(enrollment => enrollment.courseTitle).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const filteredStudents = students.filter(student => (
    (statusFilter === "all" || student.status === statusFilter)
    && (courseFilter === "all" || student.courseTitles.includes(courseFilter))
    && (!search.trim() || `${student.name} ${student.email} ${student.courseTitle}`.toLowerCase().includes(search.trim().toLowerCase()))
  ));
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleStudents = filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const topPerformers = students.filter(student => student.progress > 0)
    .sort((left, right) => right.progress - left.progress || left.name.localeCompare(right.name))
    .slice(0, 3);

  const statusSegments = [
    { key: "in-progress", label: "In Progress", count: inProgressCount, color: "#7009b5" },
    { key: "completed", label: "Completed", count: completedCount, color: "#f0ac00" },
    { key: "not-started", label: "Not Started", count: notStartedCount, color: "#bb83e9" },
  ];
  let chartStart = 0;
  const chartBackground = totalStudents
    ? `conic-gradient(${statusSegments.map(segment => {
        const end = chartStart + (segment.count / totalStudents) * 100;
        const value = `${segment.color} ${chartStart}% ${end}%`;
        chartStart = end;
        return value;
      }).join(", ")})`
    : "#eee6f5";

  const metrics = [
    { key: "all", label: "Total Students", value: totalStudents.toLocaleString(), icon: Users, color: "purple" },
    { key: "in-progress", label: "In Progress", value: inProgressCount.toLocaleString(), icon: BarChart3, color: "gold" },
    { key: "completed", label: "Completed", value: completedCount.toLocaleString(), icon: BookOpen, color: "purple" },
    { key: "average", label: "Avg. Progress", value: averageProgress === null ? "—" : `${averageProgress}%`, icon: CheckCircle2, color: "gold" },
  ];

  function chooseStatus(status) {
    setStatusFilter(status);
    setPage(1);
  }

  function exportCurrentList(includeProgress) {
    if (!filteredStudents.length) return;
    exportCsv(filteredStudents, includeProgress ? "student-progress-report.csv" : "student-list.csv", includeProgress);
  }

  const focusSearch = () => document.getElementById("edc-ms-search")?.focus();
  const emailAddresses = filteredStudents.map(student => student.email).filter(Boolean);
  const emailListHref = emailAddresses.length
    ? `mailto:?bcc=${encodeURIComponent(emailAddresses.join(","))}&subject=${encodeURIComponent("Course learning update")}`
    : "";

  return (
    <section className="edc-my-students">
      <header className="edc-ms-header">
        <div>
          <h1><Users size={30} /> My Students</h1>
          <p>Manage your enrolled students and review their saved course progress.</p>
        </div>
        <button type="button" className="edc-ms-export" disabled={!filteredStudents.length} onClick={() => exportCurrentList(false)}>
          <Download size={16} /> Export Student List
        </button>
      </header>

      <div className="edc-ms-stats" aria-label="Student summary">
        {metrics.map(({ key, label, value, icon: Icon, color }) => {
          const active = key === statusFilter;
          return (
            <button type="button" key={key} className={`edc-ms-stat ${color}${active ? " active" : ""}`} onClick={() => chooseStatus(key === "average" ? "all" : key)} aria-pressed={key === "average" ? false : active}>
              <span><Icon size={25} /></span>
              <div><small>{label}</small><strong>{value}</strong></div>
            </button>
          );
        })}
      </div>

      <div className="edc-ms-layout">
        <section className="edc-ms-main">
          <div className="edc-ms-filter-tabs" role="group" aria-label="Filter students by progress">
            {[
              ["all", "All Students", totalStudents],
              ["in-progress", "In Progress", inProgressCount],
              ["completed", "Completed", completedCount],
              ["not-started", "Not Started", notStartedCount],
            ].map(([key, label, count]) => (
              <button type="button" className={statusFilter === key ? "active" : ""} aria-pressed={statusFilter === key} key={key} onClick={() => chooseStatus(key)}>
                {label} ({count.toLocaleString()})
              </button>
            ))}
          </div>

          <div className="edc-ms-toolbar">
            <label className="edc-ms-search">
              <Search size={16} />
              <input id="edc-ms-search" type="search" aria-label="Search students by name or email" placeholder="Search students by name or email..." value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />
            </label>
            <select aria-label="Filter students by course" value={courseFilter} onChange={event => { setCourseFilter(event.target.value); setPage(1); }}>
              <option value="all">All Courses</option>
              {courseOptions.map(course => <option value={course} key={course}>{course}</option>)}
            </select>
          </div>

          <div className="edc-ms-table-wrap">
            <table className="edc-ms-table">
              <thead><tr><th>#</th><th>Student</th><th>Enrolled Course</th><th>Progress</th><th>Enrollment Date</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {visibleStudents.map((student, index) => (
                  <tr key={student.key}>
                    <td>{(currentPage - 1) * pageSize + index + 1}</td>
                    <td>
                      <div className="edc-ms-person">
                        <span className="edc-ms-avatar">{String(student.name || "S").trim().charAt(0).toUpperCase()}</span>
                        <span><strong>{student.name}</strong><small>{student.email || "Email unavailable"}</small></span>
                      </div>
                    </td>
                    <td>
                      <span className="edc-ms-course-name" title={student.courseTitle}>
                        {student.courseTitles.length > 1 ? `${student.courseTitles[0]} + ${student.courseTitles.length - 1} more` : student.courseTitles[0] || "Course unavailable"}
                      </span>
                    </td>
                    <td>
                      <div className="edc-ms-progress">
                        <span><span style={{ width: `${student.progress}%` }} /></span>
                        <strong>{student.progress}%</strong>
                      </div>
                    </td>
                    <td><span className="edc-ms-date"><CalendarDays size={14} /> {formatDate(student.enrolledAt)}</span></td>
                    <td><span className={`edc-ms-status ${student.status}`}>{student.statusLabel}</span></td>
                    <td>
                      <div className="edc-ms-row-actions">
                        <button type="button" onClick={() => onViewStudent?.(student)} aria-label={`View details for ${student.name}`}>Details</button>
                        {student.email && <a href={`mailto:${encodeURIComponent(student.email)}`} aria-label={`Email ${student.name}`}><Mail size={15} /></a>}
                      </div>
                    </td>
                  </tr>
                ))}
                {!visibleStudents.length && (
                  <tr><td className="edc-ms-empty-cell" colSpan={7}>
                    {students.length ? "No students match these filters." : "No student enrollments are saved for your courses yet."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <footer className="edc-ms-pagination">
            <span>{filteredStudents.length ? `Showing ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filteredStudents.length)} of ${filteredStudents.length} students` : "Showing 0 students"}</span>
            {totalPages > 1 && <div>
              <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
              <span>Page {currentPage} of {totalPages}</span>
              <button type="button" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Next</button>
            </div>}
          </footer>
        </section>

        <aside className="edc-ms-sidebar">
          <section className="edc-ms-panel edc-ms-overview">
            <h2>Students Overview</h2>
            <div className="edc-ms-overview-content">
              <div className="edc-ms-donut" style={{ background: chartBackground }} role="img" aria-label={`${totalStudents} students: ${inProgressCount} in progress, ${completedCount} completed, ${notStartedCount} not started`}>
                <span><strong>{totalStudents.toLocaleString()}</strong><small>Students</small></span>
              </div>
              <ul>
                {statusSegments.map(segment => (
                  <li key={segment.key}>
                    <i style={{ background: segment.color }} />
                    <span>{segment.label} ({totalStudents ? Math.round(segment.count / totalStudents * 100) : 0}%)</span>
                    <strong>{segment.count.toLocaleString()}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="edc-ms-panel edc-ms-top-performers">
            <h2><CheckCircle2 size={18} /> Top Progress</h2>
            {topPerformers.length ? <ol>
              {topPerformers.map(student => (
                <li key={student.key}>
                  <span className="edc-ms-avatar">{String(student.name || "S").trim().charAt(0).toUpperCase()}</span>
                  <span><strong>{student.name}</strong><small>{student.courseTitles.length} {student.courseTitles.length === 1 ? "course" : "courses"}</small></span>
                  <strong className="edc-ms-top-progress">{student.progress}%</strong>
                </li>
              ))}
            </ol> : <p className="edc-ms-aside-empty">Progress leaders will appear when students start lessons.</p>}
          </section>

          <section className="edc-ms-panel edc-ms-quick-actions">
            <h2><BarChart3 size={18} /> Quick Actions</h2>
            <div>
              <button type="button" onClick={focusSearch}><Search size={18} /><span>Find Student</span></button>
              <a className="edc-ms-email-list" href={emailListHref || undefined} aria-disabled={!emailListHref}><Mail size={18} /><span>Email List</span></a>
              <button type="button" disabled={!filteredStudents.length} onClick={() => exportCurrentList(false)}><Download size={18} /><span>Export List</span></button>
              <button type="button" disabled={!filteredStudents.length} onClick={() => exportCurrentList(true)}><BookOpen size={18} /><span>Progress Report</span></button>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Download,
  FileText,
  GraduationCap,
  LifeBuoy,
  Monitor,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  ADMIN_USERS_KEY,
  ADMIN_DATA_CHANGED_EVENT,
  getAdminCourses,
  getAdminActivityLog,
  getAdminOverviewData,
  readAdminArray,
  readAdminSupportRequestsState,
  readAdminUsersState,
} from "./adminData";
import { BOOKS_CHANGED_EVENT, getBookRecords } from "../../utils/books";
import { getModerationReportsState, MODERATION_REPORTS_EVENT } from "../../utils/moderationReports";

function getDashboardSnapshot() {
  const usersState = readAdminUsersState();
  const users = usersState.users;
  const supportState = readAdminSupportRequestsState();
  const moderationState = getModerationReportsState();
  const books = getBookRecords();
  return {
    overview: getAdminOverviewData(),
    users,
    courses: getAdminCourses(users),
    userError: usersState.error,
    books,
    supportRequests: supportState.records,
    supportError: supportState.error,
    reports: moderationState.records,
    reportError: moderationState.error,
  };
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function downloadReport(snapshot) {
  const rows = [
    ["Metric", "Value"],
    ["Registered accounts", snapshot.users.length],
    ["Students", snapshot.users.filter((user) => user.role === "Student").length],
    ["Teachers", snapshot.users.filter((user) => user.role === "Teacher").length],
    ["Admins", snapshot.users.filter((user) => user.role === "Admin").length],
    ["Courses", snapshot.overview.courseCount],
    ["PDF/eBooks", snapshot.books.length],
    ["Pending teacher applications", snapshot.overview.pendingTeacherCount],
    ["Pending course approvals", snapshot.overview.pendingCourseCount],
    ["Pending book approvals", snapshot.books.filter((book) => ["Pending", "Pending Approval", "Submitted"].includes(book.status)).length],
    ["Support tickets", snapshot.supportRequests.length],
    ["Moderation reports", snapshot.reports.length],
    ["Generated at", new Date().toISOString()],
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "educonnect-admin-report.csv";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function AdminOverview({ email }) {
  const [snapshot, setSnapshot] = useState(getDashboardSnapshot);
  const [rangeDays, setRangeDays] = useState(30);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const refreshDashboard = useCallback(() => {
    setSnapshot(getDashboardSnapshot());
    setLastRefreshed(new Date());
  }, []);
  const overview = snapshot.overview;
  const recentActivity = getAdminActivityLog().records.slice()
    .sort((first, second) => {
      const left = new Date(first.timestamp || 0).getTime();
      const right = new Date(second.timestamp || 0).getTime();
      return right - left;
    })
    .slice(0, 5);
  const totalUsers = snapshot.users.length;
  const roleCounts = snapshot.users.reduce((counts, user) => {
    const role = typeof user.role === "string" && user.role.trim() ? user.role.trim() : "Unspecified";
    counts[role] = (counts[role] || 0) + 1;
    return counts;
  }, {});
  const growth = useMemo(() => {
    const days = rangeDays;
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(start.getDate() - days + 1);
    start.setHours(0, 0, 0, 0);
    let students = 0;
    let teachers = 0;
    snapshot.users.forEach((user) => {
      const date = validDate(user.createdAt || user.registeredAt);
      if (!date || date >= start) return;
      if (user.role === "Student") students += 1;
      if (user.role === "Teacher") teachers += 1;
    });
    let courses = snapshot.courses.filter((course) => {
      const date = validDate(course.createdAt);
      return date && date < start;
    }).length;
    const buckets = Array.from({ length: days }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return { date, students: 0, teachers: 0, courses: 0 };
    });
    snapshot.users.forEach((user) => {
      const date = validDate(user.createdAt || user.registeredAt);
      if (!date || date < start || date > end) return;
      const index = Math.floor((date - start) / 86400000);
      if (user.role === "Student") buckets[index].students += 1;
      if (user.role === "Teacher") buckets[index].teachers += 1;
    });
    snapshot.courses.forEach((course) => {
      const date = validDate(course.createdAt);
      if (!date || date < start || date > end) return;
      buckets[Math.floor((date - start) / 86400000)].courses += 1;
    });
    let cumulativeStudents = students;
    let cumulativeTeachers = teachers;
    let cumulativeCourses = courses;
    buckets.forEach((bucket) => {
      cumulativeStudents += bucket.students;
      cumulativeTeachers += bucket.teachers;
      cumulativeCourses += bucket.courses;
      bucket.students = cumulativeStudents;
      bucket.teachers = cumulativeTeachers;
      bucket.courses = cumulativeCourses;
    });
    return buckets;
  }, [rangeDays, snapshot]);
  const growthHasRecords = growth.some((bucket) => bucket.students || bucket.teachers || bucket.courses);
  const maxGrowth = Math.max(1, ...growth.map((bucket) => Math.max(bucket.students, bucket.teachers, bucket.courses)));
  const linePath = (key) => growth.map((bucket, index) => {
    const x = growth.length === 1 ? 50 : index * 100 / (growth.length - 1);
    const y = 100 - bucket[key] / maxGrowth * 90;
    return `${index ? "L" : "M"}${x},${y}`;
  }).join(" ");
  const recentRegistrations = snapshot.users
    .map((user) => ({ ...user, registrationDate: validDate(user.createdAt || user.registeredAt) }))
    .filter((user) => user.registrationDate)
    .sort((first, second) => second.registrationDate - first.registrationDate)
    .slice(0, 5);
  const sortedRoles = Object.entries(roleCounts).sort((first, second) => second[1] - first[1]);
  const roleColor = (role) => ({
    Student: "#760bd1",
    Teacher: "#f4ad00",
    Admin: "#ae73e8",
  }[role] || "#b8a8ca");
  const roleDonut = sortedRoles.reduce((segments, [role, count]) => {
    const start = segments.progress;
    const end = start + count / Math.max(1, totalUsers) * 100;
    return {
      progress: end,
      stops: [...segments.stops, `${roleColor(role)} ${start}% ${end}%`],
    };
  }, { progress: 0, stops: [] }).stops.join(", ");
  const pendingActions = [
    { label: "Course Approvals", count: overview.pendingCourseCount, path: "/admin/courses", icon: BookOpen },
    { label: "Teacher Verifications", count: overview.pendingTeacherCount, path: "/admin/teachers", icon: UserRound },
    { label: "Content Moderation", count: snapshot.reports.filter((report) => ["Pending", "Under Review", "Escalated"].includes(report.status || "Pending")).length, path: "/admin/moderation", icon: ShieldCheck },
    { label: "Appeals & Reports", count: snapshot.supportRequests.filter((request) => request.category === "Moderation & Appeal" && ["Submitted", "In Review", "Open"].includes(request.status)).length, path: "/admin/support/open-appeals", icon: ShieldAlert },
    { label: "Help Tickets", count: snapshot.supportRequests.filter((request) => request.category !== "Moderation & Appeal" && !["Resolved", "Closed"].includes(request.status)).length, path: "/admin/support/pending", icon: LifeBuoy },
    { label: "PDF/eBook Approvals", count: snapshot.books.filter((book) => ["Pending", "Pending Approval", "Submitted"].includes(book.status)).length, path: "/admin/books", icon: FileText },
  ];

  useEffect(() => {
    window.addEventListener("storage", refreshDashboard);
    window.addEventListener(ADMIN_DATA_CHANGED_EVENT, refreshDashboard);
    window.addEventListener(BOOKS_CHANGED_EVENT, refreshDashboard);
    window.addEventListener(MODERATION_REPORTS_EVENT, refreshDashboard);

    return () => {
      window.removeEventListener("storage", refreshDashboard);
      window.removeEventListener(ADMIN_DATA_CHANGED_EVENT, refreshDashboard);
      window.removeEventListener(BOOKS_CHANGED_EVENT, refreshDashboard);
      window.removeEventListener(MODERATION_REPORTS_EVENT, refreshDashboard);
    };
  }, [refreshDashboard]);

  const adminName = readAdminArray(ADMIN_USERS_KEY).find((user) => user.role === "Admin" && String(user.email).toLowerCase() === String(email || "").toLowerCase())?.name?.trim() || "Admin";
  const stats = [
    { label: "Total Users", value: totalUsers, icon: UsersRound, path: "/admin/users", color: "purple" },
    { label: "Teachers", value: overview.teacherCount, icon: UserRound, path: "/admin/users?role=Teacher", color: "orange" },
    { label: "Students", value: overview.studentCount, icon: GraduationCap, path: "/admin/users?role=Student", color: "green" },
    { label: "Courses", value: overview.courseCount, icon: BookOpen, path: "/admin/courses", color: "red" },
    { label: "PDF/eBooks", value: snapshot.books.length, icon: FileText, path: "/admin/books", color: "violet" },
    { label: "Open Admin Actions", value: pendingActions.reduce((sum, action) => sum + action.count, 0) + overview.pendingKnowledgeProposalCount, icon: ClipboardCheck, path: "/admin/notifications", color: "purple" },
  ];

  return (
    <div className="edc-admin-overview">
      <section className="edc-admin-dashboard-heading">
        <div>
          <span>PLATFORM ADMINISTRATION</span>
          <h2><Monitor size={22} aria-hidden="true" />Admin Dashboard</h2>
          <p>Welcome back, {adminName}. Counts reflect records saved in this browser.</p>
        </div>
        <div className="edc-admin-dashboard-actions">
          <label><CalendarDays size={15} /><span className="edc-admin-visually-hidden">Registration date range</span>
            <select value={rangeDays} onChange={(event) => setRangeDays(Number(event.target.value))} aria-label="Registration date range">
              <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 12 months</option>
            </select><ChevronDown size={13} aria-hidden="true" />
          </label>
          <button type="button" onClick={() => downloadReport(snapshot)}><Download size={15} />Export Report</button>
          <button type="button" onClick={refreshDashboard} aria-label="Refresh dashboard data"><RefreshCw size={15} aria-hidden="true" />Refresh</button>
          {lastRefreshed && <span className="edc-admin-dashboard-refresh-status" role="status">Updated {lastRefreshed.toLocaleTimeString()}</span>}
          <details className="edc-admin-quick-actions">
            <summary><Plus size={16} />Quick Actions<ChevronDown size={14} /></summary>
            <div>
              <Link to="/admin/teachers">Review teacher applications</Link>
              <Link to="/admin/courses">Review courses</Link>
              <Link to="/admin/users">Manage users</Link>
              <Link to="/admin/support">Open support queue</Link>
            </div>
          </details>
        </div>
      </section>
      {(snapshot.userError || snapshot.supportError || snapshot.reportError) && (
        <p className="edc-admin-feedback edc-admin-feedback-error" role="alert">
          Some dashboard data could not be read. Counts for affected records may be incomplete.
          {[snapshot.userError, snapshot.supportError, snapshot.reportError].filter(Boolean).join(" ")}
        </p>
      )}
      <section className="edc-admin-stat-grid" aria-label="Platform summary">
        {stats.map(({ label, value, icon: Icon, path, color }) => (
          <Link
            className={`edc-admin-stat-card edc-admin-stat-card-link edc-admin-metric-card edc-admin-metric-${color}`}
            key={label}
            to={path}
            aria-label={`${label}: ${value}. Open related admin section.`}
          >
            <span className="edc-admin-stat-icon" aria-hidden="true">
              <Icon size={19} />
            </span>
            <p>{label}</p>
            <strong>{value}</strong>
          </Link>
        ))}
      </section>

      <div className="edc-admin-live-grid">
        <Link className="edc-admin-panel edc-admin-growth-panel edc-admin-growth-panel-link" to="/admin/reports" aria-label="Open Reports and Analytics for platform growth details">
          <div className="edc-admin-panel-heading">
            <div><h3>Platform Growth</h3><p>New accounts and courses with recorded dates.</p></div>
            <div className="edc-admin-chart-legend"><span>Students</span><span>Teachers</span><span>Courses</span></div>
          </div>
          {growthHasRecords ? (
            <>
              <svg className="edc-admin-growth-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Daily registrations and courses created over the last ${rangeDays} days`}>
                <path className="edc-admin-chart-gridline" d="M0 10H100M0 35H100M0 60H100M0 85H100" />
                <path className="edc-admin-chart-students" d={linePath("students")} />
                <path className="edc-admin-chart-teachers" d={linePath("teachers")} />
                <path className="edc-admin-chart-courses" d={linePath("courses")} />
              </svg>
              <div className="edc-admin-growth-axis"><span>{growth[0].date.toLocaleDateString()}</span><span>{growth[Math.floor((growth.length - 1) / 2)].date.toLocaleDateString()}</span><span>{growth[growth.length - 1].date.toLocaleDateString()}</span></div>
            </>
          ) : <div className="edc-admin-dashboard-empty">No dated registrations or courses in this period.</div>}
        </Link>

        <section className="edc-admin-panel edc-admin-distribution-panel">
          <div className="edc-admin-panel-heading"><div><h3>User Distribution</h3><p>Registered accounts by saved role.</p></div><Link to="/admin/users">View users</Link></div>
          {totalUsers ? (
            <div className="edc-admin-role-distribution">
              <Link className="edc-admin-role-donut-link" to="/admin/users" aria-label={`Open user management for ${totalUsers} registered users`}>
                <div className="edc-admin-role-donut" style={{ background: `conic-gradient(${roleDonut})` }}>
                  <span><strong>{totalUsers.toLocaleString()}</strong><small>Total Users</small></span>
                </div>
              </Link>
              <div className="edc-admin-role-legend">{sortedRoles.map(([role, count]) => (
                <Link key={role} to={`/admin/users?role=${encodeURIComponent(role)}`}>
                  <i style={{ backgroundColor: roleColor(role) }} /><span>{role}</span><strong>{(count / totalUsers * 100).toFixed(1)}%</strong>
                </Link>
              ))}</div>
            </div>
          ) : <div className="edc-admin-dashboard-empty">No registered user records are available.</div>}
        </section>

        <section className="edc-admin-panel edc-admin-pending-panel">
          <div className="edc-admin-panel-heading"><div><h3>Pending Actions</h3><p>Open the related review queue.</p></div></div>
          <ul className="edc-admin-pending-action-list">
            {pendingActions.map(({ label, count, path, icon: Icon }) => (
              <li key={label}><Link to={path}><Icon size={15} /><span>{label}</span><strong>{count.toLocaleString()}</strong><ArrowRight size={14} /></Link></li>
            ))}
            <li><Link to="/admin/knowledge"><ClipboardCheck size={15} /><span>AI Knowledge Proposals</span><strong>{overview.pendingKnowledgeProposalCount.toLocaleString()}</strong><ArrowRight size={14} /></Link></li>
          </ul>
        </section>

        <section className="edc-admin-panel edc-admin-recent-activity-panel">
          <div className="edc-admin-panel-heading"><div><h3>Recent Activities</h3><p>Latest actions recorded in the Admin activity log.</p></div><Link to="/admin/audit-logs">View all</Link></div>
          {recentActivity.length ? <ul className="edc-admin-activity-summary-list">{recentActivity.map((item) => (
            <li key={item.id || `${item.timestamp}-${item.action}`}><Link to="/admin/audit-logs" aria-label={`Open activity log entry: ${item.description || item.action || "Admin activity"}`}><span className="edc-admin-activity-row-icon"><ShieldCheck size={15} /></span><div><strong>{item.description || item.action || "Admin activity"}</strong><small>{item.targetName || item.entityId || "Target not provided"}</small></div><time>{item.timestamp ? new Date(item.timestamp).toLocaleString() : "Date not recorded"}</time></Link></li>
          ))}</ul> : <div className="edc-admin-dashboard-empty">No Admin actions have been recorded yet.</div>}
        </section>

        <section className="edc-admin-panel edc-admin-registrations-panel">
          <div className="edc-admin-panel-heading"><div><h3>Recent Registrations</h3><p>Accounts with a recorded registration date.</p></div><Link to="/admin/users">View all</Link></div>
          {recentRegistrations.length ? <div className="edc-admin-registration-list">{recentRegistrations.map((user, index) => (
            <Link key={`${user.email || user.name}-${index}`} to={user.email || user.name ? `/admin/users?q=${encodeURIComponent(user.email || user.name)}` : "/admin/users"} aria-label={`Open user record for ${user.name || user.email || "registered user"}`}><span className="edc-admin-registration-avatar">{(user.avatar || user.profile?.avatar || user.studentProfile?.avatar || user.teacherProfile?.avatar) ? <img src={user.avatar || user.profile?.avatar || user.studentProfile?.avatar || user.teacherProfile?.avatar} alt="" /> : String(user.name || "?").trim().charAt(0).toUpperCase()}</span><strong>{user.name || "Name not provided"}</strong><span>{user.role || "Role not provided"}</span><time>{user.registrationDate.toLocaleDateString()}</time></Link>
          ))}</div> : <div className="edc-admin-dashboard-empty">No user records have a valid registration date.</div>}
        </section>

        <section className="edc-admin-panel edc-admin-health-summary-panel">
          <div className="edc-admin-panel-heading"><div><h3>System Health</h3><p>Read-only checks of this browser demo.</p></div><Link to="/admin/system-health">Details</Link></div>
          <div className="edc-admin-health-summary-list">
            <Link to="/admin/system-health"><span>Browser storage</span><strong data-health={snapshot.userError || snapshot.supportError ? "issue" : "ready"}>{snapshot.userError || snapshot.supportError ? "Check data" : "Readable"}</strong></Link>
            <Link to="/admin/users"><span>Registered users</span><strong>{snapshot.userError ? "Unavailable" : `${snapshot.users.length.toLocaleString()} records`}</strong></Link>
            <Link to="/admin/support"><span>Support tickets</span><strong>{snapshot.supportError ? "Unavailable" : `${snapshot.supportRequests.length.toLocaleString()} records`}</strong></Link>
            <Link to="/admin/moderation"><span>Moderation reports</span><strong>{snapshot.reportError ? "Unavailable" : `${snapshot.reports.length.toLocaleString()} records`}</strong></Link>
          </div>
        </section>
      </div>

    </div>
  );
}

export default AdminOverview;

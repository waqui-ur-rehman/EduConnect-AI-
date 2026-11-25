
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock3,
  DollarSign,
  Download,
  FileText,
  GraduationCap,
  RefreshCw,
  Star,
  Store,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  ADMIN_DATA_CHANGED_EVENT,
  getAdminActivityLog,
  getAdminCourses,
  getAdminTeachers,
  getAdminKnowledgeStorageState,
  readAdminSupportRequestsState,
  readAdminUsersState,
} from "./adminData";
import {
  getAdminSavedOrderItems,
  getAdminTutorBookings,
  getAdminTutorProfiles,
  readAdminOperationsSettings,
} from "./adminOperationsData";
import { collectInstructorCourseAnalytics } from "../../utils/instructorAnalytics";
import { REVIEW_EVENT } from "../../utils/courseReviews";
import { ORDERS_EVENT } from "../../utils/studentCart";
import { apiFetch } from "../../utils/api";
import { fetchAdminAnalytics } from "../../utils/phase7Api";

function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `PKR ${Math.max(0, amount).toLocaleString()}` : "—";
}

function uniqueUsers(users) {
  const byEmail = new Map();

  users.forEach((user) => {
    if (!user || typeof user !== "object" || Array.isArray(user)) {
      return;
    }

    const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
    if (!email) {
      return;
    }

    if (!byEmail.has(email)) {
      byEmail.set(email, user);
    }
  });

  return [...byEmail.values()];
}

function countMap(values) {
  const map = new Map();

  values.forEach((value) => {
    if (typeof value !== "string") {
      return;
    }

    const normalized = value.trim();
    if (!normalized) {
      return;
    }

    map.set(normalized, (map.get(normalized) || 0) + 1);
  });

  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "0%";
  }

  return `${Math.round(value)}%`;
}

function readCourseStorageError(teachers) {
  for (const teacher of teachers) {
    try {
      const raw = window.localStorage.getItem(`educonnect.teacher.${teacher.email}.courses`);
      if (raw === null) continue;
      if (!Array.isArray(JSON.parse(raw))) {
        return "Saved course records are not in a supported format.";
      }
    } catch {
      return "Saved course records could not be read.";
    }
  }
  return "";
}

function readEnrollmentStorageError() {
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith("educonnect.student.") || !key.endsWith(".enrollments")) continue;
      const raw = window.localStorage.getItem(key);
      if (raw === null) continue;
      if (!Array.isArray(JSON.parse(raw))) {
        return "Saved course enrollment records are not in a supported format.";
      }
    }
  } catch {
    return "Saved course enrollment records could not be read.";
  }
  return "";
}

function readReviewStorageError() {
  try {
    const raw = window.localStorage.getItem("educonnect.courseReviews.v1");
    if (raw !== null && !Array.isArray(JSON.parse(raw))) {
      return "Saved course reviews are not in a supported format.";
    }
  } catch {
    return "Saved course reviews could not be read.";
  }
  return "";
}

function readReportsSnapshot() {
  const userState = readAdminUsersState();
  const users = uniqueUsers(userState.users);
  const teachers = getAdminTeachers(users);
  const courseError = userState.error || readCourseStorageError(teachers);
  const courses = courseError ? [] : getAdminCourses(users);
  const courseAnalytics = courseError ? [] : teachers.flatMap((teacher) => (
    collectInstructorCourseAnalytics(
      teacher.email,
      courses.filter((course) => String(course.teacherEmail).trim().toLowerCase() === String(teacher.email).trim().toLowerCase()),
    )
  ));
  const enrollmentError = readEnrollmentStorageError();
  const reviewError = readReviewStorageError();
  const knowledgeState = getAdminKnowledgeStorageState();
  const activityState = getAdminActivityLog();
  const supportState = readAdminSupportRequestsState();
  const operationsSettings = readAdminOperationsSettings();
  const tutorProfiles = getAdminTutorProfiles(operationsSettings, userState.users);
  const tutorBookings = getAdminTutorBookings();
  const transactionState = getAdminSavedOrderItems();
  const transactions = transactionState.records;

  return {
    users,
    userError: userState.error || "",
    teachers,
    courses,
    courseAnalytics,
    courseError,
    enrollmentError,
    reviewError,
    knowledgeState,
    activityState,
    supportState,
    operationsSettings,
    tutorProfiles,
    tutorBookings,
    transactionState,
    transactions,
    transactionSource: transactionState.errors.length
      ? "Order record scan incomplete"
      : transactionState.records.length
        ? "Saved browser-local demo orders"
        : "No saved browser-local demo orders",
    errors: [
      userState.error,
      courseError && courseError !== userState.error ? courseError : "",
      enrollmentError,
      reviewError,
      knowledgeState.error,
      activityState.error,
      supportState.error,
      operationsSettings.error,
      ...tutorBookings.errors,
      ...transactionState.errors,
    ].filter(Boolean),
  };
}

function DistributionPanel({ title, description, values, total, fillClass = "", unavailable = false }) {
  return (
    <section className="edc-admin-panel edc-admin-report-card">
      <div className="edc-admin-panel-heading">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      {unavailable ? (
        <p className="edc-admin-security-note">This data is unavailable because its saved source could not be read.</p>
      ) : values.length === 0 ? (
        <p className="edc-admin-security-note">No records are available for this report in the current browser.</p>
      ) : (
        <div className="edc-admin-analytics-bars">
          {values.map(([label, count]) => (
            <div key={label} className="edc-admin-analytics-bar-row">
              <div className="edc-admin-analytics-bar-labels">
                <span>{label}</span>
                <strong>{count}</strong>
              </div>
              <div className="edc-admin-analytics-bar-track">
                <div
                  className={`edc-admin-analytics-bar-fill ${fillClass}`}
                  style={{ width: `${(count / (total || 1)) * 100}%` }}
                />
              </div>
              <small>{formatPercent((count / (total || 1)) * 100)}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DonutPanel({ title, description, values, total, colors, unavailable = false }) {
  const stops = values.map(([, count], index) => {
    const previousCount = values.slice(0, index).reduce((sum, [, value]) => sum + value, 0);
    const start = (previousCount / Math.max(1, total)) * 100;
    const end = start + (count / Math.max(1, total)) * 100;
    return `${colors[index % colors.length]} ${start}% ${end}%`;
  }).join(", ");

  return (
    <section className="edc-admin-report-card">
      <header><h3>{title}</h3>{description && <p>{description}</p>}</header>
      {unavailable ? <p className="edc-admin-report-empty">This data is unavailable because its saved source could not be read.</p>
        : values.length ? (
          <div className="edc-admin-report-donut-layout">
            <div className="edc-admin-report-donut" style={{ background: `conic-gradient(${stops})` }} role="img" aria-label={`${total} saved records by category`}>
              <span><strong>{total.toLocaleString()}</strong><small>Saved</small></span>
            </div>
            <div className="edc-admin-report-legend">{values.slice(0, 6).map(([label, count], index) => (
              <div key={label}><i style={{ backgroundColor: colors[index % colors.length] }} /><span>{label}</span><strong>{count.toLocaleString()} ({formatPercent((count / Math.max(1, total)) * 100)})</strong></div>
            ))}{values.length > 6 && <p>Showing 6 of {values.length} saved categories.</p>}</div>
          </div>
        ) : <p className="edc-admin-report-empty">No saved records are available for this report.</p>}
    </section>
  );
}

function EnrollmentTrendPanel({ records, unavailable = false }) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return { key, label: date.toLocaleDateString(undefined, { month: "short" }), count: 0 };
  });
  const monthCounts = new Map(months.map((month) => [month.key, month]));
  let datedEnrollments = 0;
  records.forEach((record) => {
    const timestamp = Date.parse(record.enrolledAt || "");
    if (!Number.isFinite(timestamp) || timestamp > now.getTime() || timestamp < start.getTime()) return;
    const date = new Date(timestamp);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const month = monthCounts.get(key);
    if (!month) return;
    month.count += 1;
    datedEnrollments += 1;
  });

  const max = Math.max(1, ...months.map((month) => month.count));
  const points = months.map((month, index) => ({
    ...month,
    x: 42 + (index * 548) / (months.length - 1),
    y: 132 - (month.count / max) * 102,
  }));
  const path = points.map(({ x, y }, index) => `${index ? "L" : "M"}${x},${y}`).join(" ");

  return (
    <section className="edc-admin-report-card edc-admin-report-trend">
      <header><div><h3>Recorded Enrollments (Last 12 Months)</h3><p>Counts use saved student enrollment dates; no user or revenue trend is inferred.</p></div><span><i /> Enrollments</span></header>
      {unavailable ? <p className="edc-admin-report-empty">Enrollment history is unavailable because saved enrollment records could not be read.</p>
        : datedEnrollments ? (
          <div className="edc-admin-report-chart-wrap">
            <svg viewBox="0 0 620 175" role="img" aria-label={`${datedEnrollments} saved enrollments with dates in the last 12 months`}>
              {[30, 64, 98, 132].map((y) => <line key={y} x1="38" x2="596" y1={y} y2={y} className="edc-admin-report-gridline" />)}
              <path d={path} className="edc-admin-report-line" />
              {points.map((point) => <g key={point.key}>
                <circle cx={point.x} cy={point.y} r="3.5" className="edc-admin-report-point"><title>{`${point.label}: ${point.count} enrollments`}</title></circle>
                <text x={point.x} y="158" textAnchor="middle" className="edc-admin-report-axis-label">{point.label}</text>
              </g>)}
            </svg>
          </div>
        ) : <p className="edc-admin-report-empty">No saved enrollments with dates in the last 12 months.</p>}
    </section>
  );
}

function TopCoursesPanel({ courses, unavailable = false, reviewUnavailable = false }) {
  const ranked = [...courses]
    .filter((course) => course.students > 0)
    .sort((left, right) => right.students - left.students || left.title.localeCompare(right.title))
    .slice(0, 5);

  return (
    <section className="edc-admin-report-card">
      <header><h3><BookOpen size={16} aria-hidden="true" />Top Courses by Saved Enrollments</h3></header>
      {unavailable ? <p className="edc-admin-report-empty">Course enrollment data is unavailable because a saved data source could not be read.</p>
        : ranked.length ? (
          <div className="edc-admin-report-table-wrap">
            <table className="edc-admin-report-table">
              <thead><tr><th scope="col">#</th><th scope="col">Course Title</th><th scope="col">Instructor</th><th scope="col">Enrollments</th><th scope="col">Rating</th></tr></thead>
              <tbody>{ranked.map((course, index) => (
                <tr key={`${course.teacherEmail}-${course.id}`}>
                  <td>{index + 1}</td><td><strong>{course.title || "Untitled course"}</strong></td>
                  <td>{course.teacherEmail || "Instructor not recorded"}</td><td>{course.students.toLocaleString()}</td>
                  <td>{reviewUnavailable ? "—" : course.reviews ? `${course.rating.toFixed(1)} / 5` : "Not collected"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="edc-admin-report-empty">No saved course enrollments are available to rank.</p>}
    </section>
  );
}

function MongoDBOverviewPanel({ overview, error }) {
  if (!overview) {
    return (
      <section className="edc-admin-report-card">
        <header><h3><BarChart3 size={17} aria-hidden="true" />MongoDB Reports</h3><p>Live counts from the authorized backend report endpoints.</p></header>
        <p className="edc-admin-security-note">{error ? `Backend reports are unavailable: ${error}` : "Loading MongoDB reports…"}</p>
      </section>
    );
  }
  const users = overview.users || {};
  const courses = overview.courses || {};
  const support = overview.support || {};
  const books = overview.books || {};
  const rows = [
    ["Total Students", users.students],
    ["Total Teachers", users.teachers],
    ["Total Admins", users.admins],
    ["Active Users (30-day window)", users.activeUsers],
    ["Published Courses", courses.publishedCourses],
    ["Pending Approvals", courses.pendingApprovals],
    ["Books", books.total],
    ["Lessons", courses.lessons],
    ["Quizzes", courses.quizzes],
    ["Support Tickets", support.total],
    ["Support Tickets — Open", support.open],
    ["Support Tickets — In Progress", support.inProgress],
    ["Support Tickets — Resolved", support.resolved],
    ["Support Tickets — Closed", support.closed],
  ];
  return (
    <section className="edc-admin-report-card">
      <header><h3><BarChart3 size={17} aria-hidden="true" />MongoDB Reports</h3><p>Live counts from the authorized backend report endpoints.</p></header>
      <dl className="edc-admin-report-facts">
        {rows.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{Number.isFinite(Number(value)) ? Number(value).toLocaleString() : value ?? "—"}</dd></div>
        ))}
      </dl>
    </section>
  );
}

function MongoDBFinancePanel({ overview, tickets, error }) {
  if (!overview) {
    return (
      <section className="edc-admin-report-card edc-admin-report-financial">
        <header><h3><DollarSign size={17} aria-hidden="true" />MongoDB Financial Reports</h3></header>
        <p className="edc-admin-report-untracked">{error ? `Backend reports are unavailable: ${error}` : "Loading MongoDB financial reports…"}</p>
      </section>
    );
  }
  const finance = overview.finance || {};
  const rows = [
    ["Verified Paid Orders", finance.verifiedOrders],
    ["Verified Order Value", finance.verifiedOrderValue],
    ["Teacher Earnings", finance.teacherEarnings],
    ["Platform Commission", finance.platformCommission],
    ["Refunds", finance.refunds],
    ["Demo Paid Orders", finance.demoPaidOrders],
    ["Support Tickets (open)", tickets?.counts?.open ?? tickets?.total],
  ];
  return (
    <section className="edc-admin-report-card edc-admin-report-financial">
      <header><h3><DollarSign size={17} aria-hidden="true" />MongoDB Financial Reports</h3><p>Demo sandbox sales are excluded from real-money revenue and payout totals.</p></header>
      <dl className="edc-admin-report-facts">
        {rows.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{Number.isFinite(Number(value)) ? money(value) : value ?? "—"}</dd></div>
        ))}
      </dl>
    </section>
  );
}

const REPORT_TABS = [
  ["overview", "Overview", BarChart3],
  ["users", "User Reports", UsersRound],
  ["courses", "Course Reports", BookOpen],
  ["financial", "Financial Reports", DollarSign],
  ["performance", "Performance", Activity],
  ["custom", "Custom Reports", FileText],
];

function AdminLearningPanel({ analytics }) {
  if (!analytics?.summary) {
    return (
      <section className="edc-admin-report-card">
        <header><h3><Activity size={16} aria-hidden="true" />MongoDB Learning Analytics</h3><p>Phase 7 platform learning metrics.</p></header>
        <p className="edc-admin-report-empty">Learning analytics are unavailable until the backend endpoint responds.</p>
      </section>
    );
  }
  const s = analytics.summary;
  const facts = [
    ["Active Students", s.activeStudents], ["Active Teachers", s.activeTeachers], ["Published Courses", s.publishedCourses],
    ["Enrollments", s.enrollments], ["Lessons Completed", s.lessonsCompleted], ["Completion Rate", `${s.completionRate}%`],
    ["Quiz Attempts", s.quizAttempts], ["Passed Quizzes", s.passedQuizzes], ["Quiz Pass Rate", s.quizPassRate == null ? "—" : `${s.quizPassRate}%`],
    ["Certificates Issued", s.certificatesIssued], ["Recent Enrollments (30d)", s.recentEnrollments],
  ];
  return (
    <section className="edc-admin-report-card">
      <header><h3><Activity size={16} aria-hidden="true" />MongoDB Learning Analytics</h3><p>Live Phase 7 metrics from MongoDB collections.</p></header>
      <dl className="edc-admin-report-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{Number.isFinite(Number(value)) ? Number(value).toLocaleString() : value}</dd></div>)}</dl>
      {Array.isArray(analytics.topCourses) && analytics.topCourses.length > 0 && (
        <div className="edc-admin-report-table-wrap" style={{ marginTop: 12 }}>
          <table className="edc-admin-report-table"><thead><tr><th scope="col">Top Course</th><th scope="col">Enrollments</th><th scope="col">Lessons</th></tr></thead>
            <tbody>{analytics.topCourses.map((course) => <tr key={course.courseId}><td><strong>{course.title}</strong></td><td>{Number(course.enrollments || 0).toLocaleString()}</td><td>{Number(course.lessons || 0).toLocaleString()}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AdminAnalytics() {
  const [reports, setReports] = useState(readReportsSnapshot);
  const [activeTab, setActiveTab] = useState("overview");
  const [apiOverview, setApiOverview] = useState(null);
  const [apiTickets, setApiTickets] = useState(null);
  const [apiError, setApiError] = useState("");
  const [apiLearning, setApiLearning] = useState(null);

  const fetchApiReports = useCallback(async () => {
    try {
      const [overviewResponse, ticketsResponse, learningResult] = await Promise.allSettled([
        apiFetch("/admin/reports/overview", { method: "GET" }),
        apiFetch("/admin/reports/tickets", { method: "GET" }),
        fetchAdminAnalytics(),
      ]);
      if (overviewResponse.status === "fulfilled" && ticketsResponse.status === "fulfilled" && overviewResponse.value.ok && ticketsResponse.value.ok) {
        const [overview, tickets] = await Promise.all([overviewResponse.value.json(), ticketsResponse.value.json()]);
        setApiOverview(overview);
        setApiTickets(tickets);
        setApiError("");
      } else {
        setApiError("Backend reports could not be loaded.");
      }
      if (learningResult.status === "fulfilled") setApiLearning(learningResult.value);
    } catch (error) {
      setApiError(error?.message || "Backend reports could not be loaded.");
    }
  }, []);

  useEffect(() => {
    function refresh() {
      setReports(readReportsSnapshot());
    }

    const events = ["storage", "focus", ADMIN_DATA_CHANGED_EVENT, "educonnect:student-data-changed", ORDERS_EVENT, REVIEW_EVENT];
    events.forEach((event) => window.addEventListener(event, refresh));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchApiReports();
    window.addEventListener(ADMIN_DATA_CHANGED_EVENT, fetchApiReports);
    return () => {
      events.forEach((event) => window.removeEventListener(event, refresh));
      window.removeEventListener(ADMIN_DATA_CHANGED_EVENT, fetchApiReports);
    };
  }, [fetchApiReports]);

  const {
    users,
    userError,
    teachers,
    courses,
    courseAnalytics,
    courseError,
    enrollmentError,
    reviewError,
    knowledgeState,
    activityState,
    supportState,
    operationsSettings,
    tutorProfiles,
    tutorBookings,
    transactionState,
    transactions,
    transactionSource,
    errors,
  } = reports;
  const roleDistribution = useMemo(
    () => countMap(users.map((user) => typeof user.role === "string" && user.role.trim() ? user.role : "Role not recorded")),
    [users],
  );
  const courseStatuses = useMemo(
    () => countMap(courses.map((course) => typeof course.status === "string" && course.status.trim() ? course.status : "Status not recorded")),
    [courses],
  );
  const teacherStatuses = useMemo(
    () => countMap(teachers.map((teacher) => typeof teacher.status === "string" && teacher.status.trim() ? teacher.status : "Status not recorded")),
    [teachers],
  );
  const knowledgeProposals = knowledgeState.proposals;
  const knowledgeStatuses = useMemo(
    () => countMap(knowledgeProposals.map((proposal) => proposal.status || "Status not recorded")),
    [knowledgeProposals],
  );
  const supportStatuses = useMemo(
    () => countMap(supportState.records.map((record) => record.status || "Status not recorded")),
    [supportState.records],
  );
  const moderationRecords = supportState.records.filter((record) => record.category === "Moderation & Appeal");
  const moderationStatuses = useMemo(
    () => countMap(moderationRecords.map((record) => record.status || "Status not recorded")),
    [moderationRecords],
  );
  const tutorBookingStatuses = useMemo(
    () => countMap(tutorBookings.records.map((booking) => booking.status || "Status not recorded")),
    [tutorBookings.records],
  );
  const enrollmentRecords = courseAnalytics.flatMap((course) => course.enrollmentRecords);
  const ratings = courseAnalytics.flatMap((course) => course.ratings);
  const averageRating = ratings.length
    ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
    : null;
  const averageProgress = enrollmentRecords.length
    ? Math.round(enrollmentRecords.reduce((sum, enrollment) => sum + enrollment.progress, 0) / enrollmentRecords.length)
    : null;
  const uniqueEnrolledStudents = new Set(enrollmentRecords.map((enrollment) => enrollment.email).filter(Boolean)).size;
  const totalUsers = users.length;
  const totalCourses = courses.length;
  const totalEnrollments = enrollmentRecords.length;
  const activityCount = activityState.records.length;
  const transactionsTotal = transactions.reduce(
    (sum, transaction) => sum + (Number.isFinite(transaction.amount) ? transaction.amount : 0),
    0,
  );
  const savedOrderValue = transactions.length && !transactionState.errors.length &&
    transactions.every((transaction) => Number.isFinite(transaction.amount))
    ? `PKR ${transactionsTotal.toLocaleString()}`
    : transactionState.errors.length ? "—" : transactions.length ? "Amount unavailable" : "No saved orders";
  const enrollmentByCategory = [...courseAnalytics.reduce((map, course) => {
    const count = Number(course.students) || 0;
    if (!count) return map;
    const category = typeof course.category === "string" && course.category.trim()
      ? course.category.trim()
      : "Category not recorded";
    map.set(category, (map.get(category) || 0) + count);
    return map;
  }, new Map())]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const ratingDistribution = [5, 4, 3, 2, 1]
    .map((rating) => [`${rating} stars`, ratings.filter((value) => value === rating).length])
    .filter(([, count]) => count > 0);
  const progressDistribution = [
    ["Completed", enrollmentRecords.filter((record) => record.progress >= 100).length],
    ["In Progress", enrollmentRecords.filter((record) => record.progress > 0 && record.progress < 100).length],
    ["Not Started", enrollmentRecords.filter((record) => record.progress <= 0).length],
  ].filter(([, count]) => count > 0);
  const hasEnrollmentError = Boolean(courseError || enrollmentError);
  const hasRatingError = Boolean(courseError || reviewError);
  const platformColors = ["#7412bf", "#ffba08", "#ee3e5a", "#3589ef", "#17a84b", "#8d7ba0"];
  const stats = [
    { label: "Total Users", value: userError ? "—" : totalUsers.toLocaleString(), icon: UsersRound, color: "purple", tab: "users" },
    { label: "Total Courses", value: courseError ? "—" : totalCourses.toLocaleString(), icon: BookOpen, color: "orange", tab: "courses" },
    { label: "Enrollments", value: hasEnrollmentError ? "—" : totalEnrollments.toLocaleString(), icon: GraduationCap, color: "green", tab: "performance" },
    { label: "Revenue", value: "No data", icon: DollarSign, color: "red", tab: "financial" },
    { label: "Registered Tutors", value: userError || operationsSettings.error ? "—" : tutorProfiles.length.toLocaleString(), icon: Store, color: "violet", tab: "users" },
    { label: "Average Rating", value: hasRatingError ? "—" : averageRating === null ? "No ratings" : `${averageRating.toFixed(1)} / 5`, icon: Star, color: "purple", tab: "courses" },
  ];

  function refreshReports() {
    setReports(readReportsSnapshot());
  }

  function quickAction(tab) {
    setActiveTab(tab);
  }

  function renderOverview() {
    return (
      <div className="edc-admin-report-overview">
        <main className="edc-admin-report-main">
          <EnrollmentTrendPanel records={enrollmentRecords} unavailable={hasEnrollmentError} />
          <TopCoursesPanel courses={courseAnalytics} unavailable={hasEnrollmentError} reviewUnavailable={hasRatingError} />
          <section className="edc-admin-report-card edc-admin-report-recent">
            <header><h3><FileText size={16} aria-hidden="true" />Recent Reports</h3><span>Not stored</span></header>
            <div className="edc-admin-report-empty"><Clock3 size={21} aria-hidden="true" /><strong>Report generation history is not available.</strong><p>This app does not save generated or scheduled report records.</p></div>
          </section>
        </main>
        <aside className="edc-admin-report-sidebar">
          <DonutPanel
            title="User Distribution"
            description="Unique registered accounts by saved role."
            values={roleDistribution}
            total={totalUsers}
            colors={platformColors}
            unavailable={Boolean(userError)}
          />
          <MongoDBOverviewPanel overview={apiOverview} error={apiError} />
          <AdminLearningPanel analytics={apiLearning} />
          <section className="edc-admin-report-card">
            <header><h3><DollarSign size={16} aria-hidden="true" />Revenue Overview</h3></header>
            <div className="edc-admin-report-revenue"><strong>Unavailable</strong><span>Settled revenue is not available in this app.</span></div>
            <dl className="edc-admin-report-facts">
              <div><dt>Saved demo order items</dt><dd>{transactionState.errors.length ? "—" : transactions.length.toLocaleString()}</dd></div>
              <div><dt>Saved order value (demo)</dt><dd>{savedOrderValue}</dd></div>
              <div><dt>Payouts / refunds</dt><dd>Unavailable</dd></div>
            </dl>
            <p className="edc-admin-report-caption">{transactionSource}; checkout values are not confirmed payments.</p>
          </section>
          <DistributionPanel
            title="Enrollments by Category"
            description="Saved student enrollments grouped by each course category."
            values={enrollmentByCategory}
            total={totalEnrollments}
            unavailable={hasEnrollmentError}
          />
          <section className="edc-admin-report-card">
            <header><h3><Activity size={16} aria-hidden="true" />Key Insights</h3></header>
            <ul className="edc-admin-report-insights">
              <li><span><UsersRound size={14} /></span>{userError ? "Registered user totals are unavailable." : `${totalUsers.toLocaleString()} unique accounts are saved in this browser.`}</li>
              <li><span><BookOpen size={14} /></span>{hasEnrollmentError ? "Enrollment totals are unavailable." : `${totalEnrollments.toLocaleString()} course enrollments across ${uniqueEnrolledStudents.toLocaleString()} unique students.`}</li>
              <li><span><Star size={14} /></span>{hasRatingError ? "Course ratings are unavailable." : averageRating === null ? "No course ratings have been collected." : `${ratings.length.toLocaleString()} saved reviews; average ${averageRating.toFixed(1)} / 5.`}</li>
              <li><span><Activity size={14} /></span>{activityState.error ? "Admin activity totals are unavailable." : `${activityCount.toLocaleString()} Admin activity records are saved in this browser.`}</li>
              <li><span><DollarSign size={14} /></span>Revenue, payout, refund, and settlement tracking is not enabled.</li>
            </ul>
          </section>
          <section className="edc-admin-report-card">
            <header><h3><Activity size={16} aria-hidden="true" />Quick Actions</h3></header>
            <div className="edc-admin-report-quick-actions">
              <Link to="/admin/data-export"><Download size={14} />Export Available Data</Link>
              <button type="button" onClick={() => quickAction("users")}><UsersRound size={14} />User Reports</button>
              <button type="button" onClick={() => quickAction("courses")}><BookOpen size={14} />Course Reports</button>
              <button type="button" onClick={() => quickAction("financial")}><DollarSign size={14} />Financial Reports</button>
            </div>
          </section>
        </aside>
      </div>
    );
  }

  function renderUserReports() {
    return (
      <div className="edc-admin-report-panels">
        <DonutPanel title="User Distribution" description="Counts use unique registered account emails." values={roleDistribution} total={totalUsers} colors={platformColors} unavailable={Boolean(userError)} />
        <DistributionPanel title="Teacher Application Status" description="Current saved teacher account statuses." values={teacherStatuses} total={teachers.length} unavailable={Boolean(userError)} />
        <DistributionPanel title="Support Request Status" description="Statuses from saved browser-local support requests." values={supportStatuses} total={supportState.records.length} unavailable={Boolean(supportState.error)} />
        <DistributionPanel title="Moderation & Appeal Status" description="A category-filtered subset of the same saved support requests." values={moderationStatuses} total={moderationRecords.length} fillClass="course-fill" unavailable={Boolean(supportState.error)} />
        <DistributionPanel title="Tutor Booking Requests" description="Saved student booking requests; this is not payment data." values={tutorBookingStatuses} total={tutorBookings.records.length} unavailable={tutorBookings.errors.length > 0} />
        <DistributionPanel title="AI Knowledge Proposal Status" description="Current saved governance proposals, not AI runtime metrics." values={knowledgeStatuses} total={knowledgeProposals.length} fillClass="knowledge-fill" unavailable={Boolean(knowledgeState.error)} />
      </div>
    );
  }

  function renderCourseReports() {
    return (
      <div className="edc-admin-report-panels">
        <DistributionPanel title="Course Status Distribution" description="Approval and publication states on saved teacher course records." values={courseStatuses} total={totalCourses} fillClass="course-fill" unavailable={Boolean(courseError)} />
        <DistributionPanel title="Enrollments by Category" description="Actual saved student enrollments grouped by course category." values={enrollmentByCategory} total={totalEnrollments} unavailable={hasEnrollmentError} />
        <TopCoursesPanel courses={courseAnalytics} unavailable={hasEnrollmentError} reviewUnavailable={hasRatingError} />
      </div>
    );
  }

  function renderFinancialReports() {
    return (
      <div className="edc-admin-report-panels">
        <section className="edc-admin-report-card edc-admin-report-financial">
          <header><h3><DollarSign size={17} aria-hidden="true" />Financial Data Availability</h3></header>
          <p className="edc-admin-report-untracked">Revenue and payment settlement tracking is not enabled.</p>
          <p>This browser has saved checkout order items, but their values are demo checkout data and do not confirm completed or settled payments.</p>
          <dl className="edc-admin-report-facts">
            <div><dt>Saved demo order items</dt><dd>{transactionState.errors.length ? "—" : transactions.length.toLocaleString()}</dd></div>
            <div><dt>Saved order value (demo)</dt><dd>{savedOrderValue}</dd></div>
            <div><dt>Settled revenue</dt><dd>Unavailable</dd></div>
            <div><dt>Payout / refund / invoice records</dt><dd>Unavailable</dd></div>
            <div><dt>Subscriptions / licenses</dt><dd>Unavailable</dd></div>
          </dl>
          <p className="edc-admin-report-caption">{transactionSource}. No revenue total is inferred from these order items.</p>
          <Link className="edc-admin-report-link" to="/admin/finance">Open Financial Management <ArrowRight size={14} /></Link>
        </section>
        <MongoDBFinancePanel overview={apiOverview} tickets={apiTickets} error={apiError} />
        <DistributionPanel title="Saved Tutor Booking Status" description="Booking requests are shown separately from financial transactions." values={tutorBookingStatuses} total={tutorBookings.records.length} />
      </div>
    );
  }

  function renderPerformance() {
    return (
      <div className="edc-admin-report-panels">
        <AdminLearningPanel analytics={apiLearning} />
        <EnrollmentTrendPanel records={enrollmentRecords} unavailable={hasEnrollmentError} />
        <section className="edc-admin-report-card">
          <header><h3><CheckCircle2 size={16} aria-hidden="true" />Saved Learning Progress</h3></header>
          <div className="edc-admin-report-performance-number">
            <strong>{hasEnrollmentError ? "—" : averageProgress === null ? "Not available" : `${averageProgress}%`}</strong>
            <span>Average recorded progress across saved enrollment records.</span>
          </div>
          <DistributionPanel title="Enrollment Progress Status" description="Based on the saved progress field for each enrollment." values={progressDistribution} total={totalEnrollments} unavailable={hasEnrollmentError} />
        </section>
        <DonutPanel title="Saved Course Ratings" description="Recorded learner ratings only; moderated reviews are excluded by the source." values={ratingDistribution} total={ratings.length} colors={platformColors} unavailable={hasRatingError} />
        <TopCoursesPanel courses={courseAnalytics} unavailable={hasEnrollmentError} reviewUnavailable={hasRatingError} />
      </div>
    );
  }

  function renderCustomReports() {
    return (
      <section className="edc-admin-report-card edc-admin-report-custom">
        <span><FileText size={24} aria-hidden="true" /></span>
        <h3>Custom report builder has not been set up.</h3>
        <p>This app does not save report definitions or generated report history. You can export the existing browser-local datasets without adding or simulating records.</p>
        <Link to="/admin/data-export"><Download size={15} />Export Available Data</Link>
      </section>
    );
  }

  return (
    <section className="edc-admin-analytics edc-admin-reports-reference">
      <header className="edc-admin-reports-heading">
        <div>
          <span className="edc-admin-page-eyebrow">PLATFORM INSIGHTS</span>
          <h2><BarChart3 aria-hidden="true" />Reports &amp; Analytics</h2>
          <p>Explore saved user, course, enrollment, and activity data from this browser.</p>
        </div>
        <div className="edc-admin-reports-heading-actions">
          <Link to="/admin/data-export"><Download size={15} />Export Available Data</Link>
          <button type="button" onClick={refreshReports}><RefreshCw size={15} />Refresh</button>
        </div>
      </header>
      <p className="edc-admin-reports-note">These are browser-local records, not platform-wide metrics. No sample data, growth percentages, or settled revenue figures are added.</p>

      <div className="edc-admin-reports-stats" aria-label="Platform summary from saved data">
        {stats.map(({ label, value, icon: Icon, color, tab }) => (
          <button
            className={`edc-admin-reports-stat ${color} edc-admin-metric-card edc-admin-metric-${color}${activeTab === tab ? " is-active" : ""}`}
            key={label}
            type="button"
            aria-pressed={activeTab === tab}
            onClick={() => quickAction(tab)}
          >
            <span><Icon size={21} aria-hidden="true" /></span>
            <div><p>{label}</p><strong>{value}</strong></div>
          </button>
        ))}
      </div>

      <nav className="edc-admin-reports-tabs" aria-label="Report categories">
        {REPORT_TABS.map(([id, label, Icon]) => (
          <button type="button" key={id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)} aria-current={activeTab === id ? "page" : undefined}>
            <Icon size={15} aria-hidden="true" />{label}
          </button>
        ))}
      </nav>

      {errors.length > 0 && <p className="edc-admin-feedback edc-admin-feedback-error" role="alert"><AlertTriangle size={16} aria-hidden="true" />{errors.join(" ")}</p>}

      {activeTab === "overview" && renderOverview()}
      {activeTab === "users" && renderUserReports()}
      {activeTab === "courses" && renderCourseReports()}
      {activeTab === "financial" && renderFinancialReports()}
      {activeTab === "performance" && renderPerformance()}
      {activeTab === "custom" && renderCustomReports()}
    </section>
  );
}

export default AdminAnalytics;

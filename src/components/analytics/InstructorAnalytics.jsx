import React, { useEffect, useState } from "react";
import {
  Award,
  BarChart3,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Download,
  GraduationCap,
  Layers3,
  WalletCards,
  UsersRound,
} from "lucide-react";
import { ORDERS_EVENT } from "../../utils/studentCart";
import { collectInstructorCourseAnalytics } from "../../utils/instructorAnalytics";
import "./InstructorAnalytics.css";

const number = (value) => Math.max(0, Number(value) || 0);
const formatCurrency = (value) =>
  `PKR ${number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const monthKey = (date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
const csvEscape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const dateLabel = (value) => {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Date not recorded";
};
const completionFor = (course) => {
  const records = course.enrollmentRecords || [];
  return records.length
    ? records.reduce((total, record) => total + number(record.progress), 0) /
        records.length
    : null;
};
const statusFor = (progress) =>
  progress >= 100 ? "Completed" : progress > 0 ? "In Progress" : "Not Started";

function getMonths(count) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - count + index + 1, 1),
    );
    return {
      key: monthKey(date),
      label: date.toLocaleDateString(undefined, {
        month: "short",
        timeZone: "UTC",
      }),
    };
  });
}

function ProgressChart({ courses, metric }) {
  const valueFor = metric === "enrollments"
    ? (course) => Number(course.students ?? course.enrollments ?? 0)
    : (course) => (course.completion != null ? Number(course.completion) : (completionFor(course) || 0));
  const values = courses.map(valueFor);
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => ({
    x: 54 + (index * 592) / Math.max(1, values.length - 1),
    y: 25 + ((max - value) / max) * 142,
  }));
  const path = points
    .map(({ x, y }, index) => `${index ? "L" : "M"}${x},${y}`)
    .join(" ");
  const area = `${path} L${points[points.length - 1]?.x || 646},185 L${points[0]?.x || 54},185 Z`;
  const hasData = values.some((value) => value > 0);

  return (
    <div className="edc-ia-line-chart">
      {courses.length ? (
        <svg viewBox="0 0 700 220" role="img" aria-label="Learning progress by course">
          <defs>
            <linearGradient id="edc-ia-progress-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#7412c7" stopOpacity=".23" />
              <stop offset="100%" stopColor="#7412c7" stopOpacity=".02" />
            </linearGradient>
          </defs>
          {[25, 65, 105, 145, 185].map((y) => (
            <line key={y} x1="54" x2="646" y1={y} y2={y} className="edc-ia-gridline" />
          ))}
          {points.length > 1 && <path d={area} fill="url(#edc-ia-progress-area)" />}
          {points.length > 1 && <path d={path} className="edc-ia-progress-path" />}
          {points.map(({ x, y }, index) => {
            const course = courses[index];
            const value = values[index];
            const label = metric === "enrollments"
              ? `${value} enrollments`
              : `${Math.round(value)}% average progress`;
            return (
              <g key={String(course.id || course.courseId || index)}>
                <circle cx={x} cy={y} r="5" className="edc-ia-progress-dot">
                  <title>{`${course.title || "Untitled course"}: ${label}`}</title>
                </circle>
                <text x={x} y="211" textAnchor="middle" className="edc-ia-axis-label">
                  {(course.title || "Course").slice(0, 9)}
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        <div className="edc-ia-chart-empty">No course analytics data available yet.</div>
      )}
      {courses.length > 0 && !hasData && (
        <div className="edc-ia-chart-empty">No progress data is available for these courses.</div>
      )}
    </div>
  );
}
function SalesChart({ months, sales }) {
  const values = months.map(({ key }) =>
    sales.filter((sale) => String(sale.purchasedAt || "").slice(0, 7) === key).length,
  );
  const max = Math.max(1, ...values);

  return (
    <div className="edc-ia-sales-chart">
      {months.map((month, index) => (
        <div className="edc-ia-sales-month" key={month.key}>
          <small>{values[index]}</small>
          <div className="edc-ia-sales-track">
            <span style={{ height: `${values[index] ? Math.max(4, values[index] / max * 100) : 0}%` }} />
          </div>
          <b>{month.label}</b>
        </div>
      ))}
      {!values.some((value) => value > 0) && (
        <div className="edc-ia-chart-empty">No saved sales in this period.</div>
      )}
    </div>
  );
}

function RevenueEnrollmentsChart({ months, sales, enrollments }) {
  const records = months.map(({ key }) => ({
    key,
    sales: sales.filter((sale) => String(sale.purchasedAt || "").slice(0, 7) === key),
    enrollments: enrollments.filter(
      (enrollment) => String(enrollment.enrolledAt || "").slice(0, 7) === key,
    ).length,
  }));
  const revenueValues = records.map(({ sales: monthSales }) =>
    monthSales.reduce((total, sale) => total + number(sale.amount), 0),
  );
  const enrollmentValues = records.map((record) => record.enrollments);
  const maxRevenue = Math.max(1, ...revenueValues);
  const maxEnrollments = Math.max(1, ...enrollmentValues);
  const points = enrollmentValues.map((value, index) => ({
    x: 52 + (index * 600) / Math.max(1, records.length - 1),
    y: 172 - (value / maxEnrollments) * 125,
  }));
  const path = points
    .map(({ x, y }, index) => `${index ? "L" : "M"}${x},${y}`)
    .join(" ");
  const hasData = revenueValues.some((value) => value > 0) ||
    enrollmentValues.some((value) => value > 0);

  return (
    <div className="edc-ia-combo-chart">
      <svg viewBox="0 0 700 220" role="img" aria-label="Recorded gross sales and enrollments by month">
        {[22, 60, 98, 136, 174].map((y) => (
          <line key={y} x1="50" x2="652" y1={y} y2={y} className="edc-ia-gridline" />
        ))}
        {records.map((record, index) => {
          const x = 52 + (index * 600) / Math.max(1, records.length - 1);
          const height = revenueValues[index]
            ? Math.max(3, (revenueValues[index] / maxRevenue) * 135)
            : 0;
          return (
            <g key={record.key}>
              <rect
                x={x - 17}
                y={172 - height}
                width="34"
                height={height}
                rx="5"
                className="edc-ia-revenue-bar"
              >
                <title>{`${record.key}: ${formatCurrency(revenueValues[index])}`}</title>
              </rect>
              <text x={x} y="207" textAnchor="middle" className="edc-ia-axis-label">
                {months[index].label}
              </text>
            </g>
          );
        })}
        {points.length > 1 && <path d={path} className="edc-ia-enrollment-path" />}
        {points.map(({ x, y }, index) => (
          <circle key={records[index].key} cx={x} cy={y} r="4" className="edc-ia-enrollment-dot">
            <title>{`${records[index].key}: ${records[index].enrollments} enrollments`}</title>
          </circle>
        ))}
      </svg>
      {!hasData && <div className="edc-ia-chart-empty">No dated sales or enrollments in this period.</div>}
    </div>
  );
}

function downloadReport(data) {
  const rows = [
    ["Course", "Status", "Enrollments", "Average Progress (%)", "Recorded Demo Sales", "Gross Demo Sales (PKR)"],
    ...data.map((course) => [
      course.title || "Untitled course",
      course.status || "Not recorded",
      course.students,
      completionFor(course) === null ? "" : completionFor(course).toFixed(1),
      course.sales,
      number(course.revenue).toFixed(2),
    ]),
  ];
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}`], {
      type: "text/csv;charset=utf-8;",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "educonnect-learning-analytics.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function InstructorAnalytics({ email, courses = [], serverAnalytics = null, earnings = null }) {
  const [, setRevision] = useState(0);
  const [detail, setDetail] = useState("");
  const [period, setPeriod] = useState(6);
  const [progressMetric, setProgressMetric] = useState("completion");

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("storage", refresh);
    window.addEventListener(ORDERS_EVENT, refresh);
    window.addEventListener("educonnect:student-data-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(ORDERS_EVENT, refresh);
      window.removeEventListener("educonnect:student-data-changed", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const data = collectInstructorCourseAnalytics(email, courses);
  const enrollments = data.flatMap((course) =>
    (course.enrollmentRecords || []).map((record) => ({
      ...record,
      courseTitle: course.title || record.courseTitle || "Untitled course",
    })),
  );
  const sales = data
    .flatMap((course) =>
      (course.salesRecords || []).map((record) => ({
        ...record,
        course: record.course || course.title || "Untitled course",
      })),
    )
    .sort(
      (left, right) =>
        (Date.parse(right.purchasedAt || "") || 0) -
        (Date.parse(left.purchasedAt || "") || 0),
    );
  const totalDemoRevenue = sales.reduce((total, sale) => total + number(sale.amount), 0);
  const localAverageProgress = enrollments.length
    ? enrollments.reduce((total, enrollment) => total + number(enrollment.progress), 0) /
      enrollments.length
    : null;
  const serverSummary = serverAnalytics?.summary || null;
  const serverCourses = Array.isArray(serverAnalytics?.courses) ? serverAnalytics.courses : [];
  const earningsSummary = earnings?.summary || null;
  const verifiedGross = Number(earningsSummary?.grossSales || 0);
  const verifiedNet = Number(earningsSummary?.netEarnings || 0);
  const verifiedCommission = Number(earningsSummary?.commission || 0);
  const hasVerifiedRealPayments = Boolean(earningsSummary?.hasVerifiedRealPayments);
  const averageProgress = serverSummary ? (Number(serverSummary.completionPercent) || 0) : localAverageProgress;
  const displayEnrollmentsCount = serverSummary ? Number(serverSummary.enrolledStudents || 0) : enrollments.length;
  const localStatuses = enrollments.reduce(
    (counts, enrollment) => {
      const status = statusFor(number(enrollment.progress));
      counts[status] += 1;
      return counts;
    },
    { Completed: 0, "In Progress": 0, "Not Started": 0 },
  );
  const serverStatuses = serverCourses.reduce((counts, course) => {
    const status = course.status === "Completed" ? "Completed" : course.status === "In Progress" ? "In Progress" : "Not Started";
    counts[status] += Number(course.enrollments || 0);
    return counts;
  }, { Completed: 0, "In Progress": 0, "Not Started": 0 });
  const statuses = serverCourses.length ? serverStatuses : localStatuses;
  const months = getMonths(period);
  const progressSource = serverCourses.length ? serverCourses.map((course) => ({
    id: course.courseId,
    title: course.title,
    students: Number(course.enrollments || 0),
    completion: Number(course.completionPercent ?? course.averageCompletion ?? 0),
    lessons: Number(course.lessons || 0),
    completedLessons: Number(course.completedLessons || 0),
    quizAttempts: Number(course.quizAttempts || 0),
    passRate: course.passRate,
    avgRating: course.avgRating,
  })) : data;
  const progressCourses = [...progressSource]
    .filter((course) => (course.students || course.enrollments || 0) > 0 || serverCourses.length)
    .sort((left, right) => (Number(right.students || right.enrollments || 0) - Number(left.students || left.enrollments || 0)))
    .slice(0, 6);
  const completionTotal = serverCourses.length ? displayEnrollmentsCount : enrollments.length;
  const topSalesCourse = [...data]
    .filter((course) => course.sales > 0)
    .sort((left, right) => right.revenue - left.revenue)[0];
  const topEnrollmentCourse = [...progressSource]
    .filter((course) => Number(course.students || course.enrollments || 0) > 0)
    .sort((left, right) => Number(right.students || right.enrollments || 0) - Number(left.students || left.enrollments || 0))[0];
  const salesByCourse = [...data]
    .filter((course) => course.sales > 0)
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 3);
  const statusTotal = statuses.Completed + statuses["In Progress"] + statuses["Not Started"];
  const statusPercentage = (value) => statusTotal ? value / statusTotal * 100 : 0;
  const statusGradient = statusTotal
    ? `conic-gradient(#31b85a 0 ${statusPercentage(statuses.Completed)}%, #9b26df ${statusPercentage(statuses.Completed)}% ${statusPercentage(statuses.Completed) + statusPercentage(statuses["In Progress"])}%, #f5b400 ${statusPercentage(statuses.Completed) + statusPercentage(statuses["In Progress"])}% 100%)`
    : "#e9e3ef";
  const insights = [];

  if (topEnrollmentCourse) {
    insights.push(`${topEnrollmentCourse.title || "Untitled course"} has the most saved enrollments (${topEnrollmentCourse.students}).`);
  }
  if (topSalesCourse) {
    insights.push(`${topSalesCourse.title || "Untitled course"} has the highest recorded demo sales (${formatCurrency(topSalesCourse.revenue)}).`);
  }
  if (completionTotal) {
    insights.push(`${statuses.Completed} of ${completionTotal} course enrollments are completed.`);
    insights.push(`Average saved course progress is ${Math.round(averageProgress)}%.`);
  }

  const detailTitle = {
    enrollments: "Course Enrollments",
    sales: "Recorded Demo Sales",
    revenue: "Gross Demo Revenue",
    completion: "Student Learning Progress",
  }[detail];

  return (
    <main className="edc-instructor-analytics">
      {detail ? (
        <section className="edc-ia-detail-page edc-ia-panel">
          <button type="button" className="edc-ia-back" onClick={() => setDetail("")}>
            ← Back to Learning Analytics &amp; Sales
          </button>
          <h1>{detailTitle}</h1>
          {detail === "enrollments" && (
            enrollments.length ? (
              <div className="edc-ia-detail-list">
                {enrollments.map((record) => (
                  <article key={record.id}>
                    <strong>{record.name || record.email}</strong>
                    <span>{record.courseTitle}</span>
                    <small>{record.email} · {dateLabel(record.enrolledAt)} · {Math.round(number(record.progress))}% complete</small>
                  </article>
                ))}
              </div>
            ) : <p>No student enrollments are saved for your courses yet.</p>
          )}
          {detail === "sales" && (
            <div className="edc-ia-table-wrap">
              <table>
                <thead><tr><th>Course</th><th>Student</th><th>Date</th><th>Status</th><th>Amount</th></tr></thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id}>
                      <td>{sale.course}</td><td>{sale.student || "—"}</td>
                      <td>{dateLabel(sale.purchasedAt)}</td><td>{sale.status || "Recorded"}</td>
                      <td>{formatCurrency(sale.amount)}</td>
                    </tr>
                  ))}
                  {!sales.length && <tr><td colSpan={5}>No saved course sales yet.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {detail === "revenue" && (
            <>
              <p>Verified real-money earnings are shown separately from demo/sandbox transactions. Demo transactions are never counted as real earnings.</p>
              <div className="edc-ia-detail-list">
                <article>
                  <strong>Verified Gross Sales (Real)</strong>
                  <span>{formatCurrency(verifiedGross)}</span>
                  <small>Platform commission {formatCurrency(verifiedCommission)} · Teacher net {formatCurrency(verifiedNet)}</small>
                </article>
                <article>
                  <strong>Demo/Sandbox Gross (Not real money)</strong>
                  <span>{formatCurrency(totalDemoRevenue)}</span>
                  <small>Excluded from verified revenue and earnings totals.</small>
                </article>
                {(earnings?.byCourse || []).length ? earnings.byCourse.filter((c) => Number(c.revenue || 0) > 0).map((course) => (
                  <article key={String(course.courseId)}>
                    <strong>{course.title || "Untitled course"}</strong>
                    <span>{Number(course.sales || 0)} verified real sales</span>
                    <small>{formatCurrency(Number(course.revenue || 0))} gross · {formatCurrency(Number(course.net || 0))} net</small>
                  </article>
                )) : <p>{hasVerifiedRealPayments ? "" : "No verified live payments have been recorded yet."}</p>}
              </div>
            </>
          )}
          {detail === "completion" && (
            enrollments.length ? (
              <div className="edc-ia-detail-list">
                {enrollments.map((record) => (
                  <article key={record.id}>
                    <strong>{record.name || record.email}</strong>
                    <span>{record.courseTitle}</span>
                    <small>{record.completedLessons} of {record.totalLessons} lessons · {Math.round(number(record.progress))}%</small>
                  </article>
                ))}
              </div>
            ) : <p>No saved learning progress is available yet.</p>
          )}
        </section>
      ) : (
        <>
          <header className="edc-ia-head">
            <div>
              <span>TEACHER INSIGHTS</span>
              <h1><ChartNoAxesCombined size={25} /> Learning Analytics &amp; Sales</h1>
              <p>Track saved student progress, course activity, and recorded demo sales.</p>
            </div>
            <div className="edc-ia-actions">
              <label className="edc-ia-period">
                <CalendarDays size={16} />
                <select aria-label="Analytics date range" value={period} onChange={(event) => setPeriod(Number(event.target.value))}>
                  <option value={6}>Last 6 Months</option>
                  <option value={12}>Last 12 Months</option>
                </select>
              </label>
              <button type="button" onClick={() => downloadReport(data)}>
                <Download size={16} /> Download Report
              </button>
            </div>
          </header>

          <p className="edc-ia-notice">
            <CircleAlert size={16} />
            {serverSummary
              ? `MongoDB-backed learning metrics: ${Number(serverSummary.totalPublishedCourses || 0)} published courses, ${Number(serverSummary.enrolledStudents || 0)} enrollments, ${Number(serverSummary.completedLessons || 0)} completed lessons, ${Number(serverSummary.totalQuizAttempts || 0)} quiz attempts. Sales/revenue cards below still use saved browser-local demo records.`
              : "Saved browser-local enrollments and demo checkout records only. No real payments or platform-wide reporting."}
          </p>

          <section className="edc-ia-stats" aria-label="Analytics summary">
            <button type="button" className="purple" onClick={() => setDetail("enrollments")}>
              <span><GraduationCap size={22} /></span>
              <small>Total Enrollments</small>
              <strong>{displayEnrollmentsCount.toLocaleString()}</strong>
              <em>View details →</em>
            </button>
            <button type="button" className="gold" onClick={() => setDetail("sales")}>
              <span><BarChart3 size={22} /></span>
              <small>Demo Sales (Local)</small>
              <strong>{sales.length.toLocaleString()}</strong>
              <em>View details →</em>
            </button>
            <button type="button" className="purple" onClick={() => setDetail("revenue")}>
              <span><WalletCards size={22} /></span>
              <small>{hasVerifiedRealPayments ? "Verified Gross Revenue" : "Verified Revenue (Real)"}</small>
              <strong>{formatCurrency(verifiedGross)}</strong>
              <em>{hasVerifiedRealPayments ? `Net ${formatCurrency(verifiedNet)}` : "No verified live payments yet"}</em>
            </button>
            <button type="button" className="gold" onClick={() => setDetail("completion")}>
              <span><UsersRound size={22} /></span>
              <small>Avg. Completion Rate</small>
              <strong>{averageProgress === null ? "—" : `${Math.round(averageProgress)}%`}</strong>
              <em>View details →</em>
            </button>
          </section>

          <div className="edc-ia-top-grid">
            <section className="edc-ia-panel">
              <header className="edc-ia-panel-heading">
                <div><h2><Layers3 size={18} /> Student Learning Progress</h2><p>Saved average progress by course</p></div>
                <select aria-label="Progress chart metric" value={progressMetric} onChange={(event) => setProgressMetric(event.target.value)}>
                  <option value="completion">Completion Rate</option>
                  <option value="enrollments">Enrollments</option>
                </select>
              </header>
              <ProgressChart courses={progressCourses} metric={progressMetric} />
            </section>

            <section className="edc-ia-panel">
              <header className="edc-ia-panel-heading">
                <div><h2><Layers3 size={18} /> Sales Trend</h2><p>Recorded course sales by purchase date</p></div>
                <div className="edc-ia-trend-summary"><strong>{sales.length}</strong><small>total saved sales</small></div>
              </header>
              <SalesChart months={months} sales={sales} />
            </section>
          </div>

          <div className="edc-ia-middle-grid">
            <section className="edc-ia-panel">
              <header className="edc-ia-panel-heading">
                <h2><BookOpen size={18} /> Course Performance</h2>
              </header>
              <div className="edc-ia-table-wrap">
                <table className="edc-ia-performance-table">
                  <thead><tr><th>Course</th><th>Enrollments</th><th>Completion</th><th>Gross Demo Sales</th></tr></thead>
                  <tbody>
                    {(serverCourses.length ? serverCourses : data).map((course) => {
                      const isServer = Boolean(serverCourses.length);
                      const enrollments = isServer ? Number(course.enrollments || 0) : course.students;
                      const completion = isServer ? (Number(course.completionPercent ?? course.averageCompletion) || 0) : completionFor(course);
                      const revenue = isServer ? 0 : course.revenue;
                      const title = course.title || "Untitled course";
                      return (
                        <tr key={String(course.courseId || course.id)}>
                          <td>{title}</td>
                          <td>{enrollments}</td>
                          <td>
                            {completion === null ? "—" : `${Math.round(completion)}%`}
                            {completion !== null && <span className="edc-ia-progress-track"><i style={{ width: `${Math.max(0, Math.min(100, Number(completion) || 0))}%` }} /></span>}
                          </td>
                          <td>{isServer ? "—" : formatCurrency(revenue)}</td>
                        </tr>
                      );
                    })}
                    {!(serverCourses.length ? serverCourses : data).length && <tr><td colSpan={4}>No courses are saved for this teacher yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="edc-ia-panel edc-ia-status-panel">
              <header className="edc-ia-panel-heading"><h2><UsersRound size={18} /> Students by Status</h2></header>
              <div className="edc-ia-status-content">
                <div className="edc-ia-donut" style={{ background: statusGradient }}>
                  <div><strong>{completionTotal.toLocaleString()}</strong><small>Enrollments</small></div>
                </div>
                <ul>
                  {[
                    ["Completed", statuses.Completed, CircleCheck],
                    ["In Progress", statuses["In Progress"], CircleDot],
                    ["Not Started", statuses["Not Started"], CircleAlert],
                  ].map(([label, count, Icon]) => (
                    <li key={label}>
                      <Icon size={14} className={`edc-ia-status-icon ${label.toLowerCase().replace(" ", "-")}`} />
                      <span>{label}</span>
                      <strong>{statusTotal ? `${Math.round(count / statusTotal * 100)}% (${count})` : "0 (no records)"}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="edc-ia-panel edc-ia-insights-panel">
              <header className="edc-ia-panel-heading"><h2><Award size={18} /> Key Insights</h2></header>
              {insights.length ? (
                <ul>{insights.map((insight) => <li key={insight}><CircleCheck size={15} />{insight}</li>)}</ul>
              ) : (
                <p>No enrollment or sale insights are available until records are saved.</p>
              )}
            </section>
          </div>

          <div className="edc-ia-bottom-grid">
            <section className="edc-ia-panel">
              <header className="edc-ia-panel-heading">
                <div><h2><BarChart3 size={18} /> Monthly Revenue &amp; Enrollments</h2><p>Saved purchase and enrollment dates</p></div>
                <div className="edc-ia-legend"><span>Gross demo sales</span><span>Enrollments</span></div>
              </header>
              <RevenueEnrollmentsChart months={months} sales={sales} enrollments={enrollments} />
            </section>

            <section className="edc-ia-panel">
              <header className="edc-ia-panel-heading">
                <h2><Award size={18} /> Top Performing Courses</h2>
                <small>By gross recorded sales</small>
              </header>
              {salesByCourse.length ? (
                <ol className="edc-ia-top-courses">
                  {salesByCourse.map((course, index) => (
                    <li key={String(course.id)}>
                      <span>{index + 1}</span>
                      <div><strong>{course.title || "Untitled course"}</strong><small>{course.sales} saved sales</small></div>
                      <b>{formatCurrency(course.revenue)}</b>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="edc-ia-empty">No course has a saved sale record yet.</p>
              )}
            </section>
          </div>

          <p className="edc-ia-foot">
            Enrollment totals are per course, so one learner enrolled in multiple courses counts once for each course. Sales are local demo checkout records, not actual payments.
          </p>
        </>
      )}
    </main>
  );
}

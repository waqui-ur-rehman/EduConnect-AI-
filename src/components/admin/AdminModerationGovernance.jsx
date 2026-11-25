import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, ChevronDown, Clock3, Download, Eye, FileText, Flag, Gavel, History, Search, Settings, ShieldAlert, ShieldCheck, UsersRound } from "lucide-react";
import { ADMIN_DATA_CHANGED_EVENT, ADMIN_USERS_KEY, readAdminArray, readAdminSupportRequestsState } from "./adminData";
import { applyModerationAction, getModerationPolicies, getModerationReportsState, linkModerationAppeal, MODERATION_REASONS, MODERATION_REPORTS_EVENT, MODERATION_REPORTS_KEY, MODERATION_STATUSES, saveModerationPolicies, setModerationPriority } from "../../utils/moderationReports";
import { getBookReviews, getBookRecords } from "../../utils/books";
import { getReviews } from "../../utils/courseReviews";
import { readDiscussions } from "../../utils/courseDiscussions";
import { getModerationVisibilityMap } from "../../utils/moderationVisibility";
import { createCsvContent, downloadCsv } from "./adminCsvUtils";
import {
  getAdminOperationalQueue,
  getAdminSupportQueue,
  normalizeAdminSupportTicket,
  saveAdminOperationalRecord,
} from "./adminQueueApi";

const TABS = [
  ["all", "All Reports"],
  ["pending", "Pending"],
  ["resolved", "Resolved"],
  ["violations", "Violations"],
  ["escalated", "Escalated"],
];
const REPORT_TYPES = ["course", "pdf", "video", "review", "book-review", "comment", "teacher", "user"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const SEVERITIES = ["Low", "Medium", "High", "Critical"];
const VIOLATION_CATEGORIES = ["Copyright Violation", "Spam", "Misleading Content", "Harassment", "Inappropriate Content", "Fake or Fraudulent Content", "Repeated Policy Violations"];
const CATEGORY_FILTERS = [...new Set([...MODERATION_REASONS, ...VIOLATION_CATEGORIES])];

function listForTarget(report) {
  switch (report.targetType) {
    case "pdf": {
      const publishedBook = getBookRecords().find((item) => String(item.id) === report.targetId);
      if (publishedBook) return publishedBook;
      const [email, courseId, ...resourceParts] = report.targetId.split("::");
      if (!email || !courseId || !resourceParts.length) return null;
      try {
        const key = `educonnect.curriculum.v1.${encodeURIComponent(email.toLowerCase())}.${encodeURIComponent(courseId)}`;
        const curriculum = JSON.parse(window.localStorage.getItem(key) || "{}");
        const resourceId = resourceParts.join("::");
        return Array.isArray(curriculum.resources) ? curriculum.resources.find((item) => String(item.id) === resourceId) || null : null;
      } catch { return null; }
    }
    case "review": return getReviews(true).find((item) => String(item.id || `${item.courseKey}:${item.studentEmail}`) === report.targetId);
    case "book-review": return getBookReviews(true).find((item) => String(item.id) === report.targetId);
    case "comment": return readDiscussions().find((item) => String(item.id) === report.targetId);
    case "user":
    case "teacher": return readAdminArray(ADMIN_USERS_KEY).find((item) => String(item.email).toLowerCase() === report.targetId.toLowerCase());
    case "course": {
      const [email, ...idParts] = report.targetId.split("::");
      const courseId = idParts.join("::");
      return readLocalCourse(email, courseId);
    }
    case "video": {
      const [email, courseId, ...lessonParts] = report.targetId.split("::");
      const lessonId = lessonParts.join("::");
      const course = readLocalCourse(email, courseId);
      if (!course) return null;
      const lessons = Array.isArray(course.lessons) ? course.lessons : Array.isArray(course.lessonItems) ? course.lessonItems : [];
      const lesson = lessons.find((item) => String(item.id) === lessonId) || lessons[Number(lessonId)] || null;
      return { courseTitle: course.title, courseId, lessonId, lesson };
    }
    default: return null;
  }
}

function readLocalCourse(email, courseId) {
  try {
    const courses = JSON.parse(window.localStorage.getItem(`educonnect.teacher.${email}.courses`) || "[]");
    return Array.isArray(courses) ? courses.find((item) => String(item.id) === courseId) || null : null;
  } catch { return null; }
}

function fmt(value) {
  if (!value) return "Not provided";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function safeSnapshot(value) {
  if (Array.isArray(value)) return value.map(safeSnapshot);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !/(password|token|secret|credential|session)/i.test(key))
      .map(([key, item]) => [key, safeSnapshot(item)]));
  }
  return value;
}

function isAcceptedAppeal(appeal) {
  const accepted = ["accepted", "appeal accepted", "accepted appeal"];
  return appeal?.appealAccepted === true || [appeal?.status, appeal?.decision, appeal?.outcome, appeal?.resolution].some((value) => accepted.includes(String(value || "").trim().toLowerCase()));
}

function matchesReport(report, tab) {
  if (tab === "pending") return ["Pending", "Under Review"].includes(report.status);
  if (tab === "resolved") return report.status === "Resolved";
  if (tab === "escalated") return report.status === "Escalated";
  if (tab === "content") return report.reportType === "content" && !["review", "book-review", "comment"].includes(report.targetType);
  if (tab === "users") return report.reportType === "user";
  if (tab === "reviews") return ["review", "book-review", "comment"].includes(report.targetType);
  if (tab === "violations") return report.violation?.status === "Confirmed";
  return true;
}

function AdminModerationGovernance({ email }) {
  const [reportState, setReportState] = useState(getModerationReportsState);
  const [supportState, setSupportState] = useState(readAdminSupportRequestsState);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [priority, setPriority] = useState("all");
  const [sort, setSort] = useState("newest");
  const [dateRange, setDateRange] = useState("all");
  const [dateReferenceTime, setDateReferenceTime] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [featuredReportId, setFeaturedReportId] = useState("");
  const [action, setAction] = useState("Mark Under Review");
  const [reason, setReason] = useState("");
  const [severity, setSeverity] = useState("Medium");
  const [violationCategory, setViolationCategory] = useState(VIOLATION_CATEGORIES[0]);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [appealId, setAppealId] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [policies, setPolicies] = useState(getModerationPolicies);
  const [reportSource, setReportSource] = useState("loading");
  const [policySource, setPolicySource] = useState("loading");
  const [editingPolicy, setEditingPolicy] = useState("");
  const [policyMessage, setPolicyMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const localReports = getModerationReportsState();
    const localPolicies = getModerationPolicies();
    const [reportsResult, policiesResult, supportResult] = await Promise.allSettled([
      getAdminOperationalQueue(
        "moderation-reports",
        localReports.records,
        (report) => report.id,
      ),
      getAdminOperationalQueue(
        "moderation-policies",
        localPolicies,
        (policy) => policy.id,
      ),
      getAdminSupportQueue(),
    ]);

    if (reportsResult.status === "fulfilled") {
      const queue = reportsResult.value;
      setReportState({ records: queue.records, error: queue.source === "fallback" ? localReports.error : "" });
      setReportSource(queue.source);
      if (queue.source === "backend") {
        window.localStorage.setItem(MODERATION_REPORTS_KEY, JSON.stringify(queue.records));
      }
    } else {
      setReportState({ records: [], error: reportsResult.reason?.message || "Moderation reports could not be loaded." });
      setReportSource("backend");
    }

    if (policiesResult.status === "fulfilled") {
      const queue = policiesResult.value;
      setPolicies(queue.records);
      setPolicySource(queue.source);
      if (queue.source === "backend") {
        window.localStorage.setItem("educonnect.moderationPolicies.v1", JSON.stringify(queue.records));
      }
    } else {
      setPolicies([]);
      setPolicySource("backend");
      setPolicyMessage(policiesResult.reason?.message || "Moderation policies could not be loaded.");
    }

    if (supportResult.status === "fulfilled") {
      setSupportState({
        records: supportResult.value.records.map(normalizeAdminSupportTicket),
        error: "",
      });
    } else if (supportResult.reason?.backendUnavailable) {
      setSupportState(readAdminSupportRequestsState());
    } else {
      setSupportState({ records: [], error: supportResult.reason?.message || "Appeals could not be loaded." });
    }
  }, []);
  useEffect(() => {
    const initialRefresh = window.setTimeout(refresh, 0);
    window.addEventListener(MODERATION_REPORTS_EVENT, refresh);
    window.addEventListener(ADMIN_DATA_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener(MODERATION_REPORTS_EVENT, refresh);
      window.removeEventListener(ADMIN_DATA_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  const reports = reportState.records;
  const counts = {
    total: reports.length,
    pending: reports.filter((item) => ["Pending", "Under Review"].includes(item.status)).length,
    resolved: reports.filter((item) => item.status === "Resolved").length,
    violations: reports.filter((item) => item.violation?.status === "Confirmed").length,
    escalated: reports.filter((item) => item.status === "Escalated").length,
    policies: policies.length,
  };
  const recent = [...reports].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);
  const typeCounts = reports.reduce((result, item) => ({ ...result, [item.targetType]: (result[item.targetType] || 0) + 1 }), {});
  const statusCounts = reports.reduce((result, item) => ({ ...result, [item.status]: (result[item.status] || 0) + 1 }), {});
  const statusSegments = [
    { label: "Pending", count: statusCounts.Pending || 0, color: "#f0aa00" },
    { label: "Under Review", count: statusCounts["Under Review"] || 0, color: "#7d20d4" },
    { label: "Resolved", count: statusCounts.Resolved || 0, color: "#16a34a" },
    { label: "Dismissed", count: statusCounts.Dismissed || 0, color: "#9383a5" },
    { label: "Escalated", count: statusCounts.Escalated || 0, color: "#e52e55" },
  ].filter((item) => item.count > 0);
  let segmentProgress = 0;
  const statusDonutStops = statusSegments.map((segment) => {
    const end = segmentProgress + (segment.count / Math.max(1, reports.length)) * 100;
    const stop = `${segment.color} ${segmentProgress}% ${end}%`;
    segmentProgress = end;
    return stop;
  }).join(", ");
  const statusDonutBackground = reports.length
    ? `conic-gradient(${statusDonutStops})`
    : "conic-gradient(#e9def4 0 100%)";
  const tabCounts = {
    all: reports.length,
    pending: counts.pending,
    resolved: counts.resolved,
    violations: counts.violations,
    escalated: counts.escalated,
  };
  const filtered = useMemo(() => {
    const query = search.trim().replace(/\s+/g, " ").toLowerCase();
    const days = Number(dateRange);
    const cutoff = dateRange === "all" || !dateReferenceTime
      ? null
      : dateReferenceTime - days * 24 * 60 * 60 * 1000;
    return reports.filter((report) => {
      if (!matchesReport(report, tab) || (status !== "all" && report.status !== status) || (type !== "all" && report.targetType !== type) || (reasonFilter !== "all" && report.reason !== reasonFilter && report.violation?.category !== reasonFilter) || (priority !== "all" && report.priority !== priority)) return false;
      const created = new Date(report.createdAt).getTime();
      if (cutoff !== null && (Number.isNaN(created) || created < cutoff || created > dateReferenceTime)) return false;
      if (!query) return true;
      const haystack = [report.id, report.targetTitle, report.targetId, report.reporterEmail, report.reporterName, report.targetOwnerEmail, report.targetOwnerName, report.reason, report.description].filter(Boolean).join(" ").trim().replace(/\s+/g, " ").toLowerCase();
      return haystack.includes(query);
    }).sort((a, b) => sort === "oldest" ? new Date(a.createdAt) - new Date(b.createdAt) : sort === "priority" ? PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority) || new Date(b.createdAt) - new Date(a.createdAt) : new Date(b.createdAt) - new Date(a.createdAt));
  }, [dateRange, dateReferenceTime, priority, reasonFilter, reports, search, sort, status, tab, type]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 8));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * 8, currentPage * 8);
  const report = selected ? reports.find((item) => item.id === selected.id) || selected : null;
  const supportAppeals = supportState.records.filter((item) => item.category === "Moderation & Appeal");
  const linkedAppeal = report ? supportAppeals.find((item) => String(item.id) === String(report.appealId) || String(item.moderationReportId || "") === String(report.id)) : null;
  const canReverseDecision = Boolean(linkedAppeal && isAcceptedAppeal(linkedAppeal));
  const recentActions = reports.flatMap((item) => (item.history || []).map((entry) => ({ ...entry, reportId: item.id, targetTitle: item.targetTitle }))).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 8);
  const featuredReport = filtered.find((item) => item.id === featuredReportId) || filtered[0] || null;
  const pendingReport = reports.find((item) => ["Pending", "Under Review", "Escalated"].includes(item.status));

  function resetFilters() { setSearch(""); setStatus("all"); setType("all"); setReasonFilter("all"); setPriority("all"); setSort("newest"); setDateRange("all"); setPage(1); }
  function openReport(item) { setFeaturedReportId(item.id); setSelected(item); setAction(item.reportType === "user" ? "Issue Warning" : "Mark Under Review"); setReason(""); setResolutionNotes(""); setViolationCategory(VIOLATION_CATEGORIES.includes(item.reason) ? item.reason : VIOLATION_CATEGORIES[0]); setAppealId(item.appealId || supportAppeals.find((appeal) => String(appeal.moderationReportId || "") === String(item.id))?.id || ""); setFeedback(null); }
  function exportReport() {
    try {
      const columns = [
        { header: "Report ID", getValue: (item) => item.id },
        { header: "Reported Content", getValue: (item) => item.targetTitle },
        { header: "Content Type", getValue: (item) => labelForType(item.targetType) },
        { header: "Reported By", getValue: (item) => item.reporterEmail },
        { header: "Content Owner", getValue: (item) => item.targetOwnerEmail },
        { header: "Reason", getValue: (item) => item.reason },
        { header: "Priority", getValue: (item) => item.priority },
        { header: "Status", getValue: (item) => item.status },
        { header: "Created At", getValue: (item) => item.createdAt },
      ];
      downloadCsv("educonnect-moderation-report.csv", createCsvContent(filtered, columns));
    } catch (exportError) {
      setFeedback({ type: "error", text: exportError instanceof Error ? exportError.message : "The moderation report could not be exported." });
    }
  }
  async function takeAction(event) {
    event.preventDefault();
    if (!report || busy) return;
    if (["Hide Content", "Remove Content", "Restore Content", "Reverse Moderation Decision"].includes(action) && !window.confirm(`${action} for “${report.targetTitle}”? This change will affect the previous moderation decision.`)) return;
    setBusy(true);
    try {
      const next = applyModerationAction(report.id, { action, reason, actor: email || "Admin", severity, violationCategory, resolutionNotes });
      if (reportSource !== "fallback") {
        await saveAdminOperationalRecord("moderation-reports", next.id, next);
      }
      setSelected(next);
      setFeedback({ type: "success", text: `${action} recorded.` });
      setReason("");
    } catch (error) { setFeedback({ type: "error", text: error instanceof Error ? error.message : "Action could not be saved." }); }
    finally { setBusy(false); }
  }
  async function changePriority(nextPriority) {
    try {
      setModerationPriority(report.id, nextPriority, email || "Admin");
      const updated = getModerationReportsState().records.find((item) => item.id === report.id);
      if (reportSource !== "fallback" && updated) {
        await saveAdminOperationalRecord("moderation-reports", updated.id, updated);
      }
      setFeedback({ type: "success", text: "Priority updated." });
    }
    catch (error) { setFeedback({ type: "error", text: error.message }); }
  }
  async function savePolicies() {
    try {
      const next = saveModerationPolicies(policies, email || "Admin");
      if (policySource !== "fallback") {
        await Promise.all(next.map((policy) =>
          saveAdminOperationalRecord("moderation-policies", policy.id, policy),
        ));
      }
      setPolicies(next);
      setEditingPolicy("");
      setPolicyMessage("Policy changes saved and added to the Admin Audit Log.");
    }
    catch (error) { setPolicyMessage(error instanceof Error ? error.message : "Policy changes could not be saved."); }
  }

  async function saveAppealLink() {
    try {
      linkModerationAppeal(report.id, appealId, email || "Admin");
      const updated = getModerationReportsState().records.find((item) => item.id === report.id);
      if (reportSource !== "fallback" && updated) {
        await saveAdminOperationalRecord("moderation-reports", updated.id, updated);
      }
      setFeedback({ type: "success", text: "Appeal linked." });
    } catch (error) {
      setFeedback({ type: "error", text: error.message });
    }
  }

  return <section className="edc-moderation edc-moderation-reference">
    <header className="edc-moderation-page-heading">
      <div>
        <span className="edc-admin-page-eyebrow">TRUST &amp; SAFETY</span>
        <h2><ShieldCheck aria-hidden="true" />Moderation &amp; Governance</h2>
        <p>Review reports and apply saved moderation policies using real platform records.</p>
      </div>
      <div className="edc-moderation-page-actions">
        <button type="button" className="edc-admin-action-button" onClick={exportReport} disabled={Boolean(reportState.error) || !filtered.length}><Download size={15} />Export Report</button>
        <button type="button" className="edc-admin-action-button" onClick={() => { setTab("policies"); setPage(1); }}><FileText size={15} />View Policies</button>
        <button type="button" className="edc-admin-button-primary" onClick={() => { setTab("pending"); setPage(1); }} disabled={Boolean(reportState.error) || !counts.pending}><Clock3 size={15} />Review Pending</button>
      </div>
    </header>
    {reportState.error && <p className="edc-admin-feedback edc-admin-feedback-error" role="alert"><ShieldAlert size={16} />{reportState.error} Saved report records could not be counted.</p>}
    {feedback && !report && <p className={`edc-admin-feedback edc-admin-feedback-${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>{feedback.text}</p>}
    <div className="edc-moderation-reference-stats" aria-label="Moderation summaries">
      {[
        { label: "Total Reports", value: counts.total, icon: Flag, color: "purple", tab: "all" },
        { label: "Pending Review", value: counts.pending, icon: Clock3, color: "orange", tab: "pending" },
        { label: "Resolved", value: counts.resolved, icon: CheckCircle2, color: "green", tab: "resolved" },
        { label: "Confirmed Violations", value: counts.violations, icon: AlertTriangle, color: "red", tab: "violations" },
        { label: "Escalated Cases", value: counts.escalated, icon: ShieldAlert, color: "violet", tab: "escalated" },
        { label: "Policy Rules", value: counts.policies, icon: ShieldCheck, color: "purple", tab: "policies" },
      ].map(({ label, value, icon: Icon, color, tab: targetTab }) => (
        <Stat
          key={label}
          icon={Icon}
          label={label}
          value={reportState.error ? "—" : value.toLocaleString()}
          color={color}
          active={tab === targetTab}
          onClick={() => { setTab(targetTab); setPage(1); }}
        />
      ))}
    </div>

    <div className="edc-moderation-workspace">
      <main className="edc-moderation-main">
        <nav className="edc-moderation-reference-tabs" aria-label="Filter moderation reports">
          {TABS.map(([id, label]) => (
            <button type="button" key={id} className={tab === id ? "active" : ""} aria-pressed={tab === id} onClick={() => { setTab(id); setPage(1); }}>
              {label}<span>({reportState.error ? "—" : tabCounts[id].toLocaleString()})</span>
            </button>
          ))}
        </nav>

    {tab === "overview" && <>
      <div className="edc-moderation-stats">
        <Stat icon={Flag} label="Total Reports" value={reportState.error ? "—" : counts.total} color="purple" active={tab === "all"} onClick={() => { setTab("all"); setPage(1); }} />
        <Stat icon={Clock3} label="Pending Reports" value={reportState.error ? "—" : counts.pending} color="orange" active={tab === "pending"} onClick={() => { setTab("pending"); setPage(1); }} />
        <Stat icon={CheckCircle2} label="Resolved Cases" value={reportState.error ? "—" : counts.resolved} color="green" active={tab === "resolved"} onClick={() => { setTab("resolved"); setPage(1); }} />
        <Stat icon={ShieldAlert} label="Escalated Cases" value={reportState.error ? "—" : counts.escalated} color="red" active={tab === "escalated"} onClick={() => { setTab("escalated"); setPage(1); }} />
      </div>
      <div className="edc-moderation-overview-grid">
        <section className="edc-admin-panel"><div className="edc-admin-panel-heading"><div><h3>Recent Reports</h3><p>Newest submitted reports from browser storage.</p></div><button className="edc-admin-action-button" type="button" onClick={() => { setTab("all"); setPage(1); }}>View All Reports <ArrowRight size={14} /></button></div>
          <ReportTable rows={recent} onOpen={openReport} compact /></section>
        <section className="edc-admin-panel"><div className="edc-admin-panel-heading"><div><h3>Reports by Type</h3><p>Counts are calculated from saved reports.</p></div></div><Breakdown values={typeCounts} /></section>
        <section className="edc-admin-panel"><div className="edc-admin-panel-heading"><div><h3>Reports by Status</h3><p>Live status totals.</p></div></div><Breakdown values={statusCounts} /></section>
        <section className="edc-admin-panel"><div className="edc-admin-panel-heading"><div><h3>Pending Cases</h3><p>Cases requiring Admin review.</p></div></div><ReportTable rows={reports.filter((item) => ["Pending", "Under Review", "Escalated"].includes(item.status)).slice(0, 5)} onOpen={openReport} compact /></section>
        <section className="edc-admin-panel"><div className="edc-admin-panel-heading"><div><h3>Recent Moderation Activity</h3><p>Report submissions and recorded actions.</p></div><Link to="/admin/audit-logs">Audit Logs</Link></div><ActionList rows={recentActions.slice(0, 5)} /></section>
      </div>
    </>}

    {tab !== "overview" && tab !== "actions" && tab !== "appeals" && tab !== "policies" && <>
      <div className="edc-moderation-toolbar">
        <label className="edc-admin-search"><Search size={16} /><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search ID, title, user, reporter, or reason" aria-label="Search reports" /></label>
        <select className="edc-admin-select" value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} aria-label="Filter report type"><option value="all">All types</option>{REPORT_TYPES.map((item) => <option value={item} key={item}>{labelForType(item)}</option>)}</select>
        <select className="edc-admin-select" value={reasonFilter} onChange={(event) => { setReasonFilter(event.target.value); setPage(1); }} aria-label="Filter violation category"><option value="all">All reasons / categories</option>{CATEGORY_FILTERS.map((item) => <option key={item}>{item}</option>)}</select>
        <select className="edc-admin-select" value={status} onChange={(event) => { setStatus(event.target.value); setTab("all"); setPage(1); }} aria-label="Filter status"><option value="all">All statuses</option>{MODERATION_STATUSES.map((item) => <option key={item}>{item}</option>)}</select>
        <select className="edc-admin-select" value={priority} onChange={(event) => { setPriority(event.target.value); setPage(1); }} aria-label="Filter priority"><option value="all">All priorities</option>{PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select>
        <label className="edc-moderation-range"><CalendarDays size={14} /><span className="edc-admin-visually-hidden">Filter by report date</span><select value={dateRange} onChange={(event) => { setDateReferenceTime(Date.now()); setDateRange(event.target.value); setPage(1); }}><option value="all">All Time</option><option value="7">Last 7 Days</option><option value="30">Last 30 Days</option><option value="90">Last 90 Days</option></select><ChevronDown size={14} /></label>
        <select className="edc-admin-select" value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort reports"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="priority">Urgent priority first</option></select>
        <button className="edc-admin-action-button" type="button" onClick={resetFilters}>Clear Filters</button>
      </div>
      {reportState.error
        ? <Empty icon={ShieldAlert} title="Report records unavailable" description="Saved moderation report data could not be read." />
        : <ReportTable rows={pageRows} onOpen={openReport} />}
      <div className="edc-moderation-pagination"><span>{reportState.error ? "Report totals unavailable." : `Showing ${filtered.length ? (currentPage - 1) * 8 + 1 : 0}–${Math.min(currentPage * 8, filtered.length)} of ${filtered.length}`}</span><div><button type="button" aria-label="Previous page" disabled={currentPage <= 1 || Boolean(reportState.error)} onClick={() => setPage((value) => Math.max(1, value - 1))}><ArrowLeft size={15} /></button><span>Page {currentPage} of {pageCount}</span><button type="button" aria-label="Next page" disabled={currentPage >= pageCount || Boolean(reportState.error)} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}><ArrowRight size={15} /></button></div></div>
    </>}

    {tab === "actions" && <section className="edc-admin-panel"><div className="edc-admin-panel-heading"><div><h3>Moderation Actions</h3><p>Immutable browser-local history of report decisions.</p></div><Link to="/admin/audit-logs">Open existing Audit Logs <ArrowRight size={14} /></Link></div>{recentActions.length ? <ActionList rows={recentActions} /> : <Empty icon={ShieldCheck} title="No moderation actions yet" description="Successful review actions will appear here." />}</section>}

{tab === "appeals" && <section className="edc-admin-panel"><div className="edc-admin-panel-heading"><div><h3>Appeals & Disputes</h3><p>Existing Moderation & Appeal requests stay managed in Support & Appeals.</p></div><Link className="edc-admin-button-primary" to="/admin/support">Open Support & Appeals <ArrowRight size={14} /></Link></div>{supportAppeals.length ? <div className="edc-admin-table-wrap"><table className="edc-admin-applications-table"><thead><tr><th>Appeal ID</th><th>Subject</th><th>Requester</th><th>Status</th><th>Submitted</th><th>Linked case / original decision</th><th>Open</th></tr></thead><tbody>{supportAppeals.map((item) => { const linked = reports.filter((record) => String(record.appealId) === String(item.id) || String(item.moderationReportId || "") === String(record.id)); return <tr key={item.id}><td>{item.id}</td><td>{item.subject}</td><td>{item.requesterEmail}</td><td><StatusBadge status={item.status} /></td><td>{fmt(item.createdAt)}</td><td>{linked.length ? linked.map((record) => { const decision = (record.history || []).filter((entry) => entry.action !== "Report submitted" && entry.action !== "Appeal linked").at(-1); return <div key={record.id}><button className="edc-admin-action-button" type="button" onClick={() => openReport(record)}>{record.id}: {decision?.action || "No decision recorded"}</button></div>; }) : "No linked moderation case"}</td><td><Link to="/admin/support">View Appeal</Link></td></tr>; })}</tbody></table></div> : <Empty icon={FileText} title="No appeal records found" description="Appeals categorized as Moderation & Appeal will appear here. No duplicate appeal workflow was created." />}</section>}

    {tab === "policies" && <section className="edc-moderation-policies">{policyMessage && <p className="edc-admin-feedback edc-admin-feedback-success" role="status">{policyMessage}</p>}{policies.map((policy) => <article className="edc-admin-panel edc-moderation-policy" key={policy.id}><header><div><h3>{policy.title}</h3><small>Version {policy.version} · Updated {fmt(policy.updatedAt)} · {policy.updatedBy || "Default policy"}</small></div>{editingPolicy !== policy.id && <button className="edc-admin-action-button" type="button" onClick={() => { setEditingPolicy(policy.id); setPolicyMessage(""); }}>Edit Policy</button>}</header>{editingPolicy === policy.id ? <textarea maxLength={5000} rows={5} value={policy.body} onChange={(event) => setPolicies((current) => current.map((item) => item.id === policy.id ? { ...item, body: event.target.value } : item))} /> : <p>{policy.body}</p>}{editingPolicy === policy.id && <div><button className="edc-admin-button-primary" type="button" onClick={savePolicies}>Save Policy</button><button className="edc-admin-action-button" type="button" onClick={() => { setPolicies(getModerationPolicies()); setEditingPolicy(""); }}>Cancel</button></div>}</article>)}</section>}

      </main>
      <aside className="edc-moderation-reference-sidebar">
        <section className="edc-moderation-reference-card">
          <header><h3><ShieldCheck size={18} aria-hidden="true" />Governance &amp; Policy Overview</h3></header>
          <div className="edc-moderation-status-overview">
            <div className="edc-moderation-status-donut" style={{ background: statusDonutBackground }} role="img" aria-label={`${reportState.error ? "Unknown" : reports.length} saved report status distribution`}>
              <span><strong>{reportState.error ? "—" : reports.length.toLocaleString()}</strong><small>Reports</small></span>
            </div>
            <div className="edc-moderation-status-legend">
              {(statusSegments.length ? statusSegments : [{ label: "No reports", count: 0, color: "#bba9cc" }]).map((segment) => (
                <div key={segment.label}><i style={{ backgroundColor: segment.color }} /><span>{segment.label}</span><strong>{reportState.error ? "—" : segment.count.toLocaleString()}</strong></div>
              ))}
            </div>
          </div>
          <p className="edc-moderation-sidebar-note">{reportState.error ? "Status totals unavailable because saved reports could not be read." : `Policy records: ${policies.length.toLocaleString()}. Confirmed violations are counted only after an Admin decision.`}</p>
        </section>

        <section className="edc-moderation-reference-card">
          <header><h3><FileText size={18} aria-hidden="true" />Moderation Policies</h3><button type="button" onClick={() => { setTab("policies"); setPage(1); }}>View all</button></header>
          <ul className="edc-moderation-policy-links">
            {policies.slice(0, 5).map((policy) => (
              <li key={policy.id}>
                <FileText size={14} aria-hidden="true" />
                <button type="button" onClick={() => { setTab("policies"); setEditingPolicy(policy.id); }}>{policy.title}</button>
                <span>v{policy.version}</span>
              </li>
            ))}
          </ul>
          {policies.length > 5 && <p className="edc-moderation-sidebar-note">{(policies.length - 5).toLocaleString()} more saved policies</p>}
        </section>

        <section className="edc-moderation-reference-card">
          <header><h3><History size={18} aria-hidden="true" />Quick Actions</h3></header>
          <div className="edc-moderation-quick-actions">
            <button type="button" onClick={() => { setTab("all"); setPage(1); }}><Search size={15} />Review Reports</button>
            <button type="button" onClick={() => pendingReport && openReport(pendingReport)} disabled={!pendingReport || Boolean(reportState.error)}><Gavel size={15} />Take Action</button>
            <Link to="/admin/users"><UsersRound size={15} />Manage Users</Link>
            <button type="button" onClick={() => { setTab("policies"); setPage(1); }}><Settings size={15} />Policy Settings</button>
            <button type="button" onClick={() => { setTab("actions"); setPage(1); }}><History size={15} />Action History</button>
            <button type="button" onClick={() => { setTab("appeals"); setPage(1); }}><FileText size={15} />View Appeals</button>
            <button type="button" onClick={() => { setTab("overview"); setPage(1); }}><ArrowRight size={15} />Overview</button>
          </div>
        </section>

        {featuredReport && tab !== "appeals" && tab !== "policies" && tab !== "actions" && tab !== "overview" && (
          <section className="edc-moderation-reference-card edc-moderation-selected-report">
            <header><h3><Flag size={17} aria-hidden="true" />Selected Report</h3></header>
            <strong>{featuredReport.targetTitle}</strong>
            <span>{featuredReport.id} · {labelForType(featuredReport.targetType)}</span>
            <StatusBadge status={featuredReport.status} />
            <button type="button" className="edc-admin-action-button" onClick={() => openReport(featuredReport)}><Eye size={14} />Review details</button>
          </section>
        )}
      </aside>
    </div>

      {report && <div className="edc-admin-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><section className="edc-admin-details-modal edc-moderation-detail" role="dialog" aria-modal="true" aria-labelledby="edc-moderation-detail-title"><header className="edc-admin-details-header"><div><span className="edc-admin-page-eyebrow">{report.id}</span><h3 id="edc-moderation-detail-title">{report.targetTitle}</h3></div><button className="edc-admin-modal-close" type="button" onClick={() => setSelected(null)} aria-label="Close report">×</button></header>
      <div className="edc-moderation-detail-grid"><Detail label="Content type" value={labelForType(report.targetType)} /><Detail label="Content ID" value={report.targetId} /><Detail label="Reported by" value={`${report.reporterName} (${report.reporterEmail})`} /><Detail label={report.reportType === "user" ? "Reported user" : "Content owner"} value={`${report.targetOwnerName || "Not provided"} ${report.targetRole ? `· ${report.targetRole}` : ""} ${report.targetOwnerEmail ? `(${report.targetOwnerEmail})` : ""}`} /><Detail label="Report reason" value={report.reason} /><Detail label="Date" value={fmt(report.createdAt)} />{report.violation?.status === "Confirmed" && <><Detail label="Confirmed violation" value={report.violation.category} /><Detail label="Severity" value={report.violation.severity} /></>}<div><span>Priority</span><select value={report.priority} onChange={(event) => changePriority(event.target.value)}>{PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select></div><div><span>Status</span><StatusBadge status={report.status} /></div></div>
      <article className="edc-moderation-evidence"><strong>Description</strong><p>{report.description}</p>{report.evidence && <p><strong>Evidence:</strong> {report.evidence}</p>}<strong>Reported content snapshot</strong><pre>{JSON.stringify(safeSnapshot(listForTarget(report) || { id: report.targetId, title: report.targetTitle }), null, 2)}</pre></article>
      {report.reportType === "user" && <p className="edc-moderation-notice"><UsersRound size={16} /> Account status and restrictions remain managed in User Management. <Link to="/admin/users">Open User Management</Link></p>}
      <form className="edc-moderation-action-form" onSubmit={takeAction}><h4>Review decision</h4><div className="edc-admin-settings-fields"><label className="edc-admin-settings-field">Action<select value={action} onChange={(event) => setAction(event.target.value)}>{(report.reportType === "user" ? ["Mark Under Review", "Issue Warning", "Dismiss Report", "Escalate Case", "Resolve Case", ...(canReverseDecision ? ["Reverse Moderation Decision"] : [])] : ["Mark Under Review", "Dismiss Report", "Hide Content", "Remove Content", ...(getModerationVisibilityMap()[`${report.targetType}:${report.targetId}`] ? ["Restore Content"] : []), "Confirm Violation", "Escalate Case", "Resolve Case", ...(canReverseDecision ? ["Reverse Moderation Decision"] : [])]).map((item) => <option key={item}>{item}</option>)}</select></label>{action === "Confirm Violation" && <><label className="edc-admin-settings-field">Violation category<select value={violationCategory} onChange={(event) => setViolationCategory(event.target.value)}>{VIOLATION_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label><label className="edc-admin-settings-field">Confirmed severity<select value={severity} onChange={(event) => setSeverity(event.target.value)}>{SEVERITIES.map((item) => <option key={item}>{item}</option>)}</select></label></>}</div><label className="edc-admin-settings-field">Action reason<textarea required minLength={3} maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Record the evidence-based decision reason" /></label><label className="edc-admin-settings-field">Resolution notes (optional)<textarea maxLength={1000} rows={2} value={resolutionNotes} onChange={(event) => setResolutionNotes(event.target.value)} /></label><button className="edc-admin-button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Record Decision"}</button></form>
      {supportAppeals.length > 0 && <div className="edc-moderation-appeal-link"><label className="edc-admin-settings-field">Related Support & Appeals ID<select value={appealId} onChange={(event) => setAppealId(event.target.value)}><option value="">No linked appeal</option>{supportAppeals.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.subject}</option>)}</select></label><button className="edc-admin-action-button" type="button" onClick={saveAppealLink}>Link Appeal</button>{appealId && <><span className="edc-moderation-appeal-status">{linkedAppeal ? `Appeal status: ${linkedAppeal.status}` : "Appeal record not found"}</span><Link to="/admin/support">View Appeal</Link></>}</div>}
      <h4>Moderation History</h4><ActionList rows={(report.history || []).map((item) => ({ ...item, reportId: report.id, targetTitle: report.targetTitle }))} />
      {feedback && <p className={`edc-admin-feedback edc-admin-feedback-${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>{feedback.text}</p>}
    </section></div>}
  </section>;
}

function Stat({ icon: Icon, label, value, color = "purple", active = false, onClick }) {
  return (
    <button
      className={`edc-admin-stat-card edc-admin-metric-card edc-admin-metric-${color}${active ? " is-active" : ""}`}
      type="button"
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="edc-admin-stat-icon"><Icon size={18} aria-hidden="true" /></span>
      <p>{label}</p>
      <strong>{value}</strong>
    </button>
  );
}
function Detail({ label, value }) { return <div><span>{label}</span><strong>{value || "Not provided"}</strong></div>; }
function labelForType(value) { return String(value || "unknown").replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function StatusBadge({ status }) { const normalized = String(status || "").toLowerCase(); const className = ["resolved", "accepted"].includes(normalized) ? "edc-admin-status-approved" : ["pending", "submitted"].includes(normalized) ? "edc-admin-status-pending" : ["escalated", "rejected"].includes(normalized) ? "edc-admin-status-rejected" : ["dismissed", "closed"].includes(normalized) ? "edc-admin-status-unknown" : "edc-admin-status-changes"; return <span className={`edc-admin-status-badge ${className}`}>{status}</span>; }
function Empty({ icon: Icon, title, description }) { return <div className="edc-admin-applications-empty"><span className="edc-admin-applications-empty-icon"><Icon size={23} /></span><h3>{title}</h3><p>{description}</p></div>; }
function Breakdown({ values }) { const entries = Object.entries(values); return entries.length ? <dl className="edc-admin-breakdown-list">{entries.map(([key, value]) => <div key={key}><dt>{labelForType(key)}</dt><dd>{value}</dd></div>)}</dl> : <p className="edc-moderation-empty-note">No saved reports yet.</p>; }
function ActionList({ rows }) { return rows.length ? <ul className="edc-moderation-action-list">{rows.map((item, index) => <li key={`${item.reportId}-${item.timestamp}-${index}`}><span><strong>{item.action}</strong><small>{item.reportId} · {item.targetTitle}</small></span><span><b>{item.actor}</b><small>{fmt(item.timestamp)}</small></span></li>)}</ul> : <p className="edc-moderation-empty-note">No moderation activity yet.</p>; }
function ReportTable({ rows, onOpen, compact = false }) {
  return rows.length ? (
    <div className="edc-admin-table-wrap edc-moderation-report-table-wrap">
      <table className="edc-admin-applications-table edc-moderation-report-table">
        <thead>
          <tr>
            <th scope="col">Report ID</th>
            <th scope="col">{compact ? "Content / User" : "Reported Content"}</th>
            <th scope="col">Reported By</th>
            <th scope="col">Reason</th>
            <th scope="col">Date</th>
            <th scope="col">Status</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => {
            const reporter = String(item.reporterName || item.reporterEmail || "").trim();
            const initials = reporter
              ? reporter.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase()
              : "";
            return (
              <tr key={item.id}>
                <td><span className="edc-moderation-report-id">{item.id}</span></td>
                <td>
                  <span className="edc-moderation-reported-content">
                    <span><FileText size={16} aria-hidden="true" /></span>
                    <span><strong>{item.targetTitle}</strong><small>{labelForType(item.targetType)} · {item.targetId}</small></span>
                  </span>
                </td>
                <td>
                  <span className="edc-moderation-reporter-cell">
                    <span>{initials || <UsersRound size={14} aria-hidden="true" />}</span>
                    <span><strong>{item.reporterName || "Not provided"}</strong><small>{item.reporterEmail}</small></span>
                  </span>
                </td>
                <td><span className="edc-moderation-reason">{item.violation?.category || item.reason}</span><small className="edc-moderation-priority">Priority: {item.priority}</small></td>
                <td><span className="edc-moderation-report-date"><CalendarDays size={13} aria-hidden="true" />{fmtDate(item.createdAt)}</span></td>
                <td><StatusBadge status={item.status} /></td>
                <td>
                  <button className="edc-moderation-open-report" type="button" onClick={() => onOpen(item)} aria-label={`Review report ${item.id}`} title="Review report">
                    <Eye size={16} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty icon={Flag} title="No matching reports" description="Reports submitted through the existing learning experience will appear here. This queue does not generate sample reports." />
  );
}

function fmtDate(value) {
  if (!value) return "Not provided";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

export default AdminModerationGovernance;

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, BookOpen, ChartNoAxesCombined, CheckCircle2, ChevronRight, Clock3, FileText, HelpCircle, House, LifeBuoy, ListTree, Paperclip, RotateCcw, Search, Send, ShieldAlert, X } from "lucide-react";
import { ADMIN_DATA_CHANGED_EVENT, MODERATION_APPEAL_STATUSES, SUPPORT_FAQ_CATEGORIES, SUPPORT_REQUEST_CATEGORIES, SUPPORT_REQUEST_PRIORITIES, addAdminSupportResponse, createAdminSupportRequest, getAdminHelpFaqs, readAdminSupportRequestsState, updateAdminSupportRequestStatus } from "../admin/adminData";
import { getModerationReportsState, MODERATION_REPORTS_EVENT } from "../../utils/moderationReports";
import { apiFetch } from "../../utils/api";
import "./UserModerationAppeals.css";
import "./UserSupportDashboard.css";

const priorities = ["Low", "Medium", "High", "Urgent"];
export default function UserModerationAppeals({ email, name, role }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const [requests, setRequests] = useState(() => readAdminSupportRequestsState().records);
  const [reports, setReports] = useState(() => getModerationReportsState().records);
  const [subject, setSubject] = useState("");
  const [reportId, setReportId] = useState("");
  const [appealType, setAppealType] = useState("Moderation Decision Appeal");
  const [relatedRecordId, setRelatedRecordId] = useState("");
  const [originalDecision, setOriginalDecision] = useState("");
  const [evidence, setEvidence] = useState(null);
  const [evidenceInputKey, setEvidenceInputKey] = useState(0);
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [reportSearch, setReportSearch] = useState("");
  const [reportStatusFilter, setReportStatusFilter] = useState("all");
  const [reportTypeFilter, setReportTypeFilter] = useState("all");
  const [activeSummary, setActiveSummary] = useState("");
  const [selectedReportId, setSelectedReportId] = useState("");
  const [activeAppealSection, setActiveAppealSection] = useState("cases");

  useEffect(() => {
    const refreshRequests = () => setRequests(readAdminSupportRequestsState().records);
    const refreshReports = () => setReports(getModerationReportsState().records);
    const refreshAll = () => { refreshRequests(); refreshReports(); };
    window.addEventListener("storage", refreshAll);
    window.addEventListener(ADMIN_DATA_CHANGED_EVENT, refreshRequests);
    window.addEventListener(MODERATION_REPORTS_EVENT, refreshReports);
    return () => {
      window.removeEventListener("storage", refreshAll);
      window.removeEventListener(ADMIN_DATA_CHANGED_EVENT, refreshRequests);
      window.removeEventListener(MODERATION_REPORTS_EVENT, refreshReports);
    };
  }, []);

  const ownAppeals = useMemo(() => requests
    .filter((item) => Boolean(normalizedEmail) && item.category === "Moderation & Appeal" && String(item.requesterEmail || "").trim().toLowerCase() === normalizedEmail && (!item.requesterRole || item.requesterRole === role))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [normalizedEmail, requests, role]);
  const visibleCases = useMemo(() => reports.filter((item) => {
    if (!normalizedEmail) return false;
    const submittedByMe = String(item.reporterEmail || "").trim().toLowerCase() === normalizedEmail;
    const aboutMyAccountOrContent = role === "Teacher" && String(item.targetOwnerEmail || "").trim().toLowerCase() === normalizedEmail;
    const hasAdminAction = (item.history || []).some((entry) => !["Report submitted", "Appeal linked"].includes(entry.action));
    return submittedByMe || (aboutMyAccountOrContent && hasAdminAction);
  }).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)), [normalizedEmail, reports, role]);
  const filteredCases = visibleCases.filter((item) => {
    const status = item.status || "Pending";
    const matchesStatus = reportStatusFilter === "all"
      || (reportStatusFilter === "needs-review" && ["Pending", "Under Review", "Escalated"].includes(status))
      || status === reportStatusFilter;
    const matchesType = reportTypeFilter === "all" || item.targetType === reportTypeFilter;
    const searchText = `${item.id} ${item.targetTitle} ${item.targetType} ${item.reason} ${item.description}`.toLowerCase();
    return matchesStatus && matchesType && searchText.includes(reportSearch.trim().toLowerCase());
  });
  const reportStatusOptions = [...new Set(visibleCases.map((item) => item.status || "Pending"))];
  const reportTypeOptions = [...new Set(visibleCases.map((item) => item.targetType).filter(Boolean))];
  const pendingReportsCount = visibleCases.filter((item) => ["Pending", "Under Review", "Escalated"].includes(item.status || "Pending")).length;
  const resolvedReportsCount = visibleCases.filter((item) => item.status === "Resolved").length;
  const selectedCase = filteredCases.find((item) => item.id === selectedReportId) || filteredCases[0] || null;

  function filterMyReports(status = "all", summary = status) {
    setActiveAppealSection(status === "Resolved" ? "history" : "cases");
    setActiveSummary(summary);
    setReportStatusFilter(status);
    setReportTypeFilter("all");
    setReportSearch("");
    requestAnimationFrame(() => document.getElementById("edc-user-reports")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function showMyAppeals() {
    setActiveAppealSection("appeals");
    setActiveSummary("appeals");
    document.getElementById("edc-user-appeals-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showAppealForm() {
    setActiveAppealSection("submit");
    document.getElementById("edc-user-appeal-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.querySelector(".edc-user-appeal-form input")?.focus({ preventScroll: true });
  }

  function startAppeal(item) {
    setReportId(item.id);
    setRelatedRecordId(item.id);
    setAppealType("Moderation Decision Appeal");
    setSubject(`Appeal: ${item.targetTitle}`.slice(0, 160));
    const adminActions = (item.history || []).filter((entry) => !["Report submitted", "Appeal linked"].includes(entry.action));
    setOriginalDecision(adminActions.at(-1)?.action || "");
    setDescription("");
    setFeedback("");
    setError("");
    showAppealForm();
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setFeedback("");
    setIsSubmitting(true);
    try {
      const savedEvidence = await readAttachment(evidence);
      createAdminSupportRequest({
        subject,
        description,
        category: "Moderation & Appeal",
        priority,
        requesterName: name || role || "User",
        requesterEmail: normalizedEmail,
        requesterRole: role || "User",
        requesterId: normalizedEmail,
        actor: normalizedEmail || role || "User",
        moderationReportId: reportId.trim(),
        appealType,
        relatedRecordId: relatedRecordId.trim() || reportId.trim(),
        originalDecision,
        attachment: savedEvidence,
      });
      setSubject("");
      setReportId("");
      setRelatedRecordId("");
      setOriginalDecision("");
      setEvidence(null);
      setEvidenceInputKey((current) => current + 1);
      setDescription("");
      setPriority("Medium");
      setAppealType("Moderation Decision Appeal");
      setFeedback("Your appeal was submitted to Admin.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Your appeal could not be submitted.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function replyToAppeal(appeal) {
    const message = String(replyDrafts[appeal.id] || "").trim();
    if (!message) return;
    setError("");
    try {
      addAdminSupportResponse(appeal.id, { message, author: name || role || "User", actor: normalizedEmail, authorRole: role, requesterEmail: normalizedEmail });
      setReplyDrafts((current) => ({ ...current, [appeal.id]: "" }));
      setRequests(readAdminSupportRequestsState().records);
      setFeedback("Your appeal reply was sent to Admin.");
    } catch (replyError) { setError(replyError instanceof Error ? replyError.message : "Your reply could not be sent."); }
  }

  return <section className={`edc-user-appeals-page edc-user-appeals-dashboard${role === "Student" ? " edc-user-student-page" : ""}`}>
    {role !== "Student" && <nav className="edc-user-page-breadcrumb" aria-label="Breadcrumb"><House size={13} /><span>/</span><strong>Moderation &amp; Appeals</strong></nav>}
    <header className="edc-user-appeals-heading edc-user-page-hero">
      <span><ShieldAlert size={24} /></span>
      <div>{role !== "Student" && <span className="edc-user-appeals-eyebrow">YOUR ACCOUNT CASES</span>}<h1>Moderation &amp; Appeals</h1>
        <p>Submit an appeal or review the reports and decisions associated with your account.</p></div>
      <div className="edc-user-page-hero-art" aria-hidden="true"><ShieldAlert /><FileText /></div>
      <div className="edc-user-appeals-heading-actions">
        <button type="button" className="edc-user-guidelines-link" onClick={() => document.getElementById("edc-user-appeal-guidelines")?.scrollIntoView({ behavior: "smooth", block: "start" })}><BookOpen size={15} />Moderation Guidelines</button>
        <button type="button" className="edc-user-submit-appeal-link" onClick={showAppealForm}><Send size={15} />Submit an Appeal</button>
      </div>
    </header>

    <section className="edc-user-case-stats" aria-label="Your moderation summary">
      {[
        { key: "all", label: "My Reports", value: visibleCases.length, color: "purple", icon: ShieldAlert, action: () => filterMyReports("all", "all") },
        { key: "needs-review", label: "Needs Review", value: pendingReportsCount, color: "amber", icon: Clock3, action: () => filterMyReports("needs-review", "needs-review") },
        { key: "Resolved", label: "Resolved Reports", value: resolvedReportsCount, color: "green", icon: CheckCircle2, action: () => filterMyReports("Resolved", "Resolved") },
        { key: "appeals", label: "My Appeals", value: ownAppeals.length, color: "violet", icon: FileText, action: showMyAppeals },
      ].map(({ key, label, value, color, icon: Icon, action }) => <button key={label} type="button" className={`edc-user-case-stat ${color}`}
        onClick={action} aria-pressed={activeSummary === key} aria-label={`${label}: ${value}. View related records`}>
        <span><Icon size={20} /></span><div><small>{label}</small><strong>{value.toLocaleString()}</strong></div><ChevronRight className="edc-user-case-stat-action" size={15} aria-hidden="true" />
      </button>)}
    </section>

    <nav className="edc-user-appeal-nav" aria-label="Moderation and appeals sections">
      <button type="button" aria-current={activeAppealSection === "cases" ? "location" : undefined} onClick={() => filterMyReports("all", "all")}><ShieldAlert size={15} />My Cases</button>
      <button type="button" aria-current={activeAppealSection === "appeals" ? "location" : undefined} onClick={showMyAppeals}><FileText size={15} />My Appeals</button>
      <button type="button" aria-current={activeAppealSection === "submit" ? "location" : undefined} onClick={showAppealForm}><Send size={15} />Submit an Appeal</button>
      <button type="button" aria-current={activeAppealSection === "history" ? "location" : undefined} onClick={() => filterMyReports("Resolved", "Resolved")}><Clock3 size={15} />Resolution History</button>
    </nav>

    <div className="edc-user-appeals-grid edc-user-governance-grid">
      <form className="edc-user-appeals-card edc-user-appeal-form" id="edc-user-appeal-form" onSubmit={submit}>
        <header className="edc-user-card-heading"><div><h2><Send size={17} />Submit an Appeal</h2><p>Share the decision details so Admin can review your request.</p></div></header>
        <label>Subject<input required minLength={3} maxLength={160} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Briefly describe your appeal" /></label>
        <label>Appeal type<select value={appealType} onChange={(event) => setAppealType(event.target.value)}>{["Course Rejection Appeal", "PDF/eBook Rejection Appeal", "Teacher Application Rejection Appeal", "Account Restriction Appeal", "Moderation Decision Appeal"].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Related record ID (optional)<input maxLength={120} value={relatedRecordId} onChange={(event) => setRelatedRecordId(event.target.value)} placeholder="Course, book, account or decision ID" /></label>
        <label>Original decision<input required minLength={3} maxLength={240} value={originalDecision} onChange={(event) => setOriginalDecision(event.target.value)} placeholder="For example, Course rejected" /></label>
        <label>Moderation report ID (optional)<input maxLength={80} value={reportId} onChange={(event) => setReportId(event.target.value)} placeholder="For example, MOD-…" /></label>
        <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}>{priorities.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Appeal reason and explanation<textarea required minLength={5} maxLength={5000} rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explain the decision and why you are requesting a review." /></label>
        <label>Optional evidence (max 2 MB)<input key={evidenceInputKey} type="file" accept="image/*,.pdf,.txt,.doc,.docx" onChange={(event) => setEvidence(event.target.files?.[0] || null)} />{evidence && <small>{evidence.name}</small>}</label>
        {error && <p className="edc-user-appeals-feedback error" role="alert"><AlertCircle size={15} /> {error}</p>}
        {feedback && <p className="edc-user-appeals-feedback success" role="status">{feedback}</p>}
        <button type="submit" disabled={isSubmitting}><Send size={15} /> {isSubmitting ? "Submitting…" : "Submit Appeal"}</button>
      </form>

      <aside className="edc-user-appeals-card edc-user-appeal-guidelines" id="edc-user-appeal-guidelines">
        <header className="edc-user-card-heading"><div><h2><ShieldAlert size={17} />Appeal Guidelines</h2><p>Information that helps Admin review your request.</p></div></header>
        <ul>
          <li><CheckCircle2 size={14} /><span>Choose the appeal type that best matches the decision.</span></li>
          <li><CheckCircle2 size={14} /><span>Include the original decision and related record ID when available.</span></li>
          <li><CheckCircle2 size={14} /><span>Explain the facts and why you are requesting a review.</span></li>
          <li><CheckCircle2 size={14} /><span>Attach only relevant evidence. Files are limited to 2 MB.</span></li>
          <li><CheckCircle2 size={14} /><span>Check My Appeals for status updates and Admin replies.</span></li>
        </ul>
        <p>These are submission tips only; no review time is guaranteed.</p>
      </aside>

      <section className="edc-user-appeals-card edc-user-case-results" aria-label="Your reports, outcomes, and appeals" id="edc-user-reports">
        <header className="edc-user-card-heading"><div><h2><ShieldAlert size={17} />My Reports &amp; Outcomes</h2><p>Only reports linked to your signed-in account appear here.</p></div></header>
        <div className="edc-user-case-filters">
          <label><Search size={14} /><input type="search" aria-label="Search your reports" placeholder="Search reports..." value={reportSearch} onChange={(event) => { setReportSearch(event.target.value); setActiveSummary(""); }} /></label>
          <select aria-label="Filter reports by status" value={reportStatusFilter} onChange={(event) => { setReportStatusFilter(event.target.value); setActiveSummary(""); }}>
            <option value="all">All Statuses</option><option value="needs-review">Needs Review</option>{reportStatusOptions.map((status) => <option key={status}>{status}</option>)}
          </select>
          <select aria-label="Filter reports by item type" value={reportTypeFilter} onChange={(event) => { setReportTypeFilter(event.target.value); setActiveSummary(""); }}>
            <option value="all">All Types</option>{reportTypeOptions.map((type) => <option key={type}>{type}</option>)}
          </select>
        </div>
        {filteredCases.length ? <div className="edc-user-appeals-list edc-user-case-list">{filteredCases.map((item) => {
          const adminActions = (item.history || []).filter((entry) => !["Report submitted", "Appeal linked"].includes(entry.action));
          const lastAction = adminActions.at(-1);
          return <article className="edc-user-appeal-item" data-selected={selectedCase?.id === item.id} key={item.id}>
            <button type="button" className="edc-user-case-select" onClick={() => setSelectedReportId(item.id)} aria-pressed={selectedCase?.id === item.id}>
              <span className="edc-user-appeal-item-heading"><strong>{item.targetTitle}</strong><span data-status={String(item.status || "Pending").toLowerCase().replaceAll(" ", "-")}>{item.status || "Pending"}</span></span>
              <small>{item.id} · {item.targetType}</small>
              <small>Reported {item.createdAt ? new Date(item.createdAt).toLocaleString() : "date unavailable"}{lastAction ? ` · Latest action: ${lastAction.action}` : ""}</small>
            </button>
            {lastAction && <button className="edc-user-appeal-link" type="button" onClick={() => startAppeal(item)}>Appeal / add context</button>}
          </article>;
        })}</div> : <p className="edc-user-appeals-empty">{visibleCases.length ? "No reports match these filters." : "Your submitted reports and moderation outcomes will appear here."}</p>}

        <h2 className="edc-user-appeals-subheading" id="edc-user-appeals-list"><FileText size={17} />My Appeals</h2>
        {ownAppeals.length ? <div className="edc-user-appeals-list">{ownAppeals.map((appeal) => {
          const publicResponses = (Array.isArray(appeal.responses) ? appeal.responses : []).filter((response) => response.type !== "internal_note");
          return <article className="edc-user-appeal-item" key={appeal.id}>
            <div className="edc-user-appeal-item-heading"><strong>{appeal.subject}</strong><span data-status={String(appeal.status || "Submitted").toLowerCase().replaceAll(" ", "-")}>{MODERATION_APPEAL_STATUSES.includes(appeal.status) ? appeal.status : "Submitted"}</span></div>
            <small>Appeal ID: {appeal.id} · {appeal.appealType || "Moderation Decision Appeal"}</small>
            {appeal.relatedRecordId && <small>Related record: {appeal.relatedRecordTitle || appeal.relatedRecordId} · {appeal.relatedRecordId}</small>}
            {appeal.originalDecision && <small>Original decision: {appeal.originalDecision}</small>}
            <p>{appeal.description}</p>
            {appeal.moderationReportId && <small>Report ID: {appeal.moderationReportId}</small>}
            <small>Submitted {appeal.createdAt ? new Date(appeal.createdAt).toLocaleString() : "date unavailable"} · {appeal.priority || "Medium"} priority</small>
            {publicResponses.map((response) => <div className="edc-user-appeal-response" key={response.id}><strong>{response.author || "Admin"}</strong><p>{response.message}</p><small>{response.createdAt ? new Date(response.createdAt).toLocaleString() : ""}</small></div>)}
            {appeal.decisionReason && <p className="edc-user-appeal-decision"><strong>Admin decision reason:</strong> {appeal.decisionReason}</p>}
            {appeal.status !== "Closed" && <form className="edc-user-appeal-reply" onSubmit={(event) => { event.preventDefault(); replyToAppeal(appeal); }}><textarea aria-label={`Reply to appeal ${appeal.id}`} rows={2} maxLength={5000} value={replyDrafts[appeal.id] || ""} onChange={(event) => setReplyDrafts((current) => ({ ...current, [appeal.id]: event.target.value }))} placeholder="Reply to Admin or provide requested information" /><button type="submit" disabled={!String(replyDrafts[appeal.id] || "").trim()}><Send size={14} /> Send Reply</button></form>}
          </article>;
        })}</div> : <p className="edc-user-appeals-empty">You have not submitted a moderation appeal yet.</p>}
      </section>

      <aside className="edc-user-appeals-card edc-user-case-details" aria-label="Selected case details">
        <header className="edc-user-card-heading"><div><h2><ShieldAlert size={17} />Case Details</h2><p>Details are limited to cases linked to your account.</p></div></header>
        {selectedCase ? (() => {
          const adminActions = (selectedCase.history || []).filter((entry) => !["Report submitted", "Appeal linked"].includes(entry.action));
          const lastAction = adminActions.at(-1);
          const reportedByMe = String(selectedCase.reporterEmail || "").trim().toLowerCase() === normalizedEmail;
          return <>
            <div className="edc-user-case-details-title"><strong>{selectedCase.targetTitle}</strong><small>{selectedCase.targetType || "Content"} · {reportedByMe ? "Submitted by you" : "Regarding your account or content"}</small></div>
            <dl>
              <div><dt>Report ID</dt><dd>{selectedCase.id}</dd></div>
              <div><dt>Reported on</dt><dd>{selectedCase.createdAt ? new Date(selectedCase.createdAt).toLocaleString() : "Date unavailable"}</dd></div>
              <div><dt>Reason</dt><dd>{selectedCase.reason || "Reason not provided"}</dd></div>
              <div><dt>Status</dt><dd><span data-status={String(selectedCase.status || "Pending").toLowerCase().replaceAll(" ", "-")}>{selectedCase.status || "Pending"}</span></dd></div>
            </dl>
            {selectedCase.description && <p className="edc-user-case-details-message">{selectedCase.description}</p>}
            {lastAction && <p className="edc-user-case-details-action"><strong>Latest moderation action:</strong> {lastAction.action}</p>}
            {lastAction && <button type="button" className="edc-user-case-appeal-action" onClick={() => startAppeal(selectedCase)}><Send size={14} />Appeal / add context</button>}
          </>;
        })() : <p className="edc-user-appeals-empty">Your reports and moderation outcomes will appear here when available.</p>}
      </aside>
    </div>
    <p className="edc-user-appeals-note">Appeals are private support records. Admin decisions and internal review notes remain in the Admin workspace.</p>
  </section>;
}

const ticketCategories = SUPPORT_REQUEST_CATEGORIES.filter((category) => category !== "Moderation & Appeal");

function readAttachment(file) {
  if (!file) return Promise.resolve(null);
  if (file.size > 2 * 1024 * 1024) return Promise.reject(new Error("Attachment must be 2 MB or smaller."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", size: file.size, dataUrl: String(reader.result || "") });
    reader.onerror = () => reject(new Error("The attachment could not be read."));
    reader.readAsDataURL(file);
  });
}

const normalizeBackendTicket = (ticket) => ({
  id: String(ticket.id),
  ticketId: ticket.ticketId,
  subject: ticket.subject,
  description: ticket.description,
  category: ticket.category,
  priority: ticket.priority,
  status: ticket.status,
  requesterName: ticket.requesterName || "User",
  requesterEmail: ticket.requesterEmail,
  requesterRole: ticket.requesterRole,
  relatedRecordId: ticket.relatedRecordId || "",
  relatedRecordTitle: ticket.relatedRecordTitle || "",
  assignedStaff: ticket.assignedStaff || "",
  assignedBy: ticket.assignedBy || "",
  responses: (ticket.responses || []).map((response) => ({ id: response.id, message: response.message, type: response.type, author: response.author, authorRole: response.authorRole, createdAt: response.createdAt })),
  resolvedAt: ticket.resolvedAt || null,
  closedAt: ticket.closedAt || null,
  createdAt: ticket.createdAt,
  updatedAt: ticket.updatedAt,
});

export function UserSupportCenter({ email, name, role, onNavigate }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const [requests, setRequests] = useState(() => readAdminSupportRequestsState().records);
  const [apiTickets, setApiTickets] = useState([]);
  const [apiAvailable, setApiAvailable] = useState(false);
  const [apiError, setApiError] = useState("");
  const [apiLoading, setApiLoading] = useState(true);
  const [ticketFaqs, setTicketFaqs] = useState(() => getAdminHelpFaqs({ publishedOnly: true }));
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("Technical Issue");
  const [priority, setPriority] = useState("Medium");
  const [description, setDescription] = useState("");
  const [relatedRecord, setRelatedRecord] = useState("");
  const [replyDrafts, setReplyDrafts] = useState({});
  const [faqSearch, setFaqSearch] = useState("");
  const [faqCategory, setFaqCategory] = useState("all");
  const [activeSupportSection, setActiveSupportSection] = useState("help-center");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  const fetchMyTickets = useCallback(async () => {
    try {
      const response = await apiFetch("/support/tickets/mine", { method: "GET" });
      if (!response.ok) throw Object.assign(new Error((await response.json().catch(() => ({}))).message || "Your support tickets could not be loaded."), { status: response.status });
      const data = await response.json();
      setApiTickets((data.tickets || []).map(normalizeBackendTicket));
      setApiError("");
      setApiAvailable(true);
    } catch (fetchError) {
      setApiError(fetchError?.message || "Your support tickets could not be loaded. Browser-saved tickets are shown.");
      setApiAvailable(false);
    } finally {
      setApiLoading(false);
    }
  }, []);

  useEffect(() => {
    const refresh = () => {
      setRequests(readAdminSupportRequestsState().records);
      setTicketFaqs(getAdminHelpFaqs({ publishedOnly: true }));
    };
    window.addEventListener("storage", refresh);
    window.addEventListener(ADMIN_DATA_CHANGED_EVENT, refresh);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMyTickets();
    window.addEventListener("focus", fetchMyTickets);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(ADMIN_DATA_CHANGED_EVENT, refresh);
      window.removeEventListener("focus", fetchMyTickets);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // MongoDB-backed tickets are the primary source; browser-local records are the fallback.
  const ownTickets = useMemo(() => {
    const source = apiAvailable ? apiTickets : requests;
    return source
      .filter((item) => Boolean(normalizedEmail) && item.category !== "Moderation & Appeal" && String(item.requesterEmail || "").trim().toLowerCase() === normalizedEmail && (!item.requesterRole || item.requesterRole === role))
      .sort((first, second) => new Date(second.updatedAt || second.createdAt) - new Date(first.updatedAt || first.createdAt));
  }, [apiAvailable, apiTickets, normalizedEmail, requests, role]);
  const visibleFaqs = ticketFaqs.filter((faq) => (faqCategory === "all" || faq.category === faqCategory) && `${faq.category} ${faq.question} ${faq.answer}`.toLowerCase().includes(faqSearch.trim().toLowerCase()));
  const resolvedTicketCount = ownTickets.filter((ticket) => ["Resolved", "Closed"].includes(ticket.status)).length;
  const inProgressTicketCount = ownTickets.filter((ticket) => ["In Progress", "Under Review"].includes(ticket.status)).length;
  const openTicketCount = ownTickets.filter((ticket) => ["Open", "Pending"].includes(ticket.status)).length;

  function navigateSupportSection(section) {
    setActiveSupportSection(section);
    requestAnimationFrame(() => document.getElementById(`edc-user-support-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function openHelpArticle(faq) {
    setFaqCategory(faq.category);
    setFaqSearch(faq.question);
    navigateSupportSection("faqs");
  }

  async function submitTicket(event) {
    event.preventDefault();
    setError("");
    setFeedback("");
    try {
      const response = await apiFetch("/support/tickets", { method: "POST", body: JSON.stringify({
        subject: subject.trim(),
        description: description.trim(),
        category,
        priority,
        requesterName: name || role || "User",
        relatedRecordId: relatedRecord.trim(),
        relatedRecordTitle: relatedRecord.trim(),
      }) });
      if (!response.ok) throw Object.assign(new Error((await response.json().catch(() => ({}))).message || "Your support request could not be submitted."), { status: response.status });
      setSubject("");
      setDescription("");
      setRelatedRecord("");
      setFeedback("Your support ticket was submitted. Admin replies will appear in My Tickets.");
      await fetchMyTickets();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Your support request could not be submitted.");
    }
  }

  async function replyToTicket(ticket) {
    const message = String(replyDrafts[ticket.id] || "").trim();
    if (!message) return;
    setError("");
    setFeedback("");
    try {
      const response = await apiFetch(`/support/tickets/${encodeURIComponent(ticket.id)}/replies`, { method: "POST", body: JSON.stringify({ message }) });
      if (!response.ok) throw Object.assign(new Error((await response.json().catch(() => ({}))).message || "Your reply could not be sent."), { status: response.status });
      setReplyDrafts((current) => ({ ...current, [ticket.id]: "" }));
      setFeedback("Your reply was sent.");
      await fetchMyTickets();
    } catch (replyError) {
      // Browser-local fallback when the backend is unavailable.
      try {
        addAdminSupportResponse(ticket.id, { message, author: name || role || "User", actor: normalizedEmail, authorRole: role, requesterEmail: normalizedEmail });
        setReplyDrafts((current) => ({ ...current, [ticket.id]: "" }));
        setFeedback("Your reply was sent.");
      } catch (localError) {
        setError(replyError instanceof Error ? replyError.message : localError instanceof Error ? localError.message : "Your reply could not be sent.");
      }
    }
  }

  async function updateTicket(ticket, status) {
    if (!window.confirm(`${status === "Closed" ? "Close" : "Reopen"} ticket ${ticket.id}?`)) return;
    setError("");
    setFeedback("");
    try {
      const response = await apiFetch(`/support/tickets/${encodeURIComponent(ticket.id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
      if (!response.ok) throw Object.assign(new Error((await response.json().catch(() => ({}))).message || "Ticket status could not be changed."), { status: response.status });
      setFeedback(status === "Closed" ? "Ticket closed. You can reopen it if the issue returns." : "Ticket reopened.");
      await fetchMyTickets();
    } catch (statusError) {
      // Browser-local fallback when the backend is unavailable.
      try {
        updateAdminSupportRequestStatus(ticket.id, status, normalizedEmail, "", { actorRole: role, requesterEmail: normalizedEmail });
      } catch (localError) {
        setError(statusError instanceof Error ? statusError.message : localError instanceof Error ? localError.message : "Ticket status could not be changed.");
        return;
      }
      setFeedback(status === "Closed" ? "Ticket closed. You can reopen it if the issue returns." : "Ticket reopened.");
    }
  }

  return <section className={`edc-user-support-center edc-user-support-dashboard${role === "Student" ? " edc-user-student-page" : ""}`}>
    {role !== "Student" && <nav className="edc-user-page-breadcrumb" aria-label="Breadcrumb"><House size={13} /><span>/</span><strong>Help &amp; Support</strong></nav>}
    <header className="edc-user-support-heading edc-user-page-hero">
      <span><LifeBuoy size={24} /></span>
      <div className="edc-user-support-hero-content">
        {role !== "Student" && <small>TEACHER SUPPORT</small>}
        <h1>Help &amp; Support</h1>
        <p>Find answers in published help articles or contact Admin through a support ticket.</p>
        <form className="edc-user-support-search" role="search" aria-label="Search help articles" onSubmit={(event) => { event.preventDefault(); navigateSupportSection("faqs"); }}>
          <Search size={18} /><input type="search" aria-label="Search published help articles" value={faqSearch}
            onChange={(event) => setFaqSearch(event.target.value)} placeholder="Search help articles, FAQs, or issues..." />
          {faqSearch && <button type="button" aria-label="Clear help search" onClick={() => setFaqSearch("")}><X size={15} /></button>}
          <button type="submit">Search</button>
        </form>
      </div>
      <div className="edc-user-support-hero-stats" aria-label="Your support summary">
        <div><FileText size={17} /><strong>{ownTickets.length.toLocaleString()}</strong><small>My Tickets</small></div>
        <div><CheckCircle2 size={17} /><strong>{resolvedTicketCount.toLocaleString()}</strong><small>Resolved</small></div>
        <div><Clock3 size={17} /><strong>{inProgressTicketCount.toLocaleString()}</strong><small>In Progress</small></div>
        <div><HelpCircle size={17} /><strong>{ticketFaqs.length.toLocaleString()}</strong><small>Published FAQs</small></div>
      </div>
    </header>
    <nav className="edc-user-support-nav" aria-label="Help and support sections">
      {[
        ["help-center", "Help Center", House],
        ["faqs", "FAQs", HelpCircle],
        ["tickets", "My Tickets", FileText],
        ["contact", "Contact Support", LifeBuoy],
        ["resources", "Resources", BookOpen],
      ].map(([section, label, Icon]) => <button key={section} type="button" aria-current={activeSupportSection === section ? "location" : undefined}
        onClick={() => navigateSupportSection(section)}><Icon size={15} />{label}</button>)}
      <button type="button" className="edc-user-support-nav-primary" onClick={() => navigateSupportSection("contact")}><Send size={15} />Submit a Ticket</button>
    </nav>
    {error && <p className="edc-user-support-feedback error" role="alert"><AlertCircle size={15} /> {error}</p>}
    {feedback && <p className="edc-user-support-feedback success" role="status">{feedback}</p>}
    {apiError && <p className="edc-user-support-feedback error" role="status">{apiError}</p>}
    {apiLoading && !apiError && <p className="edc-user-support-feedback" role="status">Loading your tickets…</p>}
    <div className="edc-user-support-content-grid" id="edc-user-support-help-center">
      <section className="edc-user-support-card edc-user-support-faq-card" id="edc-user-support-faqs">
        <header className="edc-user-support-card-heading"><div><h2><HelpCircle size={18} />Frequently Asked Questions</h2><p>Answers from the published help center.</p></div>
          <label className="edc-user-support-faq-category"><span>Topic</span><select aria-label="Filter help articles by topic" value={faqCategory} onChange={(event) => setFaqCategory(event.target.value)}><option value="all">All Topics</option>{SUPPORT_FAQ_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
        </header>
        {visibleFaqs.length ? visibleFaqs.map((faq) => <details key={faq.id}><summary>{faq.question}<ChevronRight size={15} /></summary><small>{faq.category}</small><p>{faq.answer}</p></details>) : <p className="edc-user-support-empty">{ticketFaqs.length ? "No published help article matches this search." : "No published help articles are available yet."}</p>}
      </section>
      <form className="edc-user-support-card edc-user-support-ticket-form" onSubmit={submitTicket} id="edc-user-support-contact">
        <header className="edc-user-support-card-heading"><div><h2><Send size={18} />Contact Support</h2><p>Submit a ticket and follow Admin replies here.</p></div></header>
        <label>Problem title<input required minLength={3} maxLength={160} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Briefly describe the problem" /></label>
        <div className="edc-user-support-fields"><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{ticketCategories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}>{SUPPORT_REQUEST_PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select></label></div>
        <label>Related course / PDF / order (optional)<input maxLength={180} value={relatedRecord} onChange={(event) => setRelatedRecord(event.target.value)} placeholder="Name or record ID" /></label>
        <label>Description<textarea required minLength={5} maxLength={5000} rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explain what happened and what you need help with." /></label>
        <label className="edc-user-support-attachment edc-user-support-attachment-disabled"><Paperclip size={15} /> Attachments are stored in MongoDB in this app. Share links or details in the description, or ask an Admin to attach files.</label>
        <button type="submit"><Send size={15} /> Submit Request</button>
        <small className="edc-user-support-storage-note">Your ticket is saved to MongoDB and shared with Admin staff. Do not attach sensitive personal or payment information.</small>
      </form>
      <aside className="edc-user-support-resource-column">
        <section className="edc-user-support-card" id="edc-user-support-resources">
          <header className="edc-user-support-card-heading"><div><h2><BookOpen size={18} />Support Resources</h2><p>Published articles from your help center.</p></div></header>
          {ticketFaqs.length ? <div className="edc-user-support-resource-list">{ticketFaqs.slice(0, 4).map((faq) => <button key={faq.id} type="button" onClick={() => openHelpArticle(faq)}><span><FileText size={14} />{faq.question}</span><ChevronRight size={14} /></button>)}
            <button type="button" onClick={() => navigateSupportSection("faqs")}><span><BookOpen size={14} />Browse all published FAQs</span><ChevronRight size={14} /></button>
          </div> : <p className="edc-user-support-empty">Published resources will appear here when available.</p>}
        </section>
        <section className="edc-user-support-card edc-user-support-quick-links">
          <header className="edc-user-support-card-heading"><div><h2><ArrowRight size={18} />Quick Links</h2><p>Open your teacher workspace sections.</p></div></header>
          <div className="edc-user-support-resource-list">
            {[
              ["courses", "My Courses", BookOpen],
              ["curriculum", "Curriculum Builder", ListTree],
              ["books", "My PDF/eBooks", FileText],
              ["analytics", "Learning Analytics", ChartNoAxesCombined],
            ].map(([tab, label, Icon]) => <button key={tab} type="button" onClick={() => onNavigate(tab)}><span><Icon size={14} />{label}</span><ChevronRight size={14} /></button>)}
          </div>
        </section>
      </aside>
    </div>
    <section className="edc-user-support-card edc-user-support-my-tickets" id="edc-user-support-tickets"><div className="edc-user-support-card-heading"><div><h2><Clock3 size={18} />My Support Tickets</h2><p>{ownTickets.length} saved ticket{ownTickets.length === 1 ? "" : "s"} · {openTicketCount} open</p></div>
      <button type="button" className="edc-user-support-status-link" onClick={() => navigateSupportSection("contact")}><Send size={14} />Submit a Ticket</button>
    </div>
      {ownTickets.length ? ownTickets.map((ticket) => <article className="edc-user-support-ticket" key={ticket.id}>
        <header><div><strong>{ticket.subject}</strong><small>{ticket.id} · {ticket.category} · {ticket.priority} priority</small></div><span data-status={String(ticket.status).toLowerCase().replaceAll(" ", "-")}>{ticket.status}</span></header>
        <p>{ticket.description}</p><small>Submitted {ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : "date unavailable"}{ticket.assignedStaff ? ` · Assigned to ${ticket.assignedStaff}` : ""}</small>
        {ticket.relatedRecordId && <small>Related: {ticket.relatedRecordTitle || ticket.relatedRecordId}</small>}
        {ticket.attachment?.dataUrl && <a href={ticket.attachment.dataUrl} download={ticket.attachment.name} target="_blank" rel="noreferrer">Attachment: {ticket.attachment.name}</a>}
        <div className="edc-user-support-conversation">{(Array.isArray(ticket.responses) ? ticket.responses : []).filter((response) => response.type !== "internal_note").map((response) => <div key={response.id}><strong>{response.author || "Support"} <small>· {response.authorRole || "Support"}</small></strong><p>{response.message}</p><time>{response.createdAt ? new Date(response.createdAt).toLocaleString() : ""}</time></div>)}</div>
        <div className="edc-user-support-ticket-actions">{ticket.status === "Resolved" && <button type="button" className="secondary" onClick={() => updateTicket(ticket, "Closed")}><X size={14} /> Close Ticket</button>}{ticket.status === "Closed" && <button type="button" className="secondary" onClick={() => updateTicket(ticket, "Open")}><RotateCcw size={14} /> Reopen Ticket</button>}</div>
        {ticket.status !== "Closed" && <form className="edc-user-support-reply" onSubmit={(event) => { event.preventDefault(); replyToTicket(ticket); }}><textarea aria-label={`Reply to ticket ${ticket.id}`} rows={2} maxLength={5000} value={replyDrafts[ticket.id] || ""} onChange={(event) => setReplyDrafts((current) => ({ ...current, [ticket.id]: event.target.value }))} placeholder="Write a reply to Admin" /><button type="submit" disabled={!String(replyDrafts[ticket.id] || "").trim()}><Send size={14} /> Send Reply</button></form>}
      </article>) : <p className="edc-user-support-empty">You have not submitted a support ticket yet.</p>}
    </section>
    <p className="edc-user-support-privacy">Support tickets are stored in MongoDB and shared with Admin staff. Do not attach sensitive personal or payment information.</p>
  </section>;
}

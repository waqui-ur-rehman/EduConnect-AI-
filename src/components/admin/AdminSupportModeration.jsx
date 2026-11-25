import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  CreditCard,
  Download,
  Eye,
  FileText,
  Filter,
  LifeBuoy,
  Lock,
  MessageSquare,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  ADMIN_DATA_CHANGED_EVENT,
  MODERATION_APPEAL_STATUSES,
  SUPPORT_FAQ_CATEGORIES,
  SUPPORT_REQUEST_CATEGORIES,
  SUPPORT_REQUEST_PRIORITIES,
  SUPPORT_REQUEST_STATUSES,
  addAdminSupportResponse,
  deleteAdminHelpFaq,
  getAdminHelpFaqs,
  importLegacyStudentHelpRequests,
  readAdminHelpFaqsState,
  readAdminSupportRequestsState,
  saveAdminHelpFaq,
  updateAdminSupportRequestAssignment,
  updateAdminSupportRequestPriority,
  updateAdminSupportRequestStatus,
} from "./adminData";
import { getStudentHelpRequests } from "../../utils/books";
import { createCsvContent, downloadCsv } from "./adminCsvUtils";
import {
  adminApiRequest,
  getAdminSupportQueue,
  normalizeAdminSupportTicket,
} from "./adminQueueApi";

const PAGE_SIZE = 15;
const ALL_REQUEST_STATUSES = [...new Set([...SUPPORT_REQUEST_STATUSES, ...MODERATION_APPEAL_STATUSES])];
const APPEAL_STATUSES_OPEN = new Set(["Submitted", "Under Review", "More Information Required"]);
const TABS = [
  ["overview", "All Requests", LifeBuoy],
  ["tickets", "Support Tickets", MessageSquare],
  ["appeals", "Appeals", ShieldAlert],
  ["reports", "SLA & Escalation", Clock3],
  ["faqs", "Help Center", BookOpen],
];

const REQUEST_SUBVIEWS = [
  ["tickets", "All Tickets", MessageSquare],
  ["students", "Student Help", UserRound],
  ["teachers", "Teacher Help", Users],
  ["payments", "Payment Support", CreditCard],
  ["assignments", "Assignments", CheckCircle2],
  ["messages", "Messages", MessageSquare],
];

function formatTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function badgeClass(status) {
  const value = String(status || "").toLowerCase();
  if (["open", "submitted"].includes(value)) return "edc-admin-status-pending";
  if (["in progress", "under review", "waiting for user", "more information required"].includes(value)) return "edc-admin-status-changes";
  if (["resolved", "accepted"].includes(value)) return "edc-admin-status-approved";
  if (["rejected", "urgent"].includes(value)) return "edc-admin-status-rejected";
  return "edc-admin-status-unknown";
}

function priorityClass(priority) {
  if (String(priority).toLowerCase() === "urgent") return "edc-admin-status-rejected";
  if (String(priority).toLowerCase() === "high") return "edc-admin-priority-high";
  if (String(priority).toLowerCase() === "medium") return "edc-admin-priority-medium";
  return "edc-admin-status-unknown";
}

function isAppeal(record) {
  return record.category === "Moderation & Appeal";
}

function isPayment(record) {
  return ["Payment Failed", "Payment Completed but Course Locked", "Duplicate Payment", "Incorrect Purchase Status", "Payment Problem", "Refund Request", "Transaction Not Found", "Billing & Payment"].includes(record.category);
}

function isPending(record) {
  return !["Resolved", "Closed", "Accepted", "Rejected"].includes(record.status);
}

function SupportOverviewTable({ rows, type, error, onOpen }) {
  const isAppealTable = type === "appeal";
  if (error) {
    return <div className="edc-admin-support-empty-state" role="alert"><AlertTriangle size={19} /><p>{error}</p></div>;
  }
  if (!rows.length) {
    return <div className="edc-admin-support-empty-state"><LifeBuoy size={20} aria-hidden="true" /><p>{isAppealTable ? "No saved appeals were found." : "No saved support tickets were found."}</p></div>;
  }

  return (
    <div className="edc-admin-support-reference-table-wrap">
      <table className="edc-admin-support-reference-table">
        <thead>
          {isAppealTable
            ? <tr><th scope="col">Appeal ID</th><th scope="col">Requester</th><th scope="col">Appeal Reason</th><th scope="col">Related Record</th><th scope="col">Submitted</th><th scope="col">Status</th><th scope="col">Actions</th></tr>
            : <tr><th scope="col">Ticket ID</th><th scope="col">Requester</th><th scope="col">Subject</th><th scope="col">Category</th><th scope="col">Created</th><th scope="col">Status</th><th scope="col">Actions</th></tr>}
        </thead>
        <tbody>{rows.map((item) => (
          <tr key={item.id}>
            <td><code>{item.id || "ID not recorded"}</code></td>
            <td><strong>{item.requesterName || "Name not provided"}</strong><small>{item.requesterRole || "Role not recorded"}</small></td>
            <td><strong>{item.subject || "Subject not provided"}</strong></td>
            {isAppealTable ? (
              <td>{item.relatedRecordTitle || item.relatedRecordId || item.appealType || "Not linked"}</td>
            ) : (
              <td><span className="edc-admin-activity-tag">{item.category || "Category not recorded"}</span></td>
            )}
            <td>{formatTimestamp(item.createdAt)}</td>
            <td><span className={`edc-admin-status-badge ${badgeClass(item.status)}`}>{item.status || "Status not recorded"}</span></td>
            <td><button className="edc-admin-support-view-button" type="button" onClick={() => onOpen(item)} aria-label={`View ${isAppealTable ? "appeal" : "ticket"} ${item.id}`} title="View details"><Eye size={14} aria-hidden="true" /></button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function AdminSupportModeration({ email, moderationOnly = false, initialView = "overview", detailPage = false }) {
  const adminActor = email || window.sessionStorage.getItem("educonnect.demoEmail") || "Admin";
  const [localRequests, setRequests] = useState(() => readAdminSupportRequestsState().records);
  const [apiTickets, setApiTickets] = useState([]);
  const [apiSource, setApiSource] = useState("loading");
  const [apiError, setApiError] = useState("");
  const [localStoreError, setStoreError] = useState(() => readAdminSupportRequestsState().error || "");
  const storeError = apiSource === "backend" ? "" : localStoreError;
  const requests = useMemo(() => {
    if (apiSource === "backend") return apiTickets;
    if (apiSource === "fallback") return localRequests;
    return [];
  }, [apiSource, apiTickets, localRequests]);
  const [faqs, setFaqs] = useState(getAdminHelpFaqs);
  const [faqError, setFaqError] = useState(() => readAdminHelpFaqsState().error || "");
  const [activeView, setActiveView] = useState(moderationOnly ? "appeals" : initialView);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [assignedFilter, setAssignedFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [assignment, setAssignment] = useState("");
  const [priorityDraft, setPriorityDraft] = useState("Medium");
  const [decisionReason, setDecisionReason] = useState("");
  const [responseMessage, setResponseMessage] = useState("");
  const [responseType, setResponseType] = useState("response");
  const [feedback, setFeedback] = useState(null);
  const [responseError, setResponseError] = useState("");
  const [faqSearch, setFaqSearch] = useState("");
  const [faqCategory, setFaqCategory] = useState("all");
  const [faqDraft, setFaqDraft] = useState({ id: "", category: SUPPORT_FAQ_CATEGORIES[0], question: "", answer: "", published: true });
  const [faqFormError, setFaqFormError] = useState("");
  const [reportNow] = useState(() => new Date());

  const refreshRequests = useCallback(() => {
    const state = readAdminSupportRequestsState();
    setRequests(state.records);
    setStoreError(state.error || "");
    setSelectedRequest((current) => current ? state.records.find((item) => String(item.id) === String(current.id)) || null : null);
  }, []);

  const refreshFaqs = useCallback(() => {
    const state = readAdminHelpFaqsState();
    setFaqs(state.records);
    setFaqError(state.error || "");
  }, []);

  const fetchBackendTickets = useCallback(async () => {
    try {
      const queue = await getAdminSupportQueue();
      setApiTickets(queue.records.map(normalizeAdminSupportTicket));
      setApiSource("backend");
      setApiError("");
    } catch (error) {
      setApiTickets([]);
      setApiSource(error?.backendUnavailable ? "fallback" : "backend");
      setApiError(error instanceof Error ? error.message : "Support tickets could not be loaded.");
    }
  }, []);

  useEffect(() => {
    window.addEventListener(ADMIN_DATA_CHANGED_EVENT, fetchBackendTickets);
    return () => window.removeEventListener(ADMIN_DATA_CHANGED_EVENT, fetchBackendTickets);
  }, [fetchBackendTickets]);

  useEffect(() => {
    fetchBackendTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.addEventListener("storage", refreshRequests);
    window.addEventListener(ADMIN_DATA_CHANGED_EVENT, refreshRequests);
    window.addEventListener("storage", refreshFaqs);
    window.addEventListener(ADMIN_DATA_CHANGED_EVENT, refreshFaqs);
    return () => {
      window.removeEventListener("storage", refreshRequests);
      window.removeEventListener(ADMIN_DATA_CHANGED_EVENT, refreshRequests);
      window.removeEventListener("storage", refreshFaqs);
      window.removeEventListener(ADMIN_DATA_CHANGED_EVENT, refreshFaqs);
    };
  }, [refreshFaqs, refreshRequests]);

  useEffect(() => {
    try {
      importLegacyStudentHelpRequests(getStudentHelpRequests());
    } catch (error) {
      window.setTimeout(() => setFeedback({ type: "error", message: error instanceof Error ? error.message : "Earlier student help requests could not be imported." }), 0);
    }
  }, []);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") setSelectedRequest(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const scopedRequests = useMemo(() => {
    if (moderationOnly) return requests.filter(isAppeal);
    if (activeView === "pending") return requests.filter((item) => !isAppeal(item) && isPending(item));
    if (activeView === "resolved") return requests.filter((item) => !isAppeal(item) && (item.status === "Resolved" || (item.status === "Closed" && item.resolvedAt)));
    if (activeView === "open-appeals") return requests.filter((item) => isAppeal(item) && APPEAL_STATUSES_OPEN.has(item.status));
    if (activeView === "tickets") return requests.filter((item) => !isAppeal(item));
    if (activeView === "students") return requests.filter((item) => item.requesterRole === "Student" && !isAppeal(item));
    if (activeView === "teachers") return requests.filter((item) => item.requesterRole === "Teacher" && !isAppeal(item));
    if (activeView === "appeals") return requests.filter(isAppeal);
    if (activeView === "payments") return requests.filter((item) => isPayment(item) && !isAppeal(item));
    if (activeView === "assignments") return requests.filter((item) => !isAppeal(item));
    if (activeView === "messages") return requests.filter((item) => Array.isArray(item.responses) && item.responses.some((response) => response.type !== "internal_note"));
    return requests.filter((item) => !isAppeal(item));
  }, [activeView, moderationOnly, requests]);

  const filteredRequests = useMemo(() => {
    const query = search.trim().toLowerCase();
    return scopedRequests.filter((item) => {
      const role = String(item.requesterRole || "Unknown");
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
      const matchesPriority = priorityFilter === "all" || item.priority === priorityFilter;
      const matchesRole = roleFilter === "all" || role === roleFilter;
      const matchesAssigned = assignedFilter === "all" || (assignedFilter === "unassigned" ? !item.assignedStaff : item.assignedStaff === assignedFilter);
      const timestamp = new Date(item.createdAt || 0).getTime();
      const matchesFrom = !fromDate || (Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) >= fromDate);
      const matchesTo = !toDate || (Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) <= toDate);
      if (!(matchesStatus && matchesCategory && matchesPriority && matchesRole && matchesAssigned && matchesFrom && matchesTo)) return false;
      if (!query) return true;
      return [item.id, item.subject, item.description, item.requesterName, item.requesterEmail, role, item.category, item.priority, item.status, item.assignedStaff, item.relatedRecordId, item.appealType]
        .filter(Boolean).join(" ").toLowerCase().includes(query);
    }).sort((first, second) => new Date(second.updatedAt || second.createdAt || 0) - new Date(first.updatedAt || first.createdAt || 0));
  }, [assignedFilter, categoryFilter, fromDate, priorityFilter, roleFilter, scopedRequests, search, statusFilter, toDate]);

  const totalTickets = requests.filter((item) => !isAppeal(item)).length;
  const pendingTickets = requests.filter((item) => !isAppeal(item) && isPending(item)).length;
  const resolvedTickets = requests.filter((item) => !isAppeal(item) && (item.status === "Resolved" || (item.status === "Closed" && item.resolvedAt))).length;
  const totalAppeals = requests.filter(isAppeal).length;
  const totalRequests = requests.length;
  const openRequests = requests.filter(isPending).length;
  const inProgressTickets = requests.filter((item) => !isAppeal(item) && item.status === "In Progress").length;
  const unassigned = requests.filter((item) => !isAppeal(item) && isPending(item) && !item.assignedStaff);
  const urgent = requests.filter((item) => item.priority === "Urgent" && isPending(item));
  const recentTickets = requests.filter((item) => !isAppeal(item)).slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);
  const recentAppeals = requests.filter(isAppeal).slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);
  const categoryData = useMemo(() => {
    const counts = new Map();
    requests.forEach((item) => {
      const category = typeof item.category === "string" && item.category.trim()
        ? item.category.trim()
        : "Category not recorded";
      counts.set(category, (counts.get(category) || 0) + 1);
    });
    return [...counts.entries()].map(([category, count]) => ({ category, count }))
      .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));
  }, [requests]);
  const categoryColors = ["#7412bf", "#ffba08", "#ee3e5a", "#3589ef", "#17a84b", "#8d7ba0"];
  let categoryProgress = 0;
  const categoryStops = categoryData.map((item, index) => {
    const end = categoryProgress + (item.count / Math.max(1, totalRequests)) * 100;
    const stop = `${categoryColors[index % categoryColors.length]} ${categoryProgress}% ${end}%`;
    categoryProgress = end;
    return stop;
  }).join(", ");
  const categoryBackground = categoryData.length
    ? `conic-gradient(${categoryStops})`
    : "conic-gradient(#e9def4 0 100%)";
  const pageCount = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
  const visiblePage = Math.min(page, pageCount);
  const pageRequests = filteredRequests.slice((visiblePage - 1) * PAGE_SIZE, visiblePage * PAGE_SIZE);
  const assignedStaffOptions = [...new Set(requests.map((item) => item.assignedStaff).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  function openRequest(request) {
    setSelectedRequest(request);
    setAssignment(request.assignedStaff || "");
    setPriorityDraft(request.priority || "Medium");
    setDecisionReason(request.decisionReason || "");
    setResponseMessage("");
    setResponseError("");
    setFeedback(null);
  }

  function resetFilters() {
    setSearchInput(""); setSearch(""); setStatusFilter("all"); setCategoryFilter("all");
    setPriorityFilter("all"); setRoleFilter("all"); setAssignedFilter("all");
    setFromDate(""); setToDate(""); setPage(1);
  }

  function exportReport() {
    setFeedback(null);
    if (storeError) {
      setFeedback({ type: "error", message: storeError });
      return;
    }
    const records = activeView === "overview" ? requests : filteredRequests;
    if (!records.length) {
      setFeedback({ type: "info", message: "There are no saved support records to export." });
      return;
    }
    try {
      const columns = [
        { header: "Request ID", getValue: (item) => item.id },
        { header: "Requester", getValue: (item) => item.requesterName },
        { header: "Requester Email", getValue: (item) => item.requesterEmail },
        { header: "Role", getValue: (item) => item.requesterRole },
        { header: "Subject", getValue: (item) => item.subject },
        { header: "Category", getValue: (item) => item.category },
        { header: "Priority", getValue: (item) => item.priority },
        { header: "Assigned Staff", getValue: (item) => item.assignedStaff },
        { header: "Status", getValue: (item) => item.status },
        { header: "Created At", getValue: (item) => item.createdAt },
      ];
      downloadCsv("educonnect-support-requests.csv", createCsvContent(records, columns));
      setFeedback({ type: "success", message: `${records.length.toLocaleString()} saved support records exported.` });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "The saved support report could not be exported." });
    }
  }

  // MongoDB-backed admin actions run first; browser-local updates remain as fallback.
  async function callTicketApi(path, options) {
    return adminApiRequest(path, options);
  }

  async function refreshAfterTicketChange() {
    refreshRequests();
    await fetchBackendTickets();
  }

  function handleStatusChange(request, nextStatus) {
    if (["Accepted", "Rejected", "Closed"].includes(nextStatus)
      && !window.confirm(`Confirm changing ${request.id} to “${nextStatus}”?`)) return;
    const message = `${isAppeal(request) ? "Appeal" : "Ticket"} ${request.id} updated to ${nextStatus}.`;
    setFeedback(null);
    (async () => {
      try {
        await callTicketApi(`/admin/support/tickets/${encodeURIComponent(request.id)}/status`, { method: "PATCH", body: JSON.stringify({ status: nextStatus, reason: decisionReason }) });
        setFeedback({ type: "success", message });
        await refreshAfterTicketChange();
      } catch (error) {
        if (!error?.backendUnavailable) {
          setFeedback({ type: "error", message: error instanceof Error ? error.message : "Status could not be updated." });
          return;
        }
        try {
          updateAdminSupportRequestStatus(request.id, nextStatus, adminActor, decisionReason);
          setFeedback({ type: "success", message });
          refreshRequests();
        } catch (localError) {
          setFeedback({ type: "error", message: error instanceof Error ? error.message : localError instanceof Error ? localError.message : "Status could not be updated." });
        }
      }
    })();
  }

  function saveAssignment() {
    if (!selectedRequest) return;
    const message = assignment.trim() ? "Ticket assignment saved." : "Ticket is now unassigned.";
    (async () => {
      try {
        await callTicketApi(`/admin/support/tickets/${encodeURIComponent(selectedRequest.id)}/assign`, { method: "PATCH", body: JSON.stringify({ assignedStaff: assignment }) });
        setFeedback({ type: "success", message });
        await refreshAfterTicketChange();
      } catch (error) {
        if (!error?.backendUnavailable) {
          setFeedback({ type: "error", message: error instanceof Error ? error.message : "Assignment could not be saved." });
          return;
        }
        try {
          updateAdminSupportRequestAssignment(selectedRequest.id, assignment, adminActor);
          setFeedback({ type: "success", message });
          refreshRequests();
        } catch (localError) { setFeedback({ type: "error", message: error?.message || localError?.message || "Assignment could not be saved." }); }
      }
    })();
  }

  function savePriority() {
    if (!selectedRequest) return;
    const message = `Priority changed to ${priorityDraft}.`;
    (async () => {
      try {
        await callTicketApi(`/admin/support/tickets/${encodeURIComponent(selectedRequest.id)}/priority`, { method: "PATCH", body: JSON.stringify({ priority: priorityDraft }) });
        setFeedback({ type: "success", message });
        await refreshAfterTicketChange();
      } catch (error) {
        if (!error?.backendUnavailable) {
          setFeedback({ type: "error", message: error instanceof Error ? error.message : "Priority could not be changed." });
          return;
        }
        try {
          updateAdminSupportRequestPriority(selectedRequest.id, priorityDraft, adminActor);
          setFeedback({ type: "success", message });
          refreshRequests();
        } catch (localError) { setFeedback({ type: "error", message: error?.message || localError?.message || "Priority could not be changed." }); }
      }
    })();
  }

  function sendResponse(event) {
    event.preventDefault();
    if (!selectedRequest) return;
    setResponseError("");
    (async () => {
      const message = responseType === "internal_note" ? "Internal note saved for Admin." : "Reply sent to the requester.";
      try {
        await callTicketApi(`/admin/support/tickets/${encodeURIComponent(selectedRequest.id)}/replies`, { method: "POST", body: JSON.stringify({ message: responseMessage, type: responseType }) });
        setResponseMessage("");
        setFeedback({ type: "success", message });
        await refreshAfterTicketChange();
      } catch (error) {
        if (!error?.backendUnavailable) {
          setResponseError(error instanceof Error ? error.message : "Reply could not be sent.");
          return;
        }
        try {
          addAdminSupportResponse(selectedRequest.id, { message: responseMessage, type: responseType, author: adminActor, actor: adminActor, authorRole: "Admin" });
          setResponseMessage("");
          setFeedback({ type: "success", message });
          refreshRequests();
        } catch (localError) { setResponseError(error instanceof Error ? error.message : localError instanceof Error ? localError.message : "Reply could not be sent."); }
      }
    })();
  }

  function saveFaq(event) {
    event.preventDefault();
    setFaqFormError("");
    try {
      setFaqs(saveAdminHelpFaq(faqDraft, adminActor));
      setFaqDraft({ id: "", category: SUPPORT_FAQ_CATEGORIES[0], question: "", answer: "", published: true });
      setFeedback({ type: "success", message: "FAQ saved." });
    } catch (error) { setFaqFormError(error instanceof Error ? error.message : "FAQ could not be saved."); }
  }

  function toggleFaq(faq) {
    try { setFaqs(saveAdminHelpFaq({ ...faq, published: faq.published === false }, adminActor)); }
    catch (error) { setFeedback({ type: "error", message: error.message || "FAQ status could not be changed." }); }
  }

  function removeFaq(faq) {
    if (!window.confirm(`Delete FAQ “${faq.question}”?`)) return;
    try { setFaqs(deleteAdminHelpFaq(faq.id, adminActor)); setFeedback({ type: "success", message: "FAQ deleted." }); }
    catch (error) { setFeedback({ type: "error", message: error.message || "FAQ could not be deleted." }); }
  }

  const visibleFaqs = faqs.filter((faq) => (faqCategory === "all" || faq.category === faqCategory)
    && `${faq.category} ${faq.question} ${faq.answer}`.toLowerCase().includes(faqSearch.trim().toLowerCase()));

  const resolutionHours = requests.filter((item) => !isAppeal(item) && (item.status === "Resolved" || (item.status === "Closed" && item.resolvedAt))).map((item) => {
    const start = new Date(item.createdAt || 0).getTime();
    const end = new Date(item.resolvedAt || item.updatedAt || 0).getTime();
    return start > 0 && end >= start ? (end - start) / 3600000 : null;
  }).filter((value) => value !== null);
  const averageHours = resolutionHours.length ? resolutionHours.reduce((sum, value) => sum + value, 0) / resolutionHours.length : null;
  const now = reportNow.getTime();
  const dayStart = new Date(reportNow); dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(reportNow); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const ticketDates = requests.filter((item) => !isAppeal(item)).map((item) => new Date(item.createdAt || 0).getTime());
  const dailyTickets = ticketDates.filter((date) => date >= dayStart.getTime()).length;
  const weeklyTickets = ticketDates.filter((date) => date >= weekStart.getTime()).length;
  const monthlyTickets = ticketDates.filter((date) => date >= monthStart.getTime()).length;
  const commonCategories = categoryData.filter((item) => item.category !== "Moderation & Appeal").slice(0, 5);
  const maxCommonCategory = Math.max(1, ...commonCategories.map((item) => item.count));
  const appealAccepted = requests.filter((item) => isAppeal(item) && item.status === "Accepted").length;
  const appealRejected = requests.filter((item) => isAppeal(item) && item.status === "Rejected").length;
  const workload = assignedStaffOptions.map((staff) => ({ staff, count: requests.filter((item) => item.assignedStaff === staff && isPending(item)).length }));
  const activePrimaryTab = activeView === "overview"
    ? "overview"
    : activeView === "appeals" || activeView === "open-appeals"
      ? "appeals"
      : activeView === "reports"
        ? "reports"
        : activeView === "faqs"
          ? "faqs"
          : "tickets";

  return (
    <section className="edc-admin-support-moderation edc-admin-support-workspace">
      {!moderationOnly && !detailPage ? (
        <>
          <header className="edc-admin-support-reference-heading">
            <div>
              <span className="edc-admin-page-eyebrow">CUSTOMER CARE &amp; RESOLUTION</span>
              <h2><LifeBuoy aria-hidden="true" />Support &amp; Appeals</h2>
              <p>Review saved support requests, appeals, and response activity from this browser.</p>
            </div>
            <div className="edc-admin-support-reference-actions">
              <button type="button" className="edc-admin-action-button" disabled={Boolean(storeError) || !requests.length} onClick={exportReport}>
                <Download size={15} aria-hidden="true" />Export Report
              </button>
              <button type="button" className="edc-admin-button-primary" onClick={() => { setActiveView("reports"); setPage(1); }}>
                <Clock3 size={15} aria-hidden="true" />SLA &amp; Escalation
              </button>
            </div>
          </header>
          <p className="edc-admin-support-reference-note">
            Request counts use saved browser records. Satisfaction scores and SLA compliance are not collected because no rating or SLA target source is configured.
          </p>
        </>
      ) : (
        <div className="edc-admin-security-notice edc-admin-support-notice">
          <LifeBuoy size={17} aria-hidden="true" />
          <div><strong>Support &amp; Appeals</strong><p>Requests, replies, and appeal decisions are stored in this browser. Internal notes remain in this Admin workspace; cross-device support requires a backend.</p></div>
        </div>
      )}

      {feedback && <p className={`edc-admin-feedback edc-admin-feedback-${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>{feedback.message}</p>}
      {apiError && <p className="edc-admin-feedback edc-admin-feedback-error" role="status"><AlertTriangle size={15} /> {apiSource === "fallback" ? `MongoDB support tickets are unavailable: ${apiError} Browser records are shown.` : apiError}</p>}
      {storeError && <p className="edc-admin-feedback edc-admin-feedback-error" role="alert"><AlertTriangle size={15} /> {storeError} Existing data was preserved.</p>}

      {detailPage && <Link className="edc-admin-support-back" to="/admin/support"><ArrowLeft size={15} /> Back to Support Overview</Link>}

      {!moderationOnly && !detailPage && <div className="edc-admin-support-stat-grid" aria-label="Support overview">
        {[
          { label: "Total Requests", value: storeError ? "—" : totalRequests.toLocaleString(), icon: MessageSquare, color: "purple", view: "overview", status: "all" },
          { label: "Open Requests", value: storeError ? "—" : openRequests.toLocaleString(), icon: Clock3, color: "orange", view: "pending", status: "all" },
          { label: "Resolved Tickets", value: storeError ? "—" : resolvedTickets.toLocaleString(), icon: CheckCircle2, color: "green", view: "resolved", status: "all" },
          { label: "Appeals", value: storeError ? "—" : totalAppeals.toLocaleString(), icon: ShieldAlert, color: "red", view: "appeals", status: "all" },
          { label: "In Progress", value: storeError ? "—" : inProgressTickets.toLocaleString(), icon: Users, color: "violet", view: "tickets", status: "In Progress" },
          { label: "Satisfaction", value: "No ratings", icon: AlertTriangle, color: "purple", view: "reports", status: "all" },
        ].map(({ label, value, icon: Icon, color, view, status }) => (
          <button
            className={`edc-admin-support-reference-stat ${color} edc-admin-metric-card edc-admin-metric-${color}${activeView === view && statusFilter === status ? " is-active" : ""}`}
            key={label}
            type="button"
            aria-pressed={activeView === view && statusFilter === status}
            onClick={() => { setActiveView(view); setStatusFilter(status); setPage(1); }}
          >
            <span><Icon size={20} aria-hidden="true" /></span><div><p>{label}</p><strong>{value}</strong></div>
          </button>
        ))}
      </div>}

      {!moderationOnly && !detailPage && <nav className="edc-admin-support-tabs" aria-label="Support and appeals sections">
        {TABS.map(([id, label, Icon]) => {
          const count = id === "overview" ? totalRequests : id === "tickets" ? totalTickets : id === "appeals" ? totalAppeals : null;
          return <button type="button" key={id} className={activePrimaryTab === id ? "active" : ""} onClick={() => { setActiveView(id); setPage(1); setFeedback(null); }} aria-current={activePrimaryTab === id ? "page" : undefined}><Icon size={15} />{label}{count !== null && <span>({storeError ? "—" : count.toLocaleString()})</span>}</button>;
        })}
      </nav>}

      {!moderationOnly && !detailPage && activePrimaryTab === "tickets" && <nav className="edc-admin-support-subtabs" aria-label="Support ticket filters">
        {REQUEST_SUBVIEWS.map(([id, label, Icon]) => <button type="button" key={id} className={activeView === id ? "active" : ""} onClick={() => { setActiveView(id); setPage(1); }} aria-pressed={activeView === id}><Icon size={13} />{label}</button>)}
      </nav>}

      {activeView === "overview" && <>
        <div className="edc-admin-support-reference-grid">
          <main className="edc-admin-support-reference-main">
            <section className="edc-admin-support-reference-card">
              <header><h3><LifeBuoy size={17} aria-hidden="true" />Recent Support Tickets</h3><button type="button" onClick={() => setActiveView("tickets")}>View All Tickets <ArrowRight size={14} /></button></header>
              <SupportOverviewTable rows={recentTickets} type="ticket" error={storeError} onOpen={openRequest} />
            </section>
            <section className="edc-admin-support-reference-card">
              <header><h3><ShieldAlert size={17} aria-hidden="true" />Recent Appeal Requests</h3><button type="button" onClick={() => setActiveView("appeals")}>View All Appeals <ArrowRight size={14} /></button></header>
              <SupportOverviewTable rows={recentAppeals} type="appeal" error={storeError} onOpen={openRequest} />
            </section>
          </main>
          <aside className="edc-admin-support-reference-sidebar">
            <section className="edc-admin-support-reference-card">
              <header><h3><FileText size={17} aria-hidden="true" />Requests by Category</h3></header>
              {storeError ? <div className="edc-admin-support-empty-state" role="alert"><AlertTriangle size={18} /><p>Category totals are unavailable while saved requests cannot be read.</p></div> : categoryData.length ? (
                <div className="edc-admin-support-category-overview">
                  <div className="edc-admin-support-category-donut" style={{ background: categoryBackground }} role="img" aria-label={`${totalRequests} saved requests by category`}>
                    <span><strong>{totalRequests.toLocaleString()}</strong><small>Total</small></span>
                  </div>
                  <div className="edc-admin-support-category-legend">
                    {categoryData.slice(0, 6).map((item, index) => (
                      <div key={item.category}><i style={{ backgroundColor: categoryColors[index % categoryColors.length] }} /><span>{item.category}</span><strong>{item.count.toLocaleString()}</strong></div>
                    ))}
                    {categoryData.length > 6 && <p>Showing 6 of {categoryData.length} saved categories.</p>}
                  </div>
                </div>
              ) : <div className="edc-admin-support-empty-state"><FileText size={18} /><p>No saved requests are available for category totals.</p></div>}
            </section>
            <section className="edc-admin-support-reference-card">
              <header><h3><Clock3 size={17} aria-hidden="true" />SLA &amp; Escalation</h3></header>
              <dl className="edc-admin-support-sla-list">
                <div><dt>Pending tickets</dt><dd>{storeError ? "—" : pendingTickets.toLocaleString()}</dd></div>
                <div><dt>Unassigned open tickets</dt><dd>{storeError ? "—" : unassigned.length.toLocaleString()}</dd></div>
                <div><dt>Open urgent requests</dt><dd>{storeError ? "—" : urgent.length.toLocaleString()}</dd></div>
                <div><dt>Average recorded resolution</dt><dd>{storeError ? "—" : averageHours === null ? "Not available" : `${averageHours.toFixed(1)} h`}</dd></div>
                <div><dt>SLA compliance</dt><dd>Unavailable</dd></div>
              </dl>
              <p className="edc-admin-support-reference-caption">No saved SLA targets or satisfaction ratings exist in this app.</p>
            </section>
            <section className="edc-admin-support-reference-card">
              <header><h3><CheckCircle2 size={17} aria-hidden="true" />Quick Actions</h3></header>
              <div className="edc-admin-support-quick-actions">
                <button type="button" onClick={() => setActiveView("tickets")}><MessageSquare size={14} />Support Tickets</button>
                <button type="button" onClick={() => setActiveView("appeals")}><ShieldAlert size={14} />Review Appeals</button>
                <button type="button" onClick={() => { resetFilters(); setPriorityFilter("Urgent"); setActiveView("tickets"); }}><AlertTriangle size={14} />Urgent Requests</button>
                <button type="button" onClick={() => setActiveView("faqs")}><BookOpen size={14} />Help Center</button>
              </div>
            </section>
          </aside>
        </div>
      </>}

      {!["overview", "faqs", "reports"].includes(activeView) && <>
        {activeView === "payments" && <div className="edc-admin-security-notice edc-admin-support-notice"><CreditCard size={16} /><p>Payment Support records payment questions only. Verification, refund approval and transaction changes stay in the existing Financial Management workflow; this page never transfers or refunds money.</p></div>}
        <form className="edc-admin-support-filters" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(1); }}>
          <label className="edc-admin-support-search"><span>Search tickets &amp; appeals</span><div><Search size={15} /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="ID, person, title, appeal or related record" /></div></label>
          <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{ALL_REQUEST_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label>Category<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">All categories</option>{SUPPORT_REQUEST_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label>Priority<select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">All priorities</option>{SUPPORT_REQUEST_PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
          <label>User role<select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">All roles</option><option>Student</option><option>Teacher</option><option>User</option><option>Unknown</option></select></label>
          <label>Assigned staff<select value={assignedFilter} onChange={(event) => setAssignedFilter(event.target.value)}><option value="all">All assignments</option><option value="unassigned">Unassigned</option>{assignedStaffOptions.map((staff) => <option key={staff}>{staff}</option>)}</select></label>
          <label>From<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
          <label>To<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
          <div className="edc-admin-support-filter-actions"><button className="edc-admin-action-button" type="submit"><Search size={14} /> Search / Apply Filters</button><button className="edc-admin-action-button" type="button" onClick={resetFilters}><RotateCcw size={14} /> Clear Filters</button><button className="edc-admin-action-button" type="button" onClick={fetchBackendTickets}><Filter size={14} /> Refresh</button></div>
        </form>
        {storeError ? <div className="edc-admin-applications-empty edc-admin-support-empty" role="alert"><AlertTriangle size={23} /><h3>Saved support records unavailable</h3><p>Fix the browser storage error above before relying on request totals.</p></div> : filteredRequests.length ? <div className="edc-admin-table-wrap"><table className="edc-admin-applications-table edc-admin-support-table"><thead><tr><th>Ticket / Appeal ID</th><th>Requester</th><th>Title</th><th>Category</th><th>Priority</th><th>Assigned Staff</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>{pageRequests.map((item) => <tr key={item.id}>
          <td><code>{item.id}</code></td><td><strong>{item.requesterName || "User"}</strong><small>{item.requesterRole || "Role unknown"} · {item.requesterEmail || "Email unavailable"}</small></td><td><strong>{item.subject}</strong>{item.relatedRecordId && <small>Related: {item.relatedRecordId}</small>}</td><td><span className="edc-admin-activity-tag">{item.category}</span></td><td><span className={`edc-admin-status-badge ${priorityClass(item.priority)}`}>{item.priority || "Medium"}</span></td><td>{item.assignedStaff || <span className="edc-admin-muted">Unassigned</span>}</td><td><span className={`edc-admin-status-badge ${badgeClass(item.status)}`}>{item.status}</span></td><td>{formatTimestamp(item.createdAt)}</td><td><button className="edc-admin-action-button" type="button" onClick={() => openRequest(item)}><Eye size={14} /> View Details</button></td>
        </tr>)}</tbody></table></div> : <div className="edc-admin-applications-empty edc-admin-support-empty"><LifeBuoy size={23} /><h3>{scopedRequests.length ? "No matching records" : "No support records yet"}</h3><p>{scopedRequests.length ? "Clear or change filters to see other saved records." : "Student and Teacher requests appear here after they submit a support ticket. No sample tickets are added."}</p></div>}
        <div className="edc-admin-activity-pagination"><p>Showing {filteredRequests.length ? (visiblePage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(visiblePage * PAGE_SIZE, filteredRequests.length)} of {filteredRequests.length} record{filteredRequests.length === 1 ? "" : "s"}</p><div><button className="edc-admin-filter-button" type="button" disabled={visiblePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><span>Page {visiblePage} of {pageCount}</span><button className="edc-admin-filter-button" type="button" disabled={visiblePage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button></div></div>
      </>}

      {activeView === "faqs" && <section className="edc-admin-support-faqs">
        <section className="edc-admin-panel"><header><div><h3>{faqDraft.id ? "Edit FAQ" : "Add FAQ"}</h3><p>Published FAQs appear in the public Help Center and Student/Teacher Help &amp; Support.</p></div></header>
          <form className="edc-admin-support-faq-form" onSubmit={saveFaq}><label>Category<select value={faqDraft.category} onChange={(event) => setFaqDraft({ ...faqDraft, category: event.target.value })}>{SUPPORT_FAQ_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label><label>Question<input required minLength={5} maxLength={240} value={faqDraft.question} onChange={(event) => setFaqDraft({ ...faqDraft, question: event.target.value })} /></label><label>Answer<textarea required minLength={5} maxLength={5000} rows={4} value={faqDraft.answer} onChange={(event) => setFaqDraft({ ...faqDraft, answer: event.target.value })} /></label>{faqFormError && <p className="edc-admin-feedback edc-admin-feedback-error" role="alert">{faqFormError}</p>}<div className="edc-admin-support-filter-actions"><button className="edc-admin-settings-save" type="submit"><Plus size={14} /> Save FAQ</button>{faqDraft.id && <button className="edc-admin-action-button" type="button" onClick={() => { setFaqDraft({ id: "", category: SUPPORT_FAQ_CATEGORIES[0], question: "", answer: "", published: true }); setFaqFormError(""); }}>Cancel Edit</button>}</div></form>
        </section>
        <section className="edc-admin-panel"><header><div><h3>Help Center FAQs ({faqs.length})</h3><p>Search, filter, publish, edit or remove an FAQ.</p></div></header><div className="edc-admin-support-faq-filters"><label>Search<input type="search" value={faqSearch} onChange={(event) => setFaqSearch(event.target.value)} placeholder="Search FAQ question or answer" /></label><label>Category<select value={faqCategory} onChange={(event) => setFaqCategory(event.target.value)}><option value="all">All categories</option>{SUPPORT_FAQ_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label></div>
          {faqError && <p className="edc-admin-feedback edc-admin-feedback-error" role="alert">{faqError}</p>}{visibleFaqs.length ? visibleFaqs.map((faq) => <article className="edc-admin-support-faq-row" key={faq.id}><div><span className="edc-admin-activity-tag">{faq.category}</span><span className={`edc-admin-status-badge ${faq.published === false ? "edc-admin-status-unknown" : "edc-admin-status-approved"}`}>{faq.published === false ? "Unpublished" : "Published"}</span><h4>{faq.question}</h4><p>{faq.answer}</p></div><div><button className="edc-admin-action-button" type="button" onClick={() => { setFaqDraft({ ...faq }); setFaqFormError(""); }}><Eye size={14} /> Edit</button><button className="edc-admin-action-button" type="button" onClick={() => toggleFaq(faq)}>{faq.published === false ? "Publish" : "Unpublish"}</button><button className="edc-admin-action-button edc-admin-danger-button" type="button" onClick={() => removeFaq(faq)}><Trash2 size={14} /> Delete</button></div></article>) : <p className="edc-admin-support-empty">No FAQs match these filters.</p>}
        </section>
      </section>}

      {activeView === "reports" && <section className="edc-admin-support-reports">
        <div className="edc-admin-security-notice edc-admin-support-notice"><Clock3 size={16} /><p>No SLA targets or satisfaction survey records are configured. The values below are workload and recorded-resolution summaries only, not SLA compliance scores.</p></div>
        <section className="edc-admin-support-report-cards">{[["Tickets today", storeError ? "—" : dailyTickets], ["Tickets last 7 days", storeError ? "—" : weeklyTickets], ["Tickets this month", storeError ? "—" : monthlyTickets], ["Average recorded resolution", storeError ? "—" : averageHours === null ? "Not available" : `${averageHours.toFixed(1)} h`], ["Pending tickets", storeError ? "—" : pendingTickets], ["Urgent pending requests", storeError ? "—" : urgent.length], ["Appeals accepted", storeError ? "—" : appealAccepted], ["Appeals rejected", storeError ? "—" : appealRejected]].map(([label, value]) => <article className="edc-admin-panel" key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
        <div className="edc-admin-support-overview-grid"><section className="edc-admin-panel"><h3>Most Common Problems</h3>{storeError ? <p className="edc-admin-support-empty">Category totals are unavailable while saved requests cannot be read.</p> : commonCategories.length ? commonCategories.map((item) => <div className="edc-admin-support-category-chart" key={item.category}><div className="edc-admin-support-report-row"><span>{item.category}</span><strong>{item.count}</strong></div><div className="edc-admin-support-bar-track"><span style={{ width: `${(item.count / maxCommonCategory) * 100}%` }} /></div></div>) : <p className="edc-admin-support-empty">No saved ticket data yet.</p>}</section><section className="edc-admin-panel"><h3>Staff Workload</h3>{storeError ? <p className="edc-admin-support-empty">Staff workload is unavailable while saved requests cannot be read.</p> : workload.length ? workload.map((item) => <div className="edc-admin-support-report-row" key={item.staff}><span>{item.staff}</span><strong>{item.count} open</strong></div>) : <p className="edc-admin-support-empty">No staff assignments recorded.</p>}</section></div>
      </section>}

      {selectedRequest && <div className="edc-admin-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedRequest(null)}><section className="edc-admin-details-modal edc-admin-support-modal edc-admin-support-detail" role="dialog" aria-modal="true" aria-labelledby="support-detail-title">
        <header className="edc-admin-details-header"><div><span className="edc-admin-page-eyebrow">{isAppeal(selectedRequest) ? "APPEAL REVIEW" : "SUPPORT TICKET"}</span><h3 id="support-detail-title">{selectedRequest.subject}</h3><span className="edc-admin-support-id-tag">{selectedRequest.id}</span></div><button type="button" className="edc-admin-modal-close" onClick={() => setSelectedRequest(null)} aria-label="Close"><X size={17} /></button></header>
        {feedback && <p className={`edc-admin-feedback edc-admin-feedback-${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>{feedback.message}</p>}
        <dl className="edc-admin-details-list"><div><dt>Requester</dt><dd>{selectedRequest.requesterName} · {selectedRequest.requesterRole || "Role not recorded"} · {selectedRequest.requesterEmail}</dd></div><div><dt>User ID</dt><dd>{selectedRequest.requesterId || selectedRequest.requesterEmail || "Not recorded"}</dd></div><div><dt>Submitted</dt><dd>{formatTimestamp(selectedRequest.createdAt)}</dd></div><div><dt>Last updated</dt><dd>{formatTimestamp(selectedRequest.updatedAt)}</dd></div><div><dt>Category / priority</dt><dd>{selectedRequest.category} · {selectedRequest.priority}</dd></div><div><dt>Status / assigned staff</dt><dd>{selectedRequest.status} · {selectedRequest.assignedStaff || "Unassigned"}</dd></div>{selectedRequest.assignedBy && <div><dt>Assigned by</dt><dd>{selectedRequest.assignedBy} · {formatTimestamp(selectedRequest.assignedAt)}</dd></div>}{selectedRequest.relatedRecordId && <div><dt>Related record</dt><dd>{selectedRequest.relatedRecordTitle || "Record"} · {selectedRequest.relatedRecordId}</dd></div>}{selectedRequest.appealType && <div><dt>Appeal type / original decision</dt><dd>{selectedRequest.appealType} · {selectedRequest.originalDecision || "Not recorded"}</dd></div>}{selectedRequest.decisionReason && <div><dt>Appeal decision reason</dt><dd>{selectedRequest.decisionReason}</dd></div>}{selectedRequest.moderationReportId && <div><dt>Moderation report</dt><dd>{selectedRequest.moderationReportId}</dd></div>}</dl>
        <div className="edc-admin-support-desc-box"><span className="edc-admin-support-box-label">{isAppeal(selectedRequest) ? "Appeal reason and details" : "Problem description"}</span><p>{selectedRequest.description}</p>{selectedRequest.attachment?.dataUrl && <a href={selectedRequest.attachment.dataUrl} download={selectedRequest.attachment.name} target="_blank" rel="noreferrer">View attachment: {selectedRequest.attachment.name}</a>}</div>
        {isAppeal(selectedRequest) && <div className="edc-admin-security-notice"><ShieldAlert size={15} /><p>Accepting an appeal records the decision only. Rejected courses, books or accounts are not automatically published or restored; complete the existing approval or governance workflow separately.</p></div>}
        <section className="edc-admin-support-admin-controls"><h4>Assignment &amp; priority</h4><div><label>Assign / reassign staff<input value={assignment} onChange={(event) => setAssignment(event.target.value)} maxLength={160} placeholder="Staff name or email" /></label><button className="edc-admin-action-button" type="button" onClick={saveAssignment}>Save Assignment</button><label>Priority<select value={priorityDraft} onChange={(event) => setPriorityDraft(event.target.value)}>{SUPPORT_REQUEST_PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></label><button className="edc-admin-action-button" type="button" onClick={savePriority}>Save Priority</button></div></section>
        {isAppeal(selectedRequest) && <label className="edc-admin-support-decision-reason">Decision reason (required for accept/reject)<textarea rows={3} maxLength={2000} value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} placeholder="Explain the appeal decision for the requester." /></label>}
        <section className="edc-admin-support-status-section"><h4>Update Status</h4><div className="edc-admin-support-status-buttons">{(isAppeal(selectedRequest) ? MODERATION_APPEAL_STATUSES : SUPPORT_REQUEST_STATUSES).map((status) => <button key={status} className={`edc-admin-action-button ${selectedRequest.status === status ? "edc-admin-support-status-btn-active" : ""}`} type="button" disabled={selectedRequest.status === status} onClick={() => handleStatusChange(selectedRequest, status)}>{status === "Resolved" || status === "Accepted" ? <CheckCircle2 size={13} /> : status === "Rejected" ? <AlertTriangle size={13} /> : status === "Closed" ? <Lock size={13} /> : null}{status}</button>)}</div></section>
        <section className="edc-admin-support-thread-section"><h4>Messages &amp; Internal Notes ({(selectedRequest.responses || []).length})</h4>{selectedRequest.responses?.length ? <div className="edc-admin-support-thread-list">{selectedRequest.responses.map((response) => <article key={response.id} className={`edc-admin-support-thread-item ${response.type === "internal_note" ? "edc-admin-support-thread-internal" : "edc-admin-support-thread-response"}`}><header><span><strong>{response.author || "User"}</strong> · {response.authorRole || (response.type === "internal_note" ? "Admin note" : "User")}</span><time>{formatTimestamp(response.createdAt)}</time></header><p>{response.message}</p></article>)}</div> : <p className="edc-admin-support-empty">No messages have been sent.</p>}
          <form onSubmit={sendResponse}><div className="edc-admin-support-response-type-row"><label><input type="radio" name="support-response-type" checked={responseType === "response"} onChange={() => setResponseType("response")} /> Public reply</label><label><input type="radio" name="support-response-type" checked={responseType === "internal_note"} onChange={() => setResponseType("internal_note")} /> Internal Admin note</label></div><textarea rows={3} required minLength={2} maxLength={5000} value={responseMessage} onChange={(event) => setResponseMessage(event.target.value)} placeholder={responseType === "internal_note" ? "Private note for Admin staff" : "Write a reply to the requester"} />{responseError && <p className="edc-admin-feedback edc-admin-feedback-error" role="alert">{responseError}</p>}<button type="submit" className="edc-admin-settings-save"><Send size={14} /> {responseType === "internal_note" ? "Save Internal Note" : "Send Reply"}</button></form>
        </section>
      </section></div>}
    </section>
  );
}

export default AdminSupportModeration;

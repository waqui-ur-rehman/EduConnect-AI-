import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Activity,
  AlertTriangle,
  Clock3,
  Database,
  Download,
  Eye,
  Filter,
  History,
  LogIn,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  ADMIN_ACTIVITY_CATEGORY_LABELS,
  ADMIN_DATA_CHANGED_EVENT,
  appendAdminActivityRecord,
  getAdminActivityLog,
} from "./adminData";
import { createCsvContent, downloadCsv } from "./adminCsvUtils";
import { apiFetch } from "../../utils/api";

const PAGE_SIZE = 15;
const ALL_FILTERS = {
  from: "",
  to: "",
  module: "all",
  action: "all",
  role: "all",
  status: "all",
};

const AUDIT_TABS = [
  ["all", "Activity Logs", Activity],
  ["login", "Login Logs", LogIn],
  ["system", "System Logs", Database],
  ["changes", "Change History", History],
  ["data-access", "Data Access Logs", ShieldCheck],
];

const MODULE_LABELS = {
  "teacher-applications": "Teacher Applications",
  "course-review": "Course Review",
  "book-approvals": "Course & Books",
  "user-management": "User Management",
  "user-activity": "User Management",
  security: "Security & Access",
  "financial-management": "Financial Management",
  "admin-settings": "Settings & Configuration",
  "data-export": "Data Export",
  "ai-knowledge": "AI Knowledge Governance",
  "data-import": "Data Import",
  "ai-operations": "AI Operations",
  support: "Support & Moderation",
  moderation: "Moderation & Governance",
  "tutor-marketplace": "Tutor Marketplace",
};

function formatTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return "Not provided";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function localDateKey(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRecordModule(record) {
  if (typeof record?.module === "string" && record.module.trim()) {
    return record.module.trim();
  }
  const category = String(record?.category || "");
  return MODULE_LABELS[category] || ADMIN_ACTIVITY_CATEGORY_LABELS[category] || category || "General";
}

function getRecordAction(record) {
  const action = String(record?.action || "Unknown action").replaceAll("_", " ").trim();
  const normalized = action.toLowerCase();
  if (record?.category === "teacher-applications" && ["approved", "rejected"].includes(normalized)) {
    return `Teacher application ${normalized}`;
  }
  if (record?.category === "course-review" && ["approved", "rejected", "suspended"].includes(normalized)) {
    return `Course ${normalized}`;
  }
  if (record?.category === "book-approvals" && ["approved", "rejected", "published", "unpublished"].includes(normalized)) {
    return `Book ${normalized}`;
  }
  return action.charAt(0).toUpperCase() + action.slice(1);
}

function getRecordRole(record) {
  const role = record?.actorRole || record?.userRole || "Admin";
  return typeof role === "string" && role.trim() ? role.trim() : "Admin";
}

function getRecordStatus(record) {
  const status = record?.status ?? record?.result;
  return typeof status === "string" && status.trim() ? status.trim() : "Unknown";
}

function isLoginRecord(record) {
  return record.category === "security"
    && record.entityType === "Admin Session"
    && ["Admin Login", "Admin Login Failed"].includes(record.action);
}

function isConfigurationRecord(record) {
  return record.category === "admin-settings"
    || (record.category === "security" && /policy/i.test(String(record.entityType || "")));
}

function isImportExportRecord(record) {
  return ["data-import", "data-export"].includes(record.category);
}

function isChangeRecord(record) {
  return record.previousValue !== undefined || record.newValue !== undefined;
}

function safeDisplayValue(value, fieldName = "") {
  if (/password|otp|token|api.?key|secret|credential|cvv|card.?number/i.test(fieldName)) {
    return "Hidden for security";
  }
  if (typeof value === "string") {
    return value
      .replace(/(password|otp|token|api.?key|secret|credential|cvv)\s*[:=]\s*[^,;\s]+/gi, "$1: [hidden]")
      .slice(0, 1200);
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean")
      .map((item) => String(item).slice(0, 160))
      .join(", ")
      .slice(0, 1200);
  }
  return "";
}

function recordDetails(record) {
  const relatedId = record.targetId ?? record.entityId;
  const fields = [
    ["Log ID", record.id],
    ["Action Name", getRecordAction(record)],
    ["Performed By", record.actor],
    ["Actor ID", record.actorId],
    ["User Role", getRecordRole(record)],
    ["Date & Time", formatTimestamp(record.timestamp)],
    ["Module", getRecordModule(record)],
    ["Related Record ID", relatedId],
    ["Previous Value", record.previousValue],
    ["New Value", record.newValue],
    ["Action Status", getRecordStatus(record)],
    ["Reason", record.reason],
    ["Description", record.description],
  ];

  return fields
    .map(([label, value]) => [label, safeDisplayValue(value, label)])
    .filter(([, value]) => value !== "");
}

function normalizeAuditLog(log) {
  const record = {
    id: log.id || `backend-${String(log.timestamp || new Date().toISOString())}-${Math.random().toString(36).slice(2, 8)}`,
    actor: log.actor || "",
    actorRole: log.actorRole || "Admin",
    actorId: log.actorId || undefined,
    action: log.action || "Unknown action",
    category: log.category || "security",
    module: log.module || ADMIN_ACTIVITY_CATEGORY_LABELS[log.category] || log.category || "General",
    entityType: log.entityType || "",
    entityId: log.entityId || "",
    targetId: log.targetId || "",
    targetName: log.targetName || "",
    result: log.result || "Success",
    description: log.description || "",
    details: log.details || null,
    timestamp: log.timestamp || log.createdAt || new Date().toISOString(),
    status: log.result || "Success",
  };
  if (log.details && typeof log.details === "object") {
    if (log.details.before !== undefined) record.previousValue = JSON.stringify(log.details.before);
    if (log.details.after !== undefined) record.newValue = JSON.stringify(log.details.after);
  }
  return record;
}

function AdminActivityLog() {
  const [activityState, setActivityState] = useState(getAdminActivityLog);
  const [backendRecords, setBackendRecords] = useState([]);
  const records = useMemo(() => {
    const known = new Set(backendRecords.map((record) => record.id));
    const merged = [...backendRecords, ...activityState.records.filter((record) => !known.has(record.id))];
    merged.sort((first, second) => new Date(second.timestamp || 0).getTime() - new Date(first.timestamp || 0).getTime());
    return merged;
  }, [activityState.records, backendRecords]);
  const error = activityState.error || "";
  const [search, setSearch] = useState("");
  const [filterDraft, setFilterDraft] = useState(ALL_FILTERS);
  const [filters, setFilters] = useState(ALL_FILTERS);
  const [activeTab, setActiveTab] = useState("all");
  const [overviewFilter, setOverviewFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const loadBackendAuditLogs = async () => {
    try {
      const response = await apiFetch("/admin/audit-logs?limit=100", { method: "GET" });
      if (!response.ok) throw Object.assign(new Error((await response.json().catch(() => ({}))).message || "Audit logs could not be loaded from the backend."), { status: response.status });
      const data = await response.json();
      setBackendRecords((data.logs || []).map(normalizeAuditLog));
    } catch { /* Backend audit log is optional: browser records still display. */ }
  };

  useEffect(() => {
    function refreshRecords() {
      setActivityState(getAdminActivityLog());
    }
    refreshRecords();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBackendAuditLogs();
    window.addEventListener("storage", refreshRecords);
    window.addEventListener(ADMIN_DATA_CHANGED_EVENT, refreshRecords);
    window.addEventListener(ADMIN_DATA_CHANGED_EVENT, loadBackendAuditLogs);
    return () => {
      window.removeEventListener("storage", refreshRecords);
      window.removeEventListener(ADMIN_DATA_CHANGED_EVENT, refreshRecords);
      window.removeEventListener(ADMIN_DATA_CHANGED_EVENT, loadBackendAuditLogs);
    };
  }, []);

  const options = useMemo(() => {
    const unique = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return {
      modules: unique(records.map(getRecordModule)),
      actions: unique(records.map(getRecordAction)),
      roles: unique(records.map(getRecordRole)),
      statuses: unique(records.map(getRecordStatus)),
    };
  }, [records]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...records]
      .sort((first, second) => new Date(second.timestamp || 0).getTime() - new Date(first.timestamp || 0).getTime())
      .filter((record) => {
        const module = getRecordModule(record);
        const action = getRecordAction(record);
        const role = getRecordRole(record);
        const status = getRecordStatus(record);
        const date = localDateKey(record.timestamp);
        if (activeTab === "login" && !isLoginRecord(record)) return false;
        if (activeTab === "system" && record.category !== "system") return false;
        if (activeTab === "changes" && !isChangeRecord(record)) return false;
        if (activeTab === "data-access" && record.category !== "data-access") return false;
        if (overviewFilter === "admins" && role.toLowerCase() !== "admin") return false;
        if (overviewFilter === "logins" && !isLoginRecord(record)) return false;
        if (overviewFilter === "security" && record.category !== "security") return false;
        if (overviewFilter === "configuration" && !isConfigurationRecord(record)) return false;
        if (overviewFilter === "transfers" && !isImportExportRecord(record)) return false;
        if (filters.module !== "all" && module !== filters.module) return false;
        if (filters.action !== "all" && action !== filters.action) return false;
        if (filters.role !== "all" && role !== filters.role) return false;
        if (filters.status !== "all" && status !== filters.status) return false;
        if (filters.from && (!date || date < filters.from)) return false;
        if (filters.to && (!date || date > filters.to)) return false;
        if (!query) return true;

        const searchableText = [
          record.id,
          record.actor,
          record.actorId,
          action,
          role,
          module,
          record.targetId,
          record.entityId,
          record.entityType,
          record.targetName,
          record.description,
          record.reason,
          record.previousValue,
          record.newValue,
          record.ipAddress,
          record.ip,
          status,
        ]
          .filter((value) => typeof value === "string" || typeof value === "number")
          .join(" ")
          .toLowerCase();
        return searchableText.includes(query);
      });
  }, [activeTab, filters, overviewFilter, records, search]);

  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const visiblePage = Math.min(page, pageCount);
  const pageRecords = filteredRecords.slice((visiblePage - 1) * PAGE_SIZE, visiblePage * PAGE_SIZE);
  const securityRecords = [...records]
    .filter((record) => record.category === "security")
    .sort((first, second) => new Date(second.timestamp || 0).getTime() - new Date(first.timestamp || 0).getTime());
  const categoryData = [...records.reduce((counts, record) => {
    const module = getRecordModule(record);
    counts.set(module, (counts.get(module) || 0) + 1);
    return counts;
  }, new Map())]
    .map(([module, count]) => ({ module, count }))
    .sort((first, second) => second.count - first.count || first.module.localeCompare(second.module));
  const totalCategoryCount = categoryData.reduce((sum, item) => sum + item.count, 0);
  const categoryColors = ["#7412bf", "#ffba08", "#ee3e5a", "#3589ef", "#17a84b", "#8d7ba0"];
  let categoryProgress = 0;
  const categoryStops = categoryData.map((item, index) => {
    const end = categoryProgress + (item.count / Math.max(1, totalCategoryCount)) * 100;
    const stop = `${categoryColors[index % categoryColors.length]} ${categoryProgress}% ${end}%`;
    categoryProgress = end;
    return stop;
  }).join(", ");
  const categoryBackground = categoryData.length
    ? `conic-gradient(${categoryStops})`
    : "conic-gradient(#e9def4 0 100%)";
  const overview = [
    { id: "all", label: "Total Activities", value: records.length, icon: Activity, color: "purple" },
    { id: "admins", label: "Admin Actions", value: records.filter((record) => getRecordRole(record).toLowerCase() === "admin").length, icon: Users, color: "orange" },
    { id: "logins", label: "Login Events", value: records.filter(isLoginRecord).length, icon: LogIn, color: "green" },
    { id: "security", label: "Security Events", value: securityRecords.length, icon: ShieldCheck, color: "red" },
    { id: "configuration", label: "Configuration Changes", value: records.filter(isConfigurationRecord).length, icon: Settings, color: "violet" },
    { id: "transfers", label: "Import / Export Events", value: records.filter(isImportExportRecord).length, icon: Database, color: "purple" },
  ];

  function refreshRecords() {
    const state = getAdminActivityLog();
    setActivityState(state);
    setFeedback({ type: state.error ? "error" : "success", message: state.error || "Audit records refreshed from this browser." });
  }

  function applySearch(event) {
    event.preventDefault();
    setSearch((current) => current.trim());
    setPage(1);
  }

  function selectOverviewFilter(filterId) {
    setActiveTab("all");
    setOverviewFilter(filterId);
    setPage(1);
  }

  function selectTab(tabId) {
    setActiveTab(tabId);
    setOverviewFilter("all");
    setPage(1);
    setFeedback(null);
  }

  function applyFilters(event) {
    event.preventDefault();
    if (filterDraft.from && filterDraft.to && filterDraft.from > filterDraft.to) {
      setFeedback({ type: "error", message: "Start date must be on or before the end date." });
      return;
    }
    setFilters({ ...filterDraft });
    setPage(1);
    setFeedback(null);
  }

  function clearFilters() {
    setSearch("");
    setFilterDraft(ALL_FILTERS);
    setFilters(ALL_FILTERS);
    setActiveTab("all");
    setOverviewFilter("all");
    setPage(1);
    setFeedback(null);
  }

  function exportLogs() {
    try {
      const content = createCsvContent(filteredRecords, [
        { header: "Log ID", getValue: (record) => record.id || "" },
        { header: "Date & Time", getValue: (record) => record.timestamp || "" },
        { header: "Action", getValue: getRecordAction },
        { header: "Performed By", getValue: (record) => safeDisplayValue(record.actor, "Performed By") },
        { header: "User Role", getValue: getRecordRole },
        { header: "Module", getValue: getRecordModule },
        { header: "Related Record ID", getValue: (record) => record.targetId ?? record.entityId ?? "" },
        { header: "Status", getValue: getRecordStatus },
        { header: "Description", getValue: (record) => safeDisplayValue(record.description, "Description") },
      ]);
      const date = new Date().toISOString().slice(0, 10);
      downloadCsv(`educonnect-audit-logs-${date}.csv`, content);
      try {
        const actor = window.sessionStorage.getItem("educonnect.demoEmail") || "Admin";
        appendAdminActivityRecord({
          actor,
          actorRole: "Admin",
          action: "Audit Logs Exported",
          category: "data-export",
          module: "Audit Logs",
          entityType: "Audit Log Export",
          entityId: date,
          targetId: date,
          targetName: "Filtered Audit Logs",
          newValue: `${filteredRecords.length} CSV records`,
          description: `Admin exported ${filteredRecords.length} filtered audit record${filteredRecords.length === 1 ? "" : "s"} as CSV.`,
          result: "Success",
        });
      } catch {
        // A log write failure must not undo a CSV download that already succeeded.
      }
      setFeedback({ type: "success", message: `Exported ${filteredRecords.length} filtered audit record${filteredRecords.length === 1 ? "" : "s"} as CSV.` });
    } catch (exportError) {
      setFeedback({ type: "error", message: exportError instanceof Error ? exportError.message : "Audit logs could not be exported." });
    }
  }

  function getTabCount(tabId) {
    if (tabId === "login") return records.filter(isLoginRecord).length;
    if (tabId === "system") return records.filter((record) => record.category === "system").length;
    if (tabId === "changes") return records.filter(isChangeRecord).length;
    if (tabId === "data-access") return records.filter((record) => record.category === "data-access").length;
    return records.length;
  }

  return (
    <section className="edc-admin-activity edc-admin-audit-reference">
      <header className="edc-admin-audit-heading">
        <div>
          <span className="edc-admin-page-eyebrow">ADMIN ACTIVITY &amp; ACCESS HISTORY</span>
          <h2><Activity aria-hidden="true" />Audit Logs</h2>
          <p>Review actions saved in this browser. These records are not a tamper-proof or platform-wide audit trail.</p>
        </div>
        <div className="edc-admin-audit-heading-actions">
          <button className="edc-admin-action-button" type="button" onClick={exportLogs} disabled={Boolean(error) || !filteredRecords.length}><Download size={15} />Export Logs</button>
          <button className="edc-admin-action-button" type="button" onClick={refreshRecords}><RefreshCw size={15} />Refresh</button>
        </div>
      </header>

      <div className="edc-admin-audit-stat-grid" aria-label="Saved audit activity summary">
        {overview.map(({ id, label, value, icon: Icon, color }) => (
          <button
            className={`edc-admin-audit-stat edc-admin-metric-card edc-admin-metric-${color}${overviewFilter === id && activeTab === "all" ? " is-active" : ""}`}
            key={id}
            type="button"
            aria-pressed={overviewFilter === id && activeTab === "all"}
            disabled={Boolean(error)}
            onClick={() => selectOverviewFilter(id)}
          >
            <span><Icon size={20} aria-hidden="true" /></span>
            <div><p>{label}</p><strong>{error ? "—" : value.toLocaleString()}</strong></div>
          </button>
        ))}
      </div>

      <nav className="edc-admin-audit-tabs" aria-label="Audit log categories">
        {AUDIT_TABS.map(([id, label, Icon]) => (
          <button type="button" key={id} className={activeTab === id ? "active" : ""} onClick={() => selectTab(id)} aria-current={activeTab === id ? "page" : undefined}>
            <Icon size={15} aria-hidden="true" />{label}<span>({error ? "—" : getTabCount(id).toLocaleString()})</span>
          </button>
        ))}
      </nav>

      <div className="edc-admin-activity-toolbar">
        <form className="edc-admin-search edc-admin-activity-search" onSubmit={applySearch} role="search">
          <Search size={17} aria-hidden="true" />
          <label className="edc-admin-visually-hidden" htmlFor="admin-audit-search">Search audit logs</label>
          <input
            id="admin-audit-search"
            type="search"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Search by user, action, resource or log ID..."
          />
          <button className="edc-admin-action-button" type="submit">Search</button>
        </form>
      </div>

      <form className="edc-admin-activity-filters" onSubmit={applyFilters}>
        <label className="edc-admin-activity-date">From<input type="date" value={filterDraft.from} onChange={(event) => setFilterDraft({ ...filterDraft, from: event.target.value })} /></label>
        <label className="edc-admin-activity-date">To<input type="date" value={filterDraft.to} onChange={(event) => setFilterDraft({ ...filterDraft, to: event.target.value })} /></label>
        <label>Module<select value={filterDraft.module} onChange={(event) => setFilterDraft({ ...filterDraft, module: event.target.value })}><option value="all">All modules</option>{options.modules.map((module) => <option key={module} value={module}>{module}</option>)}</select></label>
        <label>Action<select value={filterDraft.action} onChange={(event) => setFilterDraft({ ...filterDraft, action: event.target.value })}><option value="all">All actions</option>{options.actions.map((action) => <option key={action} value={action}>{action}</option>)}</select></label>
        <label>User role<select value={filterDraft.role} onChange={(event) => setFilterDraft({ ...filterDraft, role: event.target.value })}><option value="all">All roles</option>{options.roles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
        <label>Status<select value={filterDraft.status} onChange={(event) => setFilterDraft({ ...filterDraft, status: event.target.value })}><option value="all">All statuses</option>{options.statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
        <div className="edc-admin-activity-filter-actions">
          <button className="edc-admin-action-button" type="submit"><Filter size={14} /> Apply Filters</button>
          <button className="edc-admin-action-button edc-admin-activity-clear" type="button" onClick={clearFilters}>Clear Filters</button>
        </div>
      </form>

      {feedback && <p className={`edc-admin-feedback edc-admin-feedback-${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>{feedback.message}</p>}
      {error && (
        <p className="edc-admin-feedback edc-admin-feedback-error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" /> {error} Existing audit records were kept unchanged.
        </p>
      )}

      <div className="edc-admin-audit-layout">
        <main className="edc-admin-audit-main">
          <section className="edc-admin-audit-card">
            <header><h3><Activity size={17} aria-hidden="true" />{AUDIT_TABS.find(([id]) => id === activeTab)?.[1] || "Activity Logs"}</h3><span>{error ? "Unavailable" : `${filteredRecords.length.toLocaleString()} matching records`}</span></header>
            {!error && filteredRecords.length === 0 && (
              <div className="edc-admin-audit-empty">
                {records.length === 0 && activeTab === "all" ? (
                  <><Activity size={22} aria-hidden="true" /><strong>No audit activity recorded yet.</strong><p>Actions will appear here when they are actually recorded. No sample log entries are added.</p></>
                ) : activeTab === "system" ? (
                  <><Database size={22} aria-hidden="true" /><strong>System events are not collected.</strong><p>This app does not currently write system-event records to the browser activity log.</p></>
                ) : activeTab === "data-access" ? (
                  <><ShieldCheck size={22} aria-hidden="true" /><strong>Data access events are not collected.</strong><p>The app does not currently log individual record reads or access events.</p></>
                ) : records.length > 0 ? (
                  <><Search size={22} aria-hidden="true" /><strong>No matching audit records found.</strong><p>Try another search term or adjust the current tab and filters.</p></>
                ) : (
                  <><Activity size={22} aria-hidden="true" /><strong>No records in this view.</strong><p>No matching activity has been saved in this browser.</p></>
                )}
              </div>
            )}
            {!error && filteredRecords.length > 0 && (
              <div className="edc-admin-table-wrap edc-admin-audit-table-wrap">
                <table className="edc-admin-activity-table edc-admin-audit-table">
                  <thead><tr>
                    <th scope="col">Date &amp; Time</th><th scope="col">User</th><th scope="col">Action</th>
                    <th scope="col">Resource / Module</th><th scope="col">Details</th><th scope="col">IP Address</th>
                    <th scope="col">Status</th><th scope="col">View</th>
                  </tr></thead>
                  <tbody>{pageRecords.map((record, index) => (
                    <tr key={record.id || `${record.timestamp}-${record.action}-${index}`}>
                      <td><span className="edc-admin-activity-meta"><Clock3 size={12} aria-hidden="true" />{formatTimestamp(record.timestamp)}</span></td>
                      <td><strong>{safeDisplayValue(record.actor, "Performed By") || "Not recorded"}</strong><small>{getRecordRole(record)}</small></td>
                      <td className="edc-admin-activity-description">{getRecordAction(record)}</td>
                      <td><strong>{getRecordModule(record)}</strong><small>{record.entityType || "Type not recorded"}</small></td>
                      <td className="edc-admin-audit-details-cell">{safeDisplayValue(record.description || record.targetName, "Details") || "No details recorded"}</td>
                      <td>{safeDisplayValue(record.ipAddress || record.ip, "IP Address") || "Not captured"}</td>
                      <td><span className={`edc-admin-status-badge ${getRecordStatus(record).toLowerCase() === "success" ? "edc-admin-status-approved" : getRecordStatus(record).toLowerCase() === "failed" ? "edc-admin-status-rejected" : "edc-admin-status-unknown"}`}>{getRecordStatus(record)}</span></td>
                      <td><button className="edc-admin-audit-view-button" type="button" onClick={() => setSelectedRecord(record)} aria-label={`View details for ${getRecordAction(record)}`} title="View details"><Eye size={14} aria-hidden="true" /></button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {!error && filteredRecords.length > 0 && (
              <div className="edc-admin-activity-pagination">
                <p className="edc-admin-applications-count" aria-live="polite">
                  Showing {Math.min((visiblePage - 1) * PAGE_SIZE + 1, filteredRecords.length)}–{Math.min(visiblePage * PAGE_SIZE, filteredRecords.length)} of {filteredRecords.length} filtered record{filteredRecords.length === 1 ? "" : "s"} ({records.length} total)
                </p>
                <div>
                  <button className="edc-admin-filter-button" type="button" disabled={visiblePage <= 1} onClick={() => setPage((current) => Math.max(1, Math.min(pageCount, current - 1)))}>Previous</button>
                  <span>Page {visiblePage} of {pageCount}</span>
                  <button className="edc-admin-filter-button" type="button" disabled={visiblePage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</button>
                </div>
              </div>
            )}
            {filteredRecords.length > 0 && <div className="edc-admin-activity-footer"><ShieldCheck size={14} aria-hidden="true" /><span>Read-only browser-local records; not tamper-proof or platform-wide.</span></div>}
          </section>
        </main>
        <aside className="edc-admin-audit-sidebar">
          <section className="edc-admin-audit-card">
            <header><h3><Settings size={17} aria-hidden="true" />Activity Overview</h3></header>
            {error ? <div className="edc-admin-audit-empty"><AlertTriangle size={19} /><p>Activity breakdown is unavailable while saved records cannot be read.</p></div> : categoryData.length ? (
              <div className="edc-admin-audit-category">
                <div className="edc-admin-audit-donut" style={{ background: categoryBackground }} role="img" aria-label={`${totalCategoryCount} saved activities by module`}>
                  <span><strong>{totalCategoryCount.toLocaleString()}</strong><small>Activities</small></span>
                </div>
                <div className="edc-admin-audit-legend">
                  {categoryData.slice(0, 6).map((item, index) => (
                    <div key={item.module}><i style={{ backgroundColor: categoryColors[index % categoryColors.length] }} /><span>{item.module}</span><strong>{((item.count / totalCategoryCount) * 100).toFixed(1)}%</strong></div>
                  ))}
                  {categoryData.length > 6 && <p>Showing 6 of {categoryData.length} saved modules.</p>}
                </div>
              </div>
            ) : <div className="edc-admin-audit-empty"><Activity size={19} /><p>No saved activities to summarize.</p></div>}
          </section>

          <section className="edc-admin-audit-card">
            <header><h3><ShieldCheck size={17} aria-hidden="true" />Recent Security Events</h3><button type="button" onClick={() => selectOverviewFilter("security")}>View all <ArrowRight size={13} /></button></header>
            {error ? <div className="edc-admin-audit-empty"><AlertTriangle size={18} /><p>Security records are unavailable while the audit log cannot be read.</p></div> : securityRecords.length ? (
              <ul className="edc-admin-audit-security-list">
                {securityRecords.slice(0, 5).map((record, index) => (
                  <li key={record.id || `${record.timestamp}-${index}`}>
                    <button type="button" onClick={() => setSelectedRecord(record)}>
                      <span className={getRecordStatus(record).toLowerCase() === "failed" ? "failed" : ""}><ShieldCheck size={14} aria-hidden="true" /></span>
                      <div><strong>{getRecordAction(record)}</strong><small>{safeDisplayValue(record.actor, "Performed By") || "Actor not recorded"}</small></div>
                      <time>{formatTimestamp(record.timestamp)}</time>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <div className="edc-admin-audit-empty"><ShieldCheck size={18} /><p>No security events have been recorded.</p></div>}
          </section>

          <section className="edc-admin-audit-card">
            <header><h3><Activity size={17} aria-hidden="true" />Quick Actions</h3></header>
            <div className="edc-admin-audit-quick-actions">
              <button type="button" onClick={exportLogs} disabled={Boolean(error) || !filteredRecords.length}><Download size={14} />Export Logs</button>
              <button type="button" onClick={() => selectTab("changes")}><History size={14} />Change History</button>
              <button type="button" onClick={() => selectTab("login")}><LogIn size={14} />Login Logs</button>
              <button type="button" onClick={() => { selectTab("all"); setOverviewFilter("security"); }}><ShieldCheck size={14} />Security Events</button>
            </div>
            <p className="edc-admin-audit-caption">This app does not collect IP addresses or data-access reads. Scheduled reports and alert rules have not been set up.</p>
          </section>
        </aside>
      </div>

      {selectedRecord && (
        <div className="edc-admin-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedRecord(null)}>
          <section className="edc-admin-details-modal" role="dialog" aria-modal="true" aria-labelledby="audit-record-detail-title">
            <header className="edc-admin-details-header">
              <div><span className="edc-admin-page-eyebrow">READ-ONLY AUDIT RECORD</span><h3 id="audit-record-detail-title">{getRecordAction(selectedRecord)}</h3></div>
              <button type="button" className="edc-admin-modal-close" onClick={() => setSelectedRecord(null)} aria-label="Close audit details">×</button>
            </header>
            <dl className="edc-admin-details-list">
              {recordDetails(selectedRecord).map(([label, value]) => (
                <div className="edc-admin-detail-field" key={label}><dt>{label}</dt><dd>{value}</dd></div>
              ))}
            </dl>
          </section>
        </div>
      )}
    </section>
  );
}

export default AdminActivityLog;

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  Eye,
  FileText,
  Globe,
  KeyRound,
  Layers,
  LogOut,
  Search,
  RotateCcw,
  Server,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  ADMIN_DATA_CHANGED_EVENT,
  ADMIN_USERS_KEY,
  appendAdminActivityRecord,
  getAdminActivityLog,
  notifyAdminDataChanged,
  readAdminArray,
  readAdminUsersState,
} from "./adminData";
import { ADMIN_SECTIONS } from "./adminNavigation";
import { createCsvContent, downloadCsv } from "./adminCsvUtils";

const SECURITY_TABS = [
  ["access", "Access Control"],
  ["roles", "Roles & Permissions"],
  ["login", "Login Activity"],
  ["policies", "Security Policies"],
  ["mfa", "2FA"],
  ["sessions", "Sessions"],
  ["audit", "Audit Logs"],
];

function maskEmail(email) {
  if (typeof email !== "string" || !email.includes("@")) {
    return "Unavailable";
  }
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf("@");
  if (atIndex <= 0) return "Unavailable";
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  if (!domain) return "Unavailable";

  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  if (local.length <= 4) {
    return `${local[0]}***${local.slice(-1)}@${domain}`;
  }
  return `${local.slice(0, 2)}***${local.slice(-2)}@${domain}`;
}

function getAdminDisplayName(email) {
  const users = readAdminArray(ADMIN_USERS_KEY);
  const normalized = String(email || "").trim().toLowerCase();
  const match = users.find(
    (user) =>
      typeof user?.email === "string" &&
      user.email.trim().toLowerCase() === normalized &&
      user.role === "Admin",
  );

  return typeof match?.name === "string" && match.name.trim()
    ? match.name.trim()
    : "Name not provided";
}

function getRouteStatus() {
  return {
    label: "Client Demo",
    badgeClass: "edc-admin-status-approved",
  };
}

function getStorageDiagnostics() {
  try {
    return {
      sessionEntries: window.sessionStorage.length,
      localEntries: window.localStorage.length,
      error: "",
    };
  } catch {
    return {
      sessionEntries: null,
      localEntries: null,
      error: "Browser storage diagnostics are unavailable in this environment.",
    };
  }
}

function formatActivityTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return "Not provided";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not provided" : date.toLocaleString();
}

function uniqueAccounts(users) {
  const seen = new Set();
  return users.filter((user) => {
    const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
    if (!email || seen.has(email)) return false;
    seen.add(email);
    return true;
  });
}

function displayAccountStatus(status) {
  return typeof status === "string" && status.trim() ? status.trim() : "Not recorded";
}

function statusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "active" || normalized === "success") return "active";
  if (normalized === "inactive" || normalized === "disabled" || normalized === "suspended" || normalized === "failed") return "inactive";
  return "unknown";
}

const SECURITY_DETAIL_PAGES = {
  session: {
    description: "Current login identity, role, and browser session details.",
  },
  role: {
    description: "How student, teacher, and admin roles are separated in this demo.",
  },
  runtime: {
    description: "Where authentication state is stored and which protections require a backend.",
  },
  routes: {
    description: "The Admin routes protected by the current role allowlist.",
  },
};

function AdminSecurity({ email, onLogout, view = "overview" }) {
  const [sessionEmail, setSessionEmail] = useState(() =>
    email || window.sessionStorage.getItem("educonnect.demoEmail") || "",
  );
  const [sessionRole, setSessionRole] = useState(() =>
    window.sessionStorage.getItem("educonnect.demoRole") || "",
  );
  const [rememberedEmail, setRememberedEmail] = useState(() =>
    window.localStorage.getItem("educonnect.rememberedEmail") || "",
  );
  const [usersState, setUsersState] = useState(readAdminUsersState);
  const [storageDiagnostics, setStorageDiagnostics] = useState(getStorageDiagnostics);
  const [securityActivityState, setSecurityActivityState] = useState(getAdminActivityLog);
  const [feedback, setFeedback] = useState(null);

  const refreshState = useCallback(() => {
    setSessionEmail(
      email || window.sessionStorage.getItem("educonnect.demoEmail") || "",
    );
    setSessionRole(
      window.sessionStorage.getItem("educonnect.demoRole") || "",
    );
    setRememberedEmail(
      window.localStorage.getItem("educonnect.rememberedEmail") || "",
    );
    setUsersState(readAdminUsersState());
    setStorageDiagnostics(getStorageDiagnostics());
    setSecurityActivityState(getAdminActivityLog());
  }, [email]);

  useEffect(() => {
    window.addEventListener("storage", refreshState);
    window.addEventListener(ADMIN_DATA_CHANGED_EVENT, refreshState);

    return () => {
      window.removeEventListener("storage", refreshState);
      window.removeEventListener(ADMIN_DATA_CHANGED_EVENT, refreshState);
    };
  }, [refreshState]);

  const displayName = getAdminDisplayName(sessionEmail);
  const hasActiveSession = Boolean(sessionRole === "Admin" && sessionEmail);
  const maskedSessionEmail = maskEmail(sessionEmail);
  const maskedRememberedEmail = maskEmail(rememberedEmail);
  const securityActivity = [...securityActivityState.records]
    .filter((record) => record.category === "security")
    .sort((first, second) =>
      new Date(second.timestamp || 0).getTime() -
      new Date(first.timestamp || 0).getTime(),
    );
  const loginActivity = securityActivityState.records
    .filter((record) =>
      record.category === "security" &&
      record.entityType === "Admin Session" &&
      ["Admin Login", "Admin Login Failed"].includes(record.action),
    )
    .sort((first, second) =>
      new Date(second.timestamp || 0).getTime() -
      new Date(first.timestamp || 0).getTime(),
    );
  function handleClearRememberedEmail() {
    setFeedback(null);
    if (!window.localStorage.getItem("educonnect.rememberedEmail")) {
      setFeedback({
        type: "info",
        message: "No remembered login email is currently stored in this browser.",
      });
      return;
    }

    try {
      window.localStorage.removeItem("educonnect.rememberedEmail");
      setRememberedEmail("");

      appendAdminActivityRecord({
        actor: sessionEmail || "Admin",
        action: "Cleared remembered login email",
        category: "security",
        entityType: "Login Preference",
        entityId: "rememberedEmail",
        targetName: "Browser Local Storage",
        description: "Administrator removed the remembered login email preference from this browser. User accounts and passwords were not modified.",
        result: "Success",
      });

      notifyAdminDataChanged();
      setFeedback({
        type: "success",
        message: "Remembered login email was removed from this browser. Your user account and active session remain unchanged.",
      });
    } catch {
      setFeedback({
        type: "error",
        message: "Failed to remove the remembered login email from browser storage.",
      });
    }
  }

  function handleRecordSecurityReview() {
    setFeedback(null);
    try {
      appendAdminActivityRecord({
        actor: sessionEmail || "Admin",
        action: "Security posture reviewed",
        category: "security",
        entityType: "Security Audit",
        entityId: "security-review",
        targetName: "Admin Security & Access Control",
        description: "Administrator manually logged a security posture checkpoint. No automated vulnerability scans were run.",
        result: "Success",
      });

      notifyAdminDataChanged();
      setFeedback({
        type: "success",
        message: "Manual security review checkpoint has been recorded in the Admin Activity Log.",
      });
    } catch {
      setFeedback({
        type: "error",
        message: "Could not record security review checkpoint to browser storage.",
      });
    }
  }

  function handleExportSecurityLogs() {
    setFeedback(null);
    if (securityActivityState.error) {
      setFeedback({ type: "error", message: securityActivityState.error });
      return;
    }
    if (!securityActivity.length) {
      setFeedback({ type: "info", message: "No saved security activity records are available to export." });
      return;
    }

    try {
      const columns = [
        { header: "Timestamp", getValue: (record) => record.timestamp },
        { header: "Action", getValue: (record) => record.action },
        { header: "Actor (Masked)", getValue: (record) => maskEmail(record.actor) },
        { header: "Result", getValue: (record) => record.result },
      ];
      downloadCsv("educonnect-security-activity.csv", createCsvContent(securityActivity, columns));
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Security logs could not be exported.",
      });
    }
  }

  function handleTerminateSession() {
    if (!window.confirm("End your current Admin session and return to the login screen?")) {
      return;
    }

    try {
      appendAdminActivityRecord({
        actor: sessionEmail || "Admin",
        action: "Session terminated",
        category: "security",
        entityType: "Admin Session",
        entityId: sessionEmail || "active-session",
        targetName: "Local Admin Session",
        description: "Administrator explicitly logged out from the Security & Access Control panel.",
        result: "Success",
      });
    } catch {
      // Non-blocking catch to ensure logout proceeds even if log write encounters an issue
    }

    if (typeof onLogout === "function") {
      onLogout();
    } else {
      window.sessionStorage.removeItem("educonnect.demoEmail");
      window.sessionStorage.removeItem("educonnect.demoRole");
      window.location.href = "/login";
    }
  }

  const detailPage = SECURITY_DETAIL_PAGES[view];

  if (view === "overview") {
    return (
      <SecurityOverview
        displayName={displayName}
        sessionRole={sessionRole}
        hasActiveSession={hasActiveSession}
        rememberedEmail={rememberedEmail}
        maskedSessionEmail={maskedSessionEmail}
        maskedRememberedEmail={maskedRememberedEmail}
        storageDiagnostics={storageDiagnostics}
        usersState={usersState}
        securityActivityState={securityActivityState}
        securityActivity={securityActivity}
        loginActivity={loginActivity}
        feedback={feedback}
        onExportLogs={handleExportSecurityLogs}
        onRecordReview={handleRecordSecurityReview}
        onClearRememberedEmail={handleClearRememberedEmail}
        onTerminateSession={handleTerminateSession}
      />
    );
  }

  return (
    <div className={`edc-admin-security${detailPage ? ` edc-admin-security-detail edc-admin-security-page-${view}` : ""}`}>
      {detailPage && (
        <div className="edc-admin-security-detail-heading">
          <Link className="edc-admin-export-link" to="/admin/security">
            ← Back to Security overview
          </Link>
          <p>{detailPage.description}</p>
        </div>
      )}
      {/* Overview Stat Cards */}
      <section className="edc-admin-stat-grid" aria-label="Security summary">
        <Link to="/admin/security/session" className="edc-admin-stat-card edc-admin-stat-card-link edc-admin-ops-card edc-admin-ops-card-link">
          <span className="edc-admin-stat-icon" aria-hidden="true">
            <ShieldCheck size={19} />
          </span>
          <p>Session Status</p>
          <strong style={{ fontSize: "19px" }}>
            {hasActiveSession ? "Active Demo Session" : "Inactive"}
          </strong>
        </Link>

        <Link to="/admin/security/role" className="edc-admin-stat-card edc-admin-stat-card-link edc-admin-ops-card edc-admin-ops-card-link">
          <span className="edc-admin-stat-icon" aria-hidden="true">
            <UserCheck size={19} />
          </span>
          <p>Assigned Role</p>
          <strong style={{ fontSize: "20px" }}>
            {sessionRole || "None"}
          </strong>
        </Link>

        <Link to="/admin/security/runtime" className="edc-admin-stat-card edc-admin-stat-card-link edc-admin-ops-card edc-admin-ops-card-link">
          <span className="edc-admin-stat-icon" aria-hidden="true">
            <KeyRound size={19} />
          </span>
          <p>Authentication Runtime</p>
          <strong style={{ fontSize: "18px" }}>
            Client Storage (Demo)
          </strong>
        </Link>

        <Link to="/admin/security/routes" className="edc-admin-stat-card edc-admin-stat-card-link edc-admin-ops-card edc-admin-ops-card-link">
          <span className="edc-admin-stat-icon" aria-hidden="true">
            <Layers size={19} />
          </span>
          <p>Guarded Admin Routes</p>
          <strong>{ADMIN_SECTIONS.length}</strong>
        </Link>
      </section>

      {/* Primary Grid Layout */}
      <div className="edc-admin-overview-grid">
        {/* Section A: Authentication Status */}
        <section className="edc-admin-panel" id="security-authentication">
          <div className="edc-admin-panel-heading">
            <div>
              <h3>Authentication Status</h3>
              <p>Current administrative identity and frontend authentication details.</p>
            </div>
          </div>

          <dl className="edc-admin-breakdown-list">
            <div>
              <dt>Account Name</dt>
              <dd><strong>{displayName}</strong></dd>
            </div>
            <div>
              <dt>Account Email (Masked)</dt>
              <dd>
                <code>{maskedSessionEmail}</code>
              </dd>
            </div>
            <div>
              <dt>Assigned Role</dt>
              <dd>
                <span className="edc-admin-status-badge edc-admin-status-approved">
                  {sessionRole || "Not recorded"}
                </span>
              </dd>
            </div>
            <div>
              <dt>Auth Model</dt>
              <dd>Frontend Demo Session</dd>
            </div>
            <div>
              <dt>Password Security</dt>
              <dd>Client-Side Demo Hash (Salted SHA-256)</dd>
            </div>
          </dl>

          <div className="edc-admin-security-notice">
            <ShieldAlert size={16} aria-hidden="true" />
            <div>
              <strong>Frontend Demo Hashing Notice</strong>
              <p>
                Passwords in this demo are hashed client-side with a 16-byte random salt and SHA-256.
                Fast cryptographic hashes like SHA-256 are not intended for production password storage.
                Production applications require slow, adaptive, salted password algorithms (such as Argon2id or bcrypt)
                executed exclusively on an authenticated backend server.
              </p>
            </div>
          </div>
        </section>

        {/* Section B: Session Information */}
        <section className="edc-admin-panel" id="security-session-information">
          <div className="edc-admin-panel-heading">
            <div>
              <h3>Session Information</h3>
              <p>Session storage parameters and browser lifecycle in this demo.</p>
            </div>
          </div>

          <dl className="edc-admin-breakdown-list">
            <div>
              <dt>Storage Type</dt>
              <dd><code>window.sessionStorage</code></dd>
            </div>
            <div>
              <dt>Session Storage Entries</dt>
              <dd>{storageDiagnostics.sessionEntries ?? "Unavailable"} (count only; values hidden)</dd>
            </div>
            <div>
              <dt>Browser Local Storage Entries</dt>
              <dd>{storageDiagnostics.localEntries ?? "Unavailable"} (count only; values hidden)</dd>
            </div>
            <div>
              <dt>Session Scope</dt>
              <dd>Associated with current browser tab</dd>
            </div>
            <div>
              <dt>Remembered Login</dt>
              <dd>
                {rememberedEmail ? (
                  <span className="edc-admin-security-tag-pill active">
                    Stored ({maskedRememberedEmail})
                  </span>
                ) : (
                  <span className="edc-admin-security-tag-pill inactive">
                    Not stored
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>Inactivity Timeout</dt>
              <dd>
                <span className="edc-admin-security-tag-pill inactive">
                  None (no auto-timeout)
                </span>
              </dd>
            </div>
            <div>
              <dt>Server Invalidation</dt>
              <dd>
                <span className="edc-admin-security-tag-pill inactive">
                  None (client-only tokens)
                </span>
              </dd>
            </div>
          </dl>
          {storageDiagnostics.error && (
            <p className="edc-admin-feedback edc-admin-feedback-error" role="status">
              {storageDiagnostics.error}
            </p>
          )}

          <p className="edc-admin-security-note">
            Session data is held in browser <code>sessionStorage</code> and bound to this tab session.
            No server-side session invalidation or idle timeout exists, and browser session restoration behavior across restarts is not security-guaranteed.
          </p>
        </section>

        {/* Section C: Access Control Overview */}
        <section className="edc-admin-panel" id="security-route-protection" style={{ gridColumn: "1 / -1" }}>
          <div className="edc-admin-panel-heading">
            <div>
              <h3>Access Control &amp; Route Protection Overview</h3>
              <p>Role isolation and client-side route allowlists enforced by the router.</p>
            </div>
          </div>

          <div className="edc-admin-security-role-grid">
            <article className="edc-admin-security-role-card">
              <div className="edc-admin-security-role-title">
                <Users size={16} aria-hidden="true" />
                <strong>Student Role</strong>
              </div>
              <p>
                Restricted to <code>/student/dashboard</code>. Cannot access Teacher workspaces or Admin management routes in the UI.
              </p>
              <small>Client-side redirect to Student workspace on mismatch.</small>
            </article>

            <article className="edc-admin-security-role-card">
              <div className="edc-admin-security-role-title">
                <Users size={16} aria-hidden="true" />
                <strong>Teacher Role</strong>
              </div>
              <p>
                Restricted to <code>/teacher/dashboard</code>. Can create and submit courses for review; cannot access Admin routes.
              </p>
              <small>Requires admin approval before courses can be published.</small>
            </article>

            <article className="edc-admin-security-role-card edc-admin-security-role-card-highlight">
              <div className="edc-admin-security-role-title">
                <ShieldCheck size={16} aria-hidden="true" />
                <strong>Admin Role</strong>
              </div>
              <p>
                Granted access to all <code>/admin/*</code> routes. Governs teacher applications, courses, knowledge proposals, and platform data.
              </p>
              <small>Protected by the <code>ADMIN_ROUTES</code> allowlist.</small>
            </article>
          </div>

          <h4 className="edc-admin-security-subtitle">
            Admin Route Allowlist ({ADMIN_SECTIONS.length} routes)
          </h4>
          <div className="edc-admin-security-route-grid">
            {ADMIN_SECTIONS.map((item) => {
              const status = getRouteStatus();
              const Icon = item.icon;

              return (
                <div className="edc-admin-security-route-item" key={item.id}>
                  <span className="edc-admin-security-route-icon" aria-hidden="true">
                    <Icon size={14} />
                  </span>
                  <div className="edc-admin-security-route-meta">
                    <strong>{item.title}</strong>
                    <code>{item.path}</code>
                  </div>
                  <span className={`edc-admin-status-badge ${status.badgeClass}`}>
                    {status.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="edc-admin-security-notice" style={{ marginTop: "16px" }}>
            <AlertTriangle size={16} aria-hidden="true" />
            <div>
              <strong>Client-Side Authorization Boundary</strong>
              <p>
                Route protection is performed in React by <code>DashboardPage.jsx</code> via <code>sessionStorage</code> checks.
                In a production system, every API request must be authorized on a secure backend using server-side session cookies or cryptographic tokens.
              </p>
            </div>
          </div>
        </section>

        <section className="edc-admin-panel" id="security-activity" style={{ gridColumn: "1 / -1" }}>
          <div className="edc-admin-panel-heading">
            <div>
              <h3>Security Activity</h3>
              <p>Recent records from the existing browser-local Admin activity log.</p>
            </div>
            <Link className="edc-admin-export-link" to="/admin/audit-logs">
              Open Audit Logs
            </Link>
          </div>

          {securityActivityState.error && (
            <p className="edc-admin-feedback edc-admin-feedback-error" role="alert">
              {securityActivityState.error}
            </p>
          )}
          {!securityActivityState.error && securityActivity.length === 0 && (
            <p className="edc-admin-security-note" role="status">
              No security-category activity records are stored in this browser.
            </p>
          )}
          {!securityActivityState.error && securityActivity.length > 0 && (
            <div className="edc-admin-table-wrap">
              <table className="edc-admin-activity-table">
                <thead>
                  <tr>
                    <th scope="col">Timestamp</th>
                    <th scope="col">Action</th>
                    <th scope="col">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {securityActivity.map((record, index) => (
                    <tr key={record.id || `${record.timestamp}-${index}`}>
                      <td>{formatActivityTimestamp(record.timestamp)}</td>
                      <td>{typeof record.action === "string" ? record.action : "Security activity"}</td>
                      <td>{typeof record.result === "string" ? record.result : "Not recorded"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="edc-admin-applications-count">
            Showing {securityActivity.length} recent security record{securityActivity.length === 1 ? "" : "s"}.
          </p>
        </section>

        {/* Section D: Security & Architecture Limitations */}
        <section className="edc-admin-panel" id="security-limitations" style={{ gridColumn: "1 / -1" }}>
          <div className="edc-admin-panel-heading">
            <div>
              <h3>Honest Security &amp; Architecture Limitations</h3>
              <p>Technical boundaries inherent to the current frontend-only architecture.</p>
            </div>
          </div>

          <div className="edc-admin-security-limitations-grid">
            <div className="edc-admin-security-limitation-item">
              <div className="edc-admin-security-limitation-header">
                <Server size={15} aria-hidden="true" />
                <strong>No Backend Verification</strong>
              </div>
              <p>
                Authentication, role checks, and approval actions run solely in JavaScript. There is no server API, database, or backend validation engine.
              </p>
            </div>

            <div className="edc-admin-security-limitation-item">
              <div className="edc-admin-security-limitation-header">
                <Database size={15} aria-hidden="true" />
                <strong>Plaintext Browser Storage</strong>
              </div>
              <p>
                All account profiles, courses, and settings reside in unencrypted <code>localStorage</code>, which can be inspected or modified in browser DevTools.
              </p>
            </div>

            <div className="edc-admin-security-limitation-item">
              <div className="edc-admin-security-limitation-header">
                <Clock3 size={15} aria-hidden="true" />
                <strong>Mutable Client Audit Log</strong>
              </div>
              <p>
                Administrative actions are saved to <code>educonnect.adminActivityLog</code> locally. They do not constitute a tamper-proof or compliance audit trail.
              </p>
            </div>

            <div className="edc-admin-security-limitation-item">
              <div className="edc-admin-security-limitation-header">
                <Globe size={15} aria-hidden="true" />
                <strong>No Cross-Device Synchronization</strong>
              </div>
              <p>
                Records created or approved in this browser session are not synchronized with other users, browsers, or devices.
              </p>
            </div>
          </div>
        </section>

        {/* Section E: Supported Security Actions */}
        <section className="edc-admin-panel" style={{ gridColumn: "1 / -1" }}>
          <div className="edc-admin-panel-heading">
            <div>
              <h3>Supported Security Actions</h3>
              <p>Administrative actions genuinely supported by the current frontend storage architecture.</p>
            </div>
          </div>

          {feedback && (
            <p
              className={`edc-admin-feedback edc-admin-feedback-${feedback.type}`}
              role={feedback.type === "error" ? "alert" : "status"}
              style={{ marginTop: "14px" }}
            >
              {feedback.message}
            </p>
          )}

          <div className="edc-admin-security-actions-wrap">
            <div className="edc-admin-security-action-box">
              <div>
                <strong>Terminate Admin Session</strong>
                <p>
                  Logs out of the current demo session, removes sessionStorage tokens, and returns to the login screen.
                  Uses the existing application logout flow.
                </p>
              </div>
              <button
                type="button"
                className="edc-admin-action-button edc-admin-security-danger-btn"
                onClick={handleTerminateSession}
              >
                <LogOut size={15} aria-hidden="true" />
                Terminate Session
              </button>
            </div>

            <div className="edc-admin-security-action-box">
              <div>
                <strong>Clear Remembered Login Email</strong>
                <p>
                  Removes only the <code>educonnect.rememberedEmail</code> preference key from this browser.
                  Does not delete user accounts, passwords, or the current active session.
                </p>
              </div>
              <button
                type="button"
                className="edc-admin-action-button"
                disabled={!rememberedEmail}
                onClick={handleClearRememberedEmail}
              >
                <RotateCcw size={14} aria-hidden="true" />
                Clear Remembered Email
              </button>
            </div>

            <div className="edc-admin-security-action-box">
              <div>
                <strong>Record Security Review Checkpoint</strong>
                <p>
                  Appends a manual checkpoint entry to the Admin Activity Log confirming an administrator reviewed access controls and platform limitations.
                  This is a manual record and does not run automated vulnerability or compliance scans.
                </p>
              </div>
              <button
                type="button"
                className="edc-admin-action-button"
                onClick={handleRecordSecurityReview}
              >
                <ShieldCheck size={15} aria-hidden="true" />
                Record Security Review
              </button>
            </div>
          </div>

          <h4 className="edc-admin-security-subtitle" style={{ marginTop: "24px" }}>
            Unavailable Enterprise Features (Requires Backend Architecture)
          </h4>
          <ul className="edc-admin-security-unavailable-list">
            <li>
              <strong>Two-Factor Authentication (2FA / MFA):</strong> Requires an authentication service supporting TOTP, SMS, or FIDO2/WebAuthn.
            </li>
            <li>
              <strong>Remote Session Revocation:</strong> Requires centralized server-side session stores (e.g., Redis / JWT blocklists) across devices.
            </li>
            <li>
              <strong>IP Allowlisting &amp; Geo-Fencing:</strong> Requires an API gateway or reverse proxy inspecting client network parameters.
            </li>
            <li>
              <strong>Rate Limiting &amp; Brute-Force Throttling:</strong> Requires server-side request throttling and account lockout mechanisms.
            </li>
          </ul>

          <div className="edc-admin-security-footer-links">
            <Link to="/admin/activity-log" className="edc-admin-export-link">
              View Activity Log Records
            </Link>
            <Link to="/admin/settings" className="edc-admin-export-link">
              Admin Interface Settings
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function SecurityOverview({
  displayName,
  sessionRole,
  hasActiveSession,
  rememberedEmail,
  maskedSessionEmail,
  maskedRememberedEmail,
  storageDiagnostics,
  usersState,
  securityActivityState,
  securityActivity,
  loginActivity,
  feedback,
  onExportLogs,
  onRecordReview,
  onClearRememberedEmail,
  onTerminateSession,
}) {
  const [tab, setTab] = useState("access");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const allUsers = useMemo(() => uniqueAccounts(usersState.users), [usersState.users]);
  const adminAccounts = useMemo(() => allUsers
    .filter((user) => user.role === "Admin")
    .sort((left, right) => String(left.name || left.email).localeCompare(String(right.name || right.email))), [allUsers]);
  const roleCounts = useMemo(() => {
    const counts = new Map();
    allUsers.forEach((user) => {
      if (typeof user.role !== "string" || !user.role.trim()) return;
      const role = user.role.trim();
      counts.set(role, (counts.get(role) || 0) + 1);
    });
    return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  }, [allUsers]);
  const lastLoginByEmail = useMemo(() => {
    const latest = new Map();
    loginActivity.forEach((record) => {
      if (record.action !== "Admin Login" || record.result !== "Success") return;
      const key = String(record.actor || "").trim().toLowerCase();
      const timestamp = new Date(record.timestamp || 0).getTime();
      if (!key || Number.isNaN(timestamp)) return;
      if (!latest.has(key) || timestamp > latest.get(key)) latest.set(key, timestamp);
    });
    return latest;
  }, [loginActivity]);
  const statusOptions = useMemo(() => [...new Set(adminAccounts.map((user) => displayAccountStatus(user.status)))].sort(), [adminAccounts]);
  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return adminAccounts.filter((user) => {
      const status = displayAccountStatus(user.status);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      const searchable = [user.name, user.email, user.id, user.role, status]
        .filter((value) => value !== null && value !== undefined)
        .map(String)
        .join(" ")
        .toLowerCase();
      return !query || searchable.includes(query);
    });
  }, [adminAccounts, search, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredAccounts.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageAccounts = filteredAccounts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const totalRoleAccounts = roleCounts.reduce((sum, [, count]) => sum + count, 0);
  const roleColors = ["#7412bf", "#ffba08", "#17a84b", "#ee3e5a", "#3589ef", "#8d7ba0"];
  let segmentProgress = 0;
  const roleStops = roleCounts.map(([, count], index) => {
    const end = segmentProgress + (count / Math.max(1, totalRoleAccounts)) * 100;
    const stop = `${roleColors[index % roleColors.length]} ${segmentProgress}% ${end}%`;
    segmentProgress = end;
    return stop;
  }).join(", ");
  const roleBackground = roleCounts.length
    ? `conic-gradient(${roleStops})`
    : "conic-gradient(#e9def4 0 100%)";
  const loginAttempts = loginActivity.length;
  const failedAttempts = loginActivity.filter((record) =>
    record.action === "Admin Login Failed" || record.result === "Failed",
  ).length;
  const recentLoginActivity = loginActivity.slice(0, 8);
  const recentSecurityActivity = securityActivity.slice(0, 8);
  const actorLabel = (record) => maskEmail(record.actor);

  function initials(user) {
    const name = typeof user.name === "string" ? user.name.trim() : "";
    if (name) return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    return String(user.email || "?").trim().slice(0, 1).toUpperCase() || "?";
  }

  function renderAccountTable() {
    return (
      <>
        <div className="edc-admin-security-account-filters">
          <label className="edc-admin-security-search">
            <Search size={16} aria-hidden="true" />
            <span className="edc-admin-visually-hidden">Search saved admin accounts</span>
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by name or email..." />
          </label>
          <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} aria-label="Filter admin accounts by saved status">
            <option value="all">All statuses</option>
            {statusOptions.map((status) => <option value={status} key={status}>{status}</option>)}
          </select>
        </div>
        {usersState.error ? (
          <div className="edc-admin-security-empty" role="alert"><ShieldAlert size={20} /><p>{usersState.error}</p></div>
        ) : pageAccounts.length ? (
          <div className="edc-admin-security-table-wrap">
            <table className="edc-admin-security-table">
              <thead><tr><th scope="col">Admin Account</th><th scope="col">Role</th><th scope="col">Email</th><th scope="col">Last Login</th><th scope="col">2FA</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
              <tbody>{pageAccounts.map((user) => {
                const normalizedEmail = user.email.trim().toLowerCase();
                const lastLogin = lastLoginByEmail.get(normalizedEmail);
                const name = typeof user.name === "string" && user.name.trim() ? user.name.trim() : "Name not provided";
                const status = displayAccountStatus(user.status);
                return (
                  <tr key={normalizedEmail}>
                    <td><span className="edc-admin-security-account-name"><i aria-hidden="true">{initials(user)}</i><span><strong>{name}</strong>{user.id !== undefined && user.id !== null && user.id !== "" && <small>ID: {String(user.id)}</small>}</span></span></td>
                    <td><span className="edc-admin-security-role-pill">{user.role}</span></td>
                    <td>{user.email}</td>
                    <td>{lastLogin ? new Date(lastLogin).toLocaleString() : "Not recorded"}</td>
                    <td><span className="edc-admin-security-unavailable-pill">Not set up</span></td>
                    <td><span className={`edc-admin-security-account-status ${statusTone(status)}`}>{status}</span></td>
                    <td><Link className="edc-admin-security-view" to={`/admin/users?q=${encodeURIComponent(user.email)}`} aria-label={`View ${name} in User Management`} title="View account"><Eye size={15} aria-hidden="true" /></Link></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        ) : (
          <div className="edc-admin-security-empty">
            <Users size={20} aria-hidden="true" />
            <p>{adminAccounts.length ? "No saved Admin accounts match these filters." : "No Admin accounts were found in saved registration data."}</p>
          </div>
        )}
        {!usersState.error && (
          <div className="edc-admin-security-pagination">
            <span>{filteredAccounts.length ? `Showing ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filteredAccounts.length)} of ${filteredAccounts.length} saved Admin accounts` : "No matching saved Admin accounts"}</span>
            <div>
              <button type="button" aria-label="Previous admin accounts page" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ArrowLeft size={14} /></button>
              <span>Page {currentPage} of {pageCount}</span>
              <button type="button" aria-label="Next admin accounts page" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}><ArrowRight size={14} /></button>
            </div>
          </div>
        )}
      </>
    );
  }

  function renderActivityTable(records, emptyText) {
    if (securityActivityState.error) {
      return <div className="edc-admin-security-empty" role="alert"><ShieldAlert size={20} /><p>{securityActivityState.error}</p></div>;
    }
    if (!records.length) {
      return <div className="edc-admin-security-empty"><FileText size={20} aria-hidden="true" /><p>{emptyText}</p></div>;
    }
    return (
      <div className="edc-admin-security-table-wrap">
        <table className="edc-admin-security-table edc-admin-security-activity-table">
          <thead><tr><th scope="col">Timestamp</th><th scope="col">Actor</th><th scope="col">Activity</th><th scope="col">Result</th></tr></thead>
          <tbody>{records.map((record, index) => (
            <tr key={record.id || `${record.timestamp}-${record.action}-${index}`}>
              <td>{formatActivityTimestamp(record.timestamp)}</td>
              <td>{actorLabel(record)}</td>
              <td>{typeof record.action === "string" ? record.action : "Activity not recorded"}</td>
              <td><span className={`edc-admin-security-account-status ${statusTone(record.result)}`}>{record.result || "Not recorded"}</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    );
  }

  const metricCards = [
    { label: "Total Admins", value: usersState.error ? "—" : adminAccounts.length.toLocaleString(), icon: Users, color: "purple", tab: "roles" },
    { label: "Current Session", value: hasActiveSession ? "Active" : "Inactive", icon: UserCheck, color: "orange", tab: "sessions" },
    { label: "2FA", value: "Not enabled", icon: KeyRound, color: "green", tab: "mfa" },
    { label: "Failed Admin Logins", value: securityActivityState.error ? "—" : failedAttempts.toLocaleString(), icon: AlertTriangle, color: "red", tab: "login" },
    { label: "Recorded Login Attempts", value: securityActivityState.error ? "—" : loginAttempts.toLocaleString(), icon: LogOut, color: "violet", tab: "login" },
    { label: "Guarded Admin Routes", value: ADMIN_SECTIONS.length.toLocaleString(), icon: Layers, color: "purple", tab: "access" },
  ];

  return (
    <section className="edc-admin-security-reference">
      <header className="edc-admin-security-heading">
        <div>
          <span className="edc-admin-page-eyebrow">SECURITY &amp; ACCESS MANAGEMENT</span>
          <h2><ShieldCheck aria-hidden="true" />Admin Security &amp; Access Control</h2>
          <p>Review saved Admin accounts, browser sign-in records, and the access controls supported by this app.</p>
        </div>
        <div className="edc-admin-security-heading-actions">
          <button type="button" className="edc-admin-action-button" disabled={securityActivityState.error || !securityActivity.length} onClick={onExportLogs}>
            <FileText size={15} aria-hidden="true" />Export Logs
          </button>
          <button type="button" className="edc-admin-button-primary" onClick={onRecordReview}>
            <ShieldCheck size={15} aria-hidden="true" />Record Security Review
          </button>
        </div>
      </header>

      <p className="edc-admin-security-reference-note">
        Account and sign-in totals come from this browser's saved records. This frontend does not provide 2FA, IP allowlisting, server-side enforcement, or multi-device session monitoring.
      </p>
      {feedback && <p className={`edc-admin-feedback edc-admin-feedback-${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>{feedback.message}</p>}

      <div className="edc-admin-security-stats" aria-label="Security summaries">
        {metricCards.map(({ label, value, icon: Icon, color, tab: targetTab }) => (
          <button
            className={`edc-admin-security-stat ${color} edc-admin-metric-card edc-admin-metric-${color}${tab === targetTab ? " is-active" : ""}`}
            key={label}
            type="button"
            aria-pressed={tab === targetTab}
            onClick={() => setTab(targetTab)}
          >
            <span><Icon size={20} aria-hidden="true" /></span>
            <div><p>{label}</p><strong>{value}</strong></div>
          </button>
        ))}
      </div>

      <nav className="edc-admin-security-tabs" aria-label="Security sections">
        {SECURITY_TABS.map(([id, label]) => (
          <button type="button" className={tab === id ? "active" : ""} aria-current={tab === id ? "page" : undefined} key={id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "access" && (
        <div className="edc-admin-security-workspace">
          <main className="edc-admin-security-main">
            <section className="edc-admin-security-card edc-admin-security-accounts-card">
              <header><h3><Users size={17} aria-hidden="true" />Saved Admin Accounts</h3><span>{usersState.error ? "Count unavailable" : `${adminAccounts.length.toLocaleString()} saved accounts`}</span></header>
              {renderAccountTable()}
            </section>
          </main>
          <aside className="edc-admin-security-sidebar">
            <section className="edc-admin-security-card">
              <header><h3><Layers size={17} aria-hidden="true" />Saved Role Distribution</h3></header>
              {usersState.error ? (
                <p className="edc-admin-security-side-note">Role counts are unavailable because saved account data could not be read.</p>
              ) : roleCounts.length ? (
                <div className="edc-admin-security-role-overview">
                  <div className="edc-admin-security-donut" style={{ background: roleBackground }} role="img" aria-label={`${totalRoleAccounts} saved accounts by role`}>
                    <span><strong>{totalRoleAccounts.toLocaleString()}</strong><small>Accounts</small></span>
                  </div>
                  <div className="edc-admin-security-legend">
                    {roleCounts.map(([role, count], index) => (
                      <div key={role}><i style={{ backgroundColor: roleColors[index % roleColors.length] }} /><span>{role}</span><strong>{count.toLocaleString()}</strong></div>
                    ))}
                  </div>
                </div>
              ) : <p className="edc-admin-security-side-note">No saved role assignments are available.</p>}
              <p className="edc-admin-security-side-note">Counts use unique registered account emails; per-user permission overrides are not stored.</p>
            </section>

            <section className="edc-admin-security-card">
              <header><h3><KeyRound size={17} aria-hidden="true" />Security Settings</h3></header>
              <dl className="edc-admin-security-settings-list">
                <div><dt>Two-factor authentication</dt><dd>Not available</dd></div>
                <div><dt>IP allowlisting</dt><dd>Not implemented</dd></div>
                <div><dt>Failed-login throttling</dt><dd>Not implemented</dd></div>
                <div><dt>Concurrent sessions</dt><dd>Not monitored</dd></div>
              </dl>
            </section>

            <section className="edc-admin-security-card">
              <header><h3><CheckCircle2 size={17} aria-hidden="true" />Quick Actions</h3></header>
              <div className="edc-admin-security-quick-actions">
                <button type="button" onClick={() => setTab("login")}><LogOut size={14} aria-hidden="true" />View Login Activity</button>
                <Link to="/admin/users"><Users size={14} aria-hidden="true" />Manage User Accounts</Link>
                <button type="button" onClick={onRecordReview}><ShieldCheck size={14} aria-hidden="true" />Record Security Review</button>
                <Link to="/admin/audit-logs"><FileText size={14} aria-hidden="true" />Open Audit Logs</Link>
              </div>
            </section>
          </aside>
        </div>
      )}

      {tab === "roles" && (
        <div className="edc-admin-security-tab-grid">
          <section className="edc-admin-security-card">
            <header><h3><Users size={17} aria-hidden="true" />Saved Account Roles</h3></header>
            {usersState.error ? <p className="edc-admin-security-side-note" role="alert">{usersState.error}</p> : roleCounts.length ? (
              <div className="edc-admin-security-role-overview">
                <div className="edc-admin-security-donut" style={{ background: roleBackground }} role="img" aria-label={`${totalRoleAccounts} saved accounts by role`}>
                  <span><strong>{totalRoleAccounts.toLocaleString()}</strong><small>Accounts</small></span>
                </div>
                <div className="edc-admin-security-legend">
                  {roleCounts.map(([role, count], index) => (
                    <div key={role}><i style={{ backgroundColor: roleColors[index % roleColors.length] }} /><span>{role}</span><strong>{count.toLocaleString()}</strong></div>
                  ))}
                </div>
              </div>
            ) : <p className="edc-admin-security-side-note">No saved account roles are available.</p>}
            <p className="edc-admin-security-side-note">Role labels are read from saved account records. This app does not store per-user permission matrices.</p>
          </section>
          <section className="edc-admin-security-card">
            <header><h3><ShieldCheck size={17} aria-hidden="true" />Admin Route Allowlist</h3><span>{ADMIN_SECTIONS.length} routes</span></header>
            <p className="edc-admin-security-side-note">The current frontend checks this route allowlist and the saved Admin role. These client-side checks are not server authorization.</p>
            <div className="edc-admin-security-table-wrap">
              <table className="edc-admin-security-table">
                <thead><tr><th scope="col">Admin Section</th><th scope="col">Route</th><th scope="col">Access Rule</th></tr></thead>
                <tbody>{ADMIN_SECTIONS.map((item) => (
                  <tr key={item.id}><td>{item.title}</td><td><code>{item.path}</code></td><td><span className="edc-admin-security-role-pill">Admin role</span></td></tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === "login" && (
        <section className="edc-admin-security-card">
          <header><h3><LogOut size={17} aria-hidden="true" />Recorded Admin Login Activity</h3><Link to="/admin/audit-logs">Open Full Audit Log <ArrowRight size={14} aria-hidden="true" /></Link></header>
          <p className="edc-admin-security-side-note">Login attempts are counted only when an Admin sign-in event was saved to this browser's activity log.</p>
          {renderActivityTable(recentLoginActivity, "No Admin login attempts are recorded in this browser.")}
          {!securityActivityState.error && loginActivity.length > 0 && <p className="edc-admin-security-table-note">Showing {recentLoginActivity.length} of {loginActivity.length.toLocaleString()} saved Admin sign-in records.</p>}
        </section>
      )}

      {tab === "policies" && (
        <section className="edc-admin-security-card">
          <header><h3><ShieldCheck size={17} aria-hidden="true" />Security Policy Availability</h3></header>
          <div className="edc-admin-security-table-wrap">
            <table className="edc-admin-security-table">
              <thead><tr><th scope="col">Control</th><th scope="col">Current State</th><th scope="col">Available Evidence</th></tr></thead>
              <tbody>
                <tr><td>Admin route allowlist</td><td>Implemented in frontend</td><td>{ADMIN_SECTIONS.length} routes in the current Admin allowlist</td></tr>
                <tr><td>Admin session</td><td>{hasActiveSession ? "Active in this browser" : "Inactive"}</td><td>Current tab's session storage only</td></tr>
                <tr><td>Two-factor authentication</td><td>Not available</td><td>No MFA workflow or saved enrollment data</td></tr>
                <tr><td>IP allowlisting</td><td>Not implemented</td><td>No network policy source</td></tr>
                <tr><td>Failed-login throttling</td><td>Not implemented</td><td>Saved failed attempts are logged but not throttled</td></tr>
                <tr><td>Multi-device session revocation</td><td>Not available</td><td>No centralized session store</td></tr>
              </tbody>
            </table>
          </div>
          <p className="edc-admin-security-side-note">No policy switches are shown because the app has no saved policy settings for these controls.</p>
        </section>
      )}

      {tab === "mfa" && (
        <section className="edc-admin-security-unavailable">
          <span><KeyRound size={24} aria-hidden="true" /></span>
          <p className="edc-admin-page-eyebrow">NOT SET UP</p>
          <h3>Two-factor authentication is not available</h3>
          <p>This frontend has no MFA enrollment, verification, or recovery workflow. No enabled accounts or security codes are assumed.</p>
        </section>
      )}

      {tab === "sessions" && (
        <div className="edc-admin-security-tab-grid">
          <section className="edc-admin-security-card">
            <header><h3><UserCheck size={17} aria-hidden="true" />Current Browser Session</h3><span className={`edc-admin-security-account-status ${hasActiveSession ? "active" : "inactive"}`}>{hasActiveSession ? "Active" : "Inactive"}</span></header>
            <dl className="edc-admin-security-session-list">
              <div><dt>Account name</dt><dd>{displayName}</dd></div>
              <div><dt>Account email</dt><dd>{maskedSessionEmail}</dd></div>
              <div><dt>Saved role</dt><dd>{sessionRole || "Not assigned"}</dd></div>
              <div><dt>Session storage</dt><dd>Current browser tab</dd></div>
              <div><dt>Remembered email</dt><dd>{rememberedEmail ? `Stored (${maskedRememberedEmail})` : "Not stored"}</dd></div>
              <div><dt>Session entries</dt><dd>{storageDiagnostics.sessionEntries ?? "Unavailable"} (count only)</dd></div>
            </dl>
            {storageDiagnostics.error && <p className="edc-admin-feedback edc-admin-feedback-error" role="alert">{storageDiagnostics.error}</p>}
            <p className="edc-admin-security-side-note">Other tabs and devices cannot be enumerated or revoked from this frontend.</p>
            <div className="edc-admin-security-session-actions">
              <button type="button" className="edc-admin-action-button edc-admin-security-danger-btn" disabled={!hasActiveSession} onClick={onTerminateSession}><LogOut size={14} />End Current Session</button>
              <button type="button" className="edc-admin-action-button" disabled={!rememberedEmail} onClick={onClearRememberedEmail}><RotateCcw size={14} />Clear Remembered Email</button>
            </div>
          </section>
          <section className="edc-admin-security-card">
            <header><h3><AlertTriangle size={17} aria-hidden="true" />Session Limitations</h3></header>
            <dl className="edc-admin-security-settings-list">
              <div><dt>Automatic inactivity timeout</dt><dd>Not implemented</dd></div>
              <div><dt>Server-side invalidation</dt><dd>Not available</dd></div>
              <div><dt>Concurrent session limiting</dt><dd>Not monitored</dd></div>
              <div><dt>Remembered login email</dt><dd>{rememberedEmail ? "Stored in this browser" : "Not stored"}</dd></div>
            </dl>
          </section>
        </div>
      )}

      {tab === "audit" && (
        <section className="edc-admin-security-card">
          <header><h3><FileText size={17} aria-hidden="true" />Saved Security Audit Records</h3><Link to="/admin/audit-logs">View Full Activity Log <ArrowRight size={14} aria-hidden="true" /></Link></header>
          <p className="edc-admin-security-side-note">These are security-category entries from the browser-local Admin activity log; they are not tamper-proof or platform-wide audit records.</p>
          {renderActivityTable(recentSecurityActivity, "No security-category activity records are stored in this browser.")}
          {!securityActivityState.error && securityActivity.length > 0 && <p className="edc-admin-security-table-note">Showing {recentSecurityActivity.length} of {securityActivity.length.toLocaleString()} saved security records.</p>}
        </section>
      )}
    </section>
  );
}

export default AdminSecurity;

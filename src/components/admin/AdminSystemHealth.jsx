// Admin System Health & Diagnostics page
// This component follows the existing Admin UI conventions.
import React, { useState, useEffect } from "react";
import { ADMIN_SECTIONS } from "./adminNavigation";
import {
  ADMIN_USERS_KEY,
  ADMIN_AI_KNOWLEDGE_KEY,
  ADMIN_ACTIVITY_LOG_KEY,
  ADMIN_SUPPORT_REQUESTS_KEY,
  appendAdminActivityRecord,
  readAdminUsersState,
  getAdminKnowledgeStorageState,
  getAdminActivityLog,
  readAdminSupportRequestsState,
} from "./adminData";

import { Monitor } from "lucide-react";
import "./Admin.css";

// Helper to safely read a storage key and report status
function checkStorageKey(key, readFn) {
  try {
    const raw = window.localStorage.getItem(key);
    const exists = raw !== null;
    const { records = [], error = null } = readFn();
    return {
      key,
      exists,
      error,
      count: Array.isArray(records) ? records.length : 0,
    };
  } catch (e) {
    return { key, exists: false, error: e.message, count: 0 };
  }
}
export default function AdminSystemHealth({ email }) {
  const [diagnosticRun, setDiagnosticRun] = useState(null);
  const [storageResults, setStorageResults] = useState([]);
  const [moduleStatus, setModuleStatus] = useState([]);

  // Run diagnostics – called on mount and on button click
  const runDiagnostics = () => {
    const now = new Date().toISOString();
    // Environment summary (static for demo)
    const env = {
      reactVersion: React.version,
      viteVersion: "8.x (demo)",
      storageAvailable: typeof window !== "undefined" && !!window.localStorage,
    };

    // Module availability – based on known operational IDs
    const operationalIds = new Set([
      "dashboard",
      "teachers",
      "courses",
      "knowledge",
      "users",
      "support",
      "reports",
      "data-export",
      "data-import",
      "notifications",
      "activity-log",
      "settings",
      "security",
    ]);
    const modules = ADMIN_SECTIONS.map((sec) => ({
      id: sec.id,
      title: sec.title,
      status: operationalIds.has(sec.id) ? "Operational" : "Placeholder",
    }));

    // Storage diagnostics – read‑only checks
    const storageChecks = [
      checkStorageKey(ADMIN_USERS_KEY, () => readAdminUsersState()),
      checkStorageKey(ADMIN_AI_KNOWLEDGE_KEY, () => {
        const { proposals, error } = getAdminKnowledgeStorageState();
        return { records: proposals, error };
      }),
      checkStorageKey(ADMIN_ACTIVITY_LOG_KEY, () => getAdminActivityLog()),
      checkStorageKey(ADMIN_SUPPORT_REQUESTS_KEY, () => readAdminSupportRequestsState()),
    ];

    setDiagnosticRun({ timestamp: now, env, modules, storageChecks });
    setModuleStatus(modules);
    setStorageResults(storageChecks);

    // Record the diagnostic run (no sensitive data logged)
    try {
      appendAdminActivityRecord({
        actor: email || "Admin",
        action: "Ran System Health Diagnostics",
        category: "system-health",
        timestamp: now,
        result: "Success",
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Initial run when component mounts
  useEffect(() => {
    runDiagnostics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="edc-admin-system-health">
      <section className="edc-admin-page-heading">
        <div>
          <span className="edc-admin-page-eyebrow">ADMIN DIAGNOSTICS</span>
          <h2>System Health &amp; Diagnostics</h2>
          <p>Read‑only overview of the frontend demo environment and stored data.</p>
        </div>
      </section>

      {/* Environment Summary */}
      {diagnosticRun && (
        <section className="edc-admin-health-section">
          <h3>Environment Summary</h3>
          <ul>
            <li>React version: {diagnosticRun.env.reactVersion}</li>
            <li>Vite version: {diagnosticRun.env.viteVersion}</li>
            <li>Browser storage: {diagnosticRun.env.storageAvailable ? "Available" : "Unavailable"}</li>
          </ul>
        </section>
      )}

      {/* Module Availability */}
      {moduleStatus.length > 0 && (
        <section className="edc-admin-health-section">
          <h3>Admin Module Availability</h3>
          <table className="edc-admin-table">
            <thead>
              <tr>
                <th>Module</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {moduleStatus.map((m) => (
                <tr key={m.id}>
                  <td>{m.title}</td>
                  <td>{m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Storage Diagnostics */}
      {storageResults.length > 0 && (
        <section className="edc-admin-health-section">
          <h3>Browser Storage Diagnostics</h3>
          <table className="edc-admin-table">
            <thead>
              <tr>
                <th>Dataset</th>
                <th>Available</th>
                <th>Parse Status</th>
                <th>Record Count</th>
              </tr>
            </thead>
            <tbody>
              {storageResults.map((r) => (
                <tr key={r.key}>
                  <td>{r.key}</td>
                  <td>{r.exists ? "Yes" : "No"}</td>
                  <td>{r.error ? "Invalid Format" : "Valid"}</td>
                  <td>{r.exists && !r.error ? r.count : "‑"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="edc-admin-health-section">
        <button className="edc-admin-button-primary" onClick={runDiagnostics}>
          Run Diagnostics Again
        </button>
      </section>
    </div>
  );
}

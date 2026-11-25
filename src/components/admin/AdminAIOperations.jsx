import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  CircleHelp,
  Cpu,
  Database,
  FileText,
  Gauge,
  Layers,
  RefreshCw,
  ShieldAlert,
  Workflow,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  ADMIN_DATA_CHANGED_EVENT,
  getAdminKnowledgeStorageState,
} from "./adminData";

const SECTIONS = [
  ["overview", "Overview", Activity],
  ["models", "AI Models", BrainCircuit],
  ["jobs", "Processing Jobs", Layers],
  ["usage", "Usage & Costs", Gauge],
  ["prompts", "Prompts & Workflows", Workflow],
  ["logs", "Logs & Monitoring", FileText],
];

const UNAVAILABLE_SECTIONS = {
  models: {
    title: "AI model configuration is not available",
    description: "This app has no saved model provider, deployment, or model connection settings to display.",
    icon: BrainCircuit,
  },
  jobs: {
    title: "No AI processing job source is connected",
    description: "The app does not save an AI job queue or job history. There are no live or sample jobs to show.",
    icon: Layers,
  },
  usage: {
    title: "AI usage and cost are unavailable",
    description: "No provider telemetry is connected, so request totals, token usage, latency, and cost are unavailable.",
    icon: Gauge,
  },
  prompts: {
    title: "No saved prompt or workflow records",
    description: "This app has no persisted AI prompt library or workflow execution records.",
    icon: Workflow,
  },
  logs: {
    title: "AI runtime logs are not available",
    description: "The app does not collect AI provider, deployment, or runtime monitoring logs.",
    icon: FileText,
  },
};

function proposalDate(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function formatDate(value) {
  const timestamp = proposalDate(value);
  return timestamp === null ? "Not provided" : new Date(timestamp).toLocaleDateString();
}

function StatusBadge({ status }) {
  const normalized = String(status || "").toLowerCase();
  const statusClass = normalized.includes("approved")
    ? "approved"
    : normalized.includes("pending")
      ? "pending"
      : normalized.includes("reject")
        ? "rejected"
        : "unknown";
  return <span className={`edc-admin-ai-status edc-admin-ai-status-${statusClass}`}>{status || "Status not recorded"}</span>;
}

function AdminAIOperations() {
  const [knowledgeState, setKnowledgeState] = useState(getAdminKnowledgeStorageState);
  const [section, setSection] = useState("overview");
  const [search, setSearch] = useState("");

  function refresh() {
    setKnowledgeState(getAdminKnowledgeStorageState());
  }

  useEffect(() => {
    window.addEventListener("storage", refresh);
    window.addEventListener(ADMIN_DATA_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(ADMIN_DATA_CHANGED_EVENT, refresh);
    };
  }, []);

  const proposals = knowledgeState.proposals;
  const knowledgeCounts = useMemo(() => ({
    total: proposals.length,
    pending: proposals.filter((proposal) => proposal.status === "Pending Review").length,
    approved: proposals.filter((proposal) => proposal.status === "Approved for Processing").length,
  }), [proposals]);
  const visibleProposals = useMemo(() => {
    const query = search.trim().toLowerCase();
    return proposals
      .map((proposal, index) => ({ proposal, index }))
      .filter(({ proposal }) => {
        const searchable = [
          proposal.proposedTopic,
          proposal.courseSnapshot?.title,
          proposal.teacherName,
          proposal.teacherEmail,
          proposal.status,
        ].filter((value) => typeof value === "string").join(" ").toLowerCase();
        return !query || searchable.includes(query);
      })
      .sort((left, right) => {
        const leftDate = proposalDate(left.proposal.submittedAt);
        const rightDate = proposalDate(right.proposal.submittedAt);
        if (leftDate === null && rightDate === null) return left.index - right.index;
        if (leftDate === null) return 1;
        if (rightDate === null) return -1;
        return rightDate - leftDate;
      })
      .slice(0, 8);
  }, [proposals, search]);

  const metrics = [
    { label: "Total AI Requests", value: "No data", icon: Activity, color: "purple", section: "logs" },
    { label: "Active Models", value: "Not set", icon: BrainCircuit, color: "orange", section: "models" },
    { label: "Processing Jobs", value: "No data", icon: Cpu, color: "green", section: "jobs" },
    { label: "Failed Jobs", value: "No data", icon: AlertTriangle, color: "red", section: "jobs" },
    { label: "AI Usage (Tokens)", value: "No data", icon: Database, color: "violet", section: "usage" },
    { label: "Total AI Cost", value: "No data", icon: Gauge, color: "purple", section: "usage" },
  ];

  return (
    <section className="edc-admin-ai-reference">
      <header className="edc-admin-ai-heading">
        <div>
          <span className="edc-admin-page-eyebrow">AI &amp; PLATFORM OPERATIONS</span>
          <h2><BrainCircuit aria-hidden="true" />AI Operations</h2>
          <p>Review saved AI knowledge proposals and the model operations this app currently tracks.</p>
        </div>
        <div className="edc-admin-ai-heading-actions">
          <button type="button" className="edc-admin-action-button" onClick={refresh}>
            <RefreshCw size={15} aria-hidden="true" />Refresh Data
          </button>
          <Link className="edc-admin-button-primary" to="/admin/knowledge">
            <FileText size={15} aria-hidden="true" />Knowledge Governance
          </Link>
        </div>
      </header>

      <p className="edc-admin-ai-note">
        No AI model provider or runtime telemetry is connected in this app. Operational metrics are marked unavailable; the proposal list below uses saved Knowledge Governance records only.
      </p>
      {knowledgeState.error && (
        <p className="edc-admin-feedback edc-admin-feedback-error" role="alert">{knowledgeState.error}</p>
      )}

      <div className="edc-admin-ai-stats" aria-label="AI operations availability">
        {metrics.map(({ label, value, icon: Icon, color, section: targetSection }) => (
          <button
            className={`edc-admin-ai-stat edc-admin-ai-stat-${color} edc-admin-metric-card edc-admin-metric-${color}${section === targetSection ? " is-active" : ""}`}
            key={label}
            type="button"
            aria-pressed={section === targetSection}
            onClick={() => setSection(targetSection)}
          >
            <span><Icon size={20} aria-hidden="true" /></span>
            <div><p>{label}</p><strong>{value}</strong></div>
          </button>
        ))}
      </div>

      <nav className="edc-admin-ai-tabs" aria-label="AI operations sections">
        {SECTIONS.map(([id, label, Icon]) => (
          <button
            type="button"
            className={section === id ? "active" : ""}
            aria-current={section === id ? "page" : undefined}
            key={id}
            onClick={() => setSection(id)}
          >
            <Icon size={14} aria-hidden="true" />{label}
          </button>
        ))}
      </nav>

      {section === "overview" ? (
        <div className="edc-admin-ai-workspace">
          <main className="edc-admin-ai-main">
            <section className="edc-admin-ai-card edc-admin-ai-trends">
              <header><h3><Activity size={17} aria-hidden="true" />AI Request Trends</h3><span>Not available</span></header>
              <div className="edc-admin-ai-empty-inline">
                <Gauge size={22} aria-hidden="true" />
                <p>No saved AI request history or provider telemetry is available to chart.</p>
              </div>
            </section>

            <section className="edc-admin-ai-card edc-admin-ai-proposals">
              <header>
                <h3><BrainCircuit size={17} aria-hidden="true" />Saved AI Knowledge Proposals</h3>
                <Link to="/admin/knowledge">View All Proposals <ArrowRight size={14} aria-hidden="true" /></Link>
              </header>
              {proposals.length > 0 && (
                <label className="edc-admin-ai-search">
                  <span className="edc-admin-visually-hidden">Search saved knowledge proposals</span>
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search proposal, course, teacher, or status..." />
                </label>
              )}
              {knowledgeState.error ? (
                <div className="edc-admin-ai-empty-inline" role="status"><ShieldAlert size={20} aria-hidden="true" /><p>Saved proposal records could not be read.</p></div>
              ) : visibleProposals.length ? (
                <div className="edc-admin-ai-table-wrap">
                  <table className="edc-admin-ai-table">
                    <thead><tr><th scope="col">Proposal</th><th scope="col">Course</th><th scope="col">Teacher</th><th scope="col">Status</th><th scope="col">Submitted</th></tr></thead>
                    <tbody>{visibleProposals.map(({ proposal, index }) => (
                      <tr key={proposal.proposalId || `${proposal.teacherEmail || "proposal"}-${index}`}>
                        <td><strong>{proposal.proposedTopic || "Topic not provided"}</strong></td>
                        <td>{proposal.courseSnapshot?.title || "Not linked"}</td>
                        <td>{proposal.teacherName || proposal.teacherEmail || "Not provided"}</td>
                        <td><StatusBadge status={proposal.status} /></td>
                        <td>{formatDate(proposal.submittedAt)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : (
                <div className="edc-admin-ai-empty-inline">
                  <FileText size={20} aria-hidden="true" />
                  <p>{search ? "No saved proposals match this search." : "No saved AI knowledge proposals were found."}</p>
                </div>
              )}
              {!knowledgeState.error && proposals.length > 0 && (
                <p className="edc-admin-ai-table-note">
                  Showing {visibleProposals.length} of {proposals.length.toLocaleString()} saved proposals. Proposal decisions are managed in Knowledge Governance.
                </p>
              )}
            </section>
          </main>

          <aside className="edc-admin-ai-sidebar">
            <section className="edc-admin-ai-card">
              <header><h3><BrainCircuit size={17} aria-hidden="true" />Model Status</h3></header>
              <div className="edc-admin-ai-model-empty">
                <CircleHelp size={20} aria-hidden="true" />
                <div><strong>No model connections configured</strong><p>No provider or deployed model is recorded by this app.</p></div>
              </div>
              <p className="edc-admin-ai-side-note">No sample model names or provider statuses are displayed.</p>
            </section>

            <section className="edc-admin-ai-card">
              <header><h3><Gauge size={17} aria-hidden="true" />Resource Usage</h3></header>
              <dl className="edc-admin-ai-resource-list">
                <div><dt>CPU</dt><dd>Not monitored</dd></div>
                <div><dt>Memory</dt><dd>Not monitored</dd></div>
                <div><dt>GPU</dt><dd>Not monitored</dd></div>
              </dl>
              <p className="edc-admin-ai-side-note">This frontend does not collect server resource metrics.</p>
            </section>

            <section className="edc-admin-ai-card">
              <header><h3><CheckCircle2 size={17} aria-hidden="true" />Knowledge Proposals</h3></header>
              <dl className="edc-admin-ai-resource-list">
                <div><dt>Total saved</dt><dd>{knowledgeState.error ? "—" : knowledgeCounts.total.toLocaleString()}</dd></div>
                <div><dt>Pending review</dt><dd>{knowledgeState.error ? "—" : knowledgeCounts.pending.toLocaleString()}</dd></div>
                <div><dt>Approved for processing</dt><dd>{knowledgeState.error ? "—" : knowledgeCounts.approved.toLocaleString()}</dd></div>
              </dl>
              <Link className="edc-admin-ai-quick-link" to="/admin/knowledge"><FileText size={14} aria-hidden="true" />Open Knowledge Governance</Link>
            </section>
          </aside>
        </div>
      ) : (
        <section className="edc-admin-ai-unavailable">
          {(() => {
            const unavailable = UNAVAILABLE_SECTIONS[section];
            const Icon = unavailable.icon;
            return (
              <>
                <span><Icon size={24} aria-hidden="true" /></span>
                <p className="edc-admin-page-eyebrow">NOT CONNECTED</p>
                <h3>{unavailable.title}</h3>
                <p>{unavailable.description}</p>
                <Link className="edc-admin-button-primary" to="/admin/knowledge">
                  View Saved Knowledge Proposals <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </>
            );
          })()}
        </section>
      )}
    </section>
  );
}

export default AdminAIOperations;

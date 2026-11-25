import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  BookOpenCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  Eye,
  FilePlus2,
  FileText,
  Info,
  Layers,
  Search,
  ShieldCheck,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  ADMIN_DATA_CHANGED_EVENT,
  ADMIN_USERS_KEY,
  appendAdminActivityRecord,
  createAdminKnowledgeProposal,
  getAdminCourses,
  getAdminKnowledgeStorageState,
  getAdminTeachers,
  readAdminArray,
  updateAdminKnowledgeProposal,
} from "./adminData";
import {
  ADMIN_PLATFORM_SETTINGS_CHANGED_EVENT,
  getAdminPlatformSettings,
  saveAdminPlatformSettings,
} from "./adminPlatformSettings";
import { createCsvContent, downloadCsv } from "./adminCsvUtils";
import {
  getAdminOperationalQueue,
  saveAdminOperationalRecord,
} from "./adminQueueApi";

const KNOWLEDGE_FILTERS = [
  ["all", "All Proposals"],
  ["Pending Review", "Pending Review"],
  ["Approved for Processing", "Approved for Processing"],
  ["Changes Requested", "Changes Requested"],
  ["Rights Evidence Requested", "Rights Evidence Requested"],
  ["Rejected", "Rejected"],
];

function displayValue(value) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim() || "Not provided";
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.map((item) => item.trim()).filter(Boolean).join(", ") || "Not provided";
  }
  return "Not provided";
}

function formatDate(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "Not provided";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not provided"
    : date.toLocaleDateString();
}

function statusClass(status) {
  switch (status) {
    case "Pending Review":
      return "edc-admin-status-pending";
    case "Approved for Processing":
      return "edc-admin-status-approved";
    case "Changes Requested":
    case "Rights Evidence Requested":
      return "edc-admin-status-changes";
    case "Rejected":
      return "edc-admin-status-rejected";
    default:
      return "edc-admin-status-unknown";
  }
}

function proposalKey(proposal) {
  return String(proposal.proposalId ?? "");
}

function proposalSourceKey(proposal) {
  return `${String(proposal.teacherEmail || "").trim().toLowerCase()}:${String(proposal.courseId ?? "")}`;
}

function proposalTimestamp(proposal) {
  if (typeof proposal.submittedAt !== "string" && typeof proposal.submittedAt !== "number") {
    return null;
  }
  const timestamp = new Date(proposal.submittedAt).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function proposalSourceLabel(proposal) {
  const references = displayValue(proposal.sourceReferences);
  return references !== "Not provided"
    ? references
    : displayValue(proposal.courseSnapshot?.title);
}

function courseKey(course) {
  return `${String(course.teacherEmail || "").trim().toLowerCase()}:${String(course.id ?? "")}`;
}

function readCourseChoices() {
  const users = readAdminArray(ADMIN_USERS_KEY);
  const teachers = getAdminTeachers(users);
  const teacherByEmail = new Map(
    teachers.map((teacher) => [
      teacher.email.trim().toLowerCase(),
      teacher,
    ]),
  );

  return getAdminCourses(users).map((course) => {
    const teacher = teacherByEmail.get(
      String(course.teacherEmail || "").trim().toLowerCase(),
    );
    let profile = {};
    try {
      const savedProfile = JSON.parse(
        window.localStorage.getItem(
          `educonnect.teacher.${course.teacherEmail}.profile`,
        ) || "{}",
      );
      if (
        savedProfile !== null &&
        typeof savedProfile === "object" &&
        !Array.isArray(savedProfile)
      ) {
        profile = savedProfile;
      }
    } catch {
      profile = {};
    }

    return {
      course,
      teacherName:
        displayValue(teacher?.name) !== "Not provided"
          ? displayValue(teacher?.name)
          : displayValue(profile.name),
    };
  });
}

function renderCourseContent(course) {
  if (!course) {
    return (
      <p className="edc-admin-knowledge-muted">
        The related course is no longer available in the teacher course records.
      </p>
    );
  }

  const lessons = Array.isArray(course.lessons) ? course.lessons : [];
  return (
    <div className="edc-admin-knowledge-course-content">
      <dl className="edc-admin-knowledge-detail-grid">
        <div>
          <dt>Course title</dt>
          <dd>{displayValue(course.title)}</dd>
        </div>
        <div>
          <dt>Subject or category</dt>
          <dd>{displayValue(course.category ?? course.subject)}</dd>
        </div>
        <div>
          <dt>Academic level</dt>
          <dd>{displayValue(course.level)}</dd>
        </div>
        <div>
          <dt>Language</dt>
          <dd>{displayValue(course.language)}</dd>
        </div>
        <div className="edc-admin-knowledge-detail-wide">
          <dt>Course description</dt>
          <dd className="edc-admin-knowledge-prewrap">
            {displayValue(course.description)}
          </dd>
        </div>
      </dl>

      <h5>Available lessons and content</h5>
      {lessons.length ? (
        <ol className="edc-admin-knowledge-lessons">
          {lessons.map((lesson, index) => (
            <li key={lesson?.id ?? `${index}-${lesson?.title ?? "lesson"}`}>
              <strong>{displayValue(lesson?.title)}</strong>
              <span>{displayValue(lesson?.description)}</span>
              {lesson?.duration !== undefined && lesson.duration !== "" && (
                <small>Duration: {displayValue(lesson.duration)}</small>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="edc-admin-knowledge-muted">
          No lesson content is available in this course record.
        </p>
      )}
    </div>
  );
}

function AdminKnowledgeGovernance() {
  const [proposals, setProposals] = useState(
    () => getAdminKnowledgeStorageState().proposals,
  );
  const [storeError, setStoreError] = useState(
    () => getAdminKnowledgeStorageState().error || "",
  );
  const [queueSource, setQueueSource] = useState("loading");
  const [courseChoices, setCourseChoices] = useState(readCourseChoices);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [specificStatusFilter, setSpecificStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [dateReferenceTime, setDateReferenceTime] = useState(0);
  const [page, setPage] = useState(1);
  const [featuredProposalKey, setFeaturedProposalKey] = useState("");
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedCourseKey, setSelectedCourseKey] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [platformSettings, setPlatformSettings] = useState(getAdminPlatformSettings);
  const [settingsError, setSettingsError] = useState("");
  const closeButtonRef = useRef(null);
  const returnFocusRef = useRef(null);
  const pageSize = 8;

  const refreshData = useCallback(async () => {
    const state = getAdminKnowledgeStorageState();
    try {
      const queue = await getAdminOperationalQueue(
        "knowledge",
        state.proposals,
        (proposal) => proposal.proposalId,
      );
      setProposals(queue.records);
      setQueueSource(queue.source);
      setStoreError(queue.source === "fallback" ? state.error || "" : "");
      setSelectedProposal((current) =>
        current
          ? queue.records.find(
              (proposal) => proposalKey(proposal) === proposalKey(current),
            ) ?? null
          : null,
      );
    } catch (loadError) {
      setProposals([]);
      setQueueSource("backend");
      setStoreError(loadError instanceof Error ? loadError.message : "Knowledge proposals could not be loaded.");
    }
    setCourseChoices(readCourseChoices());
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(refreshData, 0);
    window.addEventListener("storage", refreshData);
    window.addEventListener("storage", refreshPlatformSettings);
    window.addEventListener(ADMIN_DATA_CHANGED_EVENT, refreshData);

    function refreshPlatformSettings() {
      setPlatformSettings(getAdminPlatformSettings());
    }

    window.addEventListener(ADMIN_PLATFORM_SETTINGS_CHANGED_EVENT, refreshPlatformSettings);

    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setSelectedProposal(null);
        setCreateDialogOpen(false);
      }
    }
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener("storage", refreshData);
      window.removeEventListener("storage", refreshPlatformSettings);
      window.removeEventListener(ADMIN_DATA_CHANGED_EVENT, refreshData);
      window.removeEventListener(ADMIN_PLATFORM_SETTINGS_CHANGED_EVENT, refreshPlatformSettings);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [refreshData]);

  useEffect(() => {
    if (selectedProposal || createDialogOpen) {
      closeButtonRef.current?.focus();
    } else {
      returnFocusRef.current?.focus();
    }
  }, [selectedProposal, createDialogOpen]);

  const existingCourseKeys = useMemo(
    () =>
      new Set(
        proposals.map(
          (proposal) =>
            `${String(proposal.teacherEmail || "").trim().toLowerCase()}:${String(proposal.courseId ?? "")}`,
        ),
      ),
    [proposals],
  );
  const availableCourses = useMemo(
    () =>
      courseChoices.filter(
        ({ course }) => !existingCourseKeys.has(courseKey(course)),
      ),
    [courseChoices, existingCourseKeys],
  );

  const categories = useMemo(
    () => [...new Set(proposals.map((proposal) => displayValue(proposal.subject)))].sort(
      (a, b) => a.localeCompare(b),
    ),
    [proposals],
  );
  const sourceOptions = useMemo(() => {
    const records = new Map();
    proposals.forEach((proposal) => {
      const source = proposalSourceLabel(proposal);
      if (source !== "Not provided" && !records.has(source)) {
        records.set(source, source);
      }
    });
    return [...records.values()].sort((a, b) => a.localeCompare(b));
  }, [proposals]);
  const availableStatuses = useMemo(
    () => [...new Set(proposals
      .map((proposal) => proposal.status)
      .filter((status) => typeof status === "string" && status.trim()))]
      .sort((a, b) => {
        const orderA = KNOWLEDGE_FILTERS.findIndex(([id]) => id === a);
        const orderB = KNOWLEDGE_FILTERS.findIndex(([id]) => id === b);
        if (orderA === -1 && orderB === -1) return a.localeCompare(b);
        if (orderA === -1) return 1;
        if (orderB === -1) return -1;
        return orderA - orderB;
      }),
    [proposals],
  );
  const proposalStats = useMemo(() => ({
    total: proposals.length,
    pending: proposals.filter((proposal) => proposal.status === "Pending Review").length,
    approved: proposals.filter((proposal) => proposal.status === "Approved for Processing").length,
    rejected: proposals.filter((proposal) => proposal.status === "Rejected").length,
    changesRequested: proposals.filter((proposal) => proposal.status === "Changes Requested").length,
    rightsEvidenceRequested: proposals.filter((proposal) => proposal.status === "Rights Evidence Requested").length,
  }), [proposals]);
  const statusTabs = useMemo(
    () => KNOWLEDGE_FILTERS.map(([id, label]) => ({
      id,
      label,
      count: id === "all" ? proposals.length : proposals.filter((proposal) => proposal.status === id).length,
    })),
    [proposals],
  );

  const filteredProposals = useMemo(() => {
    const query = search.trim().toLowerCase();
    const days = Number(dateRange);
    const cutoff = dateRange === "all" || !dateReferenceTime
      ? null
      : dateReferenceTime - days * 24 * 60 * 60 * 1000;
    return proposals.filter((proposal) => {
      const matchesStatus =
        statusFilter === "all" || proposal.status === statusFilter;
      const matchesSpecificStatus = specificStatusFilter === "all" ||
        proposal.status === specificStatusFilter;
      const matchesCategory = categoryFilter === "all" ||
        displayValue(proposal.subject) === categoryFilter;
      const matchesSource = sourceFilter === "all" ||
        proposalSourceLabel(proposal) === sourceFilter;
      const timestamp = proposalTimestamp(proposal);
      const matchesDate = cutoff === null ||
        (timestamp !== null && timestamp >= cutoff && timestamp <= dateReferenceTime);
      const searchableText = [
        proposal.proposedTopic,
        proposal.teacherName,
        proposal.subject,
        proposal.courseSnapshot?.title,
        proposal.sourceReferences,
        proposal.existingCoverage,
        proposal.proposalId,
      ]
        .filter((value) => typeof value === "string" || typeof value === "number")
        .map(String)
        .join(" ")
        .toLowerCase();
      return matchesStatus &&
        matchesSpecificStatus &&
        matchesCategory &&
        matchesSource &&
        matchesDate &&
        (!query || searchableText.includes(query));
    });
  }, [proposals, search, statusFilter, specificStatusFilter, categoryFilter, sourceFilter, dateRange, dateReferenceTime]);
  const sortedProposals = useMemo(
    () => [...filteredProposals].sort(
      (a, b) => (proposalTimestamp(b) ?? -Infinity) - (proposalTimestamp(a) ?? -Infinity),
    ),
    [filteredProposals],
  );
  const pageCount = Math.max(1, Math.ceil(sortedProposals.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleProposals = sortedProposals.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pageStart = sortedProposals.length ? (currentPage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(currentPage * pageSize, sortedProposals.length);
  const startPage = Math.max(1, Math.min(currentPage - 2, pageCount - 4));
  const endPage = Math.min(pageCount, startPage + 4);
  const pageNumbers = Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index);
  const featuredProposal = sortedProposals.find(
    (proposal) => proposalKey(proposal) === featuredProposalKey,
  ) || sortedProposals[0] || null;

  function openProposal(proposal, event) {
    returnFocusRef.current = event.currentTarget;
    setFeaturedProposalKey(proposalKey(proposal));
    setReviewNote(
      typeof proposal.reviewNotes === "string" ? proposal.reviewNotes : "",
    );
    setError("");
    setSelectedProposal(proposal);
  }

  function selectProposalFilter(filter) {
    setStatusFilter(filter);
    setSpecificStatusFilter("all");
    setPage(1);
  }

  function handleExport() {
    setFeedback("");
    setError("");
    try {
      const columns = [
        { header: "Proposal ID", getValue: (proposal) => proposal.proposalId ?? "" },
        { header: "Proposed Topic", getValue: (proposal) => proposal.proposedTopic ?? "" },
        { header: "Related Course", getValue: (proposal) => proposal.courseSnapshot?.title ?? "" },
        { header: "Teacher", getValue: (proposal) => proposal.teacherName ?? "" },
        { header: "Teacher Email", getValue: (proposal) => proposal.teacherEmail ?? "" },
        { header: "Subject", getValue: (proposal) => proposal.subject ?? "" },
        { header: "Source References", getValue: (proposal) => proposal.sourceReferences ?? "" },
        { header: "Submitted On", getValue: (proposal) => proposal.submittedAt ?? "" },
        { header: "Status", getValue: (proposal) => proposal.status ?? "" },
      ];
      downloadCsv(
        "educonnect-knowledge-proposals.csv",
        createCsvContent(sortedProposals, columns),
      );
      setFeedback(`Exported ${sortedProposals.length} knowledge proposal${sortedProposals.length === 1 ? "" : "s"}.`);
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "The knowledge proposal report could not be exported.",
      );
    }
  }

  function updatePlatformRule(key, value) {
    setFeedback("");
    setError("");
    setSettingsError("");
    try {
      const nextSettings = {
        ...platformSettings,
        rules: { ...platformSettings.rules, [key]: value },
      };
      saveAdminPlatformSettings(nextSettings);
      setPlatformSettings(getAdminPlatformSettings());
      setFeedback("Platform rule saved.");
    } catch (settingsErrorValue) {
      setSettingsError(
        settingsErrorValue instanceof Error
          ? settingsErrorValue.message
          : "The platform rule could not be saved.",
      );
    }
  }

  function handleDialogKeyDown(event) {
    if (event.key !== "Tab") return;
    const controls = Array.from(
      event.currentTarget.querySelectorAll(
        'button:not(:disabled), textarea:not(:disabled), select:not(:disabled), input:not(:disabled)',
      ),
    );
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function submitCourseProposal(event) {
    event.preventDefault();
    setFeedback("");
    setError("");
    const choice = availableCourses.find(
      ({ course }) => courseKey(course) === selectedCourseKey,
    );
    if (!choice) {
      setError("Select an available course before creating a proposal.");
      return;
    }

    try {
      const proposal = createAdminKnowledgeProposal(choice.course, choice.teacherName);
      if (queueSource !== "fallback") {
        await saveAdminOperationalRecord("knowledge", proposal.proposalId, proposal);
      }
      await refreshData();
      setCreateDialogOpen(false);
      setSelectedCourseKey("");
      setFeedback(
        "Knowledge proposal created from the selected course. No AI processing was started.",
      );
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "The knowledge proposal could not be created.",
      );
    }
  }

  async function submitReviewDecision(status) {
    setFeedback("");
    setError("");
    if (status !== "Approved for Processing" && reviewNote.trim().length < 10) {
      setError("Add a meaningful review note of at least 10 characters.");
      return;
    }
    if (
      status === "Rejected" &&
      !window.confirm(
        "Reject this knowledge proposal? The original course and its content will be preserved.",
      )
    ) {
      return;
    }

    try {
      if (queueSource === "fallback") {
        updateAdminKnowledgeProposal(
          selectedProposal.proposalId,
          status,
          reviewNote,
        );
      } else {
        const updatedProposal = {
          ...selectedProposal,
          status,
          reviewNotes: reviewNote.trim(),
          ...(status === "Rights Evidence Requested"
            ? { rightsEvidenceStatus: "Evidence Requested" }
            : {}),
          decisionAt: new Date().toISOString(),
        };
        await saveAdminOperationalRecord(
          "knowledge",
          selectedProposal.proposalId,
          updatedProposal,
        );
        try {
          updateAdminKnowledgeProposal(
            selectedProposal.proposalId,
            status,
            reviewNote,
          );
        } catch {
          // MongoDB remains authoritative if this browser has no legacy copy.
        }
      }
      const manager = window.sessionStorage.getItem("educonnect.demoEmail") || "Admin";
      appendAdminActivityRecord({
        id: `knowledge-${selectedProposal.proposalId}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor: manager,
        action:
          status === "Approved for Processing"
            ? "approved_for_processing"
            : status === "Rejected"
              ? "rejected"
              : status === "Rights Evidence Requested"
                ? "rights_evidence_requested"
                : "changes_requested",
        category: "ai-knowledge",
        entityType: "Knowledge Proposal",
        entityId: String(selectedProposal.proposalId ?? "unknown"),
        targetName: displayValue(selectedProposal.proposedTopic),
        description:
          status === "Approved for Processing"
            ? "Knowledge proposal approved"
            : status === "Rejected"
              ? "Knowledge proposal rejected"
              : status === "Rights Evidence Requested"
                ? "Rights evidence requested for knowledge proposal"
                : "Knowledge proposal change request",
        result: "Success",
      });
      await refreshData();
      setSelectedProposal(null);
      setFeedback(
        status === "Approved for Processing"
          ? "Proposal approved for a future processing stage. No content was ingested or published."
          : status === "Rejected"
            ? "Proposal rejected with the review reason saved. The course was not changed."
            : status === "Rights Evidence Requested"
              ? "Rights evidence was requested and recorded. No notification was sent."
              : "Changes requested and the review note was saved. No notification was sent.",
      );
      setReviewNote("");
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "The proposal decision could not be saved.",
      );
    }
  }

  const selectedCourse = selectedProposal?.courseSnapshot;
  const sourceCourseCount = new Set(
    proposals.map(proposalSourceKey).filter((key) => key !== ":"),
  ).size;

  return (
    <section className="edc-admin-knowledge">
      <header className="edc-admin-knowledge-page-heading">
        <div>
          <span className="edc-admin-page-eyebrow">KNOWLEDGE GOVERNANCE</span>
          <h2><BrainCircuit aria-hidden="true" />AI Knowledge Governance</h2>
          <p>Review saved knowledge proposals and their linked course content.</p>
        </div>
        <div className="edc-admin-knowledge-page-actions">
          <Link to="/admin/data-import" className="edc-admin-action-button">
            <Upload size={15} aria-hidden="true" />Import Knowledge
          </Link>
          <button type="button" className="edc-admin-action-button" onClick={handleExport} disabled={Boolean(storeError) || !sortedProposals.length}>
            <Download size={15} aria-hidden="true" />Export Report
          </button>
          <button
            type="button"
            className="edc-admin-knowledge-create"
            disabled={Boolean(storeError) || availableCourses.length === 0}
            title={storeError ? "Proposal storage is unavailable." : availableCourses.length === 0 ? "There are no unsubmitted courses available." : undefined}
            onClick={() => {
              returnFocusRef.current = document.activeElement;
              setError("");
              setFeedback("");
              setCreateDialogOpen(true);
            }}
          >
            <FilePlus2 size={16} aria-hidden="true" />Add Knowledge
          </button>
        </div>
      </header>

      {storeError && (
        <p className="edc-admin-feedback edc-admin-feedback-error" role="alert">
          <Info size={16} aria-hidden="true" />
          {storeError} Existing saved data was not overwritten.
        </p>
      )}
      {feedback && (
        <p className="edc-admin-feedback edc-admin-feedback-success" role="status">
          <Check size={16} aria-hidden="true" />{feedback}
        </p>
      )}
      {error && !selectedProposal && (
        <p className="edc-admin-feedback edc-admin-feedback-error" role="alert">
          <Info size={16} aria-hidden="true" />{error}
        </p>
      )}

      <div className="edc-admin-knowledge-reference-stats" aria-label="Knowledge proposal summaries">
        {[
          { label: "Total Proposals", value: proposalStats.total, filter: "all", color: "purple", icon: BookOpenCheck },
          { label: "Pending Review", value: proposalStats.pending, filter: "Pending Review", color: "orange", icon: Clock3 },
          { label: "Approved for Processing", value: proposalStats.approved, filter: "Approved for Processing", color: "green", icon: CheckCircle2 },
          { label: "Rejected", value: proposalStats.rejected, filter: "Rejected", color: "red", icon: XCircle },
          { label: "Changes Requested", value: proposalStats.changesRequested, filter: "Changes Requested", color: "violet", icon: FileText },
          { label: "Rights Evidence Requested", value: proposalStats.rightsEvidenceRequested, filter: "Rights Evidence Requested", color: "purple", icon: ShieldCheck },
        ].map(({ label, value, filter, color, icon: Icon }) => (
          <button
            className={`edc-admin-knowledge-reference-stat edc-admin-metric-card edc-admin-metric-${color}${statusFilter === filter ? " is-active" : ""}`}
            key={label}
            type="button"
            aria-pressed={statusFilter === filter}
            onClick={() => selectProposalFilter(filter)}
          >
            <span className="edc-admin-knowledge-reference-stat-icon"><Icon size={22} aria-hidden="true" /></span>
            <span><small>{label}</small><strong>{storeError ? "—" : value.toLocaleString()}</strong></span>
          </button>
        ))}
      </div>

      <div className="edc-admin-knowledge-workspace">
        <section className="edc-admin-knowledge-directory" aria-label="Knowledge proposals">
          <div className="edc-admin-knowledge-tabs" aria-label="Filter proposals by status">
            {statusTabs.map(({ id, label, count }) => (
              <button
                key={id}
                type="button"
                aria-pressed={statusFilter === id}
                className={statusFilter === id ? "is-active" : ""}
                onClick={() => selectProposalFilter(id)}
              >
                {label} <span>({storeError ? "—" : count.toLocaleString()})</span>
              </button>
            ))}
          </div>

          <div className="edc-admin-knowledge-filters">
            <label className="edc-admin-search">
              <Search size={16} aria-hidden="true" />
              <span className="edc-admin-visually-hidden">Search proposals</span>
              <input
                type="search"
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                placeholder="Search by title, tag, or source..."
              />
            </label>
            <label className="edc-admin-knowledge-select">
              <span className="edc-admin-visually-hidden">Filter by category</span>
              <select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }}>
                <option value="all">All Categories</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
            <label className="edc-admin-knowledge-select">
              <span className="edc-admin-visually-hidden">Filter by saved proposal source</span>
              <select value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value); setPage(1); }}>
                <option value="all">All Sources</option>
                {sourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
            <label className="edc-admin-knowledge-select">
              <span className="edc-admin-visually-hidden">Filter by exact status</span>
              <select
                value={specificStatusFilter}
                onChange={(event) => { setSpecificStatusFilter(event.target.value); setStatusFilter("all"); setPage(1); }}
              >
                <option value="all">All Statuses</option>
                {availableStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
            <label className="edc-admin-knowledge-select">
              <CalendarDays size={14} aria-hidden="true" />
              <span className="edc-admin-visually-hidden">Filter by submission date</span>
              <select value={dateRange} onChange={(event) => { setDateReferenceTime(Date.now()); setDateRange(event.target.value); setPage(1); }}>
                <option value="all">All Time</option>
                <option value="7">Last 7 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="90">Last 90 Days</option>
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
          </div>

          <p className="edc-admin-knowledge-demo-note">
            Approval records an Admin decision only. This frontend does not process, ingest, or publish shared AI knowledge.
          </p>

          {storeError ? (
            <div className="edc-admin-applications-empty">
              <span className="edc-admin-applications-empty-icon" aria-hidden="true"><Info size={22} /></span>
              <h3>Proposal records unavailable</h3>
              <p>Saved data could not be read, so proposal totals and records are not shown.</p>
            </div>
          ) : sortedProposals.length ? (
            <div className="edc-admin-table-wrap edc-admin-knowledge-table-wrap">
              <table className="edc-admin-applications-table edc-admin-knowledge-table">
                <thead>
                  <tr>
                    <th scope="col">Knowledge Item</th>
                    <th scope="col">Category</th>
                    <th scope="col">Source</th>
                    <th scope="col">Added On</th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProposals.map((proposal) => (
                    <tr
                      key={proposalKey(proposal)}
                      className={proposalKey(proposal) === proposalKey(featuredProposal || {}) ? "is-selected" : ""}
                      onClick={() => setFeaturedProposalKey(proposalKey(proposal))}
                    >
                      <td>
                        <span className="edc-admin-knowledge-proposal-cell">
                          <span className="edc-admin-knowledge-proposal-icon"><BookOpenCheck size={17} aria-hidden="true" /></span>
                          <span><strong>{displayValue(proposal.proposedTopic)}</strong><small>ID: {displayValue(proposal.proposalId)}</small></span>
                        </span>
                      </td>
                      <td><span className="edc-admin-knowledge-category">{displayValue(proposal.subject)}</span></td>
                      <td>{proposalSourceLabel(proposal)}</td>
                      <td><span className="edc-admin-knowledge-date"><CalendarDays size={13} aria-hidden="true" />{formatDate(proposal.submittedAt)}</span></td>
                      <td><span className={`edc-admin-status-badge ${statusClass(proposal.status)}`}>{displayValue(proposal.status)}</span></td>
                      <td>
                        <button
                          className="edc-admin-knowledge-row-action"
                          type="button"
                          title="Review proposal"
                          aria-label={`Review ${displayValue(proposal.proposedTopic)}`}
                          onClick={(event) => openProposal(proposal, event)}
                        ><Eye size={16} aria-hidden="true" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="edc-admin-applications-empty">
              <span className="edc-admin-applications-empty-icon" aria-hidden="true"><BookOpenCheck size={22} /></span>
              <h3>{proposals.length ? "No proposals match these filters" : "No knowledge proposals yet"}</h3>
              <p>{proposals.length ? "Try another search or filter." : "Create a proposal from an existing teacher course to begin review."}</p>
            </div>
          )}

          <div className="edc-admin-knowledge-pagination">
            <p aria-live="polite">
              {storeError ? "Proposal count unavailable." : `Showing ${pageStart}–${pageEnd} of ${sortedProposals.length.toLocaleString()} proposals`}
            </p>
            <div>
              <button type="button" aria-label="Previous page" disabled={currentPage <= 1 || Boolean(storeError)} onClick={() => setPage((current) => Math.max(1, current - 1))}><ArrowLeft size={16} /></button>
              {startPage > 1 && <><button type="button" onClick={() => setPage(1)}>1</button>{startPage > 2 && <span>…</span>}</>}
              {pageNumbers.map((pageNumber) => <button key={pageNumber} type="button" aria-current={currentPage === pageNumber ? "page" : undefined} onClick={() => setPage(pageNumber)}>{pageNumber}</button>)}
              {endPage < pageCount && <>{endPage < pageCount - 1 && <span>…</span>}<button type="button" onClick={() => setPage(pageCount)}>{pageCount}</button></>}
              <button type="button" aria-label="Next page" disabled={currentPage >= pageCount || Boolean(storeError)} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}><ArrowRight size={16} /></button>
            </div>
          </div>
        </section>

        <aside className="edc-admin-knowledge-sidebar">
          <section className="edc-admin-knowledge-side-card">
            <header><h3><ShieldCheck size={18} aria-hidden="true" />Platform Governance</h3></header>
            <p className="edc-admin-knowledge-side-note">Current saved platform rules; these are not AI processing controls.</p>
            {platformSettings.error && <p className="edc-admin-knowledge-settings-error" role="alert">{platformSettings.error}</p>}
            {settingsError && <p className="edc-admin-knowledge-settings-error" role="alert">{settingsError}</p>}
            <label className="edc-admin-knowledge-setting">
              <span><strong>Course approval required</strong><small>Saved course publishing rule</small></span>
              <input
                type="checkbox"
                checked={Boolean(platformSettings.rules.courseApprovalRequired)}
                disabled={Boolean(platformSettings.error)}
                onChange={(event) => updatePlatformRule("courseApprovalRequired", event.target.checked)}
              />
            </label>
            <label className="edc-admin-knowledge-publishing-setting">
              <span>Content publishing rule</span>
              <select
                value={platformSettings.rules.contentPublishingRules}
                disabled={Boolean(platformSettings.error)}
                onChange={(event) => updatePlatformRule("contentPublishingRules", event.target.value)}
              >
                <option>Approved content only</option>
                <option>Admin review required</option>
                <option>Allow teacher publishing</option>
              </select>
            </label>
            <Link to="/admin/settings" className="edc-admin-knowledge-settings-link">Manage platform settings</Link>
          </section>

          <section className="edc-admin-knowledge-side-card">
            <header><h3><Layers size={18} aria-hidden="true" />Proposal Sources</h3></header>
            <div className="edc-admin-knowledge-source-counts">
              <div><span>Linked course records</span><strong>{storeError ? "—" : sourceCourseCount.toLocaleString()}</strong></div>
              <div><span>Courses available to propose</span><strong>{storeError ? "—" : availableCourses.length.toLocaleString()}</strong></div>
            </div>
            {sourceOptions.length ? (
              <ul className="edc-admin-knowledge-source-list">
                {sourceOptions.slice(0, 5).map((source) => (
                  <li key={source}><FileText size={15} aria-hidden="true" /><span title={source}>{source}</span></li>
                ))}
              </ul>
            ) : (
              <p className="edc-admin-knowledge-side-note">No source references are saved with the current proposals.</p>
            )}
            <p className="edc-admin-knowledge-source-disclaimer">No external AI provider connection is configured in this frontend.</p>
          </section>

          <section className="edc-admin-knowledge-side-card">
            <header><h3><FilePlus2 size={18} aria-hidden="true" />Quick Actions</h3></header>
            <div className="edc-admin-knowledge-quick-actions">
              <button type="button" onClick={() => { returnFocusRef.current = document.activeElement; setError(""); setFeedback(""); setCreateDialogOpen(true); }} disabled={Boolean(storeError) || availableCourses.length === 0}><FilePlus2 size={15} />Add proposal</button>
              <Link to="/admin/settings"><ShieldCheck size={15} />Configure rules</Link>
              <Link to="/admin/audit-logs"><FileText size={15} />View audit log</Link>
            </div>
          </section>

          {featuredProposal && (
            <section className="edc-admin-knowledge-side-card edc-admin-knowledge-recent-card">
              <header><h3><Clock3 size={18} aria-hidden="true" />Selected Proposal</h3></header>
              <strong>{displayValue(featuredProposal.proposedTopic)}</strong>
              <span>{displayValue(featuredProposal.teacherName)}</span>
              <span className={`edc-admin-status-badge ${statusClass(featuredProposal.status)}`}>{displayValue(featuredProposal.status)}</span>
              <button type="button" className="edc-admin-action-button" onClick={(event) => openProposal(featuredProposal, event)}><Eye size={14} />Review details</button>
              {typeof featuredProposal.reviewNotes === "string" && featuredProposal.reviewNotes.trim()
                ? <p>{featuredProposal.reviewNotes}</p>
                : <p>No review notes are saved for this proposal.</p>}
            </section>
          )}
        </aside>
      </div>

      {createDialogOpen && (
        <div
          className="edc-admin-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCreateDialogOpen(false);
          }}
        >
          <section
            className="edc-admin-details-modal edc-admin-knowledge-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edc-admin-knowledge-create-title"
            onKeyDown={handleDialogKeyDown}
          >
            <header className="edc-admin-details-header">
              <div>
                <span className="edc-admin-page-eyebrow">EXPLICIT DEMO SUBMISSION</span>
                <h3 id="edc-admin-knowledge-create-title">Submit a course for knowledge review</h3>
              </div>
              <button
                className="edc-admin-modal-close"
                type="button"
                aria-label="Close submission dialog"
                ref={closeButtonRef}
                onClick={() => setCreateDialogOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            <form onSubmit={submitCourseProposal}>
              <p className="edc-admin-knowledge-muted">
                Select a real teacher course. Its available title, description,
                category, level, language and lesson text will be copied into a
                separate proposal snapshot. Nothing is processed or published.
              </p>
              {availableCourses.length ? (
                <label className="edc-admin-knowledge-form-field">
                  <span>Existing course</span>
                  <select
                    required
                    value={selectedCourseKey}
                    onChange={(event) => setSelectedCourseKey(event.target.value)}
                  >
                    <option value="">Select a course</option>
                    {availableCourses.map(({ course, teacherName }) => (
                      <option key={courseKey(course)} value={courseKey(course)}>
                        {displayValue(course.title)} — {teacherName}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="edc-admin-applications-empty edc-admin-applications-empty-compact">
                  <strong>No eligible courses</strong>
                  <p>Every available course already has a proposal, or no teacher courses exist.</p>
                </div>
              )}
              {error && (
                <p className="edc-admin-feedback edc-admin-feedback-error" role="alert">
                  <Info size={16} aria-hidden="true" />
                  {error}
                </p>
              )}
              <div className="edc-admin-details-actions">
                <button
                  className="edc-admin-action-button"
                  type="button"
                  onClick={() => setCreateDialogOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="edc-admin-action-button edc-admin-action-approve"
                  type="submit"
                  disabled={!selectedCourseKey || Boolean(storeError)}
                >
                  <FilePlus2 size={14} aria-hidden="true" />
                  Create proposal
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {selectedProposal && (
        <div
          className="edc-admin-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedProposal(null);
          }}
        >
          <section
            className="edc-admin-details-modal edc-admin-knowledge-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edc-admin-knowledge-details-title"
            onKeyDown={handleDialogKeyDown}
          >
            <header className="edc-admin-details-header">
              <div>
                <span className="edc-admin-page-eyebrow">KNOWLEDGE PROPOSAL</span>
                <h3 id="edc-admin-knowledge-details-title">
                  {displayValue(selectedProposal.proposedTopic)}
                </h3>
              </div>
              <button
                className="edc-admin-modal-close"
                type="button"
                aria-label="Close proposal details"
                ref={closeButtonRef}
                onClick={() => setSelectedProposal(null)}
              >
                <X size={18} />
              </button>
            </header>

            <dl className="edc-admin-knowledge-detail-grid">
              <div>
                <dt>Teacher</dt>
                <dd>{displayValue(selectedProposal.teacherName)}</dd>
              </div>
              <div>
                <dt>Related course</dt>
                <dd>{displayValue(selectedCourse?.title)}</dd>
              </div>
              <div>
                <dt>Subject</dt>
                <dd>{displayValue(selectedProposal.subject)}</dd>
              </div>
              <div>
                <dt>Academic level</dt>
                <dd>{displayValue(selectedProposal.academicLevel)}</dd>
              </div>
              <div>
                <dt>Language</dt>
                <dd>{displayValue(selectedProposal.language)}</dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{formatDate(selectedProposal.submittedAt)}</dd>
              </div>
              <div>
                <dt>Review status</dt>
                <dd>
                  <span className={`edc-admin-status-badge ${statusClass(selectedProposal.status)}`}>
                    {displayValue(selectedProposal.status)}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Rights evidence</dt>
                <dd>{displayValue(selectedProposal.rightsEvidenceStatus ?? selectedProposal.rightsStatus)}</dd>
              </div>
            </dl>

            <section className="edc-admin-knowledge-detail-section">
              <h4>Proposal content</h4>
              {renderCourseContent(selectedCourse)}
            </section>
            <div className="edc-admin-knowledge-detail-grid">
              <div>
                <h4>Source references</h4>
                <p>{displayValue(selectedProposal.sourceReferences)}</p>
              </div>
              <div>
                <h4>Existing knowledge coverage</h4>
                <p>{displayValue(selectedProposal.existingCoverage)}</p>
              </div>
            </div>
            <section className="edc-admin-knowledge-detail-section">
              <h4>Admin review notes</h4>
              <p className="edc-admin-knowledge-prewrap">
                {displayValue(selectedProposal.reviewNotes)}
              </p>
            </section>

            {selectedProposal.status === "Pending Review" && (
              <div className="edc-admin-knowledge-review">
                <label className="edc-admin-knowledge-form-field">
                  <span>
                    Review note
                    <small>
                      Required for changes, rights evidence, and rejection
                      (minimum 10 characters).
                    </small>
                  </span>
                  <textarea
                    rows={3}
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    placeholder="Record the reason for your review decision."
                  />
                </label>
                {error && (
                  <p className="edc-admin-feedback edc-admin-feedback-error" role="alert">
                    <Info size={16} aria-hidden="true" />
                    {error}
                  </p>
                )}
                <p className="edc-admin-knowledge-disclaimer">
                  Approval is only permission to consider a future processing
                  stage. It does not ingest content, generate embeddings, or
                  publish shared AI knowledge. Rights evidence is not verified
                  by this demo.
                </p>
                <div className="edc-admin-details-actions">
                  <button
                    className="edc-admin-action-button edc-admin-action-approve"
                    type="button"
                    onClick={() => submitReviewDecision("Approved for Processing")}
                  >
                    <CheckCircle2 size={14} aria-hidden="true" />
                    Approve for processing
                  </button>
                  <button
                    className="edc-admin-action-button"
                    type="button"
                    onClick={() => submitReviewDecision("Changes Requested")}
                  >
                    Request changes
                  </button>
                  <button
                    className="edc-admin-action-button"
                    type="button"
                    onClick={() => submitReviewDecision("Rights Evidence Requested")}
                  >
                    Request rights evidence
                  </button>
                  <button
                    className="edc-admin-action-button edc-admin-action-reject"
                    type="button"
                    onClick={() => submitReviewDecision("Rejected")}
                  >
                    Reject proposal
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

export default AdminKnowledgeGovernance;

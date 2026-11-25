import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  CircleX,
  Clock3,
  Download,
  Eye,
  GraduationCap,
  Info,
  ListChecks,
  Search,
  ShieldCheck,
  UserPlus,
  UsersRound,
  X,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  appendAdminActivityRecord,
} from "./adminData";
import {
  ADMIN_PLATFORM_SETTINGS_CHANGED_EVENT,
  getAdminPlatformSettings,
  saveAdminPlatformSettings,
} from "./adminPlatformSettings";
import { createCsvContent, downloadCsv } from "./adminCsvUtils";
import {
  getAdminTeacherApplications,
  notifyAdminTeacherApplicationsChanged,
  updateAdminTeacherApplication,
} from "./adminTeacherApi";

const FILTERS = [
  { id: "all", label: "All Applications" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

const DETAIL_FIELDS = [
  ["bio", "About"],
  ["about", "About"],
  ["certifications", "Certifications"],
  ["certificates", "Certificates"],
  ["teachingPhilosophy", "Teaching philosophy"],
  ["languages", "Languages"],
];

function firstValue(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (
      typeof value === "string" ||
      typeof value === "number"
    ) {
      const text = String(value).trim();
      if (text) return text;
    }

    if (
      Array.isArray(value) &&
      value.every((item) => typeof item === "string")
    ) {
      const text = value.map((item) => item.trim()).filter(Boolean).join(", ");
      if (text) return text;
    }
  }

  return "";
}

function applicationStatus(application) {
  return typeof application.status === "string" && application.status.trim()
    ? application.status.trim()
    : "Not provided";
}

function teacherName(application) {
  return firstValue(application, ["name"]) || "Not provided";
}

function teacherAvatar(application) {
  return application.avatar ||
    application.profile?.avatar ||
    application.teacherProfile?.avatar ||
    "";
}

function normalizedStatus(application) {
  return applicationStatus(application).toLowerCase();
}

function formatApplicationDate(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "Not provided";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not provided"
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });
}

function exportApplications(applications) {
  const columns = [
    { header: "Teacher ID", getValue: (application) => application.id || application.applicationId || "" },
    { header: "Name", getValue: (application) => application.name || "" },
    { header: "Email", getValue: (application) => application.email || "" },
    { header: "Subject / Expertise", getValue: (application) => firstValue(application, ["subject", "specialization", "teachingSpecialization", "teachingSubject"]) },
    { header: "Qualification", getValue: (application) => firstValue(application, ["qualification", "highestQualification", "education"]) },
    { header: "Experience", getValue: (application) => firstValue(application, ["experience", "yearsOfExperience", "teachingExperience"]) },
    { header: "Applied On", getValue: (application) => application.applicationDate || application.appliedAt || application.createdAt || "" },
    { header: "Status", getValue: applicationStatus },
  ];
  downloadCsv("educonnect-teacher-applications.csv", createCsvContent(applications, columns));
}

function statusClass(application) {
  const status = normalizedStatus(application);
  if (status === "pending") return "edc-admin-status-pending";
  if (status === "approved" || status === "active") return "edc-admin-status-approved";
  if (status === "rejected") return "edc-admin-status-rejected";
  return "edc-admin-status-unknown";
}

function AdminTeacherApplications() {
  const [applications, setApplications] = useState([]);
  const [loadingApplications, setLoadingApplications] = useState(true);
  const [savingTeacherId, setSavingTeacherId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [platformSettings, setPlatformSettings] = useState(getAdminPlatformSettings);
  const pageSize = 8;

  async function refreshApplications() {
    try {
      setApplications(await getAdminTeacherApplications());
      setError("");
    } catch (loadError) {
      setError(loadError.message || "Could not load teachers.");
    } finally {
      setLoadingApplications(false);
    }
  }

  useEffect(() => {
    const initialRefresh = window.setTimeout(refreshApplications, 0);

    function closeOnEscape(event) {
      if (event.key === "Escape") setSelectedApplication(null);
    }

    function refreshPlatformSettings() {
      setPlatformSettings(getAdminPlatformSettings());
    }

    window.addEventListener(ADMIN_PLATFORM_SETTINGS_CHANGED_EVENT, refreshPlatformSettings);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("focus", refreshApplications);

    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener(ADMIN_PLATFORM_SETTINGS_CHANGED_EVENT, refreshPlatformSettings);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("focus", refreshApplications);
    };
  }, []);

  const filteredApplications = useMemo(() => {
    const query = search.trim().toLowerCase();

    return applications.filter((application) => {
      const status = normalizedStatus(application);
      const matchesStatus = statusFilter === "all" ||
        (statusFilter === "other"
          ? !["pending", "approved", "rejected"].includes(status)
          : status === statusFilter);
      const searchableText = [
        application.name,
        application.email,
        application.id,
        application.applicationId,
        firstValue(application, [
          "subject",
          "specialization",
          "teachingSpecialization",
          "teachingSubject",
        ]),
      ]
        .filter((value) => typeof value === "string" || typeof value === "number")
        .map(String)
        .join(" ")
        .toLowerCase();

      return matchesStatus && (!query || searchableText.includes(query));
    });
  }, [applications, search, statusFilter]);
  const statusCounts = useMemo(() => applications.reduce((counts, application) => {
    const status = normalizedStatus(application);
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {}), [applications]);
  const pendingCount = statusCounts.pending || 0;
  const approvedCount = statusCounts.approved || 0;
  const rejectedCount = statusCounts.rejected || 0;
  const activeCount = statusCounts.active || 0;
  const otherCount = Math.max(0, applications.length - pendingCount - approvedCount - rejectedCount);
  const pageCount = Math.max(1, Math.ceil(filteredApplications.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleApplications = filteredApplications.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const pageStart = filteredApplications.length ? (currentPage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(currentPage * pageSize, filteredApplications.length);
  const statusFilters = [
    { ...FILTERS[0], count: applications.length },
    { ...FILTERS[1], count: pendingCount },
    { ...FILTERS[2], count: approvedCount },
    { ...FILTERS[3], count: rejectedCount },
    ...(otherCount ? [{ id: "other", label: "Other", count: otherCount }] : []),
  ];
  const applicationSegments = [
    { label: "Approved", count: approvedCount, color: "#740bc7" },
    { label: "Pending", count: pendingCount, color: "#f0aa00" },
    { label: "Rejected", count: rejectedCount, color: "#e52e55" },
    ...(otherCount ? [{ label: "Other statuses", count: otherCount, color: "#bba9cc" }] : []),
  ];
  const donutStops = applicationSegments.reduce((result, segment) => {
    const end = result.progress + (segment.count / Math.max(1, applications.length)) * 100;
    return {
      progress: end,
      stops: [...result.stops, `${segment.color} ${result.progress}% ${end}%`],
    };
  }, { progress: 0, stops: [] }).stops.join(", ");
  const donutBackground = applications.length
    ? `conic-gradient(${donutStops})`
    : "conic-gradient(#e9def4 0 100%)";
  const approvedPercentage = applications.length
    ? Math.round((approvedCount / applications.length) * 100)
    : 0;

  function selectStatusFilter(status) {
    setStatusFilter(status);
    setPage(1);
  }

  function handleExport() {
    setMessage("");
    setError("");
    try {
      exportApplications(filteredApplications);
      setMessage(`Exported ${filteredApplications.length} teacher application${filteredApplications.length === 1 ? "" : "s"}.`);    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "The applications could not be exported.");
    }
  }

  function updateApplicationSetting(section, key, value) {
    setMessage("");
    setError("");
    try {
      const nextSettings = {
        ...platformSettings,
        [section]: { ...platformSettings[section], [key]: value },
      };
      saveAdminPlatformSettings(nextSettings);
      setPlatformSettings(getAdminPlatformSettings());
      setMessage("Teacher application setting saved.");
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "The setting could not be saved.");
    }
  }

  async function changeApplicationStatus(application, nextStatus) {
    setMessage("");
    setError("");

    if (nextStatus === "rejected" &&
      !window.confirm(`Reject the teacher application for ${teacherName(application)}?`)) {
      return;
    }

    setSavingTeacherId(application.id);
    try {
      await updateAdminTeacherApplication(application.id, nextStatus);
      const manager = window.sessionStorage.getItem("educonnect.demoEmail") || "Admin";
      try {
        appendAdminActivityRecord({
          actor: manager,
          actorRole: "Admin",
          action: nextStatus === "approved" ? "Teacher Approved" : "Teacher Rejected",
          category: "teacher-applications",
          module: "Teacher Applications",
          entityType: "Teacher Application",
          entityId: application.id,
          targetId: application.id,
          targetName: teacherName(application),
          previousValue: application.status || "pending",
          newValue: nextStatus,
          description: `Teacher application ${nextStatus} through MongoDB API.`,
          result: "Success",
        });
      } catch {
        // A failed local activity log must not undo a completed server action.
      }
      setSelectedApplication(null);
      await refreshApplications();
      notifyAdminTeacherApplicationsChanged();
      setMessage(nextStatus === "approved" ? "Teacher application approved." : "Teacher application rejected.");
    } catch (statusError) {
      setError(statusError.message || "The teacher application could not be updated.");
    } finally {
      setSavingTeacherId(null);
    }
  }

  function renderDetails(application) {
    const fields = [
      ["Teacher name", application.name],
      ["Email", application.email],
      [
        "Subject or specialization",
        firstValue(application, [
          "subject",
          "specialization",
          "teachingSpecialization",
          "teachingSubject",
        ]),
      ],
      [
        "Qualification",
        firstValue(application, [
          "qualification",
          "highestQualification",
          "education",
        ]),
      ],
      [
        "Experience",
        firstValue(application, [
          "experience",
          "yearsOfExperience",
          "teachingExperience",
        ]),
      ],
      [
        "Application date",
        formatApplicationDate(
          application.applicationDate ??
            application.appliedAt ??
            application.createdAt,
        ),
      ],
      ["Current status", applicationStatus(application)],
      ...DETAIL_FIELDS.filter(([key]) =>
        Object.hasOwn(application, key),
      ).map(([key, label]) => [
        label,
        firstValue(application, [key]) || "Not provided",
      ]),
    ];

    return fields.map(([label, value], index) => (
      <div
        className="edc-admin-detail-field"
        key={`${label}-${index}`}
      >
        <dt>{label}</dt>
        <dd>
          {typeof value === "string" || typeof value === "number"
            ? String(value).trim() || "Not provided"
            : "Not provided"}
        </dd>
      </div>
    ));
  }

  const summaryCards = [
    { label: "Total Applications", count: applications.length, icon: UsersRound, status: "all" },
    { label: "Pending Review", count: pendingCount, icon: Clock3, status: "pending" },
    { label: "Approved", count: approvedCount, icon: Check, status: "approved" },
    { label: "Rejected", count: rejectedCount, icon: XCircle, status: "rejected" },
    { label: "Active Teachers", count: activeCount, icon: GraduationCap, status: "active" },
  ];
  const startPage = Math.max(1, Math.min(currentPage - 2, pageCount - 4));
  const endPage = Math.min(pageCount, startPage + 4);
  const pageNumbers = Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index);

  return (
    <section className="edc-admin-teacher-applications">
      <header className="edc-admin-teacher-applications-heading">
        <div>
          <span className="edc-admin-page-eyebrow">APPLICATIONS</span>
          <h2><UsersRound aria-hidden="true" />Teacher Applications</h2>
          <p>Review teacher applications stored in MongoDB.</p>
        </div>
        <div className="edc-admin-teacher-applications-actions">
          <button type="button" className="edc-admin-action-button" onClick={() => selectStatusFilter("pending")} disabled={!pendingCount}>
            <Clock3 size={16} aria-hidden="true" />Review Pending
          </button>
          <button type="button" className="edc-admin-action-button" onClick={handleExport} disabled={!filteredApplications.length}>
            <Download size={16} aria-hidden="true" />Export List
          </button>
          <Link to="/signup" className="edc-admin-button-primary">
            <UserPlus size={16} aria-hidden="true" />Open Signup
          </Link>
        </div>
      </header>

      <div className="edc-admin-teacher-application-stats" aria-label="Teacher application summaries">
        {summaryCards.map(({ label, count, icon: Icon, status }) => (
          <button
            type="button"
            className={`edc-admin-teacher-application-stat${statusFilter === status ? " is-active" : ""}`}
            key={label}
            aria-pressed={statusFilter === status}
            onClick={() => selectStatusFilter(status)}
          >
            <span className="edc-admin-teacher-application-stat-icon"><Icon size={24} aria-hidden="true" /></span>
            <span><small>{label}</small><strong>{count.toLocaleString()}</strong></span>
          </button>
        ))}
      </div>

      {message && (
        <p className="edc-admin-feedback edc-admin-feedback-success" role="status">
          <Check size={16} aria-hidden="true" />
          {message}
        </p>
      )}
      {error && (
        <p className="edc-admin-feedback edc-admin-feedback-error" role="alert">
          <Info size={16} aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="edc-admin-teacher-applications-layout">
        <section className="edc-admin-teacher-applications-directory">
          <div className="edc-admin-teacher-application-tabs" aria-label="Filter applications">
            {statusFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                aria-pressed={statusFilter === filter.id}
                className={statusFilter === filter.id ? "is-active" : ""}
                onClick={() => selectStatusFilter(filter.id)}
              >
                {filter.label} <span>({filter.count.toLocaleString()})</span>
              </button>
            ))}
          </div>

          <div className="edc-admin-teacher-application-toolbar">
            <label className="edc-admin-search">
              <Search size={17} aria-hidden="true" />
              <span className="edc-admin-visually-hidden">Search teacher applications</span>
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search by name, email or application ID"
              />
            </label>
            <span className="edc-admin-teacher-application-filter-label"><ListChecks size={15} />{filteredApplications.length.toLocaleString()} matching</span>
          </div>

          {loadingApplications ? (
            <div className="edc-admin-applications-empty"><p>Loading teachers from MongoDB...</p></div>
          ) : applications.length === 0 ? (
            <div className="edc-admin-applications-empty">
              <span className="edc-admin-applications-empty-icon" aria-hidden="true"><UsersRound size={23} /></span>
              <h3>No teacher applications</h3>
              <p>Teachers registered in MongoDB will appear here.</p>
            </div>
          ) : filteredApplications.length === 0 ? (
            <div className="edc-admin-applications-empty edc-admin-applications-empty-compact">
              <Search size={21} aria-hidden="true" />
              <h3>No matching applications</h3>
              <p>Try another search term or select a different status filter.</p>
            </div>
          ) : (
            <div className="edc-admin-table-wrap edc-admin-teacher-application-table-wrap">
              <table className="edc-admin-applications-table edc-admin-teacher-application-table">
                <thead>
                  <tr>
                    <th scope="col">Applicant</th>
                    <th scope="col">Subject / Expertise</th>
                    <th scope="col">Qualification</th>
                    <th scope="col">Applied On</th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleApplications.map((application) => {
                    const pending = normalizedStatus(application) === "pending";
                    const subject = firstValue(application, [
                      "subject",
                      "specialization",
                      "teachingSpecialization",
                      "teachingSubject",
                    ]);
                    const qualification = firstValue(application, [
                      "qualification",
                      "highestQualification",
                      "education",
                    ]);
                    const applicationId = firstValue(application, ["id", "applicationId"]);
                    const avatar = teacherAvatar(application);

                    return (
                      <tr key={application.email.toLowerCase()}>
                        <td>
                          <span className="edc-admin-teacher-applicant">
                            <span className="edc-admin-teacher-applicant-avatar">
                              {avatar ? <img src={avatar} alt="" /> : teacherName(application).trim().charAt(0).toUpperCase()}
                            </span>
                            <span>
                              <strong>{teacherName(application)}</strong>
                              {applicationId && <small>ID: {applicationId}</small>}
                              <small>{application.email}</small>
                            </span>
                          </span>
                        </td>
                        <td><span className="edc-admin-teacher-subject">{subject || "Not provided"}</span></td>
                        <td>{qualification || "Not provided"}</td>
                        <td><span className="edc-admin-teacher-date"><CalendarDays size={14} />{formatApplicationDate(application.applicationDate ?? application.appliedAt ?? application.createdAt ?? application.registeredAt)}</span></td>
                        <td><span className={`edc-admin-status-badge ${statusClass(application)}`}>{applicationStatus(application)}</span></td>
                        <td>
                          <div className="edc-admin-teacher-row-actions">
                            <button
                              className="edc-admin-teacher-row-action"
                              type="button"
                              aria-label={`View ${teacherName(application)} details`}
                              title="View details"
                              onClick={() => {
                                setMessage("");
                                setError("");
                                setSelectedApplication(application);
                              }}
                            ><Eye size={17} aria-hidden="true" /></button>
                            {pending && (
                              <>
                                <button
                                  className="edc-admin-teacher-row-action is-approve"
                                  type="button"
                                  aria-label={`Approve ${teacherName(application)}`}
                                  title="Approve"
                                  disabled={savingTeacherId !== null}
                                  onClick={() => changeApplicationStatus(application, "approved")}
                                ><Check size={17} aria-hidden="true" /></button>
                                <button
                                  className="edc-admin-teacher-row-action is-reject"
                                  type="button"
                                  aria-label={`Reject ${teacherName(application)}`}
                                  title="Reject"
                                  disabled={savingTeacherId !== null}
                                  onClick={() => changeApplicationStatus(application, "rejected")}
                                ><X size={17} aria-hidden="true" /></button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="edc-admin-teacher-application-pagination">
            <p aria-live="polite">Showing {pageStart}â€“{pageEnd} of {filteredApplications.length.toLocaleString()} applications</p>
            <div>
              <button type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ArrowLeft size={16} /></button>
              {startPage > 1 && <><button type="button" onClick={() => setPage(1)}>1</button>{startPage > 2 && <span>â€¦</span>}</>}
              {pageNumbers.map((pageNumber) => <button key={pageNumber} type="button" aria-current={currentPage === pageNumber ? "page" : undefined} onClick={() => setPage(pageNumber)}>{pageNumber}</button>)}
              {endPage < pageCount && <>{endPage < pageCount - 1 && <span>â€¦</span>}<button type="button" onClick={() => setPage(pageCount)}>{pageCount}</button></>}
              <button type="button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage((current)=> Math.min(pageCount, current + 1))}><ArrowRight size={16} /></button>
            </div>
          </div>
        </section>

        <aside className="edc-admin-teacher-applications-sidebar">
          <section className="edc-admin-teacher-applications-card">
            <div className="edc-admin-teacher-applications-card-heading"><h3><ShieldCheck size={20} />Application Overview</h3></div>
            <div className="edc-admin-teacher-application-overview">
              <div className="edc-admin-teacher-application-donut" style={{ background: donutBackground }} role="img" aria-label={`${approvedCount} of ${applications.length} applications approved`}>
                <span><strong>{approvedPercentage}%</strong><small>Approved</small></span>
              </div>
              <div className="edc-admin-teacher-application-legend">
                {applicationSegments.map((segment) => (
                  <button key={segment.label} type="button" onClick={() => selectStatusFilter(segment.label === "Other statuses" ? "other" : segment.label.toLowerCase())}>
                    <i style={{ backgroundColor: segment.color }} /><span>{segment.label}</span><strong>{segment.count.toLocaleString()}</strong>
                  </button>
                ))}
                <div><i /><span>Total</span><strong>{applications.length.toLocaleString()}</strong></div>
              </div>
            </div>
          </section>

          <section className="edc-admin-teacher-applications-card">
            <div className="edc-admin-teacher-applications-card-heading"><h3><ListChecks size={20} />Quick Actions</h3></div>
            <div className="edc-admin-teacher-quick-actions">
              <button type="button" onClick={() => selectStatusFilter("pending")} disabled={!pendingCount}><Clock3 size={16} />Review Pending</button>
              <button type="button" onClick={() => selectStatusFilter("approved")} disabled={!approvedCount}><BadgeCheck size={16} />View Approved</button>
              <button type="button" onClick={() => selectStatusFilter("rejected")} disabled={!rejectedCount}><CircleX size={16}/>View Rejected</button>
              <button type="button" onClick={handleExport} disabled={!filteredApplications.length}><Download size={16} />ExportList</button>
            </div>
          </section>

          <section className="edc-admin-teacher-applications-card">
            <div className="edc-admin-teacher-applications-card-heading"><h3><GraduationCap size={20} />Application Settings</h3></div>
            {platformSettings.error && <p className="edc-admin-teacher-settings-error" role="alert">{platformSettings.error}</p>}
            <label className="edc-admin-teacher-setting">
              <span><strong>New application alerts</strong><small>Admin notification preference</small></span>
              <input
                type="checkbox"
                checked={Boolean(platformSettings.notifications.newTeacherApplicationAlerts)}
                disabled={Boolean(platformSettings.error)}
                onChange={(event) => updateApplicationSetting("notifications", "newTeacherApplicationAlerts", event.target.checked)}
              />
            </label>
            <Link to="/admin/settings" className="edc-admin-teacher-settings-link">Manage platform settings</Link>
          </section>
        </aside>
      </div>

      {selectedApplication && (
        <div
          className="edc-admin-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedApplication(null);
            }
          }}
        >
          <section
            className="edc-admin-details-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edc-admin-details-title"
          >
            <header className="edc-admin-details-header">
              <div>
                <span className="edc-admin-page-eyebrow">
                  TEACHER APPLICATION
                </span>
                <h3 id="edc-admin-details-title">Application details</h3>
              </div>
              <button
                className="edc-admin-modal-close"
                type="button"
                aria-label="Close application details"
                onClick={() => setSelectedApplication(null)}
              >
                <X size={19} />
              </button>
            </header>
            <dl className="edc-admin-details-list">
              {renderDetails(selectedApplication)}
            </dl>
            {normalizedStatus(selectedApplication) === "pending" && (
              <div className="edc-admin-details-actions">
                <button
                  className="edc-admin-action-button edc-admin-action-approve"
                  type="button"
                  disabled={savingTeacherId !== null}
                  onClick={() =>
                    changeApplicationStatus(selectedApplication, "approved")
                  }
                >
                  <Check size={15} aria-hidden="true" />
                  Approve
                </button>
                <button
                  className="edc-admin-action-button edc-admin-action-reject"
                  type="button"
                  disabled={savingTeacherId !== null}
                  onClick={() =>
                    changeApplicationStatus(selectedApplication, "rejected")
                  }
                >
                  <XCircle size={15} aria-hidden="true" />
                  Reject
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

export default AdminTeacherApplications;

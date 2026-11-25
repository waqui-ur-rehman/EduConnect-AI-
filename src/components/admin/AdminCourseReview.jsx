import { reviewContent, contentFileUrl } from "../../utils/contentApi";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  Eye,
  ExternalLink,
  FileUp,
  Info,
  Layers,
  RotateCcw,
  Search,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  ADMIN_DATA_CHANGED_EVENT,
  ADMIN_USERS_KEY,
  appendAdminActivityRecord,
  getAdminTeachers,
  readAdminArray,
} from "./adminData";
import { createCsvContent, downloadCsv } from "./adminCsvUtils";
import { getAdminContentQueue } from "./adminQueueApi";

const STATUS_ORDER = [
  "Draft",
  "Submitted",
  "AI Review",
  "Admin Review",
  "Pending Approval",
  "Changes Requested",
  "Approved",
  "Published",
  "Rejected",
  "Suspended",
];
const AI_REPORT_FIELDS = [
  ["status", "Status"],
  ["summary", "Summary"],
  ["completeness", "Completeness"],
  ["quality", "Quality"],
  ["pedagogy", "Pedagogy"],
  ["accuracy", "Accuracy"],
  ["safety", "Safety"],
  ["originality", "Originality"],
  ["rights", "Rights"],
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

function formatCourseDate(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "Not provided";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not provided"
    : date.toLocaleDateString();
}

function formatSubmissionDate(course) {
  const dates = [
    course.submittedAt,
    course.submissionDate,
    course.submittedOn,
    course.submittedDate,
    course.createdAt,
  ];

  for (const date of dates) {
    const formatted = formatCourseDate(date);
    if (formatted !== "Not provided") return formatted;
  }

  return "Not provided";
}

function getCourseTimestamp(course) {
  const dates = [
    course.submittedAt,
    course.submissionDate,
    course.submittedOn,
    course.submittedDate,
    course.createdAt,
  ];

  for (const value of dates) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    const timestamp = new Date(value).getTime();
    if (!Number.isNaN(timestamp)) return timestamp;
  }

  return null;
}

function isPendingReview(course) {
  return course.status === "Pending Approval";
}

function courseStatusClass(status) {
  switch (String(status || "").toLowerCase()) {
    case "pending approval":
    case "submitted":
    case "draft":
      return "edc-admin-status-pending";
    case "approved":
      return "edc-admin-status-approved";
    case "published":
      return "edc-admin-status-published";
    case "changes requested":
    case "admin review":
    case "ai review":
      return "edc-admin-status-changes";
    case "rejected":
    case "suspended":
      return "edc-admin-status-rejected";
    default:
      return "edc-admin-status-unknown";
  }
}

function getCourseFilters(courses) {
  const hasOtherStatuses = courses.some(
    (course) =>
      ![
        "Pending Approval",
        "Approved",
        "Rejected",
        "Draft",
        "Published",
      ].includes(course.status),
  );
  return [
    { id: "all", label: "All Courses" },
    { id: "pending", label: "Pending" },
    { id: "Approved", label: "Approved" },
    { id: "Rejected", label: "Rejected" },
    { id: "Published", label: "Published" },
    { id: "Draft", label: "Drafts" },
    ...(hasOtherStatuses ? [{ id: "other", label: "Other" }] : []),
  ];
}

function firstCourseValue(course, keys) {
  for (const key of keys) {
    const value = displayValue(course[key]);
    if (value !== "Not provided") return value;
  }
  return "Not provided";
}

function courseCategory(course) {
  return firstCourseValue(course, ["category", "subject"]);
}

function arrayField(course, keys) {
  for (const key of keys) {
    if (Array.isArray(course[key])) return course[key];
  }
  return [];
}

function safeMediaUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const media = value.trim();
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(media)) {
    return media;
  }
  try {
    const url = new URL(media);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function getAiReport(course) {
  for (const key of ["aiReport", "aiReview", "qualityReport"]) {
    const value = course[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return AI_REPORT_FIELDS
        .filter(([field]) => Object.hasOwn(value, field))
        .map(([field, label]) => [label, displayValue(value[field])]);
    }

    if (typeof value === "string" && value.trim()) {
      return [["Report", value.trim()]];
    }
  }
  return [];
}

function getCourseReviewChecks(course) {
  const media = firstCourseValue(course, [
    "thumbnailUrl",
    "thumbnail",
    "imageUrl",
    "image",
    "videoUrl",
  ]);
  return [
    { label: "Course description added", complete: displayValue(course.description) !== "Not provided" },
    { label: "Syllabus available", complete: (Array.isArray(course.syllabus) && course.syllabus.length > 0) || (typeof course.syllabus === "string" && Boolean(course.syllabus.trim())) },
    { label: "Lessons available", complete: Array.isArray(course.lessons) && course.lessons.length > 0 },
    { label: "Rights declaration provided", complete: firstCourseValue(course, ["rightsDeclaration", "ownershipDeclaration", "contentOwnership"]) !== "Not provided" },
    { label: "Course media provided", complete: Boolean(safeMediaUrl(media)) },
  ];
}

function readCourseSnapshot(courses = []) {
  const users = readAdminArray(ADMIN_USERS_KEY);
  const teachers = getAdminTeachers(users);
  const teacherByEmail = new Map(
    teachers.map((teacher) => [
      teacher.email.trim().toLowerCase(),
      teacher,
    ]),
  );
  return courses.map((course) => {
    const email = String(course.teacherEmail || "").trim().toLowerCase();
    const teacher = teacherByEmail.get(email);
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
      ...course,
      teacherName:
        displayValue(teacher?.name) !== "Not provided"
          ? displayValue(teacher?.name)
          : displayValue(course.teacherName || profile.name),
      teacherAvatar:
        teacher?.avatar ||
        teacher?.profile?.avatar ||
        teacher?.teacherProfile?.avatar ||
        profile.avatar ||
        "",
    };
  });
}

function courseKey(course) {
  const id =
    course.id === undefined || course.id === null || course.id === ""
      ? JSON.stringify({ ...course, teacherName: undefined })
      : String(course.id);

  return `${course.teacherEmail.trim().toLowerCase()}:${id}`;
}

function lessonText(lesson, key) {
  if (lesson === null || typeof lesson !== "object" || Array.isArray(lesson)) {
    return "Not provided";
  }

  return displayValue(lesson[key]);
}

function AdminCourseReview() {
  const [courses, setCourses] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [specificStatusFilter, setSpecificStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [instructorFilter, setInstructorFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [dateReferenceTime, setDateReferenceTime] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedCourseKey, setSelectedCourseKey] = useState("");
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [revisionEditorOpen, setRevisionEditorOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const closeButtonRef = useRef(null);
  const returnFocusRef = useRef(null);
  const pageSize = 8;

  const loadCourses = useCallback(async () => {
    try {
      const queue = await getAdminContentQueue("courses");
      setCourses(readCourseSnapshot(queue.records));
      setError(queue.source === "fallback"
        ? "The backend is unavailable. Showing saved browser courses."
        : "");
    } catch (loadError) {
      setCourses([]);
      setError(loadError instanceof Error
        ? loadError.message
        : "Course review queue could not be loaded.");
    }
  }, []);

  const filters = useMemo(() => {
    const groups = getCourseFilters(courses);
    return groups.map((filter) => ({
      ...filter,
      count: courses.filter((course) => {
        if (filter.id === "all") return true;
        if (filter.id === "pending") return isPendingReview(course);
        if (filter.id === "other") {
          return !["Pending Approval", "Approved", "Rejected", "Draft"].includes(course.status);
        }
        return course.status === filter.id;
      }).length,
    }));
  }, [courses]);

  const categories = useMemo(
    () => [...new Set(courses
      .map(courseCategory)
      .filter((category) => category !== "Not provided"))].sort((a, b) => a.localeCompare(b)),
    [courses],
  );
  const instructors = useMemo(() => {
    const byEmail = new Map();
    courses.forEach((course) => {
      if (!course.teacherEmail) return;
      const email = course.teacherEmail.trim().toLowerCase();
      if (!byEmail.has(email)) {
        byEmail.set(email, {
          email: course.teacherEmail,
          name: displayValue(course.teacherName),
        });
      }
    });
    return [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [courses]);
  const availableStatuses = useMemo(
    () => [...new Set(courses
      .map((course) => course.status)
      .filter((status) => typeof status === "string" && status.trim()))]
      .sort((a, b) => {
        const orderA = STATUS_ORDER.indexOf(a);
        const orderB = STATUS_ORDER.indexOf(b);
        if (orderA === -1 && orderB === -1) return a.localeCompare(b);
        if (orderA === -1) return 1;
        if (orderB === -1) return -1;
        return orderA - orderB;
      }),
    [courses],
  );
  const courseCounts = useMemo(() => ({
    all: courses.length,
    pending: courses.filter(isPendingReview).length,
    approved: courses.filter((course) => course.status === "Approved").length,
    rejected: courses.filter((course) => course.status === "Rejected").length,
    published: courses.filter((course) => course.status === "Published").length,
    drafts: courses.filter((course) => course.status === "Draft").length,
  }), [courses]);

  useEffect(() => {
    function refreshCourses() {
      void loadCourses();
    }

    function closeOnEscape(event) {
      if (event.key === "Escape") setSelectedCourse(null);
    }

    const initialRefresh = window.setTimeout(refreshCourses, 0);
    window.addEventListener("storage", refreshCourses);
    window.addEventListener("focus", refreshCourses);
    window.addEventListener(ADMIN_DATA_CHANGED_EVENT, refreshCourses);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener("storage", refreshCourses);
      window.removeEventListener("focus", refreshCourses);
      window.removeEventListener(ADMIN_DATA_CHANGED_EVENT, refreshCourses);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [loadCourses]);

  useEffect(() => {
    if (selectedCourse) {
      closeButtonRef.current?.focus();
    } else {
      returnFocusRef.current?.focus();
    }
  }, [selectedCourse]);

  function closeDetails() {
    setSelectedCourse(null);
    setRevisionEditorOpen(false);
    setRevisionNotes("");
  }

  function openDetails(course, event) {
    returnFocusRef.current = event.currentTarget;
    setSelectedCourseKey(courseKey(course));
    setRevisionNotes(
      typeof course.revisionNotes === "string" ? course.revisionNotes : "",
    );
    setRevisionEditorOpen(false);
    setMessage("");
    setError("");
    setSelectedCourse(course);
  }

  function handleDialogKeyDown(event) {
    if (event.key !== "Tab") return;
    const controls = Array.from(
      event.currentTarget.querySelectorAll(
        'button:not(:disabled), textarea:not(:disabled), a[href], input:not(:disabled)',
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

  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase();
    const days = Number(dateRange);
    const cutoff = dateRange === "all" || !dateReferenceTime
      ? null
      : dateReferenceTime - days * 24 * 60 * 60 * 1000;

    return courses.filter((course) => {
      const status = course.status;
      const matchesGroup = statusFilter === "all" ||
        (statusFilter === "pending" && isPendingReview(course)) ||
        (statusFilter === "other" &&
          !["Pending Approval", "Approved", "Rejected", "Draft"].includes(status)) ||
        status === statusFilter;
      const matchesSpecificStatus = specificStatusFilter === "all" ||
        status === specificStatusFilter;
      const matchesCategory = categoryFilter === "all" ||
        courseCategory(course) === categoryFilter;
      const matchesInstructor = instructorFilter === "all" ||
        course.teacherEmail.trim().toLowerCase() === instructorFilter;
      const timestamp = getCourseTimestamp(course);
      const matchesDate = cutoff === null ||
        (timestamp !== null && timestamp >= cutoff && timestamp <= dateReferenceTime);
      const searchableText = [
        course.title,
        course.teacherName,
        course.teacherEmail,
        course.category,
        course.subject,
        course.id,
      ]
        .filter((value) => typeof value === "string" || typeof value === "number")
        .map(String)
        .join(" ")
        .toLowerCase();

      return matchesGroup &&
        matchesSpecificStatus &&
        matchesCategory &&
        matchesInstructor &&
        matchesDate &&
        (!query || searchableText.includes(query));
    });
  }, [courses, search, statusFilter, specificStatusFilter, categoryFilter, instructorFilter, dateRange, dateReferenceTime]);

  const sortedCourses = useMemo(
    () => [...filteredCourses].sort((a, b) =>
      (getCourseTimestamp(b) ?? -Infinity) - (getCourseTimestamp(a) ?? -Infinity),
    ),
    [filteredCourses],
  );
  const pageCount = Math.max(1, Math.ceil(sortedCourses.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleCourses = sortedCourses.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pageStart = sortedCourses.length ? (currentPage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(currentPage * pageSize, sortedCourses.length);
  const startPage = Math.max(1, Math.min(currentPage - 2, pageCount - 4));
  const endPage = Math.min(pageCount, startPage + 4);
  const pageNumbers = Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index);
  const featuredCourse = sortedCourses.find(
    (course) => courseKey(course) === selectedCourseKey,
  ) || sortedCourses[0] || null;

  function selectCourseFilter(filter) {
    setStatusFilter(filter);
    setSpecificStatusFilter("all");
    setPage(1);
  }

  function handleExport() {
    setMessage("");
    setError("");
    try {
      const columns = [
        { header: "Course ID", getValue: (course) => course.id ?? "" },
        { header: "Course", getValue: (course) => course.title ?? "" },
        { header: "Instructor", getValue: (course) => course.teacherName ?? "" },
        { header: "Instructor Email", getValue: (course) => course.teacherEmail ?? "" },
            { header: "Category", getValue: courseCategory },
        { header: "Submitted On", getValue: formatSubmissionDate },
        { header: "Status", getValue: (course) => course.status ?? "" },
      ];
      downloadCsv(
        "educonnect-course-review-report.csv",
        createCsvContent(sortedCourses, columns),
      );
      setMessage(`Exported ${sortedCourses.length} course${sortedCourses.length === 1 ? "" : "s"}.`);
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "The course report could not be exported.",
      );
    }
  }

  async function changeCourseStatus(course, nextStatus) {
    setMessage("");
    setError("");

    const confirmation =
      nextStatus === "Rejected"
        ? `Reject "${displayValue(course.title)}"? The course and its content will be preserved.`
        : nextStatus === "Suspended"
          ? `Suspend "${displayValue(course.title)}"? The course record and its content will be preserved.`
          : null;
    if (confirmation && !window.confirm(confirmation)) {
      return;
    }

    try {
      const reason = nextStatus === "Rejected"
        ? window.prompt("Reason for rejection", revisionNotes)?.trim()
        : revisionNotes.trim();
      if (["Rejected", "Changes Requested"].includes(nextStatus) && !reason) {
        setError("A reason is required.");
        return;
      }
      const decision = { Approved: "approve", Rejected: "reject", Suspended: "unpublish", "Changes Requested": "reject" }[nextStatus];
      await reviewContent("courses", course, decision, reason);
      const manager = window.sessionStorage.getItem("educonnect.demoEmail") || "Admin";
      appendAdminActivityRecord({
        id: `course-${course.teacherEmail}-${course.id}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor: manager,
        action: nextStatus === "Approved"
          ? "approved"
          : nextStatus === "Rejected"
            ? "rejected"
            : nextStatus === "Suspended"
              ? "suspended"
              : "revision_requested",
        category: "course-review",
        entityType: "Course",
        entityId: String(course.id ?? "unknown"),
        targetId: String(course.id ?? "unknown"),
        targetName: displayValue(course.title),
        previousValue: course.status || "Not set",
        newValue: nextStatus,
        ...((nextStatus === "Rejected" || nextStatus === "Changes Requested") && revisionNotes.trim()
          ? { reason: revisionNotes.trim() }
          : {}),
        description:
          nextStatus === "Approved"
            ? "Course approved"
            : nextStatus === "Rejected"
              ? "Course rejected"
              : nextStatus === "Suspended"
                ? "Course suspended"
                : "Course revision requested",
        result: "Success",
      });
      await loadCourses();
      closeDetails();
      setMessage(
        nextStatus === "Approved"
          ? "Course approved and published. It is now available to Students."
          : nextStatus === "Rejected"
            ? "Course rejected. The course and its content were preserved."
            : nextStatus === "Suspended"
              ? "Course suspended. No publishing or AI knowledge records were changed."
              : "Revision requested. The notes were saved with the course; no email was sent.",
      );
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "The course status could not be updated.",
      );
    }
  }

  function renderFieldList(values, emptyMessage = "Not provided") {
    if (!values.length) {
      return (
        <p className="edc-admin-course-content-empty">{emptyMessage}</p>
      );
    }

    return (
      <ul className="edc-admin-course-review-list">
        {values.map((value, index) => {
          const label =
            value && typeof value === "object" && !Array.isArray(value)
              ? firstCourseValue(value, ["title", "name", "label"])
              : displayValue(value);
          const description =
            value && typeof value === "object" && !Array.isArray(value)
              ? firstCourseValue(value, ["description", "summary"])
              : "Not provided";
          return (
            <li key={`${label}-${index}`}>
              {label}
              {description !== "Not provided" ? ` — ${description}` : ""}
            </li>
          );
        })}
      </ul>
    );
  }

  function renderLessonContent(course) {
    if (!Array.isArray(course.lessons) || course.lessons.length === 0) {
      return (
        <p className="edc-admin-course-content-empty">
          No course lessons or content are available.
        </p>
      );
    }

    return (
      <ol className="edc-admin-course-lessons">
        {course.lessons.map((lesson, index) => (
          <li key={lesson?.id ?? `${courseKey(course)}-lesson-${index}`}>
            <strong>{lessonText(lesson, "title")}</strong>
            {lesson.content && <p>{lesson.content}</p>}
            {lesson.videoFileId && <video controls preload="metadata" src={contentFileUrl(lesson.videoFileId)} style={{ width: "100%", maxHeight: 300 }} />}
            {lesson.fileId && <a href={contentFileUrl(lesson.fileId)} target="_blank" rel="noreferrer">Open lesson attachment</a>}
            {lessonText(lesson, "description") !== "Not provided" && (
              <span>{lessonText(lesson, "description")}</span>
            )}
          </li>
        ))}
      </ol>
    );
  }

  function renderDetails(course) {
    const price = displayValue(course.price);
    const currency = displayValue(course.currency);
    const fields = [
      ["Course title", displayValue(course.title)],
      ["Subtitle", displayValue(course.subtitle)],
      ["Instructor", displayValue(course.teacherName)],
      ["Teacher email", displayValue(course.teacherEmail)],
      ["Category or subject", courseCategory(course)],
      ["Pricing", price === "Not provided" ? price : `${price}${currency !== "Not provided" ? ` ${currency}` : ""}`],
      ["Submission date", formatSubmissionDate(course)],
      ["Current status", displayValue(course.status)],
    ];

    return fields.map(([label, value]) => (
      <div className="edc-admin-detail-field" key={label}>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    ));
  }

  return (
    <section className="edc-admin-course-review">
      <header className="edc-admin-course-heading">
        <div>
          <span className="edc-admin-page-eyebrow">COURSE GOVERNANCE</span>
          <h2><BookOpen aria-hidden="true" />Course Review &amp; Approval</h2>
          <p>Review saved teacher courses before approving them for students.</p>
        </div>
        <div className="edc-admin-course-heading-actions">
          <Link to="/admin/data-import" className="edc-admin-action-button">
            <FileUp size={16} aria-hidden="true" />Import Courses
          </Link>
          <button
            type="button"
            className="edc-admin-action-button"
            onClick={handleExport}
            disabled={!sortedCourses.length}
          >
            <Download size={16} aria-hidden="true" />Export Report
          </button>
          <button
            type="button"
            className="edc-admin-button-primary"
            onClick={() => selectCourseFilter("pending")}
            disabled={!courseCounts.pending}
          >
            <Clock3 size={16} aria-hidden="true" />Review Pending
          </button>
        </div>
      </header>

      <div className="edc-admin-course-stats" aria-label="Course summaries">
        {[
          { label: "Total Courses", count: courseCounts.all, filter: "all", color: "purple", icon: Layers },
          { label: "Pending Review", count: courseCounts.pending, filter: "pending", color: "orange", icon: Clock3 },
          { label: "Approved", count: courseCounts.approved, filter: "Approved", color: "green", icon: CheckCircle2 },
          { label: "Rejected", count: courseCounts.rejected, filter: "Rejected", color: "red", icon: XCircle },
          { label: "Published", count: courseCounts.published, filter: "Published", color: "violet", icon: BookOpen },
          { label: "Drafts", count: courseCounts.drafts, filter: "Draft", color: "purple", icon: FileUp },
        ].map(({ label, count, filter, color, icon: Icon }) => (
          <button
            className={`edc-admin-course-stat edc-admin-metric-card edc-admin-metric-${color}${statusFilter === filter ? " is-active" : ""}`}
            key={label}
            type="button"
            aria-pressed={statusFilter === filter}
            onClick={() => selectCourseFilter(filter)}
          >
            <span className="edc-admin-course-stat-icon"><Icon size={23} aria-hidden="true" /></span>
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

      <div className="edc-admin-course-workspace">
        <section className="edc-admin-course-directory" aria-label="Course records">
          <div className="edc-admin-course-tabs" aria-label="Filter courses by review status">
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={statusFilter === filter.id ? "is-active" : ""}
              aria-pressed={statusFilter === filter.id}
              onClick={() => selectCourseFilter(filter.id)}
            >
              {filter.label} <span>({filter.count.toLocaleString()})</span>
            </button>
          ))}
          </div>

          <div className="edc-admin-course-filters">
            <label className="edc-admin-search">
              <Search size={17} aria-hidden="true" />
              <span className="edc-admin-visually-hidden">Search courses</span>
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search by course title, instructor, or ID..."
              />
            </label>
            <label className="edc-admin-course-select">
              <span className="edc-admin-visually-hidden">Filter by category</span>
              <select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }}>
                <option value="all">All Categories</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
            <label className="edc-admin-course-select">
              <span className="edc-admin-visually-hidden">Filter by instructor</span>
              <select value={instructorFilter} onChange={(event) => { setInstructorFilter(event.target.value); setPage(1); }}>
                <option value="all">All Instructors</option>
                {instructors.map((instructor) => (
                  <option key={instructor.email} value={instructor.email.trim().toLowerCase()}>
                    {instructor.name === "Not provided" ? instructor.email : instructor.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
            <label className="edc-admin-course-select">
              <span className="edc-admin-visually-hidden">Filter by course status</span>
              <select
                value={specificStatusFilter}
                onChange={(event) => {
                  setSpecificStatusFilter(event.target.value);
                  setStatusFilter("all");
                  setPage(1);
                }}
              >
                <option value="all">All Statuses</option>
                {availableStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
            <label className="edc-admin-course-select">
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

          {courses.length === 0 ? (
            <div className="edc-admin-applications-empty">
              <span className="edc-admin-applications-empty-icon" aria-hidden="true"><BookOpen size={23} /></span>
              <h3>No courses found</h3>
              <p>Teacher courses saved in this browser will appear here.</p>
            </div>
          ) : sortedCourses.length === 0 ? (
            <div className="edc-admin-applications-empty edc-admin-applications-empty-compact">
              <Search size={21} aria-hidden="true" />
              <h3>No matching courses</h3>
              <p>Try a different search term or filter.</p>
            </div>
          ) : (
            <div className="edc-admin-table-wrap edc-admin-course-table-wrap">
              <table className="edc-admin-applications-table edc-admin-course-table">
                <thead>
                  <tr>
                    <th scope="col">Course</th>
                    <th scope="col">Instructor</th>
                    <th scope="col">Category</th>
                    <th scope="col">Submitted On</th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCourses.map((course) => {
                    const media = safeMediaUrl(firstCourseValue(course, ["thumbnailUrl", "thumbnail", "imageUrl", "image"]));
                    const pending = isPendingReview(course);
                    return (
                      <tr
                        key={courseKey(course)}
                        className={courseKey(course) === courseKey(featuredCourse || {}) ? "is-selected" : ""}
                        onClick={() => setSelectedCourseKey(courseKey(course))}
                      >
                        <td>
                          <div className="edc-admin-course-cell">
                            <span className="edc-admin-course-thumbnail">
                              {media ? <img src={media} alt="" loading="lazy" /> : <BookOpen size={18} aria-hidden="true" />}
                            </span>
                            <span>
                              <strong>{displayValue(course.title)}</strong>
                              {course.id !== undefined && course.id !== null && <small>ID: {displayValue(course.id)}</small>}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="edc-admin-course-instructor">
                            <span className="edc-admin-course-instructor-avatar">
                              {course.teacherAvatar ? <img src={course.teacherAvatar} alt="" loading="lazy" /> : <UserRound size={15} aria-hidden="true" />}
                            </span>
                            <span><strong>{displayValue(course.teacherName)}</strong><small>{displayValue(course.teacherEmail)}</small></span>
                          </span>
                        </td>
                        <td><span className="edc-admin-course-category">{courseCategory(course)}</span></td>
                        <td><span className="edc-admin-course-date"><CalendarDays size={13} aria-hidden="true" />{formatSubmissionDate(course)}</span></td>
                        <td><span className={`edc-admin-status-badge ${courseStatusClass(course.status)}`}>{displayValue(course.status)}</span></td>
                        <td>
                          <div className="edc-admin-course-row-actions">
                            <button
                              className="edc-admin-course-icon-button"
                              type="button"
                              title="Review course details"
                              aria-label={`Review ${displayValue(course.title)}`}
                              onClick={(event) => openDetails(course, event)}
                            ><Eye size={16} aria-hidden="true" /></button>
                            {pending && (
                              <>
                                <button
                                  className="edc-admin-course-icon-button is-approve"
                                  type="button"
                                  title="Approve course"
                                  aria-label={`Approve ${displayValue(course.title)}`}
                                  onClick={() => changeCourseStatus(course, "Approved")}
                                ><Check size={16} aria-hidden="true" /></button>
                                <button
                                  className="edc-admin-course-icon-button is-reject"
                                  type="button"
                                  title="Reject course"
                                  aria-label={`Reject ${displayValue(course.title)}`}
                                  onClick={() => changeCourseStatus(course, "Rejected")}
                                ><X size={16} aria-hidden="true" /></button>
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

          <div className="edc-admin-course-pagination">
            <p aria-live="polite">Showing {pageStart}–{pageEnd} of {sortedCourses.length.toLocaleString()} courses</p>
            <div>
              <button type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ArrowLeft size={16} /></button>
              {startPage > 1 && <><button type="button" onClick={() => setPage(1)}>1</button>{startPage > 2 && <span>…</span>}</>}
              {pageNumbers.map((pageNumber) => <button key={pageNumber} type="button" aria-current={currentPage === pageNumber ? "page" : undefined} onClick={() => setPage(pageNumber)}>{pageNumber}</button>)}
              {endPage < pageCount && <>{endPage < pageCount - 1 && <span>…</span>}<button type="button" onClick={() => setPage(pageCount)}>{pageCount}</button></>}
              <button type="button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}><ArrowRight size={16} /></button>
            </div>
          </div>
        </section>

        <aside className="edc-admin-course-sidebar">
          {featuredCourse ? (
            <>
              <section className="edc-admin-course-side-card">
                <header className="edc-admin-course-side-heading"><h3><BookOpen size={18} />Course Review</h3></header>
                {(() => {
                  const image = safeMediaUrl(firstCourseValue(featuredCourse, ["thumbnailUrl", "thumbnail", "imageUrl", "image"]));
                  return (
                    <div className="edc-admin-course-feature">
                      <div className="edc-admin-course-feature-image">
                        {image ? <img src={image} alt="" /> : <BookOpen size={32} aria-hidden="true" />}
                      </div>
                      <span className={`edc-admin-status-badge ${courseStatusClass(featuredCourse.status)}`}>{displayValue(featuredCourse.status)}</span>
                      <h4>{displayValue(featuredCourse.title)}</h4>
                      <p>Instructor: {displayValue(featuredCourse.teacherName)}</p>
                      <div className="edc-admin-course-feature-meta">
                        <span><Layers size={13} aria-hidden="true" />{courseCategory(featuredCourse)}</span>
                        <span><CalendarDays size={13} aria-hidden="true" />{formatSubmissionDate(featuredCourse)}</span>
                      </div>
                      <div className="edc-admin-course-side-actions">
                        <button type="button" className="edc-admin-button-primary" onClick={(event) => openDetails(featuredCourse, event)}><Eye size={14} />Review Details</button>
                        {isPendingReview(featuredCourse) && (
                          <>
                            <button type="button" className="edc-admin-course-side-approve" onClick={() => changeCourseStatus(featuredCourse, "Approved")}><Check size={14} />Approve</button>
                            <button type="button" className="edc-admin-course-side-reject" onClick={() => changeCourseStatus(featuredCourse, "Rejected")}><X size={14} />Reject</button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </section>
              <section className="edc-admin-course-side-card">
                <header className="edc-admin-course-side-heading"><h3><CheckCircle2 size={18} />Review Checklist</h3></header>
                <ul className="edc-admin-course-checklist">
                  {getCourseReviewChecks(featuredCourse).map((check) => (
                    <li key={check.label} className={check.complete ? "is-present" : ""}>
                      {check.complete ? <CheckCircle2 size={15} /> : <span aria-hidden="true" />}
                      {check.label}
                    </li>
                  ))}
                </ul>
                <p className="edc-admin-course-checklist-note">Shows whether saved materials are present; review their quality manually.</p>
              </section>
              <section className="edc-admin-course-side-card">
                <header className="edc-admin-course-side-heading"><h3><Info size={18} />Reviewer Notes</h3></header>
                <p className="edc-admin-course-reviewer-note">
                  {typeof featuredCourse.revisionNotes === "string" && featuredCourse.revisionNotes.trim()
                    ? featuredCourse.revisionNotes
                    : "No saved reviewer notes."}
                </p>
                <p className="edc-admin-course-publishing-note">
                  Approval publishes the reviewed course and lessons. Later Teacher edits require a new review.
                </p>
              </section>
            </>
          ) : (
            <section className="edc-admin-course-side-card edc-admin-course-side-empty">
              <BookOpen size={26} aria-hidden="true" />
              <h3>No course selected</h3>
              <p>Saved course records will appear here when available.</p>
            </section>
          )}
        </aside>
      </div>

      {selectedCourse && (
        <div
          className="edc-admin-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDetails();
          }}
        >
          <section
            className="edc-admin-details-modal edc-admin-course-details-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edc-admin-course-details-title"
            onKeyDown={handleDialogKeyDown}
          >
            <header className="edc-admin-details-header">
              <div>
                <span className="edc-admin-page-eyebrow">COURSE REVIEW</span>
                <h3 id="edc-admin-course-details-title">
                  {displayValue(selectedCourse.title)}
                </h3>
              </div>
              <button
                className="edc-admin-modal-close"
                type="button"
                aria-label="Close course details"
                ref={closeButtonRef}
                onClick={closeDetails}
              >
                <X size={19} />
              </button>
            </header>
            <div className="edc-admin-course-review-panels">
              <div className="edc-admin-course-preview">
                <h4>Course preview</h4>
                <dl className="edc-admin-details-list">
                  {renderDetails(selectedCourse)}
                  <div className="edc-admin-detail-field">
                    <dt>Description</dt>
                    <dd>{displayValue(selectedCourse.description)}</dd>
                  </div>
                  <div className="edc-admin-detail-field">
                    <dt>Target audience</dt>
                    <dd>{firstCourseValue(selectedCourse, ["targetAudience", "audience"])}</dd>
                  </div>
                  <div className="edc-admin-detail-field">
                    <dt>Refund policy</dt>
                    <dd>{firstCourseValue(selectedCourse, ["refundPolicy", "refundTerms"])}</dd>
                  </div>
                </dl>

                <section className="edc-admin-course-section">
                  <h5>Syllabus</h5>
                  {Array.isArray(selectedCourse.syllabus)
                    ? renderFieldList(selectedCourse.syllabus)
                    : <p>{displayValue(selectedCourse.syllabus)}</p>}
                </section>
                <section className="edc-admin-course-section">
                  <h5>Sections</h5>
                  {renderFieldList(arrayField(selectedCourse, ["sections"]))}
                </section>
                <section className="edc-admin-course-section">
                  <h5>Learning outcomes</h5>
                  {renderFieldList(arrayField(selectedCourse, ["learningOutcomes", "outcomes"]))}
                </section>
                <section className="edc-admin-course-section">
                  <h5>Requirements</h5>
                  {renderFieldList(arrayField(selectedCourse, ["requirements"]))}
                </section>
                <section className="edc-admin-course-section edc-admin-course-content">
                  <h5>Lessons</h5>
                  {renderLessonContent(selectedCourse)}
                  {(selectedCourse.curriculum?.resources || []).map((resource) => <p key={resource.id}><a href={contentFileUrl(resource.fileId)} target="_blank" rel="noreferrer">{resource.name}</a></p>)}
                </section>
                <section className="edc-admin-course-section">
                  <h5>Media</h5>
                  {(() => {
                    const media = firstCourseValue(selectedCourse, [
                      "thumbnailUrl",
                      "thumbnail",
                      "imageUrl",
                      "image",
                      "videoUrl",
                    ]);
                    const mediaUrl = safeMediaUrl(media);
                    if (!mediaUrl) {
                      return <p className="edc-admin-course-content-empty">No supported course media is available.</p>;
                    }
                    const isImage =
                      /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(mediaUrl) ||
                      /\.(png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i.test(mediaUrl);
                    return (
                      <div className="edc-admin-course-media">
                        {isImage && (
                          <img
                            src={mediaUrl}
                            alt={`${displayValue(selectedCourse.title)} course media`}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink size={14} aria-hidden="true" />
                          Open course media in a new tab
                        </a>
                      </div>
                    );
                  })()}
                </section>
              </div>

              <aside className="edc-admin-course-decision">
                <h4>Admin decision</h4>
                <span className={`edc-admin-status-badge ${courseStatusClass(selectedCourse.status)}`}>
                  {displayValue(selectedCourse.status)}
                </span>
                <dl className="edc-admin-details-list">{renderDetails(selectedCourse).filter((_, index) => index === 5 || index === 6)}</dl>

                <div className="edc-admin-course-ai-report">
                  <strong>AI quality report</strong>
                  {getAiReport(selectedCourse).length ? (
                    <dl className="edc-admin-details-list">
                      {getAiReport(selectedCourse).map(([label, value]) => (
                        <div className="edc-admin-detail-field" key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p>AI report pending / not available.</p>
                  )}
                </div>

                <div className="edc-admin-course-rights">
                  <strong>Rights declaration</strong>
                  <p>{firstCourseValue(selectedCourse, ["rightsDeclaration", "ownershipDeclaration", "contentOwnership"])}</p>
                  <p>
                    Status: {firstCourseValue(selectedCourse, ["rightsStatus", "ownershipStatus"])}
                  </p>
                </div>

                {typeof selectedCourse.revisionNotes === "string" &&
                  selectedCourse.revisionNotes.trim() && (
                    <div className="edc-admin-course-revision-note">
                      <strong>Saved revision notes</strong>
                      <p>{selectedCourse.revisionNotes}</p>
                    </div>
                  )}

                <div className="edc-admin-course-review-checklist">
                  <strong>Manual review checklist</strong>
                  {[
                    "Course information is complete.",
                    "Syllabus and lessons have been reviewed.",
                    "Course content is appropriate.",
                    "Ownership declaration has been checked.",
                    "Potential safety concerns have been considered.",
                  ].map((item) => (
                    <label key={item}>
                      <input type="checkbox" />
                      {item}
                    </label>
                  ))}
                  <span className="edc-admin-course-checklist-note">
                    Checklist selections are temporary and do not represent automated verification.
                  </span>
                </div>

                {selectedCourse.status === "Pending Approval" && (
                  <div className="edc-admin-details-actions">
                    <button
                      className="edc-admin-action-button edc-admin-action-approve"
                      type="button"
                      onClick={() => changeCourseStatus(selectedCourse, "Approved")}
                    >
                      <CheckCircle2 size={15} aria-hidden="true" />
                      Approve
                    </button>
                    <button
                      className="edc-admin-action-button edc-admin-action-reject"
                      type="button"
                      onClick={() => changeCourseStatus(selectedCourse, "Rejected")}
                    >
                      <XCircle size={15} aria-hidden="true" />
                      Reject
                    </button>
                    <button
                      className="edc-admin-action-button"
                      type="button"
                      onClick={() => setRevisionEditorOpen((open) => !open)}
                    >
                      <RotateCcw size={15} aria-hidden="true" />
                      Request Revision
                    </button>
                  </div>
                )}

                {revisionEditorOpen &&
                  selectedCourse.status === "Pending Approval" && (
                    <form
                      className="edc-admin-course-revision-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!revisionNotes.trim()) {
                          setError("Enter revision notes before requesting changes.");
                          return;
                        }
                        changeCourseStatus(selectedCourse, "Changes Requested");
                      }}
                    >
                      <label htmlFor="edc-admin-revision-notes">
                        Revision notes for the teacher
                      </label>
                      <textarea
                        id="edc-admin-revision-notes"
                        required
                        value={revisionNotes}
                        onChange={(event) => setRevisionNotes(event.target.value)}
                        placeholder="Describe the changes needed."
                      />
                      <button
                        className="edc-admin-action-button"
                        type="submit"
                      >
                        Save revision notes
                      </button>
                      <span className="edc-admin-course-checklist-note">
                        Notes are saved with the course. No email or notification is sent.
                      </span>
                    </form>
                  )}

                {["Approved", "Published"].includes(selectedCourse.status) && (
                  <div className="edc-admin-details-actions">
                    <button
                      className="edc-admin-action-button edc-admin-action-reject"
                      type="button"
                      onClick={() => changeCourseStatus(selectedCourse, "Suspended")}
                    >
                      <Ban size={15} aria-hidden="true" />
                      Suspend course
                    </button>
                  </div>
                )}
                <p className="edc-admin-course-unsupported-note">
                  Publishing and shared AI knowledge approval are not available in this demo.
                </p>
              </aside>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

export default AdminCourseReview;

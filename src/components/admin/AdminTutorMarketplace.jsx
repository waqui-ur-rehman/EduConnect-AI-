import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  Clock3,
  Download,
  Eye,
  FileText,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Store,
  UsersRound,
  X,
} from "lucide-react";
import {
  ADMIN_DATA_CHANGED_EVENT,
  readAdminSupportRequestsState,
  readAdminUsersState,
  updateAdminSupportRequestStatus,
} from "./adminData";
import {
  getAdminTutorBookings,
  getAdminTutorProfiles,
  readAdminOperationsSettings,
  updateAdminTutorBookingStatus,
  updateTutorReviewStatus,
} from "./adminOperationsData";
import {
  ADMIN_PLATFORM_SETTINGS_CHANGED_EVENT,
  getAdminPlatformSettings,
} from "./adminPlatformSettings";
import { createCsvContent, downloadCsv } from "./adminCsvUtils";
import { getAdminTeacherApplications } from "./adminTeacherApi";
import {
  adminApiRequest,
  getAdminContentQueue,
  getAdminOperationalQueue,
  getAdminSupportQueue,
  normalizeAdminSupportTicket,
  saveAdminOperationalRecord,
} from "./adminQueueApi";
import { courseReviewKey, getReviews, REVIEW_EVENT } from "../../utils/courseReviews";

const SECTIONS = [
  ["tutors", "Tutor Profiles"],
  ["bookings", "Demo Booking Requests"],
  ["cases", "Support Records"],
];
const STATUS_TABS = [
  ["all", "All Tutors"],
  ["pending", "Pending"],
  ["verified", "Verified"],
  ["rejected", "Rejected"],
  ["top-rated", "Top Rated"],
];
const REVIEW_STATUSES = [
  "Pending Review",
  "Evidence Requested",
  "Reviewed (Not Verified)",
  "Verified",
  "Rejected",
];
const BOOKING_STATUSES = ["Demo Request", "Cancelled", "No-show Recorded", "Reviewed"];
const PAGE_SIZE = 8;

function readTutorListings(profiles) {
  const records = [];
  const errors = [];
  const seen = new Set();
  profiles.forEach((profile) => {
    if (!profile.email) return;
    const key = `educonnect.teacher.${profile.email}.courses`;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved)) {
        errors.push("Saved tutor course listings are not in the expected format.");
        return;
      }
      saved.filter((course) => course && typeof course === "object" && !Array.isArray(course))
        .forEach((course, index) => {
          const identity = `${profile.email.toLowerCase()}:${course.id ?? index}`;
          if (seen.has(identity)) return;
          seen.add(identity);
          records.push({ ...course, teacherEmail: profile.email });
        });
    } catch {
      errors.push("Saved tutor course listings could not be read.");
    }
  });
  return { records, errors: [...new Set(errors)] };
}

function loadMarketplaceData() {
  const users = readAdminUsersState();
  const settings = readAdminOperationsSettings();
  const profiles = getAdminTutorProfiles(settings, users.users);
  return {
    users,
    settings,
    profiles,
    listings: readTutorListings(profiles),
    bookings: getAdminTutorBookings(),
    requests: readAdminSupportRequestsState(),
    platform: getAdminPlatformSettings(),
    reviews: getReviews(),
  };
}

async function loadLiveMarketplaceData() {
  const local = loadMarketplaceData();
  try {
    const [teachers, courses, support, decisions, bookings] = await Promise.all([
      getAdminTeacherApplications(),
      getAdminContentQueue("courses"),
      getAdminSupportQueue(),
      getAdminOperationalQueue(
        "tutor-profiles",
        local.profiles.map((profile) => ({ id: profile.id, status: profile.status })),
        (profile) => profile.id,
      ),
      getAdminOperationalQueue(
        "tutor-bookings",
        local.bookings.records,
        (booking) => booking.id,
      ),
    ]);
    const localByEmail = new Map(
      local.profiles.map((profile) => [String(profile.email).toLowerCase(), profile]),
    );
    const decisionsById = new Map(
      decisions.records.map((record) => [String(record.id), record]),
    );
    const profiles = teachers.map((teacher) => {
      const localProfile = localByEmail.get(String(teacher.email).toLowerCase()) || {};
      const decision = decisionsById.get(String(teacher.id)) || {};
      const defaultStatus = teacher.status === "approved"
        ? "Verified"
        : teacher.status === "rejected"
          ? "Rejected"
          : "Pending Review";
      return {
        ...localProfile,
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        createdAt: teacher.createdAt,
        status: decision.status || defaultStatus,
      };
    });
    return {
      ...local,
      source: "backend",
      users: { users: teachers, error: null },
      profiles,
      listings: { records: courses.records, errors: [] },
      bookings: { records: bookings.records, errors: [] },
      requests: {
        records: support.records.map(normalizeAdminSupportTicket),
        error: null,
      },
      settings: {
        ...local.settings,
        tutorReviews: Object.fromEntries(
          decisions.records.map((record) => [record.id, record.status]),
        ),
        error: null,
      },
    };
  } catch (error) {
    if (error?.backendUnavailable) return { ...local, source: "fallback" };
    throw error;
  }
}

function subjectList(profile) {
  if (Array.isArray(profile.subjects)) return profile.subjects;
  return String(profile.subject || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function statusKey(value) {
  return String(value || "").trim().toLowerCase();
}

function isPending(status) {
  return ["pending review", "evidence requested"].includes(statusKey(status));
}

function getStatusClass(status) {
  const value = statusKey(status);
  if (value === "verified") return "edc-admin-status-approved";
  if (value === "rejected") return "edc-admin-status-rejected";
  if (isPending(status)) return "edc-admin-status-pending";
  return "edc-admin-status-changes";
}

function getInitials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function formatDate(value) {
  if (!value) return "Not provided";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

function AdminTutorMarketplace({ email }) {
  const [data, setData] = useState(() => ({ ...loadMarketplaceData(), source: "loading" }));
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [dateReferenceTime, setDateReferenceTime] = useState(0);
  const [tab, setTab] = useState("all");
  const [section, setSection] = useState("tutors");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null);

  async function refresh() {
    try {
      setData(await loadLiveMarketplaceData());
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Tutor marketplace could not be loaded." });
    }
  }

  useEffect(() => {
    const initialRefresh = window.setTimeout(refresh, 0);
    window.addEventListener("storage", refresh);
    window.addEventListener(ADMIN_DATA_CHANGED_EVENT, refresh);
    window.addEventListener(ADMIN_PLATFORM_SETTINGS_CHANGED_EVENT, refresh);
    window.addEventListener(REVIEW_EVENT, refresh);
    window.addEventListener("educonnect:student-data-changed", refresh);
    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener(ADMIN_DATA_CHANGED_EVENT, refresh);
      window.removeEventListener(ADMIN_PLATFORM_SETTINGS_CHANGED_EVENT, refresh);
      window.removeEventListener(REVIEW_EVENT, refresh);
      window.removeEventListener("educonnect:student-data-changed", refresh);
    };
  }, []);

  const cases = useMemo(
    () =>
      data.requests.records.filter((request) => {
        const searchable = [
          request.subject,
          request.description,
          request.requesterName,
          request.requesterEmail,
        ]
          .filter((value) => typeof value === "string")
          .join(" ");
        return request.category === "Moderation & Appeal" || /\btutor\b/i.test(searchable);
      }),
    [data.requests.records],
  );
  const filteredBookings = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.bookings.records.filter((booking) => [
      booking.tutorId,
      booking.studentEmail,
      booking.slot,
      booking.status,
      booking.note,
    ].filter(Boolean).map(String).join(" ").toLowerCase().includes(query));
  }, [data.bookings.records, search]);
  const filteredCases = useMemo(() => {
    const query = search.trim().toLowerCase();
    return cases.filter((request) => [
      request.id,
      request.subject,
      request.description,
      request.requesterName,
      request.requesterEmail,
      request.category,
      request.status,
    ].filter(Boolean).map(String).join(" ").toLowerCase().includes(query));
  }, [cases, search]);

  const tutorRows = useMemo(() => {
    const publishedListings = data.listings.records.filter((course) => course.status === "Published");
    const profiles = data.profiles.map((profile) => {
      const emailKey = String(profile.email || "").trim().toLowerCase();
      const tutorListings = publishedListings.filter(
        (course) => String(course.teacherEmail || "").trim().toLowerCase() === emailKey,
      );
      const listingKeys = new Set(tutorListings.map((course) => courseReviewKey(course)));
      const ratings = data.reviews
        .filter((review) => listingKeys.has(review.courseKey))
        .map((review) => Number(review.rating))
        .filter((rating) => Number.isFinite(rating) && rating >= 1 && rating <= 5);
      const status = data.settings.tutorReviews[profile.id] || profile.status;
      return {
        ...profile,
        status,
        subjects: subjectList(profile),
        listings: tutorListings.length,
        sessions: data.bookings.records.filter(
          (booking) => String(booking.tutorId) === String(profile.id),
        ).length,
        rating: ratings.length
          ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length
          : null,
        ratingCount: ratings.length,
      };
    });
    return profiles;
  }, [data.bookings.records, data.listings.records, data.profiles, data.reviews, data.settings.tutorReviews]);

  const subjectOptions = useMemo(
    () => [...new Set(tutorRows.flatMap((profile) => profile.subjects))].sort((a, b) => a.localeCompare(b)),
    [tutorRows],
  );
  const ratedTutors = tutorRows.filter((profile) => profile.rating !== null);
  const totalReviews = tutorRows.reduce((total, profile) => total + profile.ratingCount, 0);
  const averageRating = totalReviews
    ? (tutorRows.reduce((total, profile) => total + (profile.rating || 0) * profile.ratingCount, 0) / totalReviews).toFixed(1)
    : "—";
  const counts = {
    all: tutorRows.length,
    pending: tutorRows.filter((profile) => isPending(profile.status)).length,
    verified: tutorRows.filter((profile) => statusKey(profile.status) === "verified").length,
    rejected: tutorRows.filter((profile) => statusKey(profile.status) === "rejected").length,
    topRated: ratedTutors.length,
    listings: tutorRows.reduce((total, profile) => total + profile.listings, 0),
  };
  const tabCounts = {
    all: counts.all,
    pending: counts.pending,
    verified: counts.verified,
    rejected: counts.rejected,
    "top-rated": counts.topRated,
  };

  const filteredTutors = useMemo(() => {
    const query = search.trim().replace(/\s+/g, " ").toLowerCase();
    const days = Number(dateRange);
    const cutoff = dateRange === "all" || !dateReferenceTime
      ? null
      : dateReferenceTime - days * 24 * 60 * 60 * 1000;
    return tutorRows
      .filter((profile) => {
        if (tab === "pending" && !isPending(profile.status)) return false;
        if (tab === "verified" && statusKey(profile.status) !== "verified") return false;
        if (tab === "rejected" && statusKey(profile.status) !== "rejected") return false;
        if (tab === "top-rated" && profile.rating === null) return false;
        if (subjectFilter !== "all" && !profile.subjects.includes(subjectFilter)) return false;
        if (cutoff !== null) {
          const created = new Date(profile.createdAt).getTime();
          if (!Number.isFinite(created) || created < cutoff || created > dateReferenceTime) return false;
        }
        const searchable = [
          profile.id,
          profile.name,
          profile.email,
          profile.subject,
          ...profile.subjects,
          profile.qualification,
          profile.experience,
          profile.status,
        ]
          .filter((value) => value !== undefined && value !== null)
          .map(String)
          .join(" ")
          .toLowerCase();
        return !query || searchable.includes(query);
      })
      .sort((a, b) => tab === "top-rated"
        ? b.rating - a.rating || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name));
  }, [dateRange, dateReferenceTime, search, subjectFilter, tab, tutorRows]);

  const pageCount = Math.max(1, Math.ceil(filteredTutors.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageTutors = filteredTutors.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const subjectCounts = useMemo(() => {
    const total = tutorRows.filter((profile) => profile.subjects.length).length;
    const result = new Map();
    tutorRows.forEach((profile) => {
      profile.subjects.forEach((subject) => result.set(subject, (result.get(subject) || 0) + 1));
    });
    return [...result.entries()]
      .map(([name, count]) => ({ name, count, percentage: total ? Math.round((count / total) * 100) : 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 5);
  }, [tutorRows]);
  const statusSegments = data.settings.error ? [] : [
    { label: "Pending", count: counts.pending, color: "#f0aa00" },
    { label: "Verified", count: counts.verified, color: "#16a34a" },
    { label: "Rejected", count: counts.rejected, color: "#e52e55" },
    { label: "Other review status", count: Math.max(0, tutorRows.length - counts.pending - counts.verified - counts.rejected), color: "#7d20d4" },
  ].filter((segment) => segment.count > 0);
  let segmentProgress = 0;
  const donutStops = statusSegments.map((segment) => {
    const end = segmentProgress + (segment.count / Math.max(1, tutorRows.length)) * 100;
    const stop = `${segment.color} ${segmentProgress}% ${end}%`;
    segmentProgress = end;
    return stop;
  }).join(", ");
  const donutBackground = statusSegments.length
    ? `conic-gradient(${donutStops})`
    : tutorRows.length && data.settings.error
      ? "conic-gradient(#9383a5 0 100%)"
      : "conic-gradient(#e9def4 0 100%)";
  const hasUserDataError = Boolean(data.users.error);
  const hasReviewSettingsError = Boolean(data.settings.error);
  const hasDataError = hasUserDataError || hasReviewSettingsError;
  const platformValue = (value) => data.platform.error ? "—" : value;

  function resetFilters() {
    setSearch("");
    setSubjectFilter("all");
    setDateRange("all");
    setTab("all");
    setPage(1);
  }

  async function recordActivity(profile, status) {
    try {
      try {
        updateTutorReviewStatus(
          data.settings,
          profile.id,
          status,
          email || window.sessionStorage.getItem("educonnect.demoEmail") || "Admin",
        );
      } catch (localError) {
        if (data.source === "fallback") throw localError;
      }
      if (data.source !== "fallback") {
        await saveAdminOperationalRecord("tutor-profiles", profile.id, {
          id: profile.id,
          status,
        });
      }
      await refresh();
      setSelected((current) => current && current.id === profile.id ? { ...current, status } : current);
      setFeedback({ type: "success", text: `Review status updated to ${status}.` });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Tutor review could not be saved.",
      });
    }
  }

  async function updateBooking(booking, status) {
    try {
      const updated = { ...booking, status, adminReviewedAt: new Date().toISOString() };
      if (data.source !== "fallback") {
        await saveAdminOperationalRecord("tutor-bookings", booking.id, updated);
      }
      try {
        updateAdminTutorBookingStatus(
          booking,
          status,
          email || window.sessionStorage.getItem("educonnect.demoEmail") || "Admin",
        );
      } catch {
        // MongoDB remains authoritative when this browser has no legacy booking.
      }
      await refresh();
      setSelected(null);
      setFeedback({
        type: "success",
        text: `Saved demo booking request marked ${status}. No tutor or student was notified.`,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Booking status could not be updated.",
      });
    }
  }

  async function updateCase(request, status) {
    try {
      if (data.source !== "fallback") {
        await adminApiRequest(
          `/admin/support/tickets/${encodeURIComponent(request.id)}/status`,
          { method: "PATCH", body: JSON.stringify({ status }) },
        );
      } else {
        updateAdminSupportRequestStatus(
          request.id,
          status,
          email || window.sessionStorage.getItem("educonnect.demoEmail") || "Admin",
        );
      }
      await refresh();
      setSelected(null);
      setFeedback({ type: "success", text: `Support record status updated to ${status}.` });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Support record could not be updated.",
      });
    }
  }

  function exportReport() {
    try {
      const columns = [
        { header: "Tutor ID", getValue: (profile) => profile.id },
        { header: "Name", getValue: (profile) => profile.name },
        { header: "Email", getValue: (profile) => profile.email },
        { header: "Subjects", getValue: (profile) => profile.subjects.join(", ") },
        { header: "Qualification", getValue: (profile) => profile.qualification },
        { header: "Experience", getValue: (profile) => profile.experience },
        { header: "Average Rating", getValue: (profile) => profile.rating ?? "" },
        { header: "Published Listings", getValue: (profile) => profile.listings },
        { header: "Saved Demo Requests", getValue: (profile) => profile.sessions },
        { header: "Review Status", getValue: (profile) => profile.status },
      ];
      downloadCsv("educonnect-tutor-marketplace.csv", createCsvContent(filteredTutors, columns));
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Tutor report could not be exported.",
      });
    }
  }

  const errors = [
    data.users.error,
    data.settings.error,
    ...data.listings.errors,
    ...data.bookings.errors,
    data.requests.error,
    data.platform.error,
  ].filter(Boolean);

  return (
    <section className="edc-admin-tutor-marketplace">
      <header className="edc-admin-tutor-heading">
        <div>
          <span className="edc-admin-page-eyebrow">MARKETPLACE OPERATIONS</span>
          <h2><Store aria-hidden="true" />Tutor Marketplace</h2>
          <p>Review registered tutor profiles, published listings, and saved marketplace-related records.</p>
        </div>
        <div className="edc-admin-tutor-heading-actions">
          <button type="button" className="edc-admin-action-button" onClick={exportReport} disabled={hasDataError || !filteredTutors.length}>
            <Download size={15} aria-hidden="true" />Export Report
          </button>
          <Link className="edc-admin-action-button" to="/admin/users"><UsersRound size={15} aria-hidden="true" />Manage Users</Link>
          <button type="button" className="edc-admin-button-primary" onClick={() => { setSection("tutors"); setTab("pending"); setPage(1); }}>
            <Clock3 size={15} aria-hidden="true" />Review Pending
          </button>
        </div>
      </header>

      <p className="edc-admin-tutor-data-note">
        Tutor cards use registered accounts only. Booking records below are saved Student demo requests; they do not create real appointments or contact tutors.
      </p>
      {feedback && (
        <p className={`edc-admin-feedback edc-admin-feedback-${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>
          {feedback.text}
        </p>
      )}
      {errors.length > 0 && (
        <p className="edc-admin-feedback edc-admin-feedback-error" role="alert">
          {[...new Set(errors)].join(" ")}
        </p>
      )}

      <div className="edc-admin-tutor-stats" aria-label="Tutor marketplace summaries">
        {[
          { label: "Total Tutors", value: hasUserDataError ? "—" : counts.all, tab: "all", color: "purple", icon: UsersRound },
          { label: "Pending Approval", value: hasDataError ? "—" : counts.pending, tab: "pending", color: "orange", icon: Clock3 },
          { label: "Verified Tutors", value: hasDataError ? "—" : counts.verified, tab: "verified", color: "green", icon: Check },
          { label: "Rejected", value: hasDataError ? "—" : counts.rejected, tab: "rejected", color: "red", icon: X },
          { label: "Active Listings", value: hasUserDataError || data.listings.errors.length ? "—" : counts.listings, tab: "all", color: "violet", icon: BookOpen },
          { label: "Avg. Rating", value: hasUserDataError || data.listings.errors.length || !totalReviews ? "—" : averageRating, tab: "top-rated", color: "purple", icon: Star },
        ].map(({ label, value, tab: targetTab, color, icon: Icon }) => (
          <button
            className={`edc-admin-tutor-stat edc-admin-tutor-stat-${color} edc-admin-metric-card edc-admin-metric-${color}${section === "tutors" && tab === targetTab ? " is-active" : ""}`}
            key={label}
            type="button"
            aria-pressed={section === "tutors" && tab === targetTab}
            onClick={() => { setSection("tutors"); setTab(targetTab); setPage(1); }}
          >
            <span><Icon size={20} aria-hidden="true" /></span>
            <div><p>{label}</p><strong>{typeof value === "number" ? value.toLocaleString() : value}</strong></div>
          </button>
        ))}
      </div>

      <nav className="edc-admin-tutor-sections" aria-label="Tutor marketplace records">
        {SECTIONS.map(([id, label]) => (
          <button type="button" aria-current={section === id ? "page" : undefined} className={section === id ? "active" : ""} key={id} onClick={() => { setSection(id); setPage(1); }}>
            {label}
            <span>
              {id === "tutors" && hasUserDataError ? "—" : id === "bookings" && data.bookings.errors.length ? "—" : id === "cases" && data.requests.error ? "—" : id === "tutors" ? counts.all : id === "bookings" ? data.bookings.records.length : cases.length}
            </span>
          </button>
        ))}
      </nav>

      <div className="edc-admin-tutor-workspace">
        <main className="edc-admin-tutor-main">
          {section === "tutors" && (
            <>
              <nav className="edc-admin-tutor-status-tabs" aria-label="Filter tutor profiles">
                {STATUS_TABS.map(([id, label]) => (
                  <button type="button" className={tab === id ? "active" : ""} aria-pressed={tab === id} key={id} onClick={() => { setTab(id); setPage(1); }}>
                    {label}<span>({hasUserDataError || hasReviewSettingsError && ["pending", "verified", "rejected"].includes(id) ? "—" : tabCounts[id].toLocaleString()})</span>
                  </button>
                ))}
              </nav>
              <div className="edc-admin-tutor-filters">
                <label className="edc-admin-search">
                  <Search size={16} aria-hidden="true" />
                  <span className="edc-admin-visually-hidden">Search registered tutors</span>
                  <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by name, subject, email, or ID..." />
                </label>
                <label className="edc-admin-tutor-select">
                  <span className="edc-admin-visually-hidden">Filter by subject</span>
                  <select value={subjectFilter} onChange={(event) => { setSubjectFilter(event.target.value); setPage(1); }}>
                    <option value="all">All Subjects</option>
                    {subjectOptions.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                  </select>
                </label>
                <label className="edc-admin-tutor-select edc-admin-tutor-date-filter">
                  <CalendarDays size={14} aria-hidden="true" />
                  <span className="edc-admin-visually-hidden">Filter registration date</span>
                  <select value={dateRange} onChange={(event) => { setDateReferenceTime(Date.now()); setDateRange(event.target.value); setPage(1); }}>
                    <option value="all">All Time</option>
                    <option value="30">Last 30 Days</option>
                    <option value="90">Last 90 Days</option>
                  </select>
                </label>
                <button className="edc-admin-action-button" type="button" onClick={resetFilters}>Clear Filters</button>
              </div>
              {hasUserDataError ? (
                <div className="edc-admin-applications-empty"><h3>Tutor data unavailable</h3><p>Registered tutor records could not be read from browser storage.</p></div>
              ) : pageTutors.length ? (
                <div className="edc-admin-tutor-table-wrap">
                  <table className="edc-admin-tutor-table">
                    <thead>
                      <tr><th scope="col">Tutor</th><th scope="col">Expertise / Subjects</th><th scope="col">Experience</th><th scope="col">Rating</th><th scope="col">Sessions</th><th scope="col">Status</th><th scope="col">Actions</th></tr>
                    </thead>
                    <tbody>
                      {pageTutors.map((profile) => (
                        <tr key={profile.id}>
                          <td>
                            <span className="edc-admin-tutor-person">
                              {profile.avatar ? <img src={profile.avatar} alt="" /> : <span aria-hidden="true">{getInitials(profile.name) || <UsersRound size={15} />}</span>}
                              <span><strong>{profile.name}</strong><small>{profile.email || "Email not provided"}</small></span>
                            </span>
                          </td>
                          <td><span className="edc-admin-tutor-subjects">{profile.subjects.length ? profile.subjects.join(", ") : "Not provided"}</span></td>
                          <td>{profile.experience || "Not provided"}</td>
                          <td>
                            <span className="edc-admin-tutor-rating">
                              {profile.rating === null ? "Not rated" : <><Star size={13} fill="currentColor" aria-hidden="true" />{profile.rating.toFixed(1)} <small>({profile.ratingCount})</small></>}
                            </span>
                          </td>
                          <td>{profile.sessions.toLocaleString()}</td>
                          <td><span className={`edc-admin-status-badge ${getStatusClass(profile.status)}`}>{profile.status}</span></td>
                          <td>
                            <span className="edc-admin-tutor-row-actions">
                              <button type="button" aria-label={`View ${profile.name}`} title="View tutor" onClick={() => setSelected(profile)}><Eye size={15} aria-hidden="true" /></button>
                              <button type="button" className="approve" aria-label={`Verify ${profile.name}`} title="Verify tutor" disabled={hasReviewSettingsError || statusKey(profile.status) === "verified"} onClick={() => recordActivity(profile, "Verified")}><Check size={15} aria-hidden="true" /></button>
                              <button type="button" className="reject" aria-label={`Reject ${profile.name}`} title="Reject tutor" disabled={hasReviewSettingsError || statusKey(profile.status) === "rejected"} onClick={() => recordActivity(profile, "Rejected")}><X size={15} aria-hidden="true" /></button>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="edc-admin-applications-empty">
                  <h3>{tab === "all" ? "No registered tutor profiles" : "No matching tutor profiles"}</h3>
                  <p>{tab === "all" ? "Tutor accounts with a saved tutor profile or application will appear here. Demo catalog profiles are excluded." : "No saved tutor accounts match these filters."}</p>
                </div>
              )}
              <div className="edc-admin-tutor-pagination">
                <span>Showing {filteredTutors.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(currentPage * PAGE_SIZE, filteredTutors.length)} of {filteredTutors.length} tutors</span>
                <div>
                  <button type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ArrowLeft size={15} /></button>
                  <span>Page {currentPage} of {pageCount}</span>
                  <button type="button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}><ArrowRight size={15} /></button>
                </div>
              </div>
            </>
          )}

          {section === "bookings" && (
            <>
              <div className="edc-admin-tutor-section-heading"><div><h3>Saved Demo Booking Requests</h3><p>These are browser-local student requests, not scheduled appointments.</p></div></div>
              <label className="edc-admin-search edc-admin-tutor-section-search">
                <Search size={16} aria-hidden="true" />
                <span className="edc-admin-visually-hidden">Search saved booking requests</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search request ID, student, slot, or status" />
              </label>
              {filteredBookings.length ? (
                <div className="edc-admin-tutor-table-wrap">
                  <table className="edc-admin-tutor-table edc-admin-tutor-bookings-table">
                    <thead><tr><th scope="col">Tutor reference</th><th scope="col">Student</th><th scope="col">Requested slot</th><th scope="col">Status</th><th scope="col">Submitted</th><th scope="col">Details</th></tr></thead>
                    <tbody>{filteredBookings.map((booking) => (
                      <tr key={`${booking.studentEmail}:${booking.id}`}>
                        <td><strong>Demo catalog profile</strong><small>{booking.tutorId || "Tutor ID not provided"}</small></td>
                        <td>{booking.studentEmail}</td>
                        <td>{booking.slot || "Not provided"}</td>
                        <td><span className={`edc-admin-status-badge ${getStatusClass(booking.status)}`}>{booking.status || "Demo Request"}</span></td>
                        <td>{formatDate(booking.createdAt)}</td>
                        <td><button className="edc-admin-tutor-view-button" type="button" onClick={() => setSelected(booking)} aria-label={`View booking ${booking.id}`}><Eye size={15} /></button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : (
                <div className="edc-admin-applications-empty"><h3>{search ? "No matching booking requests" : "No saved demo booking requests"}</h3><p>Student booking requests will appear when saved in browser storage.</p></div>
              )}
            </>
          )}

          {section === "cases" && (
            <>
              <div className="edc-admin-tutor-section-heading"><div><h3>Marketplace-related Support Records</h3><p>Existing support records mentioning tutors and Moderation &amp; Appeal requests.</p></div><Link to="/admin/support">Open Support &amp; Appeals <ArrowRight size={14} /></Link></div>
              <label className="edc-admin-search edc-admin-tutor-section-search">
                <Search size={16} aria-hidden="true" />
                <span className="edc-admin-visually-hidden">Search support records</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search request, requester, category, or status" />
              </label>
              {filteredCases.length ? (
                <div className="edc-admin-tutor-table-wrap">
                  <table className="edc-admin-tutor-table edc-admin-tutor-cases-table">
                    <thead><tr><th scope="col">Request</th><th scope="col">Requester</th><th scope="col">Category</th><th scope="col">Status</th><th scope="col">Submitted</th><th scope="col">Details</th></tr></thead>
                    <tbody>{filteredCases.map((request) => (
                      <tr key={request.id}>
                        <td><strong>{request.subject || "Subject not provided"}</strong><small>{request.id}</small></td>
                        <td><strong>{request.requesterName || "Name not provided"}</strong><small>{request.requesterEmail || "Email not provided"}</small></td>
                        <td>{request.category || "Not provided"}</td>
                        <td><span className={`edc-admin-status-badge ${getStatusClass(request.status)}`}>{request.status || "Not provided"}</span></td>
                        <td>{formatDate(request.createdAt)}</td>
                        <td><button className="edc-admin-tutor-view-button" type="button" onClick={() => setSelected(request)} aria-label={`View support request ${request.id}`}><Eye size={15} /></button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : (
                <div className="edc-admin-applications-empty"><h3>{search ? "No matching support records" : "No related support records"}</h3><p>Related saved Support &amp; Appeals requests will appear here. Appeal data remains part of the existing support records.</p></div>
              )}
            </>
          )}
        </main>

        <aside className="edc-admin-tutor-sidebar">
          <section className="edc-admin-tutor-side-card">
            <header><h3><ShieldCheck size={17} aria-hidden="true" />Marketplace Overview</h3></header>
            <div className="edc-admin-tutor-overview">
              <div className="edc-admin-tutor-donut" style={{ background: donutBackground }} role="img" aria-label={`${hasUserDataError ? "Unknown" : tutorRows.length} registered tutor profiles`}>
                <span><strong>{hasUserDataError ? "—" : tutorRows.length.toLocaleString()}</strong><small>Tutors</small></span>
              </div>
              <div className="edc-admin-tutor-legend">
                {(statusSegments.length ? statusSegments : [{ label: hasReviewSettingsError ? "Review status unavailable" : "No profiles", count: 0, color: "#bba9cc" }]).map((segment) => (
                  <div key={segment.label}><i style={{ backgroundColor: segment.color }} /><span>{segment.label}</span><strong>{hasUserDataError || hasReviewSettingsError ? "—" : segment.count.toLocaleString()}</strong></div>
                ))}
              </div>
            </div>
            <p className="edc-admin-tutor-side-note">Ratings are calculated from saved, non-moderated course reviews for published courses.</p>
          </section>

          <section className="edc-admin-tutor-side-card">
            <header><h3><Star size={17} aria-hidden="true" />Top Subjects in Marketplace</h3></header>
            {subjectCounts.length ? (
              <ul className="edc-admin-tutor-subject-list">
                {subjectCounts.map(({ name, count, percentage }) => (
                  <li key={name}>
                    <span title={name}>{name}</span>
                    <span className="edc-admin-tutor-subject-meter"><i style={{ width: `${percentage}%` }} /></span>
                    <strong>{count}</strong>
                  </li>
                ))}
              </ul>
            ) : <p className="edc-admin-tutor-side-note">Subject totals appear when registered tutor profiles include subject data.</p>}
          </section>

          <section className="edc-admin-tutor-side-card">
            <header><h3><Settings size={17} aria-hidden="true" />Verification &amp; Marketplace Settings</h3><Link to="/admin/settings">Settings</Link></header>
            <dl className="edc-admin-tutor-settings-list">
              <div><dt>Verification</dt><dd>Optional profile badge</dd></div>
              <div><dt>Course approval required</dt><dd>{platformValue(data.platform.rules.courseApprovalRequired ? "On" : "Off")}</dd></div>
              <div><dt>Course uploads</dt><dd>{platformValue(data.platform.system.courseUploadEnabled ? "On" : "Off")}</dd></div>
              <div><dt>Demo checkout mode</dt><dd>{platformValue(data.platform.marketplace.demoCheckoutMode ? "On" : "Off")}</dd></div>
              <div><dt>Configured commission</dt><dd>{platformValue(`${Number(data.platform.marketplace.commissionRate).toLocaleString()}%`)}</dd></div>
            </dl>
            <p className="edc-admin-tutor-side-note">These are saved platform settings; this page does not claim to process payments or payouts.</p>
          </section>

          <section className="edc-admin-tutor-side-card">
            <header><h3><AlertTriangle size={17} aria-hidden="true" />Quick Actions</h3></header>
            <div className="edc-admin-tutor-quick-actions">
              <button type="button" onClick={() => { setSection("tutors"); setTab("pending"); setPage(1); }}><Clock3 size={14} />Review Pending</button>
              <Link to="/admin/courses"><BookOpen size={14} />Manage Listings</Link>
              <button type="button" onClick={() => { setSection("cases"); setPage(1); }}><FileText size={14} />Support Records</button>
              <Link to="/admin/settings"><Settings size={14} />Marketplace Settings</Link>
            </div>
          </section>
        </aside>
      </div>

      {selected && (
        <div className="edc-admin-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
          <section className="edc-admin-details-modal edc-admin-tutor-detail" role="dialog" aria-modal="true" aria-labelledby="admin-tutor-detail-title">
            <header className="edc-admin-details-header">
              <div>
                <span className="edc-admin-page-eyebrow">{selected.type === "Registered profile" ? "REGISTERED TUTOR PROFILE" : selected.studentEmail ? "SAVED DEMO BOOKING REQUEST" : "SUPPORT RECORD"}</span>
                <h3 id="admin-tutor-detail-title">{selected.name || selected.tutorName || selected.subject || selected.subjectLine || "Record details"}</h3>
              </div>
              <button type="button" className="edc-admin-modal-close" onClick={() => setSelected(null)} aria-label="Close details">×</button>
            </header>
            {selected.type === "Registered profile" ? (
              <>
                <dl className="edc-admin-details-list">
                  <div className="edc-admin-detail-field"><dt>Email</dt><dd>{selected.email}</dd></div>
                  <div className="edc-admin-detail-field"><dt>Subjects</dt><dd>{selected.subjects?.length ? selected.subjects.join(", ") : selected.subject || "Not provided"}</dd></div>
                  <div className="edc-admin-detail-field"><dt>Qualification</dt><dd>{selected.qualification || "Not provided"}</dd></div>
                  <div className="edc-admin-detail-field"><dt>Experience</dt><dd>{selected.experience || "Not provided"}</dd></div>
                  <div className="edc-admin-detail-field"><dt>Published listings</dt><dd>{selected.listings ?? 0}</dd></div>
                  <div className="edc-admin-detail-field"><dt>Saved booking requests</dt><dd>{selected.sessions ?? 0}</dd></div>
                  <div className="edc-admin-detail-field"><dt>Course rating</dt><dd>{selected.rating === null ? "No saved ratings" : `${selected.rating.toFixed(1)} (${selected.ratingCount} reviews)`}</dd></div>
                  <div className="edc-admin-detail-field"><dt>Review status</dt><dd>{selected.status}</dd></div>
                  <div className="edc-admin-detail-field"><dt>Registration date</dt><dd>{formatDate(selected.createdAt)}</dd></div>
                  {selected.about && <div className="edc-admin-detail-field"><dt>About</dt><dd>{selected.about}</dd></div>}
                </dl>
                <label className="edc-admin-tutor-review-select">Review status
                  <select value={selected.status} disabled={hasReviewSettingsError} onChange={(event) => recordActivity(selected, event.target.value)}>
                    {REVIEW_STATUSES.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </label>
              </>
            ) : (
              <dl className="edc-admin-details-list">
                {Object.entries({
                  ID: selected.id,
                  Tutor: selected.tutorName,
                  Student: selected.studentEmail,
                  Requester: selected.requesterName,
                  Email: selected.requesterEmail,
                  Subject: selected.tutorSubject || selected.subject,
                  Slot: selected.slot,
                  Category: selected.category,
                  Status: selected.status,
                  Submitted: formatDate(selected.createdAt),
                  Description: selected.note || selected.description,
                }).filter(([, value]) => value).map(([label, value]) => (
                  <div className="edc-admin-detail-field" key={label}><dt>{label}</dt><dd>{value}</dd></div>
                ))}
              </dl>
            )}
            {selected.studentEmail && (
              <div className="edc-admin-details-actions">
                {BOOKING_STATUSES.map((status) => (
                  <button className="edc-admin-action-button" key={status} type="button" disabled={selected.status === status} onClick={() => updateBooking(selected, status)}>
                    Mark {status}
                  </button>
                ))}
              </div>
            )}
            {selected.category && (
              <div className="edc-admin-details-actions">
                {["Open", "In Progress", "Resolved", "Closed"].map((status) => (
                  <button className="edc-admin-action-button" key={status} type="button" disabled={selected.status === status} onClick={() => updateCase(selected, status)}>
                    Mark {status}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

export default AdminTutorMarketplace;

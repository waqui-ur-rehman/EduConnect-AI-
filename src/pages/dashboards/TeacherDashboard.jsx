
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { appendAdminActivityRecord } from "../../components/admin/adminData";
import { getStudentAcademicContext, getStudentAcademicSubjects, getProgramGroupsForDegreeLevel, INTERMEDIATE_STREAMS, isAcademicProfileComplete, ONLINE_COURSES } from "../../utils/studentRecommendations";
import {
  BookOpen,
  MessageCircle,
  CheckCircle2,
  Edit3,
  GraduationCap,
  Plus,
  Send,
  Trash2,
  Users,
  Wallet,
  ChartNoAxesCombined,
  ListChecks,
  ClipboardList,
  ListTree,
  X,
  Layers3,
  MoreVertical,
  Search,
  Star,
  ArrowLeft,
  ArrowRight,
  UserRound,
  LogOut,
  ShieldAlert,
  LifeBuoy,
  Crown,
  Eye,
  Mail,
  BriefcaseBusiness,
  Camera,
  Award,
  ShieldCheck,
  Zap,
  Info,
} from "lucide-react";

import { getManagedCourses, refreshContent, saveContent, submitContent, removeContent, uploadContentFile, CONTENT_CHANGED_EVENT } from "../../utils/contentApi";
import { importBrowserContent } from "../../utils/importBrowserContent";
import CourseReviews from "../../components/reviews/CourseReviews";
import CourseDiscussions from "../../components/discussions/CourseDiscussions";
import InstructorAnalytics from "../../components/analytics/InstructorAnalytics";
import CourseQuizzes from "../../components/quizzes/CourseQuizzes";
import CourseAssignments from "../../components/assignments/CourseAssignments";
import CurriculumBuilder from "../../components/curriculum/CurriculumBuilder";
import TeacherBooks from "../../components/books/TeacherBooks";
import UserModerationAppeals, { UserSupportCenter } from "../../components/moderation/UserModerationAppeals";
import TeacherCourseEditor from "./TeacherCourseEditor";
import { NOTIFICATIONS_EVENT } from "../../utils/demoNotifications";
import {
  fetchNotifications as apiFetchNotifications,
  markServerNotificationRead, markAllServerNotificationsRead, deleteServerNotification,
  subscribeToNotificationStream,
  fetchTeacherAnalytics,
} from "../../utils/phase7Api";
import { fetchMyEarnings } from "../../utils/marketplaceApi";

import TeacherOverview, { TeacherWorkspaceHeader } from "../../components/teacher/TeacherOverview";
import TeacherLessons from "../../components/teacher/TeacherLessons";
import TeacherCnicUpload from "../../components/teacher/TeacherCnicUpload";
import VerifiedBadge from "../../components/verification/VerifiedBadge";
import StudentProfileBadge from "../../components/verification/StudentProfileBadge";
import WorkspaceSidebar from "../../components/workspace/WorkspaceSidebar";
import TeacherStudents from "../../components/teacher/TeacherStudents";
import TeacherEarnings from "../../components/teacher/TeacherEarnings";
import { collectInstructorCourseAnalytics } from "../../utils/instructorAnalytics";
import { getCourseCatalogForDisplay } from "../../utils/teacherCourses";
import { REVIEW_EVENT } from "../../utils/courseReviews";
import { ORDERS_EVENT } from "../../utils/studentCart";
import { ASSIGNMENT_EVENT } from "../../components/assignments/assignmentStorage";
import { DISCUSSIONS_EVENT } from "../../utils/courseDiscussions";
import "../../components/teacher/TeacherColorTheme.css";
import "../../components/DashboardCardClarity.css";

const purple = "var(--edc-primary)";

function readSaved(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function readTeacherProfile(profileKey, email) {
  let accountName = "";
  try {
    const users = JSON.parse(localStorage.getItem("educonnect.registeredUsers") || "[]");
    const account = Array.isArray(users)
      ? users.find((user) => String(user.email || "").trim().toLowerCase() === String(email || "").trim().toLowerCase())
      : null;
    accountName = account?.name || "";
  } catch (error) {
    console.error("Could not read the teacher account profile.", error);
  }
  const saved = readSaved(profileKey, null);
  if (saved && typeof saved === "object" && !Array.isArray(saved)) {
    return { ...saved, name: saved.name || accountName };
  }
  return { name: accountName, headline: "", bio: "" };
}

function compressImageForStorage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxDimension = 1280;
      const scale = Math.min(
        1,
        maxDimension / Math.max(image.naturalWidth, image.naturalHeight)
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

      try {
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Image compression is unavailable.");
        }

        let quality = 0.82;
        for (let attempt = 0; attempt < 48; attempt += 1) {
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const compressedImage = canvas.toDataURL("image/webp", quality);
          if (!compressedImage.startsWith("data:image/webp")) {
            throw new Error("WebP image compression is unavailable.");
          }
          if (compressedImage.length <= 450 * 1024) {
            resolve(compressedImage);
            return;
          }
          if (quality > 0.5) {
            quality = Math.max(0.5, quality - 0.12);
          } else if (Math.max(canvas.width, canvas.height) > 64) {
            canvas.width = Math.max(1, Math.round(canvas.width * 0.75));
            canvas.height = Math.max(1, Math.round(canvas.height * 0.75));
            quality = 0.82;
          } else {
            throw new Error("This image could not be compressed for browser storage.");
          }
        }
        throw new Error("This image could not be compressed for browser storage.");
      } catch (error) {
        reject(error);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read the selected image."));
    };

    image.src = objectUrl;
  });
}

function formatCourseUpdatedAt(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime())
    ? date.toLocaleDateString(undefined, {
        month: "short",
        day: "2-digit",
        year: "numeric",
      })
    : "—";
}


const emptyCourse = {
  title: "",
  category: "Development",
  level: "Beginner",
  description: "",
  price: "",
  thumbnail: "",
};  


const navigation = [
  ["overview", "Overview", GraduationCap],
  ["courses", "My Courses", BookOpen],
  ["reviews", "Course Reviews", GraduationCap],
  ["discussions", "Course Q&A", MessageCircle],
  ["lessons", "Lessons", Layers3],
  ["students", "My Students", Users],
  ["earnings", "Earnings", Wallet],
  ["analytics", "Learning Analytics & Sales", ChartNoAxesCombined],
  ["quizzes", "Course Quizzes", ListChecks],
  ["course-assignments", "Course Assignments", ClipboardList],
  ["curriculum", "Curriculum Builder", ListTree],
  ["books", "My PDF/eBooks", BookOpen],
  ["profile", "My Profile", UserRound],
  ["help-support", "Help & Support", LifeBuoy],
  ["appeals", "Moderation & Appeals", ShieldAlert],
];
const teacherTabIds = new Set(navigation.map(([id]) => id));
function teacherTabFromLocation(location) {
  if (location.pathname.startsWith("/teacher/dashboard/students/")) return "students";
  if (location.pathname.startsWith("/teacher/dashboard/earnings/")) return "earnings";
  if (location.pathname.startsWith("/teacher/dashboard/courses/")) return "courses";
  const requested = new URLSearchParams(location.search).get("tab");
  return teacherTabIds.has(requested) ? requested : "overview";
}

function TeacherSidebar({
  activeTab,
  profileImage,
  displayName,
  onNavigate,
  onCreate,
}) {
  return (
    <WorkspaceSidebar
      menuConfig={navigation.map(([id, label, icon]) => ({
        id,
        route: id,
        label,
        icon,
        sectionKey: "teacher-management",
        active: activeTab === id,
        ariaCurrent: activeTab === id ? "page" : undefined,
      }))}
      profile={{ avatar: profileImage, name: displayName, subline: "Teacher" }}
      ariaLabel="Teacher navigation"
      onNavigate={onNavigate}
      footer={
        <div className="edc-workspace-sidebar-footer-card edc-teacher-sidebar-promo">
          <Crown size={25} fill="currentColor" aria-hidden="true" />
          <strong>Keep Teaching</strong>
          <p>Build your courses and share your knowledge.</p>
          <button type="button" onClick={onCreate}>
            Create Course <Plus size={14} aria-hidden="true" />
          </button>
        </div>
      }
    />
  );
}

function TeacherProfileOverview({
  profile,
  email,
  courses,
  studentCount,
  averageRating,
  reviewCount,
  completion,
  skills,
  teachingAreas,
  profileSaved,
  onEdit,
  onNavigate,
  cnicStatus = "not_submitted",
  rejectionReason = "",
  verificationOpenSignal = 0,
  statusLoading = false,
  statusError = "",
  onVerificationSubmitted,
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeProfileSection, setActiveProfileSection] = useState("profile");
  useEffect(() => {
    if (verificationOpenSignal > 0) setActiveProfileSection("verification");
  }, [verificationOpenSignal]);
  const publicCourses = courses.filter((course) => String(course.status || "").toLowerCase() === "published");
  const displayName = String(profile.name || "").trim();
  const availability = String(profile.availability || "").trim();
  const experience = String(profile.experience || "").trim();
  const qualification = String(profile.qualification || "").trim();
  const teachingLevel = {
    school: "School",
    intermediate: "College / Intermediate",
    university: "University",
    online: "Interest / Online Courses",
  }[profile.teachingEducationLevel] || "Teaching level not selected";

  return (
    <div className="edc-profile-dashboard">
      <header className="edc-pd-heading">
        <div>
          <span className="edc-pd-heading-icon"><UserRound size={27} /></span>
          <div>
            <h1>Teacher Profile</h1>
            <p>Manage your personal information, teaching profile, and professional details.</p>
          </div>
        </div>
        <div className="edc-pd-heading-actions">
          <button type="button" className="edc-pd-secondary" onClick={() => setPreviewOpen(true)}><Eye size={16} />Preview Public Profile</button>
          <button type="button" className="edc-pd-primary" onClick={onEdit}><Edit3 size={16} />Edit Profile</button>
        </div>
      </header>

      {profileSaved && <p className="edc-pd-saved" role="status"><CheckCircle2 size={16} />Profile saved successfully.</p>}

      <div className="edc-pd-layout">
        <main className="edc-pd-main">
          <section className="edc-pd-hero">
            <div className="edc-pd-avatar">
              {profile.avatar ? <img src={profile.avatar} alt="" /> : <UserRound size={44} aria-hidden="true" />}
            </div>
            <div className="edc-pd-identity">
              <h2>{displayName || "Name not added"} {cnicStatus === "verified" && <VerifiedBadge />}</h2>
              <p>{profile.headline || "Professional headline not added"}</p>
              {skills.length > 0 && <div className="edc-pd-hero-tags">{skills.slice(0, 5).map((skill) => <span key={skill}>{skill}</span>)}</div>}
            </div>
            <button type="button" className="edc-pd-photo-action" onClick={onEdit}><Camera size={15} />Update Photo</button>
          </section>

          <section className="edc-pd-contact-strip" aria-label="Profile details">
            <div><Mail size={17} /><span>{email || "Email not available"}</span></div>
            <div><Award size={17} /><span>{qualification || "Qualification not added"}</span></div>
            <div><BriefcaseBusiness size={17} /><span>{experience || "Experience not added"}</span></div>
            {availability && <div><ShieldCheck size={17} /><span>{availability}</span></div>}
          </section>

          <div className="edc-pd-tabs" role="tablist" aria-label="Profile sections">
            {[
              ["profile", "Profile"],
              ["teaching", "Teaching"],
              ["education", "Education"],
              ["experience", "Experience"],
              ["verification", "Verification"],
            ].map(([section, label], index, sections) => (
              <button
                key={section}
                id={`edc-pd-tab-${section}`}
                type="button"
                role="tab"
                aria-selected={activeProfileSection === section}
                aria-controls="edc-pd-tab-panel"
                tabIndex={activeProfileSection === section ? 0 : -1}
                onClick={() => setActiveProfileSection(section)}
                onKeyDown={(event) => {
                  let nextIndex;
                  if (event.key === "ArrowRight") nextIndex = (index + 1) % sections.length;
                  else if (event.key === "ArrowLeft") nextIndex = (index - 1 + sections.length) % sections.length;
                  else if (event.key === "Home") nextIndex = 0;
                  else if (event.key === "End") nextIndex = sections.length - 1;
                  else return;
                  event.preventDefault();
                  const nextSection = sections[nextIndex][0];
                  setActiveProfileSection(nextSection);
                  document.getElementById(`edc-pd-tab-${nextSection}`)?.focus();
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div
            className="edc-pd-tab-panel"
            id="edc-pd-tab-panel"
            role="tabpanel"
            aria-labelledby={`edc-pd-tab-${activeProfileSection}`}
            tabIndex={0}
          >
            {activeProfileSection === "profile" && (
              <div className="edc-pd-profile-section">
                <section className="edc-pd-card edc-pd-about">
                  <header><h2><UserRound size={19} />About Me</h2><button type="button" onClick={onEdit}><Edit3 size={14} />Edit</button></header>
                  <p>{profile.bio || "No biography added yet."}</p>
                </section>
                <section className="edc-pd-card" id="edc-pd-skills">
                  <header><h2><Layers3 size={19} />Skills &amp; Expertise</h2><button type="button" onClick={onEdit}><Edit3 size={14} />Edit</button></header>
                  {skills.length ? <div className="edc-pd-chips">{skills.map((skill) => <span key={skill}>{skill}</span>)}</div> : <p className="edc-pd-empty">Add your skills and expertise to your profile.</p>}
                </section>
              </div>
            )}
            {activeProfileSection === "teaching" && (
              <section className="edc-pd-card">
                <header><h2><GraduationCap size={19} />Teaching Areas</h2><button type="button" onClick={onEdit}><Edit3 size={14} />Edit</button></header>
                {teachingAreas.length ? <ul className="edc-pd-area-list">{teachingAreas.map((area) => <li key={area}><CheckCircle2 size={15} />{area}</li>)}</ul> : <p className="edc-pd-empty">No teaching areas added yet. Set your teaching level or add subjects in your profile.</p>}
              </section>
            )}
            {activeProfileSection === "education" && (
              <section className="edc-pd-card">
                <header><h2><Award size={19} />Education</h2><button type="button" onClick={onEdit}><Edit3 size={14} />Edit</button></header>
                <p>{qualification || "Qualification not added yet."}</p>
                <p className="edc-pd-subtle">{teachingLevel}</p>
              </section>
            )}
            {activeProfileSection === "experience" && (
              <section className="edc-pd-card">
                <header><h2><BriefcaseBusiness size={19} />Experience</h2><button type="button" onClick={onEdit}><Edit3 size={14} />Edit</button></header>
                <p>{experience || "Teaching experience not added yet."}</p>
                {profile.teachingProgram && <p className="edc-pd-subtle">{profile.teachingProgram}</p>}
              </section>
            )}
            {activeProfileSection === "verification" && (
              <section className="edc-pd-card" aria-label="Teacher identity verification" style={{ padding: 24, border: "1px solid #ddd6fe", borderRadius: 16, background: "#fcfaff" }}>
                <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <h2 style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}><ShieldCheck size={21} color="#7c3aed" />Identity Verification</h2>
                  <span style={{ borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 700, background: cnicStatus === "verified" ? "#dcfce7" : "#fef3c7", color: cnicStatus === "verified" ? "#166534" : "#92400e" }}>
                    {statusLoading ? "Checking status" : statusError ? "Status unavailable" : cnicStatus === "verified" ? "Verified" : "Verification Pending"}
                  </span>
                </header>
                <p style={{ marginTop: 14, color: "#625477", lineHeight: 1.7 }}>
                  Submit your CNIC for identity review. A Verified badge appears on your profile after your documents are approved.
                </p>
                {statusLoading && (
                  <p role="status" style={{ padding: 12, borderRadius: 10, background: "#f3edff", color: "#5b21b6" }}>
                    Loading verification status from EduConnect AI backend…
                  </p>
                )}
                {statusError && (
                  <p role="alert" style={{ padding: 12, borderRadius: 10, background: "#fef3c7", color: "#713f12" }}>
                    Verification status could not be loaded: {statusError}.
                  </p>
                )}
                <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
                  <div style={{ padding: 16, borderRadius: 12, border: "1px solid #ede9fe", background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600 }}>Verification</span>
                    <strong style={{ color: cnicStatus === "verified" ? "#15803d" : "#92400e" }}>
                      {statusLoading ? "Checking…" : statusError ? "Unavailable" : cnicStatus === "verified" ? "Verified" : cnicStatus === "pending" ? "Under review" : cnicStatus === "rejected" ? "Rejected" : "Not submitted"}
                    </strong>
                  </div>
                </div>
                {!statusLoading && !statusError && (
                  <TeacherCnicUpload cnicStatus={cnicStatus} onSubmitted={onVerificationSubmitted} rejectionReason={rejectionReason} />
                )}
                <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <button type="button" className="edc-pd-secondary" onClick={onEdit}><Edit3 size={16} /> Edit Profile</button>
                  <button type="button" className="edc-pd-secondary" onClick={() => onNavigate("help-support")}><LifeBuoy size={16} /> Help & Support</button>
                </div>
              </section>
            )}
          </div>
        </main>

        <aside className="edc-pd-sidebar">
          <section className="edc-pd-card edc-pd-stats">
            <h2><ChartNoAxesCombined size={19} />Teacher Stats</h2>
            <div className="edc-pd-stat-grid">
              <div><span><BookOpen size={19} /></span><strong>{courses.length.toLocaleString()}</strong><small>Courses</small></div>
              <div><span><Users size={19} /></span><strong>{studentCount.toLocaleString()}</strong><small>Students</small></div>
              <div><span><Star size={19} /></span><strong>{averageRating === null ? "—" : averageRating.toFixed(1)}</strong><small>Average Rating</small></div>
              <div><span><Layers3 size={19} /></span><strong>{reviewCount.toLocaleString()}</strong><small>Reviews</small></div>
            </div>
            {averageRating === null && <p className="edc-pd-subtle">No course ratings have been recorded yet.</p>}
          </section>

          <section className="edc-pd-card edc-pd-completion">
            <header><h2><ShieldCheck size={19} />Account Completion</h2><strong>{completion}%</strong></header>
            <div className="edc-pd-progress" role="progressbar" aria-label="Profile completion" aria-valuenow={completion} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${completion}%` }} /></div>
            <p>Calculated from your saved profile details.</p>
          </section>

          <section className="edc-pd-card edc-pd-quick-actions">
            <h2><Zap size={19} aria-hidden="true" />Quick Actions</h2>
            <div>
              <button type="button" onClick={onEdit}><Edit3 size={16} />Edit Profile</button>
              <button type="button" onClick={() => onNavigate("courses")}><GraduationCap size={16} />Manage Courses</button>
              <button type="button" onClick={onEdit}><Camera size={16} />Update Photo</button>
              <button type="button" onClick={() => onNavigate("analytics")}><ChartNoAxesCombined size={16} />View Analytics</button>
            </div>
          </section>
        </aside>
      </div>

      {previewOpen && (
        <div className="edc-pd-preview-backdrop" onClick={() => setPreviewOpen(false)}>
          <section className="edc-pd-preview-dialog" role="dialog" aria-modal="true" aria-label="Public teacher profile preview" onClick={(event) => event.stopPropagation()}>
            <header><h2>Public Profile Preview</h2><button type="button" aria-label="Close preview" onClick={() => setPreviewOpen(false)}><X size={19} /></button></header>
            <div className="edc-pd-preview-identity">
              <div className="edc-pd-avatar">{profile.avatar ? <img src={profile.avatar} alt="" /> : <UserRound size={36} />}</div>
              <div><h3>{displayName || "Name not added"} {cnicStatus === "verified" && <VerifiedBadge />}</h3><p>{profile.headline || "Professional headline not added"}</p></div>
            </div>
            <p>{profile.bio || "No biography added yet."}</p>
            <dl>
              <div><dt>Email</dt><dd>{email || "Email not available"}</dd></div>
              <div><dt>Qualification</dt><dd>{qualification || "Not added"}</dd></div>
              <div><dt>Experience</dt><dd>{experience || "Not added"}</dd></div>
              <div><dt>Teaching Areas</dt><dd>{teachingAreas.join(", ") || "Not added"}</dd></div>
            </dl>
            <h3>Published Courses</h3>
            {publicCourses.length ? <ul>{publicCourses.map((course) => <li key={course.id}>{course.title}</li>)}</ul> : <p>No published courses yet.</p>}
          </section>
        </div>
      )}
    </div>
  );
}

function TeacherDashboard({ email = "teacher@example.com", account, onVerificationSubmitted, onLogout: signOut }) {
  const location = useLocation();
  const navigate = useNavigate();

  const cnicStatus = account?.cnicVerification?.status || "not_submitted";
  const [verificationOpenSignal, setVerificationOpenSignal] = useState(0);
  const openVerificationInProfile = () => {
    setShowProfileEditor(false);
    setVerificationOpenSignal((value) => value + 1);
    navigateTo("profile");
  };
  const courseEditMatch = location.pathname.match(
    /^\/teacher\/dashboard\/courses\/([^/]+)\/edit\/?$/
  );
  let requestedCourseId = null;
  try {
    requestedCourseId = courseEditMatch
      ? decodeURIComponent(courseEditMatch[1])
      : null;
  } catch {
    requestedCourseId = null;
  }
  const courseKey = `educonnect.teacher.${email}.courses`;
  const profileKey = `educonnect.teacher.${email}.profile`;
  const teacherNotificationKey = `educonnect.teacher.${String(email || "").trim().toLowerCase()}.notifications`;
  const registeredAccount = useMemo(() => {
    const accountEmail = String(email || "").trim().toLowerCase();
    const users = readSaved("educonnect.registeredUsers", []);
    return Array.isArray(users)
      ? users.find((user) => String(user.email || "").trim().toLowerCase() === accountEmail) || null
      : null;
  }, [email]);

  const [courses, setCourses] = useState(() =>
    getManagedCourses(email)
  );
  const coursesRef = useRef(courses);
  const [courseStorageError, setCourseStorageError] = useState("");
  const [courseSaving, setCourseSaving] = useState(false);
  const courseDraftId = useRef(null);

  const courseSaveQueue = useRef(Promise.resolve());
  function updateCourses(updater) {
    const save = async () => {
      try {
        const current = coursesRef.current;
        const next = typeof updater === "function" ? updater(current) : updater;
        for (const old of current) {
          if (!next.some((item) => String(item.id) === String(old.id))) await removeContent("courses", old);
        }
        for (const item of next) {
          const old = current.find((entry) => String(entry.id) === String(item.id));
          if (JSON.stringify(old) === JSON.stringify(item)) continue;
          if (item.status === "Pending Approval") await submitContent("courses", old);
          else if (item.status === "Published" && old?.status === "Approved") throw new Error("Admin publication is required.");
          else await saveContent("courses", { ...teacherTeachingProfile, subjects: [...teacherFocusSubjects, ...teacherSkillTags], ...item });
        }
        coursesRef.current = getManagedCourses(email);
        setCourses(coursesRef.current);
        setCourseStorageError("");
        return true;
      } catch (error) {
        setCourseStorageError(error.message || "Course could not be saved to the server.");
        return false;
      }
    };
    const result = courseSaveQueue.current.then(save);
    courseSaveQueue.current = result.then(() => undefined);
    return result;
  }
  useEffect(() => {
    const refresh = () => {
      const records = getManagedCourses(email);
      coursesRef.current = records;
      setCourses(records);
    };
    window.addEventListener(CONTENT_CHANGED_EVENT, refresh);
    refreshContent().then(refresh).catch((error) => setCourseStorageError(error.message));
    return () => window.removeEventListener(CONTENT_CHANGED_EVENT, refresh);
  }, [email]);

  const courseForEdit = requestedCourseId
    ? courses.find((item) => String(item.id) === requestedCourseId)
    : null;

  const [profile, setProfile] = useState(() => readTeacherProfile(profileKey, email));
  const [profileCompleted, setProfileCompleted] = useState(
    () => registeredAccount?.profileCompleted === true
  );

  const dashboardPathname = location.pathname;
  const dashboardSearch = location.search;
  const [tab, setTab] = useState(() => teacherTabFromLocation(location));
  useEffect(() => {
    const timer = window.setTimeout(() => setTab(teacherTabFromLocation({ pathname: dashboardPathname, search: dashboardSearch })), 0);
    return () => window.clearTimeout(timer);
  }, [dashboardPathname, dashboardSearch]);

const [notifications, setNotifications] = useState(() => readSaved(teacherNotificationKey, []));
const unreadNotifications = notifications.filter((item) => !item.read).length;
const [serverTeacherAnalytics, setServerTeacherAnalytics] = useState(null);
const [serverTeacherEarnings, setServerTeacherEarnings] = useState(null);

useEffect(() => {
  const refresh = () => setNotifications(readSaved(teacherNotificationKey, []));
  const refreshIfMatched = (event) => { if (!event.detail?.key || event.detail.key === teacherNotificationKey) refresh(); };
  const refreshStorage = (event) => { if (!event.key || event.key === teacherNotificationKey) refresh(); };
  window.addEventListener(NOTIFICATIONS_EVENT, refreshIfMatched);
  window.addEventListener("storage", refreshStorage);
  return () => {
    window.removeEventListener(NOTIFICATIONS_EVENT, refreshIfMatched);
    window.removeEventListener("storage", refreshStorage);
  };
}, [teacherNotificationKey]);

useEffect(() => {
  try { localStorage.setItem(teacherNotificationKey, JSON.stringify(notifications)); }
  catch (error) { console.error("Could not save teacher notifications", error); }
}, [notifications, teacherNotificationKey]);

const isServerNotificationId = (id) => /^[a-f0-9]{24}$/i.test(String(id || ""));
// Merge MongoDB notifications (support replies, etc.) with browser-local teacher notifications.
useEffect(() => {
  let cancelled = false;
  const mergeServer = async () => {
    try {
      const data = await apiFetchNotifications({ limit: 100 });
      if (cancelled) return;
      const serverItems = (Array.isArray(data?.notifications) ? data.notifications : []).map((item) => ({ ...item, source: "server" }));
      setNotifications((previous) => {
        const localOnly = previous.filter((item) => !isServerNotificationId(item.id));
        const seen = new Set(serverItems.map((item) => item.id));
        const dedupedLocal = localOnly.filter((item) => !seen.has(item.id));
        return [...serverItems, ...dedupedLocal]
          .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
          .slice(0, 150);
      });
    } catch {
      // Keep local notifications when backend is unavailable.
    }
  };
  mergeServer();
  const onFocus = () => mergeServer();
  window.addEventListener("focus", onFocus);
  return () => { cancelled = true; window.removeEventListener("focus", onFocus); };
}, [teacherNotificationKey]);

// Realtime notification subscription (SSE) with API resync fallback.
useEffect(() => {
  const close = subscribeToNotificationStream({
    onNotification: (notification) => {
      if (!notification?.id) return;
      setNotifications((previous) => {
        if (previous.some((item) => String(item.id) === String(notification.id))) return previous;
        return [{ ...notification, source: "server" }, ...previous].slice(0, 150);
      });
    },
    onReady: () => {
      apiFetchNotifications({ limit: 100 }).then((data) => {
        const serverItems = (Array.isArray(data?.notifications) ? data.notifications : []).map((item) => ({ ...item, source: "server" }));
        setNotifications((previous) => {
          const localOnly = previous.filter((item) => !isServerNotificationId(item.id));
          const seen = new Set(serverItems.map((item) => item.id));
          const dedupedLocal = localOnly.filter((item) => !seen.has(item.id));
          return [...serverItems, ...dedupedLocal]
            .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
            .slice(0, 150);
        });
      }).catch(() => {});
    },
  });
  return close;
}, [teacherNotificationKey]);

// Phase 7: MongoDB-backed teacher analytics.
useEffect(() => {
  let cancelled = false;
  const load = async () => {
    try { const data = await fetchTeacherAnalytics(); if (!cancelled) setServerTeacherAnalytics(data); } catch { /* local analytics remain available */ }
  };
  load();
  const onFocus = () => load();
  window.addEventListener("focus", onFocus);
  return () => { cancelled = true; window.removeEventListener("focus", onFocus); };
}, [email]);

// Verified teacher earnings (real-money only; demo excluded by backend summary).
useEffect(() => {
  let cancelled = false;
  const load = async () => {
    try { const data = await fetchMyEarnings(); if (!cancelled) setServerTeacherEarnings(data); } catch { /* earnings panel remains available */ }
  };
  load();
  const onFocus = () => load();
  window.addEventListener("focus", onFocus);
  return () => { cancelled = true; window.removeEventListener("focus", onFocus); };
}, [email]);

function markNotificationRead(id) {
  setNotifications((current) => current.map((item) => item.id === id ? { ...item, read: true } : item));
  if (isServerNotificationId(id)) markServerNotificationRead(id).catch(() => {});
}
function markAllNotificationsRead() {
  setNotifications((current) => current.map((item) => item.read ? item : { ...item, read: true }));
  markAllServerNotificationsRead().catch(() => {});
}
function deleteNotification(id) {
  setNotifications((current) => current.filter((item) => item.id !== id));
  if (isServerNotificationId(id)) deleteServerNotification(id).catch(() => {});
}

const [workspaceRevision, setWorkspaceRevision] = useState(0);
useEffect(() => {
  const refresh = event => {
    if (event.type === "storage" && event.key === profileKey) {
      const saved = readSaved(profileKey, null);
      if (saved && typeof saved === "object") setProfile(saved);
    }
    setWorkspaceRevision(value => value + 1);
  };
  const events = ["storage", "focus", "educonnect:student-data-changed", "educonnect:student-header-changed", "educonnect:teacher-profile-changed", "educonnect:moderation-visibility-changed", REVIEW_EVENT, ORDERS_EVENT, ASSIGNMENT_EVENT, DISCUSSIONS_EVENT];
  events.forEach(event => window.addEventListener(event, refresh));
  return () => events.forEach(event => window.removeEventListener(event, refresh));
}, [courseKey, profileKey]);
// Analytics also reads localStorage-backed records refreshed by workspace events.
// eslint-disable-next-line react-hooks/exhaustive-deps
const courseAnalytics = useMemo(() => collectInstructorCourseAnalytics(email, courses), [email, courses, workspaceRevision]);
const managedCourseIds = new Set(courses.map((course) => String(course.id)));
const visibleCatalogCourses = getCourseCatalogForDisplay().filter((course) =>
  !(String(course.teacherEmail || "").trim().toLowerCase() === String(email || "").trim().toLowerCase()
    && managedCourseIds.has(String(course.id)))
);
const transactions = courseAnalytics.flatMap(course => course.salesRecords).map(record => ({ ...record, date: String(record.purchasedAt || "").slice(0, 10) }));
const now = new Date();
const currentMonthKey = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
const currentMonthLabel = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
const completedSales = transactions.length;

const [selectedStudent, setSelectedStudent] = useState(null);

const enrolledStudents = courseAnalytics.flatMap(course => course.enrollmentRecords);
const uniqueStudents = [...new Map(enrolledStudents.map(student => [student.email, student])).values()];
const courseAnalyticsById = new Map(courseAnalytics.map(course => [String(course.id), course]));
const courseRatings = courseAnalytics.flatMap(course => course.ratings);
const averageCourseRating = courseRatings.length
  ? courseRatings.reduce((sum, rating) => sum + rating, 0) / courseRatings.length
  : null;
const totalCourseLessons = courses.reduce(
  (total, course) => total + (Array.isArray(course.lessons) ? course.lessons.length : Math.max(0, Number(course.lessons) || 0)),
  0,
);

const studentCourses = [
  ...new Set(enrolledStudents.map((student) => student.courseTitle)),
];

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(() => courseForEdit?.id ?? null);
  const [courseForm, setCourseForm] = useState(() =>
    courseForEdit
      ? {
          title: courseForEdit.title || "",
          category: courseForEdit.category || "Development",
          level: courseForEdit.level || "Beginner",
          description: courseForEdit.description || "",
          price: String(courseForEdit.price ?? ""),
          thumbnail: courseForEdit.thumbnail || "",
        }
      : { ...emptyCourse }
  );

const [selectedLessonCourse, setSelectedLessonCourse] = useState("");
const [editingLessonId, setEditingLessonId] = useState(null);
const [showLessonForm, setShowLessonForm] = useState(false);
const [lessonVideoFile, setLessonVideoFile] = useState(null);
const [lessonResourceFile, setLessonResourceFile] = useState(null);

const [lessonForm, setLessonForm] = useState({
  title: "",
  description: "",
  duration: "",
  isFreePreview: false,
});

  const [profileSaved, setProfileSaved] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const profileImageUploadRequest = useRef(0);
  const [profileImageProcessing, setProfileImageProcessing] = useState(false);
  const [profileImageError, setProfileImageError] = useState("");
  
const [previewCourse, setPreviewCourse] = useState(null);

const [courseSearch, setCourseSearch] = useState("");
const [categoryFilter, setCategoryFilter] = useState("All");
const [statusFilter, setStatusFilter] = useState("All");
const [openCourseMenu, setOpenCourseMenu] = useState("");
const [courseMenuPosition, setCourseMenuPosition] = useState(null);

function closeCourseMenu() {
  setOpenCourseMenu("");
  setCourseMenuPosition(null);
}

const filteredCourses = courses.filter((course) => {
  const matchesSearch = (course.title || "")
    .toLowerCase()
    .includes(courseSearch.toLowerCase().trim());

  const matchesCategory =
    categoryFilter === "All" ||
    course.category === categoryFilter;

  const matchesStatus =
    statusFilter === "All" ||
    (course.status || "Draft") === statusFilter;

  return matchesSearch && matchesCategory && matchesStatus;
});

const courseStatusTabs = [
  { value: "All", label: "All Courses" },
  { value: "Published", label: "Published" },
  { value: "Draft", label: "Draft" },
  { value: "Pending Approval", label: "Under Review" },
  { value: "Approved", label: "Approved" },
  ...[...new Set(courses.map(course => course.status || "Draft"))]
    .filter(status => !["Published", "Draft", "Pending Approval", "Approved"].includes(status))
    .map(status => ({ value: status, label: status })),
].map(tabItem => ({
  ...tabItem,
  count: tabItem.value === "All"
    ? courses.length
    : courses.filter(course => (course.status || "Draft") === tabItem.value).length,
}));

useEffect(() => {
  if (!openCourseMenu) return undefined;
  const closeMenu = event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest(".edc-teacher-course-actions-menu, .edc-teacher-course-actions-popover")) {
      closeCourseMenu();
    }
  };
  const closeOnViewportChange = () => closeCourseMenu();
  document.addEventListener("pointerdown", closeMenu);
  window.addEventListener("scroll", closeOnViewportChange, true);
  window.addEventListener("resize", closeOnViewportChange);
  return () => {
    document.removeEventListener("pointerdown", closeMenu);
    window.removeEventListener("scroll", closeOnViewportChange, true);
    window.removeEventListener("resize", closeOnViewportChange);
  };
}, [openCourseMenu]);

  function navigateTo(nextTab) {
    setTab(nextTab);
    if (location.pathname !== "/teacher/dashboard") {
      navigate("/teacher/dashboard");
    }
  }

  function startCreate() {
    courseDraftId.current = window.crypto.randomUUID();
    setEditingId(null);
    setCourseForm({ ...emptyCourse });
    setShowForm(true);
    navigateTo("courses");
  }

  function startEdit(course) {
    setEditingId(course.id);
    setCourseForm({
      ...course,
      title: course.title || "",
      category: course.category || "Development",
      level: course.level || "Beginner",
      description: course.description || "",
      price: String(course.price ?? ""),
      thumbnail: course.thumbnail || "",

    });
    setTab("courses");
    navigate(`/teacher/dashboard/courses/${encodeURIComponent(course.id)}/edit`);
  }

  function closeCourseEditor() {
    navigateTo("courses");
  }
  
function handleThumbnailUpload(event) {
  const file = event.target.files?.[0];

  if (!file) return;

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  if (!allowedTypes.includes(file.type)) {
    alert("Please select a JPG, PNG or WebP image.");
    event.target.value = "";
    return;
  }

  if (file.size > 1024 * 1024) {
    alert("Image must be smaller than 1 MB.");
    event.target.value = "";
    return;
  }

  compressImageForStorage(file).then((thumbnail) => {
    setCourseForm((previous) => ({
      ...previous,
      thumbnail,
    }));
  }).catch((error) => {
    console.error("Could not prepare course thumbnail", error);
    alert(
      error?.message === "The selected image is too large to store."
        ? "This image could not be compressed enough for browser storage. Please choose a smaller image."
        : "Unable to prepare the image. Please try another JPG, PNG or WebP file."
    );
  });
  event.target.value = "";
}

function removeThumbnail() {
  setCourseForm((previous) => ({
    ...previous,
    thumbnail: "",
  }));
}

  async function saveCourse(event) {
    event.preventDefault();
    if (courseSaving) return;

    const title = courseForm.title.trim();
    const description = courseForm.description.trim();
    const price = Number(courseForm.price);

    if (!title || !description) {
      alert("Course title and description are required.");
      return;
    }

    if (
      courseForm.price === "" ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      alert("Enter a valid course price.");
      return;
    }

    let updatedCourses;

    if (editingId) {
      updatedCourses = courses.map((course) =>
          course.id === editingId
            ? {
                ...course,
                ...courseForm,
                title,
                description,
                price,
                updatedAt: new Date().toISOString(),
                status: course.status === "Published" ? "Published" : "Draft",
              }
            : course
      );
    } else {
      const id = courseDraftId.current || (courseDraftId.current = window.crypto.randomUUID());

      updatedCourses = [
        ...courses,
        {
          id,
          ...courseForm,
          title,
          description,
          price,
          status: "Draft",
          lessons: [],
          createdAt: new Date().toISOString(),
        },
      ];
    }

    setCourseSaving(true);
    const saved = await updateCourses(updatedCourses);
    setCourseSaving(false);
    if (!saved) return;

    setShowForm(false);
    setEditingId(null);
    setCourseForm({ ...emptyCourse });
    navigateTo("courses");
  }

  function deleteCourse(id) {
    if (!window.confirm("Delete this course?")) return;
    updateCourses((previous) =>
      previous.filter((course) => course.id !== id)
    );
  }

  async function removeLesson(courseId, lessonId, options) {
    if (!options?.skipConfirm && !window.confirm("Remove this lesson?")) return false;
    const saved = await updateCourses((previous) =>
      previous.map((course) =>
        String(course.id) === String(courseId)
          ? {
              ...course,
              status: "Draft",
              lessons: (course.lessons || []).filter(
                (lesson) => String(lesson.id) !== String(lessonId)
              ),
            }
          : course
      )
    );
    if (!saved) return false;
    return true;
  }

function openLessonForm(courseId, lesson = null) {
  setSelectedLessonCourse(courseId);
  setEditingLessonId(lesson?.id ?? null);
  setLessonVideoFile(null);
  setLessonResourceFile(null);

  setLessonForm({
    title: lesson?.title || "",
    description: lesson?.description || "",
    content: lesson?.content || "",
    needsUpload: Boolean(lesson?.needsUpload),
    duration: lesson?.duration || "",
    isFreePreview: Boolean(lesson?.isFreePreview),
  });

  setShowLessonForm(true);
}

function closeLessonForm() {
  setShowLessonForm(false);
  setEditingLessonId(null);
  setLessonVideoFile(null);
  setLessonResourceFile(null);
}

async function saveLesson(event) {
  event.preventDefault();

  const title = lessonForm.title.trim();

  if (!title || !selectedLessonCourse) {
    alert("Please enter a lesson title.");
    return;
  }

  const newLessonId = editingLessonId !== null
    ? editingLessonId
    : (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);
  let videoFileId;
  let fileId;
  if (lessonResourceFile) {
    try { fileId = await uploadContentFile("pdf", lessonResourceFile); }
    catch (error) { setCourseStorageError(error.message); return; }
  }
  if (lessonVideoFile) {
    try {
      videoFileId = await uploadContentFile("video", lessonVideoFile);
    } catch (error) {
      alert(`Video could not be uploaded: ${error.message}.`);
      return;
    }
  }

  const saved = await updateCourses((previous) =>
    previous.map((course) => {
      if (course.id !== selectedLessonCourse) {
        return course;
      }

      const lessons = [...(course.lessons || [])];

      const updatedLesson = {
        title,
        description: lessonForm.description.trim(),
        content: lessonForm.content || "",
        needsUpload: Boolean(lessonForm.needsUpload && !videoFileId && !fileId && !lessonForm.content?.trim()),
        ...(fileId ? { fileId } : {}),
        duration: lessonForm.duration,
        isFreePreview: lessonForm.isFreePreview,
        ...(videoFileId ? { videoFileId } : {}),
      };

      if (editingLessonId !== null) {
        return {
          ...course,
          lessons: lessons.map((lesson) =>
            lesson.id === editingLessonId
              ? { ...lesson, ...updatedLesson }
              : lesson
          ),
        };
      }

      return {
        ...course,
        lessons: [
          ...lessons,
          {
            id: newLessonId,
            ...updatedLesson,
          },
        ],
      };
    })
  );

  if (saved) closeLessonForm();
}

function moveLesson(courseId, lessonId, direction) {
  updateCourses((previous) =>
    previous.map((course) => {
      if (course.id !== courseId) return course;
      const lessons = [...(course.lessons || [])];
      const index = lessons.findIndex((lesson) => lesson.id === lessonId);
      const newIndex = index + direction;
      if (index === -1 || newIndex < 0 || newIndex >= lessons.length) {
        return course;
      }
      [lessons[index], lessons[newIndex]] = [lessons[newIndex], lessons[index]];
      return { ...course, lessons, status: "Draft" };
    })
  );
}

const teacherProfileImage = profile.avatar || "";
const teacherExpertise = profile.expertise || "";
const teacherDisplayName = profile.name || account?.fullName || "Name not added";
const teacherTeachingProfile = {
  educationLevel: profile.teachingEducationLevel || "",
  classNumber: profile.teachingClassNumber || "",
  intermediateYear: profile.teachingIntermediateYear || "",
  stream: profile.teachingStream || "",
  degreeLevel: profile.teachingDegreeLevel || "",
  programChoice: profile.teachingProgramChoice || "",
  program: profile.teachingProgram || "",
};
const teacherFocusComplete = isAcademicProfileComplete(teacherTeachingProfile);
const teacherFocusContext = getStudentAcademicContext(teacherTeachingProfile);
const teacherFocusSubjects = teacherFocusComplete ? getStudentAcademicSubjects(teacherTeachingProfile) : [];
const teacherFocusLabel = teacherFocusComplete
  ? `${teacherFocusContext.title}${teacherTeachingProfile.degreeLevel ? ` · ${teacherTeachingProfile.degreeLevel.toUpperCase()}` : ""}`
  : "Choose a level and area of expertise";
const teacherSkillTags = [...new Set(String(teacherExpertise).split(/[,\n;]+/).map((item) => item.trim()).filter(Boolean))];
const profileList = (value) => Array.isArray(value) ? value : value ? [value] : [];
const teacherProfileAreas = [...new Set([
  ...teacherFocusSubjects,
  ...profileList(profile.subjects),
  ...profileList(profile.teachingSubjects),
  ...courses.flatMap((course) => [
    ...profileList(course.subject),
    ...profileList(course.subjects),
    ...profileList(course.specialization),
  ]),
].map((item) => String(item || "").trim()).filter(Boolean))];
const profileCompletionFields = [
  profile.name,
  profile.avatar,
  profile.headline,
  profile.bio,
  teacherExpertise,
  profile.qualification,
  profile.experience,
  profile.availability,
  teacherFocusComplete,
];
const profileCompletion = Math.round(profileCompletionFields.filter(Boolean).length / profileCompletionFields.length * 100);

function startProfileEdit() {
  setProfileSaved(false);
  setShowProfileEditor(true);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelProfileEdit() {
  profileImageUploadRequest.current += 1;
  setProfileImageProcessing(false);
  setProfileImageError("");
  setProfile(readTeacherProfile(profileKey, email));
  setProfileSaved(false);
  setShowProfileEditor(false);
}

function updateTeacherTeachingProfile(field, value) {
  setProfileSaved(false);
  setProfile((previous) => {
    const next = { ...previous, [field]: value };
    if (field === "teachingEducationLevel") {
      next.teachingClassNumber = "";
      next.teachingIntermediateYear = "";
      next.teachingStream = "";
      next.teachingDegreeLevel = "";
      next.teachingProgramChoice = "";
      next.teachingProgram = "";
    }
    if (field === "teachingDegreeLevel") {
      next.teachingProgramChoice = "";
      next.teachingProgram = "";
    }
    if (field === "teachingProgramChoice") {
      next.teachingProgram = value === "Other" ? "" : value;
    }
    return next;
  });
}

async function handleTeacherProfileImage(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const requestId = profileImageUploadRequest.current + 1;
  profileImageUploadRequest.current = requestId;
  setProfileImageProcessing(false);
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    setProfileImageError("Choose a JPG, PNG or WebP image.");
    event.target.value = "";
    return;
  }

  setProfileImageProcessing(true);
  setProfileImageError("");
  event.target.value = "";

  try {
    const avatar = await compressImageForStorage(file);
    if (profileImageUploadRequest.current !== requestId) return;
    setProfile((previous) => ({ ...previous, avatar }));
    setProfileSaved(false);
  } catch (error) {
    if (profileImageUploadRequest.current === requestId) {
      setProfileImageError(error.message || "Unable to process this image.");
    }
  } finally {
    if (profileImageUploadRequest.current === requestId) {
      setProfileImageProcessing(false);
    }
  }
}

  async function submitForApproval(courseId) {
    const course = courses.find(
      (item) => item.id === courseId
    );

    if (!course) return;

    if (!(course.lessons || []).length) {
      alert("Add at least one lesson before submission.");
      navigateTo("lessons");
      return;
    }

    if (!await updateCourses((previous) =>
      previous.map((item) =>
        item.id === courseId
          ? {
              ...item,
              status: "Pending Approval",
              revisionNotes: "",
            }
          : item
      )
    )) return;

    try {
      appendAdminActivityRecord({
        actor: email,
        actorRole: "Teacher",
        action: "Course Submitted",
        category: "course-review",
        module: "Course Review",
        entityType: "Course",
        entityId: String(course.id),
        targetId: String(course.id),
        targetName: course.title || "Course",
        previousValue: course.status || "Draft",
        newValue: "Pending Approval",
        description: "Teacher submitted a course for Admin review.",
        result: "Success",
      });
    } catch {
      // A local audit write error must not block course submission.
    }

    alert("Course submitted for approval.");
  }

  async function publishApprovedCourse(courseId) {
    const course = courses.find((item) => item.id === courseId);
    if (!course || course.status !== "Approved") return;

    if (!(course.lessons || []).length) {
      alert("Add at least one lesson before publishing.");
      navigateTo("lessons");
      return;
    }

    if (!await updateCourses((previous) =>
      previous.map((item) =>
        item.id === courseId
          ? { ...item, status: "Published", publishedAt: new Date().toISOString() }
          : item
      )
    )) return;

    try {
      appendAdminActivityRecord({
        actor: email,
        actorRole: "Teacher",
        action: "Course Published",
        category: "course-review",
        module: "Course Review",
        entityType: "Course",
        entityId: String(course.id),
        targetId: String(course.id),
        targetName: course.title || "Course",
        previousValue: "Approved",
        newValue: "Published",
        description: "Teacher published an Admin-approved course.",
        result: "Success",
      });
    } catch {
      // A local audit write error must not block course publishing.
    }

    alert("Course published. It is now available in Explore Courses.");
  }

  const teacherStatDetailSlug = location.pathname.startsWith("/teacher/dashboard/overview/")
    ? location.pathname.split("/").at(-1)
    : "";
  const teacherStatDetailConfig = {
    "total-courses": {
      title: "Total Courses",
      description: "All courses in your teaching workspace.",
      courses,
      emptyMessage: "You have not created any courses yet.",
    },
    "draft-courses": {
      title: "Draft Courses",
      description: "Courses saved as drafts and not submitted for approval.",
      courses: courses.filter((course) => (course.status || "Draft") === "Draft"),
      emptyMessage: "You have no draft courses.",
    },
    "pending-approval": {
      title: "Pending Approval",
      description: "Courses waiting for an administrator to review them.",
      courses: courses.filter((course) => course.status === "Pending Approval"),
      emptyMessage: "You have no courses waiting for approval.",
    },
    "approved-courses": {
      title: "Approved Courses",
      description: "Courses approved and ready for learners.",
      courses: courses.filter((course) => course.status === "Approved"),
      emptyMessage: "You have no approved courses yet.",
    },
  }[teacherStatDetailSlug];

  const teacherStudentDetailSlug = location.pathname.startsWith("/teacher/dashboard/students/")
    ? location.pathname.split("/").at(-1)
    : "";
  const teacherStudentDetailConfig = {
    "total-students": {
      title: "Total Students",
      description: "Student enrollments saved for your courses in this browser.",
      items: enrolledStudents.map((student) => ({
        id: student.id,
        title: student.name,
        detail: `${student.email} · ${student.courseTitle} · Enrolled ${student.enrolledAt}`,
        status: `${student.progress}% progress`,
        progress: student.progress,
      })),
      emptyMessage: "No student enrollment records are available yet.",
    },
    "demo-courses": {
      title: "Enrolled Courses",
      description: "Your courses with saved student enrollments and progress.",
      items: studentCourses.map((courseTitle) => {
        const courseStudents = enrolledStudents.filter((student) => student.courseTitle === courseTitle);
        const averageCourseProgress = courseStudents.length
          ? Math.round(courseStudents.reduce((total, student) => total + student.progress, 0) / courseStudents.length)
          : 0;
        return {
          id: courseTitle,
          title: courseTitle,
          detail: courseStudents.map((student) => `${student.name} (${student.progress}%)`).join(" · "),
          status: `${courseStudents.length} ${courseStudents.length === 1 ? "student" : "students"}`,
          progress: averageCourseProgress,
        };
      }),
      emptyMessage: "No course enrollments are available yet.",
    },
    "average-progress": {
      title: "Average Progress",
      description: `Average learning progress across your saved course enrollments is ${enrolledStudents.length ? Math.round(enrolledStudents.reduce((total, student) => total + student.progress, 0) / enrolledStudents.length) : 0}%. Individual progress is listed below.`,
      items: [...enrolledStudents].sort((a, b) => a.progress - b.progress).map((student) => ({
        id: student.id,
        title: student.name,
        detail: `${student.courseTitle} · ${student.completedLessons} of ${student.totalLessons} lessons completed`,
        status: `${student.progress}%`,
        progress: student.progress,
      })),
      emptyMessage: "No progress records are available yet.",
    },
  }[teacherStudentDetailSlug];

  const teacherEarningsDetailSlug = location.pathname.startsWith("/teacher/dashboard/earnings/")
    ? location.pathname.split("/").at(-1)
    : "";
  const transactionDetails = records => records.map(record => ({
    id: record.id,
    title: record.course,
    detail: [record.student, record.date].filter(Boolean).join(" / "),
    amount: record.amount,
    status: record.status,
  }));
  const teacherEarningsDetailConfig = {
    "total-earnings": {
      title: "Recorded Course Sales",
      description: "Saved checkout and legacy purchase records for your courses in this browser.",
      items: transactionDetails(transactions),
      emptyMessage: "No course purchase records are available yet.",
    },
    "monthly-earnings": {
      title: currentMonthLabel + " Course Sales",
      description: "Saved course purchase records for the current month.",
      items: transactionDetails(transactions.filter(transaction => transaction.date.startsWith(currentMonthKey))),
      emptyMessage: "No course purchases are recorded for this month.",
    },
    "completed-sales": {
      title: "Recorded Purchases",
      description: completedSales + " course purchase records saved in this browser.",
      items: transactionDetails(transactions),
      emptyMessage: "No course purchase records are available yet.",
    },
  }[teacherEarningsDetailSlug];

  if (requestedCourseId) {
    const course = courses.find(
      (item) => String(item.id) === requestedCourseId
    );

    return (
      <section className="edc-teacher-shell">
        <TeacherSidebar
          activeTab={tab}
          profileImage={teacherProfileImage}
          displayName={teacherDisplayName}
          onNavigate={navigateTo}
          onCreate={startCreate}
        />
        <main className="edc-teacher-main">
          <TeacherWorkspaceHeader
            profile={{ ...profile, name: teacherDisplayName }}
            identityVerified={cnicStatus === "verified"}
            unread={unreadNotifications}
            notifications={notifications}
            onReadNotification={markNotificationRead}
            onReadAllNotifications={markAllNotificationsRead}
            onDeleteNotification={deleteNotification}
            onNavigate={navigateTo}
            onLogout={signOut}
          />
          <section className="edc-teacher-course-edit-page">
            <div className="edc-teacher-course-edit-content">
              <button
                type="button"
                className="edc-teacher-course-edit-back"
                onClick={closeCourseEditor}
              >
                <ArrowLeft size={17} />
                Back to My Courses
              </button>

              {course ? (
                <>
                  {courseStorageError && (
                    <p className="edc-teacher-storage-error" role="alert">
                      {courseStorageError}
                    </p>
                  )}
                  <header className="edc-teacher-course-edit-heading">
                    <span>COURSE MANAGEMENT</span>
                    <h1>Edit Course</h1>
                    <p>Update the details for “{course.title}”.</p>
                  </header>
                  <TeacherCourseEditor
                    courseForm={courseForm}
                    setCourseForm={setCourseForm}
                    editingId={editingId}
                    teacherFocusLabel={teacherFocusLabel}
                    onSave={saveCourse}
                    onCancel={closeCourseEditor}
                    onThumbnailUpload={handleThumbnailUpload}
                    onRemoveThumbnail={removeThumbnail}
                  />
                </>
              ) : (
                <section className="edc-teacher-course-edit-not-found" role="alert">
                  <h1>Course not found</h1>
                  <p>This course may have been deleted or is no longer available.</p>
                  <button type="button" onClick={closeCourseEditor}>
                    Return to My Courses
                  </button>
                </section>
              )}
            </div>
          </section>
        </main>
      </section>
    );
  }

  return (
    <section className="edc-teacher-shell">
      <TeacherSidebar
        activeTab={tab}
        profileImage={teacherProfileImage}
        displayName={teacherDisplayName}
        onNavigate={navigateTo}
        onCreate={startCreate}
      />

      {/* MAIN CONTENT */}

      <main className="edc-teacher-main">
        <TeacherWorkspaceHeader
          profile={{ ...profile, name: teacherDisplayName }}
          identityVerified={cnicStatus === "verified"}
          unread={unreadNotifications}
          notifications={notifications}
          onReadNotification={markNotificationRead}
          onReadAllNotifications={markAllNotificationsRead}
          onDeleteNotification={deleteNotification}
          onNavigate={navigateTo}
          onLogout={signOut}
        />
        {tab !== "courses" && (
          <header className="edc-teacher-topbar">
            <div>
              <span className="edc-teacher-breadcrumb">
                Teacher Workspace / {teacherEarningsDetailConfig ? `Earnings / ${teacherEarningsDetailConfig.title}` : teacherStudentDetailConfig ? `My Students / ${teacherStudentDetailConfig.title}` : teacherStatDetailConfig ? `Overview / ${teacherStatDetailConfig.title}` : navigation.find(([id]) => id === tab)?.[1]}
              </span>

              {!["reviews", "discussions", "lessons", "analytics", "quizzes", "course-assignments", "curriculum"].includes(tab) && !(tab === "students" && !teacherStudentDetailConfig) && !(tab === "earnings" && !teacherEarningsDetailConfig) && (
                <h2>
                  {teacherEarningsDetailConfig?.title || teacherStudentDetailConfig?.title || teacherStatDetailConfig?.title || navigation.find(([id]) => id === tab)?.[1]}
                </h2>
              )}
            </div>
            <button type="button" className="edc-dashboard-logout" onClick={signOut}>
              <LogOut size={17} /> Log out
            </button>
          </header>
        )}


        {courseStorageError && (
          <p className="edc-teacher-storage-error" role="alert">
            {courseStorageError}
          </p>
        )}

        {teacherStatDetailConfig && (
          <section className="edc-teacher-stat-detail-page">
            <button type="button" className="edc-teacher-detail-back" onClick={() => navigateTo("overview")}>
              <ArrowRight size={16} /> Back to Overview
            </button>
            <p className="edc-teacher-detail-description">{teacherStatDetailConfig.description}</p>
            {teacherStatDetailConfig.courses.length ? (
              <div className="edc-teacher-detail-courses">
                {teacherStatDetailConfig.courses.map((course) => (
                  <article key={course.id} className="edc-teacher-course-row">
                    <BookOpen size={22} color={purple} />
                    <div className="edc-teacher-course-info">
                      <strong>{course.title}</strong>
                      <span>{course.category || "Uncategorized"} · {(course.lessons || []).length} lessons</span>
                    </div>
                    <span className={`edc-teacher-stat-detail-status ${course.status === "Approved" ? "approved" : course.status === "Pending Approval" ? "pending" : "draft"}`}>
                      {course.status || "Draft"}
                    </span>
                    <button type="button" className="edc-teacher-detail-edit" onClick={() => startEdit(course)} aria-label={`Edit ${course.title}`}>
                      <Edit3 size={15} /> Edit
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <section className="edc-teacher-panel edc-teacher-detail-empty">
                <BookOpen size={38} color={purple} />
                <h3>{teacherStatDetailConfig.emptyMessage}</h3>
                <button type="button" className="edc-teacher-primary" onClick={startCreate}>
                  <Plus size={16} /> Create Course
                </button>
              </section>
            )}
          </section>
        )}

        {teacherStudentDetailConfig && (
          <section className="edc-teacher-stat-detail-page">
            <button type="button" className="edc-teacher-detail-back" onClick={() => navigateTo("students")}>
              <ArrowRight size={16} /> Back to My Students
            </button>
            <p className="edc-teacher-detail-description">{teacherStudentDetailConfig.description}</p>
            {teacherStudentDetailConfig.items.length ? (
              <div className="edc-teacher-detail-courses edc-teacher-student-detail-list">
                {teacherStudentDetailConfig.items.map((item) => (
                  <article key={item.id} className="edc-teacher-student-detail-row">
                    <div className="edc-teacher-course-info">
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </div>
                    <span className="edc-teacher-stat-detail-status">{item.status}</span>
                    <div className="edc-teacher-student-detail-progress" role="img" aria-label={`${item.progress}% progress`}>
                      <span style={{ width: `${item.progress}%` }} />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <section className="edc-teacher-panel edc-teacher-detail-empty">
                <Users size={38} color={purple} />
                <h3>{teacherStudentDetailConfig.emptyMessage}</h3>
              </section>
            )}
          </section>
        )}

        {teacherEarningsDetailConfig && (
          <section className="edc-teacher-stat-detail-page">
            <button type="button" className="edc-teacher-detail-back" onClick={() => navigateTo("earnings")}>
              <ArrowRight size={16} /> Back to Earnings
            </button>
            <p className="edc-teacher-detail-description">{teacherEarningsDetailConfig.description}</p>
            {teacherEarningsDetailConfig.items.length ? (
              <div className="edc-teacher-detail-courses edc-teacher-earnings-detail-list">
                {teacherEarningsDetailConfig.items.map((item) => (
                  <article key={item.id} className="edc-earnings-request-row">
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </div>
                    <strong>PKR {item.amount.toLocaleString()}</strong>
                    <span className={`edc-earnings-status ${item.status === "Completed" ? "completed" : item.status === "Pending" ? "pending" : ""}`}>
                      {item.status}
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <section className="edc-teacher-panel edc-teacher-detail-empty">
                <Wallet size={38} color={purple} />
                <h3>{teacherEarningsDetailConfig.emptyMessage}</h3>
              </section>
            )}
          </section>
        )}

        {tab === "overview" && !teacherStatDetailConfig && (
          <TeacherOverview
            email={email}
            profile={{ ...profile, name: teacherDisplayName }}
            courses={courses}
            data={courseAnalytics}
            onNavigate={navigateTo}
            onCreate={startCreate}
            onEdit={startEdit}
            onLessons={course => { setSelectedLessonCourse(course.id); navigateTo("lessons"); }}
          />
        )}

        {/* MY COURSES */}

       
{tab === "analytics" && <InstructorAnalytics email={email} courses={courses} serverAnalytics={serverTeacherAnalytics} earnings={serverTeacherEarnings} />}
{tab === "quizzes" && <CourseQuizzes role="teacher" email={email} courses={courses.map(c => ({ ...c, teacherEmail: email }))} />}
{tab === "course-assignments" && <CourseAssignments role="teacher" email={email} courses={courses.map(c => ({ ...c, teacherEmail: email }))} />}
{tab === "curriculum" && <CurriculumBuilder role="teacher" email={email} courses={courses.map(c => ({ ...c, teacherEmail: email }))}
  onSaveCurriculum={(courseId, curriculum) => updateCourses((previous) => previous.map((course) => String(course.id) === String(courseId) ? { ...course, curriculum, status: "Draft" } : course))}
  onAddLesson={(courseId, lesson) => updateCourses(prev => prev.map(c => String(c.id)===String(courseId) ? {...c,status:"Draft",lessons:[...(Array.isArray(c.lessons)?c.lessons:[]),lesson]} : c))}
  onReorderLessons={(courseId, orderedIds) => updateCourses(prev => prev.map(c => {
    if(String(c.id)!==String(courseId))return c;
    const old=Array.isArray(c.lessons)?c.lessons:[];
    const picked=orderedIds.map(id=>old.find(l=>String(l.id)===String(id))).filter(Boolean);
    const remaining=old.filter(l=>!orderedIds.some(id=>String(id)===String(l.id)));
    return {...c,lessons:[...picked,...remaining]};
  }))}
  onNavigate={navigateTo}
  onEditCourse={(courseId) => { const target = courses.find(item => String(item.id) === String(courseId)); if (target) startEdit(target); }}
  onOpenLesson={(courseId, lessonId) => { const target = courses.find(item => String(item.id) === String(courseId)); const lesson = (target?.lessons || []).find(item => String(item.id) === String(lessonId)); openLessonForm(courseId, lesson || null); navigateTo("lessons"); }}
  onDeleteLesson={removeLesson}
/>}
{tab === "books" && <TeacherBooks email={email} profile={profile} />}
{tab === "reviews" && <CourseReviews role="teacher" email={email} courses={courses} />}
{tab === "discussions" && <CourseDiscussions role="teacher" email={email} courses={courses.map(course => ({ ...course, teacherEmail: email }))} />}
{tab === "appeals" && <UserModerationAppeals email={email} name={profile.fullName || profile.name || "Teacher"} role="Teacher" />}
{tab === "help-support" && <UserSupportCenter email={email} name={profile.fullName || profile.name || "Teacher"} role="Teacher" onNavigate={navigateTo} />}
{tab === "courses" && (
  <div className="edc-teacher-courses-page">
    <header className="edc-teacher-courses-heading">
      <div>
        <GraduationCap size={33} aria-hidden="true" />
        <div>
          <h1>My Courses</h1>
          <p>Create, manage and track the performance of your courses.</p>
        </div>
      </div>
      <button type="button" className="edc-teacher-create-course" onClick={startCreate}>
        <Plus size={19} />
        Create New Course
      </button>
      {readSaved(courseKey, []).length > 0 && <button type="button" className="edc-teacher-create-course"
        onClick={() => importBrowserContent("courses", email).then((message) => window.alert(message)).catch((error) => setCourseStorageError(error.message))}>
        Import browser courses
      </button>}
    </header>

    <section className="edc-teacher-course-stats" aria-label="Course summary">
      {[
        { label: "Total Courses", value: courses.length, icon: BookOpen, color: "purple" },
        { label: "Total Lessons", value: totalCourseLessons, icon: Layers3, color: "gold" },
        { label: "Total Students", value: uniqueStudents.length, icon: Users, color: "purple" },
        {
          label: "Avg. Rating",
          value: averageCourseRating === null ? "—" : averageCourseRating.toFixed(1),
          suffix: averageCourseRating === null ? "" : "/ 5",
          icon: Star,
          color: "gold",
        },
      ].map(({ label, value, suffix, icon: Icon, color }) => (
        <article className={`edc-teacher-course-stat ${color}`} key={label}>
          <span><Icon size={25} fill={label === "Avg. Rating" ? "currentColor" : "none"} /></span>
          <div>
            <small>{label}</small>
            <strong>{value}{suffix && <em>{suffix}</em>}</strong>
          </div>
        </article>
      ))}
    </section>

    <div className="edc-teacher-course-toolbar">
      <nav className="edc-teacher-course-status-tabs" aria-label="Filter courses by status">
        {courseStatusTabs.map(({ value, label, count }) => (
          <button
            type="button"
            key={value}
            className={statusFilter === value ? "active" : ""}
            aria-pressed={statusFilter === value}
            onClick={() => setStatusFilter(value)}
          >
            {label} <span>({count})</span>
          </button>
        ))}
      </nav>
      <div className="edc-teacher-course-search">
        <Search size={18} />
        <input
          type="search"
          aria-label="Search your courses"
          placeholder="Search your courses..."
          value={courseSearch}
          onChange={event => setCourseSearch(event.target.value)}
        />
      </div>
      <select
        aria-label="Filter courses by category"
        value={categoryFilter}
        onChange={event => setCategoryFilter(event.target.value)}
      >
        <option value="All">All Categories</option>
        <option value="Development">Development</option>
        <option value="Design">Design</option>
        <option value="Business">Business</option>
        <option value="Data Science">Data Science</option>
        <option value="IT & Software">IT & Software</option>
        <option value="Personal Growth">Personal Growth</option>
      </select>
    </div>

    {showForm && (
      <TeacherCourseEditor
        courseForm={courseForm}
        setCourseForm={setCourseForm}
        editingId={editingId}
        teacherFocusLabel={teacherFocusLabel}
        onSave={saveCourse}
                pending={courseSaving}
        onCancel={() => {
          setShowForm(false);
          setEditingId(null);
        }}
        onThumbnailUpload={handleThumbnailUpload}
        onRemoveThumbnail={removeThumbnail}
      />
    )}

    {filteredCourses.length ? (
      <div className="edc-teacher-course-table-wrap">
        <table className="edc-teacher-course-table">
          <thead>
            <tr>
              <th scope="col">Course</th>
              <th scope="col">Students</th>
              <th scope="col">Lessons</th>
              <th scope="col">Rating</th>
              <th scope="col">Status</th>
              <th scope="col">Last Updated</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCourses.map(course => {
              const status = course.status || "Draft";
              const analytics = courseAnalyticsById.get(String(course.id));
              const ratings = analytics?.ratings || [];
              const courseRating = ratings.length
                ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
                : null;
              const thumbnail = course.thumbnail || course.image;
              const lessonCount = Array.isArray(course.lessons)
                ? course.lessons.length
                : Math.max(0, Number(course.lessons) || 0);
              const statusClass = status === "Published"
                ? "published"
                : status === "Approved"
                  ? "approved"
                  : status === "Pending Approval"
                    ? "pending"
                    : status === "Rejected" || status === "Suspended"
                      ? "rejected"
                      : status === "Changes Requested"
                        ? "changes-requested"
                        : "draft";
              const canSubmit = !["Pending Approval", "Approved", "Published"].includes(status);

              return (
                <tr key={course.id}>
                  <td>
                    <div className="edc-teacher-course-table-item">
                      {thumbnail ? (
                        <img src={thumbnail} alt="" />
                      ) : (
                        <span className="edc-teacher-course-table-placeholder"><BookOpen size={22} /></span>
                      )}
                      <div>
                        <strong>{course.title || "Untitled course"}</strong>
                        <span className="edc-teacher-course-tags">
                          <small>{course.category || "Uncategorized"}</small>
                          <small>{course.level || "Level not set"}</small>
                        </span>
                        {course.revisionNotes && (
                          <span className="edc-teacher-course-revision-inline">{course.revisionNotes}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>{analytics?.students || 0}</td>
                  <td>{lessonCount}</td>
                  <td>
                    {courseRating === null ? (
                      <span className="edc-teacher-course-no-rating">—</span>
                    ) : (
                      <span className="edc-teacher-course-rating"><Star size={15} fill="currentColor" />{courseRating.toFixed(1)}</span>
                    )}
                  </td>
                  <td>
                    <span className={`edc-teacher-course-table-status ${statusClass}`}>
                      {status === "Pending Approval" ? "Under Review" : status}
                    </span>
                  </td>
                  <td className="edc-teacher-course-updated">
                    {formatCourseUpdatedAt(course.updatedAt || course.createdAt)}
                  </td>
                  <td>
                    <div className="edc-teacher-course-row-actions">
                      <button
                        type="button"
                        className="edc-teacher-course-icon-action"
                        aria-label={`Edit ${course.title || "course"}`}
                        title="Edit course"
                        onClick={() => startEdit(course)}
                      >
                        <Edit3 size={17} />
                      </button>
                      <button
                        type="button"
                        className="edc-teacher-course-icon-action"
                        aria-label="Open learning analytics"
                        title="Learning analytics"
                        onClick={() => navigateTo("analytics")}
                      >
                        <ChartNoAxesCombined size={17} />
                      </button>
                      <div className="edc-teacher-course-actions-menu">
                        <button
                          type="button"
                          className="edc-teacher-course-icon-action"
                          aria-label={`More actions for ${course.title || "course"}`}
                          aria-haspopup="menu"
                          aria-expanded={openCourseMenu === String(course.id)}
                          aria-controls={`teacher-course-menu-${course.id}`}
                          onClick={event => {
                            if (openCourseMenu === String(course.id)) {
                              closeCourseMenu();
                              return;
                            }
                            const rect = event.currentTarget.getBoundingClientRect();
                            const openAbove = window.innerHeight - rect.bottom < 190;
                            setCourseMenuPosition({
                              top: openAbove ? rect.top - 6 : rect.bottom + 6,
                              right: Math.max(8, window.innerWidth - rect.right),
                              openAbove,
                            });
                            setOpenCourseMenu(String(course.id));
                          }}
                        >
                          <MoreVertical size={18} />
                        </button>
                      </div>
                      {openCourseMenu === String(course.id) && courseMenuPosition && createPortal(
                        <div
                          id={`teacher-course-menu-${course.id}`}
                          className="edc-teacher-course-actions-popover"
                          role="menu"
                          style={{
                            position: "fixed",
                            top: courseMenuPosition.top,
                            right: courseMenuPosition.right,
                            zIndex: 1100,
                            transform: courseMenuPosition.openAbove ? "translateY(-100%)" : undefined,
                          }}
                        >
                            <button type="button" role="menuitem" onClick={() => { closeCourseMenu(); navigateTo("lessons"); }}>
                              <BookOpen size={15} /> Manage Lessons
                            </button>
                            <button type="button" role="menuitem" onClick={() => { closeCourseMenu(); setPreviewCourse(course); }}>
                              <ArrowRight size={15} /> Preview Course
                            </button>
                            {status === "Approved" && (
                              <button type="button" role="menuitem" onClick={() => { closeCourseMenu(); publishApprovedCourse(course.id); }}>
                                <CheckCircle2 size={15} /> Publish Course
                              </button>
                            )}
                            {canSubmit && (
                              <button type="button" role="menuitem" onClick={() => { closeCourseMenu(); submitForApproval(course.id); }}>
                                <Send size={15} /> Submit for Approval
                              </button>
                            )}
                            <button type="button" role="menuitem" className="danger" onClick={() => { closeCourseMenu(); deleteCourse(course.id); }}>
                              <Trash2 size={15} /> Delete Course
                            </button>
                        </div>,
                        document.body
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    ) : (
      <section className="edc-teacher-empty-courses">
        <BookOpen size={40} color="#7042d8" />
        <h3>{courses.length === 0 ? "You have no courses yet" : "No courses found"}</h3>
        <p>
          {courses.length === 0
            ? "Create your first course to get started."
            : "No courses match your search or filters."}
        </p>
        {courses.length === 0 && (
          <button type="button" className="edc-teacher-primary" onClick={startCreate}>
            <Plus size={17} />
            Create Course
          </button>
        )}
      </section>
    )}

    {visibleCatalogCourses.length > 0 && (
      <section className="edc-teacher-course-marketplace global-course-history-panel">
        <header className="edc-teacher-courses-heading">
          <div>
            <BookOpen size={28} aria-hidden="true" />
            <div>
              <h2 className="global-dashboard-section-title">Published &amp; Enrolled Courses</h2>
              <p>Other catalog courses and student learning-history records. This list is view-only.</p>
            </div>
          </div>
        </header>
        <div className="edc-teacher-course-table-wrap">
          <table className="edc-teacher-course-table">
            <thead>
              <tr>
                <th scope="col">Course</th>
                <th scope="col">Instructor</th>
                <th scope="col">Category</th>
                <th scope="col">Lessons</th>
              </tr>
            </thead>
            <tbody>
              {visibleCatalogCourses.map(course => (
                <tr key={`${course.teacherEmail}:${course.id}`}>
                  <td>
                    <div className="edc-teacher-course-table-item">
                      {course.thumbnail || course.image ? (
                        <img src={course.thumbnail || course.image} alt="" />
                      ) : (
                        <span className="edc-teacher-course-table-placeholder"><BookOpen size={22} /></span>
                      )}
                      <div><strong>{course.title}</strong></div>
                    </div>
                  </td>
                  <td>{course.instructorName || course.teacherEmail}</td>
                  <td>{course.category || "Uncategorized"}</td>
                  <td>{Array.isArray(course.lessons) ? course.lessons.length : Math.max(0, Number(course.lessons) || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    )}
  </div>
)}


        {/* LESSONS */}

{tab === "lessons" && (
  <>
    <TeacherLessons
      courses={courses}
      courseAnalytics={courseAnalytics}
      preferredCourseId={selectedLessonCourse}
      onCourseChange={setSelectedLessonCourse}
      onAddLesson={courseId => openLessonForm(courseId)}
      onEditLesson={openLessonForm}
      onDeleteLesson={removeLesson}
      onMoveLesson={moveLesson}
      onCreateCourse={() => { startCreate(); navigateTo("courses"); }}
    />

    {showLessonForm && (
      <div
        className="edc-lesson-modal-overlay"
        onClick={closeLessonForm}
      >
        <form
          className="edc-lesson-modal"
          onSubmit={saveLesson}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="edc-lesson-modal-header">
            <div>
              <h3>
                {editingLessonId !== null
                  ? "Edit Lesson"
                  : "Add New Lesson"}
              </h3>
              <p>
                {lessonForm.needsUpload ? "Re-upload this imported lesson’s media before submitting the course." : "Enter your lesson information below."}
              </p>
            </div>

            <button
              type="button"
              onClick={closeLessonForm}
              aria-label="Close lesson form"
            >
              <X size={20} />
            </button>
          </div>

          <div className="edc-lesson-modal-body">
            <div className="edc-lesson-field">
              <label htmlFor="edc-lesson-course">Course</label>
              <select
                id="edc-lesson-course"
                required
                value={selectedLessonCourse}
                disabled={editingLessonId !== null}
                onChange={(event) => setSelectedLessonCourse(event.target.value)}
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.title}</option>
                ))}
              </select>
            </div>

            <div className="edc-lesson-field">
              <label>Lesson Title</label>
              <input
                required
                value={lessonForm.title}
                onChange={(e) =>
                  setLessonForm({
                    ...lessonForm,
                    title: e.target.value,
                  })
                }
                placeholder="e.g. Introduction to React"
              />
            </div>

            <div className="edc-lesson-field">
              <label>Lesson Description</label>
              <textarea
                rows={4}
                value={lessonForm.description}
                onChange={(e) =>
                  setLessonForm({
                    ...lessonForm,
                    description: e.target.value,
                  })
                }
                placeholder="What will students learn?"
              />
            </div>

            <div className="edc-lesson-field">
              <label htmlFor="edc-lesson-content">Lesson content</label>
              <textarea id="edc-lesson-content" rows={5} value={lessonForm.content || ""}
                onChange={(event) => setLessonForm({ ...lessonForm, content: event.target.value })} />
            </div>
            <div className="edc-lesson-field">
              <label htmlFor="edc-lesson-resource">Lesson PDF attachment</label>
              <input id="edc-lesson-resource" type="file" accept="application/pdf" onChange={(event) => setLessonResourceFile(event.target.files?.[0] || null)} />
              <small>PDF up to 20 MB.</small>
            </div>
            <div className="edc-lesson-field">
              <label>Duration (minutes)</label>
              <input
                type="number"
                min="0"
                value={lessonForm.duration}
                onChange={(e) =>
                  setLessonForm({
                    ...lessonForm,
                    duration: e.target.value,
                  })
                }
                placeholder="e.g. 15"
              />
            </div>

            <div className="edc-lesson-field">
              <label>Lesson Video</label>

              <input
                id="edc-lesson-video"
                type="file"
                accept="video/mp4,video/webm"
                onChange={(e) =>
                  setLessonVideoFile(
                    e.target.files?.[0] || null
                  )
                }
              />

              <small>
                {lessonVideoFile
                  ? `Selected: ${lessonVideoFile.name}`
                  : "MP4 or WebM, up to 250 MB."}
              </small>
            </div>

            <label className="edc-lesson-preview-toggle">
              <input
                type="checkbox"
                checked={lessonForm.isFreePreview}
                onChange={(e) =>
                  setLessonForm({
                    ...lessonForm,
                    isFreePreview: e.target.checked,
                  })
                }
              />

              <span>
                <strong>Free Preview Lesson</strong>
                <small>
                  Allow students to preview this lesson.
                </small>
              </span>
            </label>
          </div>

          <div className="edc-lesson-modal-footer">
            <button
              type="button"
              className="cancel"
              onClick={closeLessonForm}
            >
              Cancel
            </button>

            <button type="submit" className="save">
              <CheckCircle2 size={17} />
              {editingLessonId !== null
                ? "Update Lesson"
                : "Save Lesson"}
            </button>
          </div>
        </form>
      </div>
    )}
  </>
)}


        {/* STUDENTS */}

      
{/* STUDENTS */}

{tab === "students" && !teacherStudentDetailConfig && (
  <>
    <TeacherStudents
      enrollments={enrolledStudents}
      onViewStudent={setSelectedStudent}
    />

    {selectedStudent && (
      <div
        className="edc-students-modal-overlay"
        onClick={() => setSelectedStudent(null)}
      >
        <div
          className="edc-students-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Student details"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="edc-students-modal-header">
            <h3>Student Details</h3>

            <button
              type="button"
              onClick={() => setSelectedStudent(null)}
              aria-label="Close student details"
            >
              <X size={20} />
            </button>
          </div>

          <div className="edc-students-modal-body">
            <div className="edc-students-modal-person">
              <div className="edc-students-avatar large">
                {selectedStudent.name.charAt(0)}
              </div>

              <div>
                <h3>{selectedStudent.name} <StudentProfileBadge email={selectedStudent.email} /></h3>
                <p>{selectedStudent.email}</p>
              </div>
            </div>

            <div className="edc-students-detail-row">
              <span>Course</span>
              <strong>{selectedStudent.courseTitle}</strong>
            </div>

            <div className="edc-students-detail-row">
              <span>Enrollment Date</span>
              <strong>{selectedStudent.enrolledAt}</strong>
            </div>

            <div className="edc-students-detail-row">
              <span>Completed Lessons</span>
              <strong>
                {selectedStudent.completedLessons} /{" "}
                {selectedStudent.totalLessons}
              </strong>
            </div>

            <div className="edc-students-detail-row">
              <span>Course Progress</span>
              <strong>{selectedStudent.progress}%</strong>
            </div>

            <div className="edc-students-progress-track">
              <div
                className="edc-students-progress-fill"
                style={{
                  width: `${selectedStudent.progress}%`,
                }}
              />
            </div>

            <p className="edc-students-demo-note">
              Progress is summarized from this student’s saved course enrollments.
            </p>
          </div>
        </div>
      </div>
    )}
  </>
)}


        {tab === "earnings" && !teacherEarningsDetailConfig && (
          <TeacherEarnings email={email} courses={courses} />
        )}


        {/* PROFILE */}
        {tab === "profile" && (
          <div className="edc-profile-page">
            {!profileCompleted && (
              <div className="edc-profile-update-banner" role="status">
                <div className="edc-profile-update-banner-icon" aria-hidden="true"><Info size={20} /></div>
                <div>
                  <strong>Update Your Profile</strong>
                  <span>Add your Subjects, Qualifications, and Teaching Classes to complete your profile.</span>
                </div>
                <button type="button" onClick={startProfileEdit}><Edit3 size={14} />Update Profile</button>
              </div>
            )}
            {showProfileEditor && <div className="edc-profile-heading">
              <div className="edc-profile-heading-copy"><h2>Edit Teacher Profile</h2><p>Changes will appear after you save.</p></div>
              <button type="button" className="edc-pd-secondary" onClick={cancelProfileEdit}><X size={16} />Cancel</button>
            </div>}
            {showProfileEditor ? (
            <div className="edc-profile-layout">
              <section className="edc-profile-editor">
                <div className="edc-profile-card-heading">
                  <h3>Personal Information</h3>
                  <p>Update your profile details below.</p>
                </div>
                <form
                  className="edc-profile-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (profileImageProcessing) {
                      setProfileImageError("Wait for the profile picture to finish processing before saving.");
                      return;
                    }
                    try {
                      localStorage.setItem(profileKey, JSON.stringify(profile));
                      window.dispatchEvent(new Event("educonnect:teacher-profile-changed"));
                      const subjects = [
                        ...profileList(profile.subjects),
                        ...profileList(profile.teachingSubjects),
                        ...teacherFocusSubjects,
                      ].some((value) => String(value || "").trim());
                      const teachingLevel = profile.teachingLevel || profile.teachingEducationLevel || "";
                      const complete = Boolean(
                        subjects &&
                        String(profile.qualification || "").trim() &&
                        String(teachingLevel || "").trim()
                      );
                      try {
                        const users = readSaved("educonnect.registeredUsers", []);
                        if (Array.isArray(users)) {
                          const accountEmail = String(email || "").trim().toLowerCase();
                          const accountIndex = users.findIndex(
                            (user) => String(user?.email || "").trim().toLowerCase() === accountEmail
                          );
                          if (accountIndex >= 0) {
                            users[accountIndex] = {
                              ...users[accountIndex],
                              name: String(profile.name || users[accountIndex].name || "").trim(),
                              profileCompleted: complete,
                            };
                            localStorage.setItem("educonnect.registeredUsers", JSON.stringify(users));
                            setProfileCompleted(complete);
                          }
                        }
                      } catch {
                        // The profile remains saved if account metadata cannot be updated.
                      }
                      setProfileSaved(true);
                      setShowProfileEditor(false);
                    } catch {
                      setProfileSaved(false);
                      alert("Profile could not be saved. Check browser storage.");
                    }
                  }}
                >
                  <div className="edc-profile-upload-section">
                    <div className="edc-profile-avatar">
                      {teacherProfileImage ? (
                        <img src={teacherProfileImage} alt="Instructor profile" />
                      ) : (
                        <span>{teacherDisplayName.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="edc-profile-upload-actions">
                      <label className="edc-profile-upload-button" htmlFor="edc-profile-picture">
                        {profileImageProcessing ? "Processing Picture..." : "Upload Picture"}
                      </label>
                      <input
                        id="edc-profile-picture"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleTeacherProfileImage}
                        hidden
                      />
                      {teacherProfileImage && (
                        <button
                          type="button"
                          className="edc-profile-remove-button"
                          onClick={() => {
                            profileImageUploadRequest.current += 1;
                            setProfileImageProcessing(false);
                            setProfileImageError("");
                            setProfile((previous) => ({ ...previous, avatar: "" }));
                            setProfileSaved(false);
                          }}
                        >
                          Remove Picture
                        </button>
                      )}
                      <small>JPG, PNG or WebP. No file-size cap; images are optimized for browser storage.</small>
                      {profileImageError && <small className="edc-profile-upload-error" role="alert">{profileImageError}</small>}
                    </div>
                  </div>
                  <div className="edc-profile-field">
                    <label htmlFor="edc-profile-name">Full Name</label>
                    <input
                      id="edc-profile-name"
                      required
                      value={profile.name || ""}
                      onChange={(event) => {
                        setProfileSaved(false);
                        setProfile((previous) => ({ ...previous, name: event.target.value }));
                      }}
                    />
                  </div>
                  <div className="edc-profile-field">
                    <label htmlFor="edc-profile-email">Email</label>
                    <input id="edc-profile-email" value={email} disabled />
                  </div>
                  <div className="edc-profile-field">
                    <label htmlFor="edc-profile-headline">Professional Headline</label>
                    <input
                      id="edc-profile-headline"
                      value={profile.headline || ""}
                      placeholder="React & Web Development Instructor"
                      onChange={(event) => {
                        setProfileSaved(false);
                        setProfile((previous) => ({ ...previous, headline: event.target.value }));
                      }}
                    />
                  </div>
                  <div className="edc-profile-field">
                    <label htmlFor="edc-profile-expertise">Additional Expertise</label>
                    <input
                      id="edc-profile-expertise"
                      value={teacherExpertise}
                      placeholder="Extra skills, e.g. React, JavaScript, UI/UX"
                      onChange={(event) => {
                        setProfileSaved(false);
                        setProfile((previous) => ({ ...previous, expertise: event.target.value }));
                      }}
                    />
                  </div>
                  <div className="edc-profile-field">
                    <label htmlFor="edc-profile-qualification">Qualification</label>
                    <input id="edc-profile-qualification" value={profile.qualification || ""} placeholder="Degree or professional qualification" onChange={(event) => { setProfileSaved(false); setProfile((previous) => ({ ...previous, qualification: event.target.value })); }} />
                  </div>
                  <div className="edc-profile-field">
                    <label htmlFor="edc-profile-experience">Teaching Experience</label>
                    <input id="edc-profile-experience" value={profile.experience || ""} placeholder="e.g. 5 years" onChange={(event) => { setProfileSaved(false); setProfile((previous) => ({ ...previous, experience: event.target.value })); }} />
                  </div>
                  <div className="edc-profile-field">
                    <label htmlFor="edc-teacher-teaching-level">Teaching Level</label>
                    <select id="edc-teacher-teaching-level" value={teacherTeachingProfile.educationLevel} onChange={(event) => updateTeacherTeachingProfile("teachingEducationLevel", event.target.value)}>
                      <option value="">Select a teaching level</option>
                      <option value="school">School</option>
                      <option value="intermediate">College / Intermediate</option>
                      <option value="university">University</option>
                      <option value="online">Interest / Online Courses</option>
                    </select>
                  </div>
                  {teacherTeachingProfile.educationLevel === "school" && <div className="edc-profile-field">
                    <label htmlFor="edc-teacher-class">Class</label>
                    <select id="edc-teacher-class" value={teacherTeachingProfile.classNumber} onChange={(event) => updateTeacherTeachingProfile("teachingClassNumber", event.target.value)}>
                      <option value="">Select a class</option>
                      {Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={String(index + 1)}>Class {index + 1}</option>)}
                    </select>
                  </div>}
                  {teacherTeachingProfile.educationLevel === "intermediate" && <>
                    <div className="edc-profile-field">
                      <label htmlFor="edc-teacher-intermediate-year">Year</label>
                      <select id="edc-teacher-intermediate-year" value={teacherTeachingProfile.intermediateYear} onChange={(event) => updateTeacherTeachingProfile("teachingIntermediateYear", event.target.value)}>
                        <option value="">Select a year</option><option value="1">1st Year</option><option value="2">2nd Year</option>
                      </select>
                    </div>
                    <div className="edc-profile-field">
                      <label htmlFor="edc-teacher-intermediate-stream">College Program / Group</label>
                      <select id="edc-teacher-intermediate-stream" value={teacherTeachingProfile.stream} onChange={(event) => updateTeacherTeachingProfile("teachingStream", event.target.value)}>
                        <option value="">Select a group</option>{INTERMEDIATE_STREAMS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                      </select>
                    </div>
                  </>}
                  {teacherTeachingProfile.educationLevel === "university" && <>
                    <div className="edc-profile-field">
                      <label htmlFor="edc-teacher-degree-level">Degree Level</label>
                      <select id="edc-teacher-degree-level" value={teacherTeachingProfile.degreeLevel} onChange={(event) => updateTeacherTeachingProfile("teachingDegreeLevel", event.target.value)}>
                        <option value="">Select a degree level</option><option value="bs">BS / Bachelor's</option><option value="masters">Master's</option><option value="phd">PhD</option>
                      </select>
                    </div>
                    {teacherTeachingProfile.degreeLevel && <div className="edc-profile-field">
                      <label htmlFor="edc-teacher-program">{teacherTeachingProfile.degreeLevel === "bs" ? "BS / Bachelor's Program" : teacherTeachingProfile.degreeLevel === "masters" ? "Master's Program" : "PhD Program"}</label>
                      <select id="edc-teacher-program" value={teacherTeachingProfile.programChoice} onChange={(event) => updateTeacherTeachingProfile("teachingProgramChoice", event.target.value)}>
                        <option value="">Select a program</option>{getProgramGroupsForDegreeLevel(teacherTeachingProfile.degreeLevel).map((group) => <optgroup key={group.label} label={group.label}>{group.programs.map((program) => <option key={program} value={program}>{program}</option>)}</optgroup>)}<option value="Other">Other</option>
                      </select>
                    </div>}
                    {teacherTeachingProfile.programChoice === "Other" && <div className="edc-profile-field">
                      <label htmlFor="edc-teacher-custom-program">Enter Program</label>
                      <input id="edc-teacher-custom-program" maxLength={100} value={teacherTeachingProfile.program} onChange={(event) => updateTeacherTeachingProfile("teachingProgram", event.target.value)} placeholder="Type the program name" />
                    </div>}
                  </>}
                  {teacherTeachingProfile.educationLevel === "online" && <>
                    <div className="edc-profile-field">
                      <label htmlFor="edc-teacher-online-interest">Interest / Course Area</label>
                      <select id="edc-teacher-online-interest" value={teacherTeachingProfile.programChoice} onChange={(event) => updateTeacherTeachingProfile("teachingProgramChoice", event.target.value)}>
                        <option value="">Select an interest</option>{ONLINE_COURSES.map((course) => <option key={course} value={course}>{course}</option>)}
                      </select>
                    </div>
                    {teacherTeachingProfile.programChoice === "Other" && <div className="edc-profile-field">
                      <label htmlFor="edc-teacher-custom-interest">Enter Course Area</label>
                      <input id="edc-teacher-custom-interest" maxLength={100} value={teacherTeachingProfile.program} onChange={(event) => updateTeacherTeachingProfile("teachingProgram", event.target.value)} placeholder="Type the course area" />
                    </div>}
                  </>}
                  <div className="edc-profile-subject-preview">
                    <strong>Subjects and courses you teach</strong>
                    <p>{teacherFocusSubjects.length ? teacherFocusSubjects.join(" · ") : teacherFocusComplete ? "No subjects are configured for this teaching focus." : "Select your teaching level and specialization to see related subjects."}</p>
                  </div>
                  <div className="edc-profile-field">
                    <label htmlFor="edc-profile-availability">Availability</label>
                    <select id="edc-profile-availability" value={profile.availability || ""} onChange={(event) => { setProfileSaved(false); setProfile((previous) => ({ ...previous, availability: event.target.value })); }}><option value="">Select availability</option><option>Available</option><option>Busy</option><option>Unavailable</option></select>
                  </div>
                  <div className="edc-profile-field">
                    <label htmlFor="edc-profile-bio">About Me</label>
                    <textarea
                      id="edc-profile-bio"
                      rows={6}
                      value={profile.bio || ""}
                      placeholder="Tell students about your experience..."
                      onChange={(event) => {
                        setProfileSaved(false);
                        setProfile((previous) => ({ ...previous, bio: event.target.value }));
                      }}
                    />
                  </div>
                  <div className="edc-profile-form-footer">
                    <button className="edc-profile-save-button" type="submit" disabled={profileImageProcessing}>
                      <CheckCircle2 size={18} /> Save Profile
                    </button>
                    <button className="edc-profile-remove-button" type="button" onClick={cancelProfileEdit}>Cancel</button>
                  </div>
                </form>
              </section>
              <aside className="edc-profile-preview-card">
                <div className="edc-profile-preview-heading">
                  <h3>Live Profile Preview</h3>
                  <p>Preview of your instructor information.</p>
                </div>
                <div className="edc-profile-preview-banner" />
                <div className="edc-profile-preview-content">
                  <div className="edc-profile-preview-avatar">
                    {teacherProfileImage ? (
                      <img src={teacherProfileImage} alt="Instructor" />
                    ) : (
                      <span>{teacherDisplayName.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <h3>{teacherDisplayName}</h3>
                  <p className="edc-profile-preview-headline">
                    {profile.headline || "Professional headline not added"}
                  </p>
                  <span className="edc-profile-preview-role">
                    <GraduationCap size={15} /> EduConnect AI Instructor
                  </span>
                  <div className="edc-profile-preview-divider" />
                  <div className="edc-profile-preview-detail">
                    <strong>Expertise</strong>
                    <p>{teacherExpertise || "Expertise not added yet"}</p>
                  </div>
                  <div className="edc-profile-preview-detail">
                    <strong>Teaching Focus</strong>
                    <p>{teacherFocusLabel}</p>
                  </div>
                  {teacherFocusSubjects.length > 0 && <div className="edc-profile-preview-detail">
                    <strong>Subjects You Teach</strong>
                    <p>{teacherFocusSubjects.join(" · ")}</p>
                  </div>}
                  <div className="edc-profile-preview-detail">
                    <strong>About Instructor</strong>
                    <p>{profile.bio || "No biography added yet."}</p>
                  </div>
                  <div className="edc-profile-preview-detail">
                    <strong>Contact Email</strong>
                    <p>{email}</p>
                  </div>
                </div>
              </aside>
            </div>
            ) : (
              <TeacherProfileOverview
                profile={{ ...profile, name: teacherDisplayName }}
                email={email}
                courses={courses}
                studentCount={uniqueStudents.length}
                averageRating={averageCourseRating}
                reviewCount={courseRatings.length}
                completion={profileCompletion}
                skills={teacherSkillTags}
                teachingAreas={teacherProfileAreas}
                profileSaved={profileSaved}
                onEdit={startProfileEdit}
                onNavigate={navigateTo}
                cnicStatus={cnicStatus}
                rejectionReason={account?.cnicVerification?.rejectionReason}
                verificationOpenSignal={verificationOpenSignal}
                onVerificationSubmitted={onVerificationSubmitted}
              />
            )}
          </div>
        )}

        <p
          style={{
            marginTop: 25,
            fontSize: 12,
            color: "#9387a2",
          }}
        >
          Course and profile changes are saved in this browser.
        </p>
        
{previewCourse && (
  <div
    className="edc-teacher-preview-overlay"
    onClick={() => setPreviewCourse(null)}
  >
    <div
      className="edc-teacher-preview-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Course preview"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="edc-teacher-preview-header">
        <h3>Course Preview</h3>

        <button
          type="button"
          onClick={() => setPreviewCourse(null)}
          aria-label="Close preview"
        >
          <X size={20} />
        </button>
      </div>

      <div className="edc-teacher-preview-content">
        {previewCourse.thumbnail ? (
          <img
            className="edc-teacher-preview-image"
            src={previewCourse.thumbnail}
            alt={previewCourse.title}
          />
        ) : (
          <div className="edc-teacher-preview-placeholder">
            <BookOpen size={50} />
            <span>EduConnect AI Course</span>
          </div>
        )}

        <h2>{previewCourse.title}</h2>

        <p>
          {previewCourse.category} · {previewCourse.level}
        </p>

        <p>{previewCourse.description}</p>

        <h3>
          PKR{" "}
          {Number(previewCourse.price || 0).toLocaleString()}
        </h3>

        <h4>Course Content</h4>

        {(previewCourse.lessons || []).length === 0 ? (
          <p>No lessons added yet.</p>
        ) : (
          (previewCourse.lessons || []).map(
            (lesson, index) => (
              <div
                key={lesson.id || index}
                className="edc-teacher-preview-lesson"
              >
                <BookOpen size={17} />
                <span>
                  Lesson {index + 1}: {lesson.title}
                </span>
              </div>
            )
          )
        )}

        <p className="edc-teacher-preview-note">
          This is a teacher preview. Student enrollment
          is not available from this popup.
        </p>
      </div>
    </div>
  </div>
)}

      </main>
    </section>
  );
}

export default TeacherDashboard;

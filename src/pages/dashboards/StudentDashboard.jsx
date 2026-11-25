import { getContentState, enrollContent, unenrollContent, getMongoCourseEnrollments, contentFileUrl, CONTENT_CHANGED_EVENT } from "../../utils/contentApi";
import { fetchProgress, setLessonCompleted, fetchMyCertificates, issueCertificate, LEARNING_UPDATED_EVENT } from "../../utils/mongoLearningApi";
import { fetchPaymentProviders, fetchPaymentsConfig } from "../../utils/marketplaceApi";
import { beginProviderCheckout } from "../../utils/paymentFlow";
import PaymentProviderPicker from "../../components/Marketplace/PaymentProviderPicker";
import { getCartState, getStudentOrders, addToCart, removeFromCart, clearCart, demoCheckout, ORDERS_EVENT } from "../../utils/studentCart";
import { CART_CHANGED_EVENT } from "../../utils/marketplaceApi";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  BookOpen,
  BookText,
  CalendarDays,
  ClipboardList,
  Brain,
  Database,
  Bot,
  Users,
  Heart,
  ShoppingCart,
  ReceiptText,
  Award,
  Microscope,
  GraduationCap,
  Search,
  Bell,
  MessageCircle,
  NotebookPen,
  ChartNoAxesCombined,
  ListChecks,
  Route,
  ListTree,
  ChevronRight,
  Play,
  CheckCircle2,
  Clock3,
  Target,
  Sparkles,
  Plus,
  Trash2,
  X,
  Star,
  Video,
  LockKeyhole,
  ArrowRight,
  RotateCcw,
  ChevronLeft,
  UserRound,
  Camera,
  Save,
  Pencil,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  LifeBuoy,
  Crown,
  Trophy,
  Info,
} from "lucide-react";
import "./Dashboard.css";
import "./StudentShoppingCart.css";
import "./StudentPortfolio.css";
import "./StudentResearchWorkspace.css";
import "./StudentProfile.css";
import "../../components/notifications/NotificationsCenter.css";
import CourseReviews from "../../components/reviews/CourseReviews";
import NotificationsCenter from "../../components/notifications/NotificationsCenter";
import { NOTIFICATIONS_EVENT } from "../../utils/demoNotifications";
import {
  fetchStudentRecommendations, fetchInterestProfile, saveInterestProfile,
  fetchResearchRecords, createResearchRecord as apiCreateResearchRecord,
  updateResearchRecord as apiUpdateResearchRecord, deleteResearchRecord as apiDeleteResearchRecord,
  archiveResearchRecord as apiArchiveResearchRecord, importResearchRecords as apiImportResearchRecords,
  RESEARCH_SECTION_TYPES, RESEARCH_TYPE_SECTIONS,
  fetchNotifications as apiFetchNotifications, markServerNotificationRead, markAllServerNotificationsRead, deleteServerNotification,
  subscribeToNotificationStream,
  fetchStudentAnalytics,
} from "../../utils/phase7Api";
import CourseDiscussions from "../../components/discussions/CourseDiscussions";
import CourseNotes from "../../components/notes/CourseNotes";
import LearningAnalytics from "../../components/analytics/LearningAnalytics";
import CourseQuizzes from "../../components/quizzes/CourseQuizzes";
import CourseAssignments from "../../components/assignments/CourseAssignments";
import LearningPaths from "../../components/learning-paths/LearningPaths";
import CurriculumBuilder from "../../components/curriculum/CurriculumBuilder";
import { readDiscussions, subscribeDiscussions } from "../../utils/courseDiscussions";
import { getPublishedTeacherCourses } from "../../utils/teacherCourses";
import { lessonVideoKey, loadLessonVideo } from "../../utils/lessonVideos";
import { getStudentAcademicSubjects, INTERMEDIATE_STREAMS, ONLINE_COURSES, getProgramGroupsForDegreeLevel, loadCurriculumResource, getPublishedPdfResources } from "../../utils/studentRecommendations";
import StudentOverview from "../../components/student/StudentOverview";
import StudentLearning from "../../components/student/StudentLearning";
import StudentStudyPlanner from "../../components/student/StudentStudyPlanner";
import StudentTopicMastery from "../../components/student/StudentTopicMastery";
import StudentWishlist from "../../components/student/StudentWishlist";
import StudentPurchases from "../../components/student/StudentPurchases";
import StudentEbooks from "../../components/student/StudentEbooks";
import BookTeacherHub from "../../components/books/BookTeacherHub";
import { getPublishedBooks, isBookPurchased } from "../../utils/books";
import { loadBookFile } from "../../utils/books";
import ReportAction from "../../components/moderation/ReportAction";
import UserModerationAppeals, { UserSupportCenter } from "../../components/moderation/UserModerationAppeals";
import { isModerationVisible } from "../../utils/moderationVisibility";
import TeacherCnicUpload from "../../components/teacher/TeacherCnicUpload";
import VerifiedBadge from "../../components/verification/VerifiedBadge";
import "../../components/books/books.css";
import "../../components/SectionTypography.css";
import "../../components/DashboardCardClarity.css";
import WorkspaceSidebar from "../../components/workspace/WorkspaceSidebar";
import reactCourseThumbnail from "../../assets/course-thumbnails/react-frontend.png";
import pythonCourseThumbnail from "../../assets/course-thumbnails/python-basics.png";
import designCourseThumbnail from "../../assets/course-thumbnails/ui-ux-design.png";

const COURSES = [
  {
    id: "demo-react",
    title: "React Frontend Development",
    category: "Development",
    instructor: "EduConnect Demo",
    lessons: 10,
    image: reactCourseThumbnail,
    icon: "âš›ï¸",
    color: "purple",
  },
  {
    id: "demo-python",
    title: "Python Programming Basics",
    category: "Programming",
    instructor: "EduConnect Demo",
    lessons: 12,
    image: pythonCourseThumbnail,
    icon: "ðŸ",
    color: "blue",
  },
  {
    id: "demo-design",
    title: "UI/UX Design Fundamentals",
    category: "Design",
    instructor: "EduConnect Demo",
    lessons: 8,
    image: designCourseThumbnail,
    icon: "ðŸŽ¨",
    color: "pink",
  },
];


const DEMO_ASSIGNMENTS = [
  { id: "react-task", courseId: "demo-react", title: "Build a React Component", description: "Create a reusable React component with props and explain how it works.", points: 100 },
  { id: "python-task", courseId: "demo-python", title: "Practice Python Functions", description: "Write two Python functions and explain their inputs and outputs.", points: 100 },
  { id: "design-task", courseId: "demo-design", title: "Mobile App Wireframe", description: "Describe a mobile app wireframe with at least three screens.", points: 100 },
];

const DEMO_QUIZZES = [
  { id: "react-quiz", courseId: "demo-react", title: "React Basics Quiz", questions: [
    { question: "What is a React component?", options: ["A reusable piece of UI", "A database", "A CSS property", "A server"], correct: 0 },
    { question: "Which hook manages component state?", options: ["useEffect", "useState", "useMemo", "useRef"], correct: 1 },
    { question: "What are props used for?", options: ["Installing packages", "Passing data to components", "Starting a server", "Creating databases"], correct: 1 },
  ] },
  { id: "python-quiz", courseId: "demo-python", title: "Python Basics Quiz", questions: [
    { question: "Which keyword defines a Python function?", options: ["function", "def", "func", "create"], correct: 1 },
    { question: "Which type stores True or False?", options: ["str", "list", "bool", "int"], correct: 2 },
    { question: "Which symbol starts a Python comment?", options: ["#", "//", "<!--", "@"], correct: 0 },
  ] },
  { id: "design-quiz", courseId: "demo-design", title: "UI/UX Basics Quiz", questions: [
    { question: "What does UX stand for?", options: ["User Experience", "Universal Extension", "User Execution", "Unique Example"], correct: 0 },
    { question: "What is a wireframe?", options: ["A programming language", "A basic interface layout", "A database", "A payment method"], correct: 1 },
    { question: "What is the purpose of usability testing?", options: ["Increase file size", "Find user experience problems", "Remove colors", "Install software"], correct: 1 },
  ] },
];

// Fictional tutor profiles and sample availability for the frontend demo.
const DEMO_TUTORS = [
  { id: "tutor-react", name: "Areeba Khan", subject: "React & JavaScript", level: "Beginner", experience: "4 years (demo)", rating: 4.9, about: "Learn frontend fundamentals with practical projects.", initials: "AK", slots: ["Mon 4:00 PM", "Wed 5:00 PM", "Sat 11:00 AM"] },
  { id: "tutor-python", name: "Hamza Ali", subject: "Python Programming", level: "Beginner", experience: "3 years (demo)", rating: 4.8, about: "Build confidence with Python exercises and examples.", initials: "HA", slots: ["Tue 3:00 PM", "Thu 6:00 PM", "Sun 12:00 PM"] },
  { id: "tutor-design", name: "Sara Malik", subject: "UI/UX Design", level: "Intermediate", experience: "5 years (demo)", rating: 4.9, about: "Explore wireframes, prototyping, and design thinking.", initials: "SM", slots: ["Mon 6:00 PM", "Fri 4:00 PM", "Sat 2:00 PM"] },
];

const MENU = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "learning", label: "My Learning", icon: BookOpen },
  { id: "reviews", label: "My Reviews", icon: Star },
  { id: "discussions", label: "Course Q&A", icon: MessageCircle },
  { id: "notes", label: "Notes & Bookmarks", icon: NotebookPen },
  { id: "analytics", label: "Learning Analytics", icon: ChartNoAxesCombined },
  { id: "quizzes", label: "Course Quizzes", icon: ListChecks },
  { id: "course-assignments", label: "Course Assignments", icon: ClipboardList },
  { id: "learning-paths", label: "Learning Paths", icon: Route },
  { id: "curriculum", label: "Course Curriculum", icon: ListTree },
  { id: "books", label: "Books & Teachers", icon: BookOpen },
  { id: "planner", label: "Study Planner", icon: CalendarDays },
  { id: "assignments", label: "Assignments & Grades", icon: ClipboardList },
  { id: "mastery", label: "Topic Mastery", icon: Brain },
  { id: "ai", label: "AI Tutor", icon: Bot },
  { id: "wishlist", label: "Wishlist", icon: Heart },
  { id: "cart", label: "Shopping Cart", icon: ShoppingCart },
  { id: "orders", label: "My Purchases", icon: ReceiptText },
  { id: "ebooks", label: "My eBooks", icon: BookOpen },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "portfolio", label: "Certificates & Portfolio", icon: Award },
  { id: "research", label: "Research Workspace", icon: Microscope },
  { id: "profile", label: "My Profile", icon: UserRound },
  { id: "help-support", label: "Help & Support", icon: LifeBuoy },
  { id: "appeals", label: "Moderation & Appeals", icon: ShieldAlert },
];

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function makeLocalResearchRecord(fields, existingId) {
  const id = existingId || `research-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return { ...fields, id, updatedAt: new Date().toISOString() };
}
const isServerNotificationId = (id) => /^[a-f0-9]{24}$/i.test(String(id || ""));

function SectionHeading({ eyebrow, title, description, action }) {
  return (
    <div className="edc-section-heading">
      <div>
        {eyebrow && <span className="edc-eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ icon: Icon = BookOpen, title, description }) {
  return (
    <div className="edc-empty">
      <div className="edc-empty-icon">
        <Icon size={26} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function ProgressBar({ value, label = "Progress" }) {
  const numericValue = Number(value);
  const progress = Number.isFinite(numericValue)
    ? Math.min(100, Math.max(0, numericValue))
    : 0;

  return (
    <div className="edc-progress-track" role="progressbar" aria-label={label}
      aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
      <div className="edc-progress-fill" style={{ width: `${progress}%` }} />
    </div>
  );
}

export default function StudentDashboard({ email = "student", account, onVerificationSubmitted }) {
  const cnicStatus = account?.cnicVerification?.status || "not_submitted";
  const identityVerified = cnicStatus === "verified";
  const baseKey = `educonnect.student.${email.trim().toLowerCase()}`;
  const location = useLocation();
  const navigate = useNavigate();
  const quizRouteId = location.pathname.startsWith("/student/dashboard/quiz/")
    ? decodeURIComponent(location.pathname.split("/").at(-1) || "")
    : "";
  const quizRouteCourseId = new URLSearchParams(location.search).get("course") || "";
  const quizRouteTeacher = new URLSearchParams(location.search).get("teacher") || "";

  const [activeTab, setActiveTab] = useState(() => quizRouteId ? "quizzes" : "overview");
  const requestedTab = location.state?.studentTab;
  const showProfileVerification = location.state?.profileSection === "verification";
  const verificationFocusKey = useRef(null);
  useEffect(() => {
    if (requestedTab && MENU.some(item => item.id === requestedTab)) {
      // Router state can request a destination tab without changing the route.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab(requestedTab);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [requestedTab, location.key]);
  useEffect(() => {
    if (activeTab !== "profile" || !showProfileVerification || verificationFocusKey.current === location.key) return;
    verificationFocusKey.current = location.key;
    document.getElementById("edc-student-identity-verification")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeTab, showProfileVerification, location.key]);
  const [search, setSearch] = useState("");
  const [learningSearch, setLearningSearch] = useState("");
  const [learningInitialFilter, setLearningInitialFilter] = useState("all");
  const [playerCourseId, setPlayerCourseId] = useState(null);
  const [playerLessonIndex, setPlayerLessonIndex] = useState(0);
  const [previewCourse, setPreviewCourse] = useState(null);
  const lessonVideoRef = useRef(null);
  const [lessonVideoTime, setLessonVideoTime] = useState(0);
  const [pendingVideoSeek, setPendingVideoSeek] = useState(null);
  // Playback analytics: count real HTML-video playback, not seeks or paused time.
  const [learningActivity, setLearningActivity] = useState(() =>
    readStorage(`${baseKey}.learningActivity`, { totalSeconds: 0, days: {} })
  );
  const playbackClock = useRef(null);
  const playbackBuffer = useRef(0);
  function recordPlayback(seconds) {
    const delta = Math.max(0, Math.min(5, Number(seconds) || 0));
    if (!delta) return;
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    setLearningActivity(previous => ({
      totalSeconds: (Number(previous.totalSeconds) || 0) + delta,
      days: { ...(previous.days || {}), [day]: (Number(previous.days?.[day]) || 0) + delta }
    }));
  }
  function handlePlaybackTick(event) {
    const video = event.currentTarget;
    const now = performance.now();
    if (video.paused || video.seeking || video.ended || !playbackClock.current) {
      playbackClock.current = null;
      return;
    }
    const delta = (now - playbackClock.current) / 1000;
    playbackClock.current = now;
    if (delta > 0 && delta <= 5) {
      playbackBuffer.current += delta;
      if (playbackBuffer.current >= 2) {
        recordPlayback(playbackBuffer.current);
        playbackBuffer.current = 0;
      }
    }
  }
  function flushPlayback() {
    if (playbackBuffer.current > 0) recordPlayback(playbackBuffer.current);
    playbackBuffer.current = 0;
    playbackClock.current = null;
  }
  useEffect(() => {
    localStorage.setItem(`${baseKey}.learningActivity`, JSON.stringify(learningActivity));
  }, [baseKey, learningActivity]);
  useEffect(() => () => {
    // Keep the last short playback segment when the player unmounts.
    // Browser unload persistence is handled by regular activity updates.
    playbackClock.current = null;
  }, []);

  function jumpToNote(courseId, lessonIndex, seconds) {
    openCoursePlayer(courseId);
    setPlayerLessonIndex(lessonIndex);
    setPendingVideoSeek({ courseId: String(courseId), lessonIndex, seconds: Math.max(0, Number(seconds) || 0) });
  }
  useEffect(() => {
    if (pendingVideoSeek && lessonVideoRef.current?.readyState >= 1) {
      const video = lessonVideoRef.current;
      if (String(playerCourseId) === pendingVideoSeek.courseId && playerLessonIndex === pendingVideoSeek.lessonIndex) {
        video.currentTime = Math.min(pendingVideoSeek.seconds, Number.isFinite(video.duration) ? video.duration : pendingVideoSeek.seconds);
        // Consume a seek once the media element is ready.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPendingVideoSeek(null);
      }
    }
  }, [pendingVideoSeek, playerCourseId, playerLessonIndex]);
  function applyPendingSeek() {
    if (!pendingVideoSeek || !lessonVideoRef.current) return;
    if (String(playerCourseId) !== pendingVideoSeek.courseId || playerLessonIndex !== pendingVideoSeek.lessonIndex) return;
    try {
      lessonVideoRef.current.currentTime = Math.min(pendingVideoSeek.seconds, Number.isFinite(lessonVideoRef.current.duration) ? lessonVideoRef.current.duration : pendingVideoSeek.seconds);
      setPendingVideoSeek(null);
    } catch { /* wait for metadata */ }
  }

  const registeredAccount = useMemo(() => {
    const accountEmail = String(email || "").trim().toLowerCase();
    const users = readStorage("educonnect.registeredUsers", []);
    if (!accountEmail || !Array.isArray(users)) return null;
    return users.find((user) => String(user?.email || "").trim().toLowerCase() === accountEmail) || null;
  }, [email]);
  const [profileCompleted, setProfileCompleted] = useState(
    () => registeredAccount?.profileCompleted === true
  );
  const [studentProfile, setStudentProfile] = useState(() => {
    const existingProfile = readStorage(`${baseKey}.profile`, {});
    return {
      fullName: existingProfile.fullName || registeredAccount?.name || "",
      phone: existingProfile.phone || "",
      city: existingProfile.city || "",
      about: existingProfile.about || "",
      avatar: existingProfile.avatar || "",
      educationLevel: existingProfile.educationLevel || "",
      classNumber: existingProfile.classNumber || "",
      intermediateYear: existingProfile.intermediateYear || "",
      stream: existingProfile.stream || "PreEngineering",
      degreeLevel: existingProfile.degreeLevel || "",
      programChoice: existingProfile.programChoice || "",
      program: existingProfile.program || "",
    };
  });
  const [profileDraft, setProfileDraft] = useState(() =>
    (() => {
      const existingProfile = readStorage(`${baseKey}.profile`, {});
      return {
        fullName: existingProfile.fullName || registeredAccount?.name || "",
        phone: existingProfile.phone || "",
        city: existingProfile.city || "",
        about: existingProfile.about || "",
        avatar: existingProfile.avatar || "",
        educationLevel: existingProfile.educationLevel || "",
        classNumber: existingProfile.classNumber || "",
        intermediateYear: existingProfile.intermediateYear || "",
        stream: existingProfile.stream || "PreEngineering",
        degreeLevel: existingProfile.degreeLevel || "",
        programChoice: existingProfile.programChoice || "",
        program: existingProfile.program || "",
      };
    })()
  );
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState("");
  const [resourceNotice, setResourceNotice] = useState("");
  const [serverRecommendations, setServerRecommendations] = useState(null);
  const [interestProfile, setInterestProfile] = useState({ interests: [], learningGoals: [] });
  const [serverStudentAnalytics, setServerStudentAnalytics] = useState(null);
  const profileDisplayName = studentProfile.fullName?.trim() || account?.fullName || registeredAccount?.name?.trim() || "Student";
  const profileAvatar = studentProfile.avatar || registeredAccount?.avatar || registeredAccount?.profile?.avatar || "";

  useEffect(() => {
    try {
      localStorage.setItem(`${baseKey}.profile`, JSON.stringify(studentProfile));
      window.dispatchEvent(new Event("educonnect:student-header-changed"));
    } catch {
      // Surface persistence failure in the profile editor.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfileNotice("Profile image may be too large for browser storage. Try a smaller photo.");
    }
  }, [baseKey, studentProfile]);

  // Phase 7: load personalized recommendations, interest profile, and analytics from MongoDB.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [recs, profile, analytics] = await Promise.allSettled([
          fetchStudentRecommendations(),
          fetchInterestProfile(),
          fetchStudentAnalytics(),
        ]);
        if (cancelled) return;
        if (recs.status === "fulfilled") setServerRecommendations(recs.value);
        if (profile.status === "fulfilled") setInterestProfile({ interests: profile.value?.interests || [], learningGoals: profile.value?.learningGoals || [] });
        if (analytics.status === "fulfilled") setServerStudentAnalytics(analytics.value);
      } catch {
        // Local/demo recommendation logic remains available.
      }
    };
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; window.removeEventListener("focus", onFocus); };
  }, [baseKey]);

  function beginProfileEdit() {
    setProfileDraft({
      ...studentProfile,
      interestsText: (interestProfile.interests || []).join(", "),
      learningGoalsText: (interestProfile.learningGoals || []).join(", "),
    });
    setEditingProfile(true);
    setProfileNotice("");
  }

  async function saveStudentProfile(event) {
    event.preventDefault();
    const fullName = profileDraft.fullName.trim();
    if (fullName.length < 2) {
      setProfileNotice("Please enter your full name (at least 2 characters).");
      return;
    }
    const nextProfile = {
      fullName: fullName.slice(0, 80),
      phone: profileDraft.phone.trim().slice(0, 25),
      city: profileDraft.city.trim().slice(0, 80),
      about: profileDraft.about.trim().slice(0, 500),
      avatar: profileDraft.avatar || "",
      educationLevel: profileDraft.educationLevel || "",
      classNumber: profileDraft.educationLevel === "school" ? profileDraft.classNumber : "",
      intermediateYear: profileDraft.educationLevel === "intermediate" ? profileDraft.intermediateYear : "",
      stream: profileDraft.stream || "PreEngineering",
      degreeLevel: profileDraft.educationLevel === "university" ? profileDraft.degreeLevel : "",
      programChoice: ["university", "online"].includes(profileDraft.educationLevel) ? profileDraft.programChoice : "",
      program: ["university", "online"].includes(profileDraft.educationLevel) ? profileDraft.program.trim().slice(0, 100) : "",
};
    setStudentProfile(nextProfile);

    const hasEducationLevel = Boolean(
      String(nextProfile.educationLevel || "").trim()
    );

    const complete = hasEducationLevel && (
      nextProfile.educationLevel === "school"
        ? Boolean(String(nextProfile.classNumber || "").trim())
        : nextProfile.educationLevel === "intermediate"
          ? Boolean(
              String(nextProfile.intermediateYear || "").trim() &&
              String(nextProfile.stream || "").trim()
            )
          : nextProfile.educationLevel === "university"
            ? Boolean(
                String(nextProfile.degreeLevel || "").trim() &&
                String(nextProfile.program || "").trim()
              )
            : nextProfile.educationLevel === "online"
              ? Boolean(String(nextProfile.programChoice || "").trim())
              : false
    );

    setProfileCompleted(complete);

    try {
      const users = readStorage("educonnect.registeredUsers", []);

      if (Array.isArray(users)) {
        const accountEmail = String(email || "").trim().toLowerCase();

        const accountIndex = users.findIndex(
          (user) =>
            String(user?.email || "").trim().toLowerCase() === accountEmail
        );

        if (accountIndex >= 0) {
          users[accountIndex] = {
            ...users[accountIndex],
            name: nextProfile.fullName,
            profileCompleted: complete,
          };

          localStorage.setItem(
            "educonnect.registeredUsers",
            JSON.stringify(users)
          );
        }
      }
    } catch {
      // The profile remains saved if account metadata cannot be updated.
    }

    const interests = String(profileDraft.interestsText || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    const learningGoals = String(profileDraft.learningGoalsText || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    try {
      const saved = await saveInterestProfile({
        interests,
        learningGoals,
      });

      setInterestProfile({
        interests: saved.interests || interests,
        learningGoals: saved.learningGoals || learningGoals,
      });

      fetchStudentRecommendations()
        .then(setServerRecommendations)
        .catch(() => {});

      setProfileNotice("Profile and learning interests saved.");
        } catch {
      setInterestProfile({ interests, learningGoals });

      setProfileNotice(
        "Profile saved in this browser. Learning interests could not be synced to the server right now."
      );
    }
    setEditingProfile(false);
  }

  function uploadStudentAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setProfileNotice("Please select a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > 1024 * 1024) {
      setProfileNotice("Please choose an image smaller than 1 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setProfileDraft((previous) => ({ ...previous, avatar: reader.result }));
        setProfileNotice("Photo selected. Click Save Changes to keep it.");
      }
    };
    reader.onerror = () => setProfileNotice("Could not read the selected image.");
    reader.readAsDataURL(file);
  }

  function ProfileAvatar({ image, size = "large" }) {
    return (
      <span className={`edc-student-profile-avatar edc-student-profile-avatar-${size}`}>
        {image ? <img src={image} alt="Student profile" /> : <UserRound size={size === "large" ? 46 : 20} />}
      </span>
    );
  }


  const [enrollments, setEnrollments] = useState(() =>
    readStorage(`${baseKey}.enrollments`, [])
  );

  const [wishlist, setWishlist] = useState(() =>
    readStorage(`${baseKey}.wishlist`, [])
  );
  const [savedBookIds, setSavedBookIds] = useState(() =>
    readStorage(`${baseKey}.bookWishlist`, [])
  );

  // MongoDB is the source of truth for the shopping cart and orders.
  const [cart, setCart] = useState([]);
  const [cartNotice, setCartNotice] = useState("");
  const [payProviders, setPayProviders] = useState([]);
  const [payProvidersMode, setPayProvidersMode] = useState("sandbox");
  const [selectedPayProvider, setSelectedPayProvider] = useState("");
  const [payDemoEnabled, setPayDemoEnabled] = useState(false);
  const [cartSelection, setCartSelection] = useState([]);
  const [cartSummaryFilter, setCartSummaryFilter] = useState("all");
  const [orders, setOrders] = useState([]);
  const [cartBusy, setCartBusy] = useState(false);
  // Development-only demo purchase: explicit Demo Payment selection or the backend-enabled fallback.
  const useDemo = selectedPayProvider === "demo" || (!selectedPayProvider && payDemoEnabled);
  const [bookPurchases, setBookPurchases] = useState(() => readStorage(`${baseKey}.bookPurchases`, []));
  useEffect(() => {
    const sync = () => {
      const state = getContentState();
      if (state.role !== "student" || state.email?.toLowerCase() !== email.toLowerCase()) return;
      const owned = (kind, items) => items.filter((item) => state.accesses.some((entry) => entry.kind === kind && String(entry.contentId) === String(item.id)));
      const merge = (existing, records) => {
        const missing = records.filter((record) => !existing.some((item) => String(item.id) === String(record.id)));
        return missing.length ? [...existing, ...missing.map((record) => ({ ...record, completedLessons: 0, progress: 0 }))] : existing;
      };
      setEnrollments((existing) => merge(existing, owned("course", state.courses)));
      setBookPurchases((existing) => merge(existing, owned("book", state.books)));
    };
    sync();
    window.addEventListener(CONTENT_CHANGED_EVENT, sync);
    return () => window.removeEventListener(CONTENT_CHANGED_EVENT, sync);
  }, [email]);
  const [orderNotice, setOrderNotice] = useState("");
  const [notifications, setNotifications] = useState(() => readStorage(`${baseKey}.notifications`, []));
  useEffect(() => {
    const notificationKey = `${baseKey}.notifications`;
    const refresh = () => setNotifications(readStorage(notificationKey, []));
    const refreshIfMatched = (event) => { if (!event.detail?.key || event.detail.key === notificationKey) refresh(); };
    const refreshStorage = (event) => { if (!event.key || event.key === notificationKey) refresh(); };
    window.addEventListener(NOTIFICATIONS_EVENT, refreshIfMatched);
    window.addEventListener("storage", refreshStorage);
    return () => {
      window.removeEventListener(NOTIFICATIONS_EVENT, refreshIfMatched);
      window.removeEventListener("storage", refreshStorage);
    };
  }, [baseKey]);
  const [discussionRevision, setDiscussionRevision] = useState(0);
  useEffect(() => subscribeDiscussions(() => setDiscussionRevision(v => v + 1)), []);
  useEffect(() => {
    // Teacher replies are detected when the student dashboard is opened or receives an update.
    // Notification IDs prevent duplicate alerts after refresh.
    const questions = readDiscussions();
    const ownReplies = questions.filter(q =>
      q.studentEmail === email.trim().toLowerCase() && q.reply?.text && q.reply?.createdAt
    );
    if (!ownReplies.length) return;
    // This effect imports notifications generated by an external discussion store.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotifications(previous => {
      const ids = new Set(previous.map(n => n.id));
      const additions = ownReplies.filter(q => !ids.has(`qa-reply:${q.id}:${q.reply.createdAt}`))
        .map(q => ({ id: `qa-reply:${q.id}:${q.reply.createdAt}`, type: "discussion",
          title: "Teacher replied to your question",
          message: `Your question about ${q.courseTitle || "a course"} has a new answer.`,
          link: "discussions", read: false, createdAt: q.reply.createdAt }));
      return additions.length ? [...additions, ...previous].slice(0, 150) : previous;
    });
  }, [email, discussionRevision]);
  function notify({ id, type, title, message, link }) {
    setNotifications(previous => {
      if (previous.some(item => item.id === id)) return previous;
      return [{ id, type, title, message, link, read: false, createdAt: new Date().toISOString() }, ...previous].slice(0, 150);
    });
  }
  function markNotificationRead(id) {
    setNotifications(previous => previous.map(item => item.id === id ? { ...item, read: true } : item));
    if (isServerNotificationId(id)) markServerNotificationRead(id).catch(() => {});
  }
  function markAllNotificationsRead() {
    setNotifications(previous => previous.map(item => item.read ? item : { ...item, read: true }));
    markAllServerNotificationsRead().catch(() => {});
  }
  function deleteNotification(id) {
    setNotifications(previous => previous.filter(item => item.id !== id));
    if (isServerNotificationId(id)) deleteServerNotification(id).catch(() => {});
  }


  const [dailyGoals, setDailyGoals] = useState(() => {
    const saved = readStorage(`${baseKey}.dailyGoals`, []);
    const previousExamples = new Set(["Complete one lesson", "Review your course progress", "Plan tomorrow's learning"]);
    return Array.isArray(saved)
      ? saved.filter((goal) => !(["1", "2", "3"].includes(String(goal.id)) && previousExamples.has(goal.title)))
      : [];
  });

  const [newGoal, setNewGoal] = useState("");

  // Portfolio demo data is stored locally for the current student.
  const [portfolioTab, setPortfolioTab] = useState("certificates");
  const [portfolioSearch, setPortfolioSearch] = useState("");
  const [portfolioName, setPortfolioName] = useState(() =>
    readStorage(`${baseKey}.portfolioName`, "")
  );
  const [certificateDates, setCertificateDates] = useState(() =>
    readStorage(`${baseKey}.certificateDates`, {})
  );
  const [portfolioProjects, setPortfolioProjects] = useState(() =>
    readStorage(`${baseKey}.portfolioProjects`, [])
  );
  const [projectForm, setProjectForm] = useState({ id: null, title: "", description: "", skills: "", url: "" });
  const [projectEditing, setProjectEditing] = useState(false);
  const [portfolioMessage, setPortfolioMessage] = useState("");

  useEffect(() => {
    localStorage.setItem(`${baseKey}.portfolioName`, JSON.stringify(portfolioName));
  }, [baseKey, portfolioName]);
  useEffect(() => {
    localStorage.setItem(`${baseKey}.portfolioProjects`, JSON.stringify(portfolioProjects));
  }, [baseKey, portfolioProjects]);

  function savePortfolioProject(event) {
    event.preventDefault();
    const title = projectForm.title.trim();
    const description = projectForm.description.trim();
    if (title.length < 3 || description.length < 10) {
      setPortfolioMessage("Project title (3+ characters) and description (10+ characters) are required.");
      return;
    }
    const url = projectForm.url.trim();
    if (url) {
      try {
        const parsed = new URL(url);
        if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("Invalid protocol");
      } catch {
        setPortfolioMessage("Enter a valid http:// or https:// project link.");
        return;
      }
    }
    const project = {
      id: projectForm.id || `project-${Date.now()}`,
      title,
      description,
      skills: projectForm.skills.split(",").map((skill) => skill.trim()).filter(Boolean).slice(0, 12),
      url,
      updatedAt: new Date().toISOString(),
    };
    setPortfolioProjects((previous) =>
      projectForm.id ? previous.map((item) => item.id === project.id ? project : item) : [project, ...previous]
    );
    setProjectForm({ id: null, title: "", description: "", skills: "", url: "" });
    setProjectEditing(false);
    setPortfolioMessage(projectForm.id ? "Project updated in this browser." : "Project saved in this browser.");
  }

  function editPortfolioProject(project) {
    setProjectForm({ ...project, skills: project.skills.join(", ") });
    setProjectEditing(true);
    setPortfolioMessage("");
  }

  function deletePortfolioProject(id) {
    if (!window.confirm("Delete this project from your demo portfolio?")) return;
    setPortfolioProjects((previous) => previous.filter((item) => item.id !== id));
    setPortfolioMessage("Project deleted.");
  }

  function printDemoCertificate(course) {
    const inlineCert = course?.certificate || null;
    const fallbackName = portfolioName.trim() || String(studentProfile.fullName || studentProfile.name || "").trim();
    const isMongoCourse = /^[a-f0-9]{24}$/i.test(String(course?.id || ""));
    if (!inlineCert && !fallbackName && !isMongoCourse) {
      setPortfolioTab("certificates");
      setPortfolioMessage("Add your name to My Profile before previewing a completion record.");
      return;
    }
    const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[char]));
    const popup = window.open("", "_blank", "width=980,height=760");
    if (!popup) {
      setPortfolioMessage("Please allow pop-ups to preview and print your certificate.");
      return;
    }
    const render = (cert) => {
      const name = cert?.studentName || fallbackName;
      const date = cert
        ? new Date(cert.completedAt || cert.issuedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
        : certificateInfo(course).date;
      const heading = cert ? "Certificate of Completion" : "Demo Course Completion Record";
      const bodyLine = cert ? "has successfully completed" : "for completing all sample lessons in";
      const recordLine = cert
        ? `<p>Certificate ID: <strong>${escapeHtml(cert.certificateId)}</strong></p>`
        : `<p>Completion progress: 100%</p>`;
      const disclaimerLine = cert
        ? "Issued by EduConnect AI after verified course completion. Verify this certificate ID with EduConnect AI support."
        : "Frontend demonstration only - Not an accredited or verified certificate";
      popup.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(heading)}</title>
      <style>body{font-family:Arial,sans-serif;margin:0;background:#f4f0ff;color:#282044}
      .sheet{box-sizing:border-box;width:95%;max-width:1000px;margin:30px auto;background:white;border:15px solid #7653cb;padding:60px 35px;text-align:center;min-height:590px}
      .brand{font-size:23px;color:#7653cb;font-weight:800}.heading{font-size:38px;margin:45px 0 10px}
      .name{font-size:34px;color:#7653cb;font-weight:bold;margin:18px}.course{font-size:26px;font-weight:700;margin:18px}
      .disclaimer{font-size:15px;color:#6c6680;margin-top:60px}.print{display:block;margin:10px auto;padding:12px 25px;border:0;border-radius:9px;background:#7653cb;color:white;cursor:pointer}
      @media print{body{background:white}.sheet{margin:0;width:100%;max-width:none;min-height:95vh}.print{display:none}@page{size:landscape;margin:8mm}}</style></head>
      <body><button class="print" onclick="window.print()">Print / Save as PDF</button><main class="sheet">
      <div class="brand">EduConnect AI</div><div class="heading">${escapeHtml(heading)}</div>
      <p>This certificate recognizes</p><div class="name">${escapeHtml(name)}</div>
      <p>${escapeHtml(bodyLine)}</p><div class="course">${escapeHtml(cert?.courseTitle || course.title)}</div>
      ${recordLine}<p>Completion date: ${escapeHtml(date)}</p>
      <p class="disclaimer">${escapeHtml(disclaimerLine)}</p>
      </main></body></html>`);
      popup.document.close();
      setPortfolioMessage("Certificate preview opened. Choose Print / Save as PDF in the new tab.");
    };
    if (inlineCert || !isMongoCourse) {
      render(inlineCert);
      return;
    }
    // MongoDB course without a stored record yet: claim it now (backend re-verifies).
    issueCertificate(course.id)
      .then((data) => {
        const cert = data?.certificate || null;
        if (cert) setMongoCertificates((previous) => previous.some((item) => item.certificateId === cert.certificateId) ? previous : [cert, ...previous]);
        render(cert);
      })
      .catch((error) => {
        popup.document.write(`<p style="font-family:sans-serif;padding:40px">${escapeHtml(error.message || "The certificate could not be issued.")}</p>`);
        popup.document.close();
        setPortfolioMessage(error.message || "The certificate could not be issued.");
      });
  }


  // Research Workspace: browser-only records. No papers, experiments or citations are verified.
  const RESEARCH_SECTIONS = [
    { id: "projects", title: "Research Projects", fields: [{key:"title",label:"Project title",required:true},{key:"question",label:"Research question",multiline:true},{key:"status",label:"Status",options:["Planning","In Progress","Completed"]},{key:"notes",label:"Notes",multiline:true}] },
    { id: "papers", title: "Paper Library", fields: [{key:"title",label:"Paper title",required:true},{key:"authors",label:"Authors"},{key:"year",label:"Publication year"},{key:"url",label:"Paper link (https://...)"},{key:"summary",label:"Summary / key findings",multiline:true}] },
    { id: "matrix", title: "Literature Review Matrix", fields: [{key:"title",label:"Study / paper title",required:true},{key:"method",label:"Methodology"},{key:"findings",label:"Main findings",multiline:true},{key:"limitations",label:"Limitations",multiline:true},{key:"gap",label:"Research gap",multiline:true}] },
    { id: "references", title: "References & Citations", fields: [{key:"title",label:"Reference title",required:true},{key:"authors",label:"Authors"},{key:"year",label:"Year"},{key:"source",label:"Journal / publisher / source"},{key:"doi",label:"DOI or link"},{key:"notes",label:"Citation notes",multiline:true}] },
    { id: "datasets", title: "Datasets", fields: [{key:"title",label:"Dataset name",required:true},{key:"source",label:"Source"},{key:"url",label:"Dataset link (https://...)"},{key:"format",label:"Format (CSV, JSON, etc.)"},{key:"description",label:"Description",multiline:true}] },
    { id: "experiments", title: "Experiment Tracking", fields: [{key:"title",label:"Experiment name",required:true},{key:"date",label:"Experiment date",type:"date"},{key:"hypothesis",label:"Hypothesis",multiline:true},{key:"method",label:"Method / procedure",multiline:true},{key:"results",label:"Results / observations",multiline:true},{key:"status",label:"Status",options:["Planned","Running","Completed"]}] },
  ];
  const [researchTab, setResearchTab] = useState("projects");
  const [researchView, setResearchView] = useState("overview");
  const [researchRecords, setResearchRecords] = useState(() => readStorage(`${baseKey}.researchRecords`, {}));
  const [researchForm, setResearchForm] = useState({});
  const [researchEditId, setResearchEditId] = useState(null);
  const [researchSearch, setResearchSearch] = useState("");
  const [researchDashboardSearch, setResearchDashboardSearch] = useState("");
  const [researchProjectStatus, setResearchProjectStatus] = useState("All Projects");
  const [researchNotice, setResearchNotice] = useState("");
  const researchServerSynced = useRef(false);
  useEffect(() => {
    localStorage.setItem(`${baseKey}.researchRecords`, JSON.stringify(researchRecords));
  }, [baseKey, researchRecords]);
  // MongoDB is the source of truth for the Research Workspace. Local records are
  // kept as a fallback and imported once per account when the server is empty.
  useEffect(() => {
    let cancelled = false;
    const normalizeServerRecord = (record) => {
      const sectionId = RESEARCH_TYPE_SECTIONS[record.type];
      if (!sectionId) return null;
      return {
        ...record.payload,
        id: record.id,
        title: record.title,
        status: record.status || record.payload?.status || "",
        tags: record.tags || [],
        courseId: record.courseId || "",
        courseTitle: record.courseTitle || "",
        updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
        _server: true,
      };
    };
    const groupBySection = (records) => {
      const grouped = {};
      for (const record of records) {
        const normalized = normalizeServerRecord(record);
        if (!normalized) continue;
        const sectionId = RESEARCH_TYPE_SECTIONS[record.type];
        grouped[sectionId] = [normalized, ...(grouped[sectionId] || [])];
      }
      return grouped;
    };
    (async () => {
      try {
        let serverRecords = await fetchResearchRecords();
        if (cancelled) return;
        // One-time migration: push browser-only records to MongoDB when the
        // server workspace is still empty, preserving existing user work.
        if (!serverRecords.length && !researchServerSynced.current) {
          const local = readStorage(`${baseKey}.researchRecords`, {});
          const localRows = Object.entries(local).flatMap(([sectionId, items]) =>
            (Array.isArray(items) ? items : []).map((item) => ({
              type: RESEARCH_SECTION_TYPES[sectionId],
              title: String(item.title || "").trim(),
              payload: item,
              status: String(item.status || "").trim(),
              tags: Array.isArray(item.tags) ? item.tags : [],
            })).filter((row) => row.type && row.title.length >= 3)
          );
          if (localRows.length) {
            await apiImportResearchRecords(localRows).catch(() => null);
            serverRecords = await fetchResearchRecords();
            if (cancelled) return;
          }
        }
        researchServerSynced.current = true;
        if (serverRecords.length) {
          const grouped = groupBySection(serverRecords);
          setResearchRecords((previous) => {
            // Keep local-only records that have no server id match.
            const merged = { ...previous };
            for (const section of RESEARCH_SECTIONS) {
              const serverItems = grouped[section.id] || [];
              const localItems = Array.isArray(previous[section.id]) ? previous[section.id] : [];
              const serverIds = new Set(serverItems.map((item) => item.id));
              const localOnly = localItems.filter((item) => String(item.id).startsWith("research-") && !serverIds.has(item.id));
              merged[section.id] = [...serverItems, ...localOnly];
            }
            return merged;
          });
        }
      } catch {
        // Offline/backend unavailable: keep localStorage research workspace.
      }
    })();
    return () => { cancelled = true; };
  }, [baseKey]);
  const currentResearchSection = RESEARCH_SECTIONS.find((section) => section.id === researchTab) || RESEARCH_SECTIONS[0];
  const researchItems = Array.isArray(researchRecords[researchTab]) ? researchRecords[researchTab] : [];
  const filteredResearchItems = researchItems.filter((item) =>
    Object.values(item).some((value) => String(value ?? "").toLowerCase().includes(researchSearch.toLowerCase()))
  );
  const projectResearchItems = Array.isArray(researchRecords.projects) ? researchRecords.projects : [];
  const filteredProjectResearchItems = projectResearchItems.filter((project) => {
    const matchesStatus = researchProjectStatus === "All Projects"
      || String(project.status || "Planning").toLowerCase() === researchProjectStatus.toLowerCase();
    const matchesSearch = !researchDashboardSearch.trim()
      || Object.values(project).some((value) => String(value ?? "").toLowerCase().includes(researchDashboardSearch.trim().toLowerCase()));
    return matchesStatus && matchesSearch;
  });
  const recentResearchRecords = RESEARCH_SECTIONS.flatMap((section) =>
    (Array.isArray(researchRecords[section.id]) ? researchRecords[section.id] : [])
      .map((item) => ({ ...item, sectionId: section.id, sectionTitle: section.title })),
  ).sort((first, second) => Date.parse(second.updatedAt || "") - Date.parse(first.updatedAt || "")).slice(0, 4);
  function switchResearchTab(id) {
    setResearchView("section"); setResearchTab(id); setResearchForm({}); setResearchEditId(null); setResearchSearch(""); setResearchNotice("");
  }
  function showResearchOverview() {
    setResearchView("overview"); setResearchForm({}); setResearchEditId(null); setResearchSearch(""); setResearchNotice("");
  }
  function saveResearchRecord(event) {
    event.preventDefault();
    const cleaned = {};
    currentResearchSection.fields.forEach((field) => { cleaned[field.key] = String(researchForm[field.key] ?? field.options?.[0] ?? "").trim(); });
    if (!cleaned.title || cleaned.title.length < 3) { setResearchNotice("Please enter a title of at least 3 characters."); return; }
    for (const field of currentResearchSection.fields) {
      if (field.key === "url" && cleaned.url) {
        try { const u = new URL(cleaned.url); if (!["http:", "https:"].includes(u.protocol)) throw new Error("Invalid URL"); }
        catch { setResearchNotice("Please enter a valid http:// or https:// link."); return; }
      }
    }
    const linkedCourseId = String(researchForm.courseId || "").trim();
    const researchCourseOptions = Array.isArray(enrolledCourses) ? enrolledCourses : [];
    const linkedCourse = researchCourseOptions.find((course) => String(course.id) === linkedCourseId);
    const localRecord = makeLocalResearchRecord({ ...cleaned, courseId: linkedCourseId, courseTitle: linkedCourse?.title || "" }, researchEditId);
    setResearchRecords((previous) => {
      const list = Array.isArray(previous[researchTab]) ? previous[researchTab] : [];
      return { ...previous, [researchTab]: researchEditId ? list.map((item) => item.id === researchEditId ? { ...item, ...localRecord, id: item.id } : item) : [localRecord, ...list] };
    });
    setResearchForm({}); setResearchEditId(null);
    setResearchNotice(researchEditId ? "Record updated in this browser." : "Record saved in this browser.");
    // Persist to MongoDB in the background; local state remains the fallback.
    const payload = { type: RESEARCH_SECTION_TYPES[researchTab], title: cleaned.title, payload: cleaned, status: cleaned.status || "", tags: [], courseId: linkedCourseId };
    const apiCall = researchEditId && !String(researchEditId).startsWith("research-")
      ? apiUpdateResearchRecord(researchEditId, payload)
      : apiCreateResearchRecord(payload);
    apiCall.then((saved) => {
      if (!saved?.id) return;
      const sectionId = RESEARCH_TYPE_SECTIONS[saved.type] || researchTab;
      setResearchRecords((previous) => {
        const list = Array.isArray(previous[sectionId]) ? previous[sectionId] : [];
        const withoutLocal = list.filter((item) => item.id !== localRecord.id && item.id !== saved.id);
        const merged = { ...saved.payload, ...saved, id: saved.id, updatedAt: saved.updatedAt || new Date().toISOString() };
        return { ...previous, [sectionId]: [merged, ...withoutLocal] };
      });
    }).catch(() => { /* localStorage copy remains available */ });
  }
  function editResearchRecord(item) {
    setResearchEditId(item.id); setResearchForm({ ...item }); setResearchNotice("Editing selected record.");
  }
  function deleteResearchRecord(id, sectionId = researchTab) {
    if (!window.confirm("Delete this research record?")) return;
    setResearchRecords((previous) => ({ ...previous, [sectionId]: (previous[sectionId] || []).filter((item) => item.id !== id) }));
    if (researchEditId === id) { setResearchEditId(null); setResearchForm({}); }
    setResearchNotice("Record deleted.");
    if (!String(id).startsWith("research-")) {
      apiDeleteResearchRecord(id).catch(() => { /* local removal already applied */ });
    }
  }

  // AI Tutor interface demo. Responses are fixed learning templates, not AI-generated.
  const AI_MODES = ["Explain Simply", "Step-by-Step", "Practice Mode", "Exam Preparation", "Study Roadmap"];
  const [aiMode, setAiMode] = useState("Explain Simply");
  const [aiInput, setAiInput] = useState("");
  const [aiHistory, setAiHistory] = useState(() =>
    readStorage(`${baseKey}.aiTutorHistory`, [])
  );
  useEffect(() => {
    localStorage.setItem(`${baseKey}.aiTutorHistory`, JSON.stringify(aiHistory));
  }, [baseKey, aiHistory]);

  function demoTutorReply(topic, mode) {
    const subject = topic.trim().slice(0, 140);
    if (mode === "Explain Simply")
      return `Demo learning guide for â€œ${subject}â€:\n1. Write a one-sentence definition of this topic.\n2. Identify its main purpose.\n3. Find one beginner-friendly example in your course notes.\n4. Explain it back in your own words.\n\nThis is a general study template, not an AI-generated explanation of your specific question.`;
    if (mode === "Step-by-Step")
      return `Demo step-by-step plan for â€œ${subject}â€:\nStep 1: List what you already know.\nStep 2: Break the topic into 3 small parts.\nStep 3: Study one example for each part.\nStep 4: Try an exercise without notes.\nStep 5: Review mistakes and repeat.\n\nSpecific topic guidance will be available after AI integration.`;
    if (mode === "Practice Mode")
      return `Demo practice for â€œ${subject}â€:\nQ1. How would you define this topic?\nQ2. Where might you use it?\nQ3. Can you give an example?\n\nWrite your answers in a notebook and compare them with your course material. Automatic answer checking is not connected yet.`;
    if (mode === "Exam Preparation")
      return `Demo exam revision for â€œ${subject}â€:\nâ€¢ Review key terms and definitions.\nâ€¢ Make 5 flashcards.\nâ€¢ Practice 3 questions without notes.\nâ€¢ Revisit the concepts you missed.\nâ€¢ Test yourself again tomorrow.\n\nThis is a study checklist, not a generated exam answer.`;
    return `Demo study roadmap for â€œ${subject}â€:\nDay 1: Learn the core definitions.\nDay 2: Study examples.\nDay 3: Complete practice exercises.\nDay 4: Review mistakes.\nDay 5: Take a short self-test.\n\nCustomize this plan to your course and available study time.`;
  }

  function sendAiMessage(event) {
    event.preventDefault();
    const question = aiInput.trim();
    if (!question) return;
    const now = Date.now();
    setAiHistory((previous) => [...previous, {
      id: `${now}-user`, role: "user", text: question, mode: aiMode,
    }, {
      id: `${now}-demo`, role: "demo", text: demoTutorReply(question, aiMode), mode: aiMode,
    }].slice(-60));
    setAiInput("");
  }

  function clearAiHistory() {
    if (window.confirm("Clear your demo AI Tutor chat history?")) setAiHistory([]);
  }


  // Tutor discovery and booking requests: saved only in this browser.
  const [tutorSearch, setTutorSearch] = useState("");
  const [tutorSubject, setTutorSubject] = useState("All Subjects");
  const [tutorTab, setTutorTab] = useState("find");
  const [bookingTutorId, setBookingTutorId] = useState(null);
  const [bookingSlot, setBookingSlot] = useState("");
  const [bookingNote, setBookingNote] = useState("");
  const [tutorNotice, setTutorNotice] = useState("");
  const [tutorBookings, setTutorBookings] = useState(() =>
    readStorage(`${baseKey}.tutorBookings`, [])
  );
  useEffect(() => {
    localStorage.setItem(`${baseKey}.tutorBookings`, JSON.stringify(tutorBookings));
  }, [baseKey, tutorBookings]);

  const matchingTutors = DEMO_TUTORS.filter((tutor) =>
    (tutorSubject === "All Subjects" || tutor.subject === tutorSubject) &&
    `${tutor.name} ${tutor.subject} ${tutor.level}`.toLowerCase().includes(tutorSearch.trim().toLowerCase())
  );
  const bookingTutor = DEMO_TUTORS.find((tutor) => tutor.id === bookingTutorId);

  function saveTutorBooking(event) {
    event.preventDefault();
    if (!bookingTutor || !bookingTutor.slots.includes(bookingSlot)) {
      setTutorNotice("Please select a demo time slot.");
      return;
    }
    const exists = tutorBookings.some((item) =>
      item.tutorId === bookingTutor.id && item.slot === bookingSlot && item.status !== "Cancelled"
    );
    if (exists) {
      setTutorNotice("You already requested this demo session.");
      return;
    }
    setTutorBookings((previous) => [...previous, {
      id: `${Date.now()}-${bookingTutor.id}`,
      tutorId: bookingTutor.id,
      slot: bookingSlot,
      note: bookingNote.trim().slice(0, 300),
      status: "Demo Request",
      createdAt: new Date().toISOString(),
    }]);
    setBookingTutorId(null);
    setBookingSlot("");
    setBookingNote("");
    setTutorTab("sessions");
    setTutorNotice("Demo booking request saved in your browser. No real tutor has been contacted.");
  }

  function cancelTutorBooking(id) {
    if (!window.confirm("Cancel this demo booking request?")) return;
    setTutorBookings((previous) => previous.map((item) =>
      item.id === id ? { ...item, status: "Cancelled" } : item
    ));
    setTutorNotice("Demo booking cancelled.");
  }

  // Academic workspace: browser-only demo, not teacher-connected.
  const [academicTab, setAcademicTab] = useState("assignments");
  const [academicSearch, setAcademicSearch] = useState("");
  const [academicRecords, setAcademicRecords] = useState(() =>
    readStorage(`${baseKey}.academicData`, { submissions: {}, quizResults: {} })
  );
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [assignmentAnswer, setAssignmentAnswer] = useState("");
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [academicMessage, setAcademicMessage] = useState("");

  useEffect(() => {
    localStorage.setItem(`${baseKey}.academicData`, JSON.stringify(academicRecords));
  }, [baseKey, academicRecords]);

  const submissions = academicRecords.submissions || {};
  const quizResults = academicRecords.quizResults || {};
  const availableAssignments = DEMO_ASSIGNMENTS.filter((task) =>
    enrollments.some((course) => course.id === task.courseId)
  );
  const availableQuizzes = DEMO_QUIZZES.filter((quiz) =>
    enrollments.some((course) => course.id === quiz.courseId)
  );
  const submittedCount = availableAssignments.filter((task) => submissions[task.id]).length;
  const attemptedQuizzes = availableQuizzes.filter((quiz) => quizResults[quiz.id]);
  const averageQuizScore = attemptedQuizzes.length
    ? Math.round(attemptedQuizzes.reduce((total, quiz) => total + quizResults[quiz.id].percentage, 0) / attemptedQuizzes.length)
    : null;

  const passedQuizzes = availableQuizzes.filter((quiz) => quizResults[quiz.id]?.percentage >= 70);
  const portfolioSkills = [...new Set(portfolioProjects.flatMap((project) => project.skills))];

  function reviewMasteryQuiz() {
    navigateTo("quizzes");
  }

  function openStudentQuiz(entry, view = "attempt") {
    setActiveTab("quizzes");
    navigate(`/student/dashboard/quiz/${encodeURIComponent(entry.quiz.id)}?course=${encodeURIComponent(entry.quiz.courseId)}&teacher=${encodeURIComponent(entry.quiz.teacherEmail || "")}${view === "result" ? "&view=result" : ""}`);
  }

  function openAssignment(task) {
    setSelectedAssignment(task.id);
    setAssignmentAnswer(submissions[task.id]?.answer || "");
    setAcademicMessage("");
  }

  function submitAssignment(event) {
    event.preventDefault();
    if (!selectedAssignment) return;
    if (assignmentAnswer.trim().length < 20) {
      setAcademicMessage("Please write at least 20 characters.");
      return;
    }
    setAcademicRecords((previous) => ({
      ...previous,
      submissions: {
        ...(previous.submissions || {}),
        [selectedAssignment]: { answer: assignmentAnswer.trim(), submittedAt: new Date().toISOString() },
      },
    }));
    setAcademicMessage("Demo assignment saved in this browser.");
  }

  function startQuiz(id) {
    setSelectedQuiz(id);
    setQuizAnswers({});
    setAcademicMessage("");
  }

  function submitQuiz(event) {
    event.preventDefault();
    const quiz = DEMO_QUIZZES.find((item) => item.id === selectedQuiz);
    if (!quiz) return;
    if (!quiz.questions.every((_, index) => quizAnswers[index] !== undefined)) {
      setAcademicMessage("Please answer every question.");
      return;
    }
    const correct = quiz.questions.filter((question, index) => quizAnswers[index] === question.correct).length;
    const percentage = Math.round((correct / quiz.questions.length) * 100);
    setAcademicRecords((previous) => ({
      ...previous,
      quizResults: {
        ...(previous.quizResults || {}),
        [quiz.id]: { correct, total: quiz.questions.length, percentage, answers: { ...quizAnswers }, completedAt: new Date().toISOString() },
      },
    }));
    setSelectedQuiz(null);
    setQuizAnswers({});
    setAcademicMessage(`Quiz completed! Your score: ${percentage}%.`);
  }


  useEffect(() => {
    localStorage.setItem(
      `${baseKey}.enrollments`,
      JSON.stringify(enrollments)
    );
    window.dispatchEvent(new Event("educonnect:student-data-changed"));
  }, [baseKey, enrollments]);

  useEffect(() => {
    localStorage.setItem(
      `${baseKey}.wishlist`,
      JSON.stringify(wishlist)
    );
  }, [baseKey, wishlist]);

  useEffect(() => {
    localStorage.setItem(`${baseKey}.bookWishlist`, JSON.stringify(savedBookIds));
  }, [baseKey, savedBookIds]);

  useEffect(() => {
    try {
      localStorage.setItem(`${baseKey}.notifications`, JSON.stringify(notifications));
      window.dispatchEvent(new Event("educonnect:student-header-changed"));
    }
    catch (error) { console.error("Could not save notifications", error); }
  }, [baseKey, notifications]);

  // Merge MongoDB notifications with local/browser-only notifications.
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
  }, [baseKey]);

  // Realtime notification subscription (SSE). Falls back to the focus/merge fetch above.
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
        // Re-sync after connect/reconnect to avoid missing events during gaps.
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
  }, [baseKey]);

  const refreshCart = async () => {
    try { const data = await getCartState(); setCart(data.items || []); } catch (error) { console.error("Could not load cart", error); }
  };
  const refreshOrders = async () => {
    try { setOrders(await getStudentOrders()); } catch (error) { console.error("Could not load orders", error); }
  };
  useEffect(() => {
    let cancelled = false;
    fetchPaymentProviders()
      .then((data) => {
        if (cancelled) return;
        setPayProvidersMode(data.mode || "sandbox");
        const list = Array.isArray(data.providers) ? data.providers : [];
        setPayProviders(list);
        setSelectedPayProvider((current) => current || list.find((entry) => entry.enabled)?.name || "");
      })
      .catch(() => { /* provider list unavailable; picker will show disabled state */ });
    fetchPaymentsConfig()
      .then((data) => { if (!cancelled) setPayDemoEnabled(Boolean(data?.demoEnabled)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    refreshCart();
    refreshOrders();
    const onCartChange = () => refreshCart();
    const onOrdersChange = () => refreshOrders();
    window.addEventListener(CART_CHANGED_EVENT, onCartChange);
    window.addEventListener(ORDERS_EVENT, onOrdersChange);
    window.addEventListener("focus", onCartChange);
    window.addEventListener("focus", onOrdersChange);
    return () => {
      window.removeEventListener(CART_CHANGED_EVENT, onCartChange);
      window.removeEventListener(ORDERS_EVENT, onOrdersChange);
      window.removeEventListener("focus", onCartChange);
      window.removeEventListener("focus", onOrdersChange);
    };
  }, [email]);

  useEffect(() => {
    localStorage.setItem(`${baseKey}.bookPurchases`, JSON.stringify(bookPurchases));
    window.dispatchEvent(new Event("educonnect:student-data-changed"));
  }, [baseKey, bookPurchases]);

  useEffect(() => {
    localStorage.setItem(
      `${baseKey}.dailyGoals`,
      JSON.stringify(dailyGoals)
    );
  }, [baseKey, dailyGoals]);

  // Keep instructor lesson data alongside the student's enrollment record.
  // Demo courses still use their existing numbered sample lessons.
  function getLessonMedia(lesson) {
    if (lesson?.videoFileId) return { type: "video", src: contentFileUrl(lesson.videoFileId) };
    const raw = String(lesson?.videoUrl || lesson?.video || lesson?.url || "").trim();
    if (!raw) return null;
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      const host = url.hostname.toLowerCase();
      if (host === "youtu.be") {
        const id = url.pathname.slice(1).split("/")[0];
        return /^[\w-]{11}$/.test(id) ? { type: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
      }
      if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
        const id = url.searchParams.get("v") || (url.pathname.startsWith("/shorts/") ? url.pathname.split("/")[2] : null) || (url.pathname.startsWith("/embed/") ? url.pathname.split("/")[2] : null);
        return id && /^[\w-]{11}$/.test(id) ? { type: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
      }
      if (/\.(mp4|webm|ogg)(\?|$)/i.test(url.pathname)) return { type: "video", src: url.href };
    } catch { /* Invalid media URL; show the lesson placeholder. */ }
    return null;
  }

  const checkoutKeyRef = useRef(null);
  const [mongoProgress, setMongoProgress] = useState({});
  const [mongoCertificates, setMongoCertificates] = useState([]);
  const certificateIssueAttempts = useRef(new Set());
  const [courseRevision, setCourseRevision] = useState(0);
  const [localVideo, setLocalVideo] = useState(null);
  useEffect(() => {
    const refresh = () => setCourseRevision(n => n + 1);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("educonnect:teacher-courses-changed", refresh);
    window.addEventListener("educonnect:teacher-profile-changed", refresh);
    window.addEventListener("educonnect:admin-data-changed", refresh);
    window.addEventListener("educonnect:curriculum-updated", refresh);
    window.addEventListener("educonnect:books-changed", refresh);
    window.addEventListener("educonnect:reviews-changed", refresh);
    window.addEventListener("educonnect:student-data-changed", refresh);
    window.addEventListener("educonnect:moderation-visibility-changed", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("educonnect:teacher-courses-changed", refresh);
      window.removeEventListener("educonnect:teacher-profile-changed", refresh);
      window.removeEventListener("educonnect:admin-data-changed", refresh);
      window.removeEventListener("educonnect:curriculum-updated", refresh);
      window.removeEventListener("educonnect:books-changed", refresh);
      window.removeEventListener("educonnect:reviews-changed", refresh);
      window.removeEventListener("educonnect:student-data-changed", refresh);
      window.removeEventListener("educonnect:moderation-visibility-changed", refresh);
    };
  }, []);
  // The catalog is localStorage-backed, so this event counter invalidates its memo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const latestPublishedCourses = useMemo(() => getPublishedTeacherCourses(), [courseRevision]);
  const mergeMongoProgress = (courseId, progress) => {
    if (!progress) return;
    setMongoProgress((previous) => ({ ...previous, [String(courseId)]: progress }));
  };
  useEffect(() => {
    if (getContentState().role !== "student") { setMongoProgress({}); setMongoCertificates([]); return undefined; }
    let cancelled = false;
    const loadProgress = () => fetchProgress()
      .then((items) => {
        if (cancelled) return;
        setMongoProgress(Object.fromEntries((items || []).map((item) => [String(item.courseId), item])));
      })
      .catch((error) => { if (error.status !== 401 && error.status !== 403) console.error("Could not load course progress", error); });
    const loadCertificates = () => fetchMyCertificates()
      .then((items) => { if (!cancelled) setMongoCertificates(items || []); })
      .catch((error) => { if (error.status !== 401 && error.status !== 403) console.error("Could not load certificates", error); });
    loadProgress();
    loadCertificates();
    window.addEventListener(LEARNING_UPDATED_EVENT, loadProgress);
    window.addEventListener(LEARNING_UPDATED_EVENT, loadCertificates);
    window.addEventListener(CONTENT_CHANGED_EVENT, loadProgress);
    return () => {
      cancelled = true;
      window.removeEventListener(LEARNING_UPDATED_EVENT, loadProgress);
      window.removeEventListener(LEARNING_UPDATED_EVENT, loadCertificates);
      window.removeEventListener(CONTENT_CHANGED_EVENT, loadProgress);
    };
  }, [courseRevision, email]);
  // MongoDB is authoritative for enrolled courses: the list is built from the
  // student's ContentAccess records (returned by /content/state), joined with
  // the approved published catalog. localStorage only carries demo/static
  // courses and per-lesson progress until server-side progress lands.
  const enrolledCourses = useMemo(
    () => {
      const mongoCourses = getMongoCourseEnrollments().map((record) => {
        const backend = mongoProgress[String(record.id)];
        const lessonItems = Array.isArray(record.lessons) ? record.lessons : [];
        const lessonCount = Math.max(0, Number(backend?.lessons ?? lessonItems.length) || 0);
        const completed = Math.min(lessonCount, Math.max(0, Number(backend?.completedLessons) || 0));
        return {
          ...record,
          lessons: lessonCount,
          lessonItems,
          instructor: record.instructorName || record.instructor || "EduConnect Instructor",
          teacherEmail: record.teacherEmail || "",
          completedLessons: completed,
          completedLessonIds: backend?.completedLessonIds || [],
          enrolledAt: record.enrolledAt || null,
          progress: lessonCount ? Math.round((completed / lessonCount) * 100) : 0,
        };
      });
      const demoCourses = enrollments
        .filter((item) => !/^[a-f0-9]{24}$/i.test(String(item.id)))
        .map((item) => {
          const demoCourse = COURSES.find(
            (course) => String(course.id) === String(item.id)
          );
          const latest = latestPublishedCourses.find(c =>
            String(c.id) === String(item.id) &&
            String(c.teacherEmail || "").toLowerCase() === String(item.teacherEmail || "").toLowerCase()
          );
          const latestLessons = Array.isArray(latest?.lessons) ? latest.lessons :
            (Array.isArray(item.lessons) ? item.lessons : []);
          const lessonCount = Math.max(
            0,
            Number(
              demoCourse?.lessons ??
                (latestLessons.length || (Array.isArray(item.lessons) ? item.lessons.length : item.lessons))
            ) || 0
          );
          const course = demoCourse || {
            id: item.id,
            title: item.title || "Untitled Course",
            category: item.category || "General",
            instructor: item.instructor || "EduConnect Instructor",
            lessons: lessonCount,
            icon: "EC",
            color: "purple",
          };

          const completed = Math.min(
            lessonCount,
            Math.max(0, Number(item.completedLessons) || 0)
          );

          return {
            ...course,
            ...(latest || {}),
            lessons: lessonCount,
            lessonItems: latestLessons,
            teacherEmail: item.teacherEmail || latest?.teacherEmail || "",
            completedLessons: completed,
            progress: lessonCount
              ? Math.round((completed / lessonCount) * 100)
              : 0,
          };
        });
      return [...mongoCourses, ...demoCourses]
        .filter((course) => course && isModerationVisible("course", `${String(course.teacherEmail || course.instructorEmail || "demo").toLowerCase()}::${course.id}`));
    },
    [enrollments, latestPublishedCourses, courseRevision, mongoProgress]
  );

  const enrolledPlayerCourse = enrolledCourses.find(c => String(c.id) === String(playerCourseId));
  const playerCourse = enrolledPlayerCourse || (previewCourse && String(previewCourse.id) === String(playerCourseId) ? {
    ...previewCourse,
    instructor: previewCourse.instructorName || previewCourse.instructor || "Instructor",
    lessons: Array.isArray(previewCourse.lessons) ? previewCourse.lessons.length : 0,
    lessonItems: Array.isArray(previewCourse.lessons) ? previewCourse.lessons : [],
    completedLessons: 0,
    progress: 0,
  } : null);
  const playerPreviewOnly = Boolean(playerCourse && !enrolledPlayerCourse);
  const playerLesson = playerCourse?.lessonItems?.[playerLessonIndex];
  const localVideoKey = playerCourse?.teacherEmail && playerLesson?.hasLocalVideo
    ? lessonVideoKey(playerCourse.teacherEmail, playerCourse.id, playerLesson.id)
    : null;
  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;
    if (localVideoKey) {
      loadLessonVideo(localVideoKey)
        .then((blob) => {
          if (!cancelled && blob) {
            objectUrl = URL.createObjectURL(blob);
            setLocalVideo({ key: localVideoKey, url: objectUrl });
          }
        })
        .catch(console.error);
    }
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [localVideoKey]);
  const localVideoUrl = localVideo?.key === localVideoKey ? localVideo.url : null;

  const completedCourses = enrolledCourses.filter(
    (course) => course.progress === 100
  );

  // Issue MongoDB certificates for completed Mongo courses. Backend re-verifies progress,
  // enrollment and any configured quiz/assignment criteria; local flags are never trusted.
  useEffect(() => {
    for (const course of completedCourses) {
      const id = String(course.id);
      if (!/^[a-f0-9]{24}$/i.test(id)) continue;
      if (mongoCertificates.some((cert) => String(cert.courseId) === id)) continue;
      if (certificateIssueAttempts.current.has(id)) continue;
      certificateIssueAttempts.current.add(id);
      issueCertificate(id)
        .then((data) => {
          const cert = data?.certificate;
          if (cert) setMongoCertificates((previous) => previous.some((item) => item.certificateId === cert.certificateId) ? previous : [cert, ...previous]);
        })
        .catch(() => { /* 409 (required quiz/assignment outstanding) or offline: claim from Certificates tab. */ });
    }
  }, [completedCourses, mongoCertificates]);

  // Compare teacher lesson IDs with the last snapshot for this student.
  // First observation establishes a baseline; it does not create false alerts.
  useEffect(() => {
    const key = `${baseKey}.lessonNotificationSnapshot`;
    const previous = readStorage(key, {});
    const next = { ...previous };
    for (const course of enrolledCourses) {
      if (!course.teacherEmail) continue;
      const courseKey = `${course.teacherEmail}:${course.id}`;
      const ids = Array.isArray(course.lessonItems)
        ? course.lessonItems.map((lesson, index) => String(lesson.id ?? index)) : [];
      const old = previous[courseKey];
      if (Array.isArray(old)) {
        const oldIds = new Set(old);
        const added = ids.filter(id => !oldIds.has(id));
        if (added.length) {
          // Course changes arrive through external storage events.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          notify({ id: `lesson:${courseKey}:${added.join("|")}`,
            type: "lesson", title: "New lesson available",
            message: `${added.length} new lesson(s) in ${course.title}.`, link: "learning" });
        }
      }
      next[courseKey] = ids;
    }
    try { localStorage.setItem(key, JSON.stringify(next)); }
    catch (error) { console.error("Could not save lesson snapshot", error); }
  }, [baseKey, enrolledCourses]);

  // Notify once when a course first reaches 100% completion.
  useEffect(() => {
    for (const course of completedCourses) {
      const courseKey = `${course.teacherEmail || "demo"}:${course.id}`;
      // Completion notifications are synchronized from persisted enrollments.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      notify({ id: `certificate:${courseKey}`, type: "certificate",
        title: "Course completed!", message: `Your demo certificate for ${course.title} is ready.`, link: "portfolio" });
    }
  }, [completedCourses]);

  // Store the first date a completed course is observed, without overwriting it on refresh.
  useEffect(() => {
    if (!completedCourses.length) return;
    // Keep an observation date when persisted courses become complete.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCertificateDates((previous) => {
      const next = { ...previous };
      let changed = false;
      completedCourses.forEach((course) => {
        const key = `${course.teacherEmail || "demo"}:${course.id}`;
        if (!next[key]) {
          next[key] = new Date().toISOString();
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [completedCourses]);

  useEffect(() => {
    localStorage.setItem(`${baseKey}.certificateDates`, JSON.stringify(certificateDates));
  }, [baseKey, certificateDates]);

  function certificateInfo(course) {
    if (course?.certificate) {
      return {
        date: new Date(course.certificate.completedAt || course.certificate.issuedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
      };
    }
    const key = `${course.teacherEmail || "demo"}:${course.id}`;
    return {
      date: certificateDates[key]
        ? new Date(certificateDates[key]).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
        : "Date not recorded",
    };
  }

  const averageProgress = enrolledCourses.length
    ? Math.round(
        enrolledCourses.reduce((sum, course) => sum + course.progress, 0) /
          enrolledCourses.length
      )
    : 0;

  const goalProgress = dailyGoals.length
    ? Math.round(
        (dailyGoals.filter((goal) => goal.done).length /
          dailyGoals.length) *
          100
      )
    : 0;

  const filteredCourses = COURSES.filter((course) =>
    `${course.title} ${course.category}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  // Cart is stored per student, using the same key as the existing marketplace cart.
  // Keep teacher identity in each entry so similarly named course IDs do not collide.
  const shopCourses = [
    ...latestPublishedCourses.map(c => ({
      ...c,
      instructor: c.instructorName || c.instructor || "Instructor",
      price: Math.max(0, Number(c.price) || 0),
    })),
  ];
  const shopKey = (c) => `${c.itemType === "book" ? "book" : "course"}::${String(c.teacherEmail || "demo").toLowerCase()}::${String(c.id)}`;
  const isMongoId = (value) => /^[a-f0-9]{24}$/i.test(String(value || ""));
  const isCurrentCartItem = (item) => {
    if (item?.available === false) return false;
    if (isMongoId(item?.id)) return true; // MongoDB cart items are validated server-side.
    return item.itemType === "book"
      ? getPublishedBooks().some((book) => String(book.id) === String(item.id) && String(book.teacherEmail || "").toLowerCase() === String(item.teacherEmail || "").toLowerCase())
      : Boolean(item.teacherEmail) && latestPublishedCourses.some((course) => String(course.id) === String(item.id) && String(course.teacherEmail || "").toLowerCase() === String(item.teacherEmail).toLowerCase());
  };
  const alreadyEnrolled = (c) => {
    const id = String(c?.id ?? "");
    if (/^[a-f0-9]{24}$/i.test(id) || c?.mongoContent) {
      return getContentState().accesses.some((entry) => entry.kind === "course" && String(entry.contentId) === id);
    }
    return enrollments.some(e =>
      String(e.id) === id &&
      String(e.teacherEmail || "").toLowerCase() === String(c.teacherEmail || "").toLowerCase()
    );
  };
  async function addCart(course) {
    if (course.itemType === "book") return addBookToCart(course);
    if (alreadyEnrolled(course)) { setCartNotice("Already enrolled. Open My Learning."); return; }
    if (cart.some(c => shopKey(c) === shopKey(course))) { setCartNotice("Course already in cart."); return; }
    try { await addToCart(email, { itemType: "course", id: course.id }); await refreshCart(); setCartNotice("Added to shopping cart."); }
    catch (error) { setCartNotice(error.message || "Could not add this course to your cart."); }
  }
  async function addBookToCart(book) {
    if (isBookPurchased(email, book.id) || bookPurchases.some((item) => String(item.id) === String(book.id))) { setCartNotice("This eBook is already in My eBooks."); return; }
    if (cart.some((item) => item.itemType === "book" && shopKey(item) === shopKey(book))) { setCartNotice("This eBook is already in your cart."); return; }
    try { await addToCart(email, { itemType: "book", id: book.id }); await refreshCart(); setCartNotice("eBook added to cart."); }
    catch (error) { setCartNotice(error.message || "Could not add this eBook to your cart."); }
  }
  async function removeCart(course) {
    try { await removeFromCart(email, course); }
    catch (error) { setCartNotice(error.message || "Could not remove the item."); }
    await refreshCart();
    setCartSelection((previous) => previous.filter((key) => key !== shopKey(course)));
    setCartNotice("Removed from cart.");
  }
  function toggleCartSelection(course) {
    const key = shopKey(course);
    setCartSelection((previous) => previous.includes(key) ? previous.filter((item) => item !== key) : [...previous, key]);
  }
  async function removeSelectedCart(items) {
    const selectedItems = items.filter((item) => cartSelection.includes(shopKey(item)));
    if (!selectedItems.length) return;
    try { await Promise.all(selectedItems.map((item) => removeFromCart(email, item))); }
    catch (error) { setCartNotice(error.message || "Could not remove the selected items."); }
    await refreshCart();
    setCartSelection([]);
    setCartNotice("Selected items removed from your cart.");
  }
  async function moveSelectedToWishlist(items) {
    const selectedItems = items.filter((item) => cartSelection.includes(shopKey(item)));
    if (!selectedItems.length) return;
    const courseIds = selectedItems.filter((item) => item.itemType !== "book").map((item) => item.id);
    const bookIds = selectedItems.filter((item) => item.itemType === "book").map((item) => String(item.id));
    setWishlist((previous) => courseIds.reduce((next, id) => next.some((value) => String(value) === String(id)) ? next : [...next, id], [...previous]));
    setSavedBookIds((previous) => bookIds.reduce((next, id) => next.includes(id) ? next : [...next, id], [...previous]));
    try { await Promise.all(selectedItems.map((item) => removeFromCart(email, item))); }
    catch (error) { setCartNotice(error.message || "Could not move the selected items."); }
    await refreshCart();
    setCartSelection([]);
    setCartNotice("Selected items moved to your Wishlist.");
  }
  async function removeAllCartItems() {
    try { await clearCart(); } catch (error) { setCartNotice(error.message || "Could not clear the cart."); }
    await refreshCart();
    setCartSelection([]);
    setCartNotice("All items removed from your cart.");
  }
  async function checkoutCart() {
    if (cartBusy) return; // Guard against double-click during the async checkout flow.
    const available = cart.filter(c => isCurrentCartItem(c) && (c.itemType === "book" ? !isBookPurchased(email, c.id) && !bookPurchases.some((item) => String(item.id) === String(c.id)) : !alreadyEnrolled(c)));
    if (!available.length) { setCartNotice("Cart is empty or all items are already owned."); return; }
    const total = available.reduce((sum,c) => sum + Math.max(0, Number(c.price) || 0), 0);
    const allFree = total === 0;
    if (!allFree && !selectedPayProvider && !useDemo) { setCartNotice(payProviders.some((entry) => entry.enabled) ? "Please choose a payment method below to continue." : "No payment provider is configured on the server (see backend/.env.example), so paid checkout is unavailable. Free items can still be checked out."); return; }
    if (!window.confirm(`Checkout: ${available.length} item(s), total PKR ${total.toLocaleString()}.${allFree ? "" : useDemo ? " Sandbox demo checkout — no real payment." : " You will be redirected to the provider's secure page."} Continue?`)) return;
    setCartBusy(true);
    try {
      if (!checkoutKeyRef.current) checkoutKeyRef.current = globalThis.crypto?.randomUUID?.() || `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (allFree || useDemo) {
        const order = await demoCheckout(email, checkoutKeyRef.current);
        checkoutKeyRef.current = null;
        notify({ id: `purchase:${order.orderNumber || order.id}`, type: "purchase", title: "Purchase complete",
          message: `${(order.items || []).length} item(s) purchased - PKR ${Number(order.total || 0).toLocaleString()}.`, link: "orders" });
        setCart([]);
        setCartSelection([]);
        await Promise.all([refreshCart(), refreshOrders()]);
        setCartNotice("Purchase complete. Your items are in My Learning and My eBooks.");
        setActiveTab((order.items || []).some((item) => item.itemType !== "book") ? "learning" : "ebooks");
        return;
      }
      // Paid order: hand off to the provider's hosted checkout. Redirect happens inside;
      // the /payment/return page confirms with the backend before unlocking anything.
      await beginProviderCheckout(selectedPayProvider, checkoutKeyRef.current);
      checkoutKeyRef.current = null;
      setCartNotice("Taking you to the secure payment page…");
    } catch (error) {
      checkoutKeyRef.current = null; // Server-side idempotency still applies.
      setCartNotice(error.message || "Payment is not available right now.");
    } finally {
      setCartBusy(false);
    }
  }

  function enrollCourse(id) {
    if (enrollments.some((item) => item.id === id)) {
      setActiveTab("learning");
      return;
    }

    setEnrollments((previous) => [
      ...previous,
      { id, completedLessons: 0 },
    ]);

    setActiveTab("learning");
  }

  async function enrollPublishedCourse(course) {
    if (alreadyEnrolled(course)) { setActiveTab("learning"); return; }
    if (Number(course.price) > 0 && !hasCourseAccess(course)) {
      addCart(course);
      setActiveTab("cart");
      return;
    }
    try { await enrollContent([course]); }
    catch (error) { setResourceNotice(error.message); return; }
    const lessons = Array.isArray(course.lessons) ? course.lessons : [];
    setEnrollments((previous) => previous.some((item) => String(item.id) === String(course.id)) ? previous : [...previous, {
      ...course,
      instructor: course.instructorName || course.instructor || "Instructor",
      teacherEmail: course.teacherEmail || "",
      lessons: lessons.length,
      lessonItems: lessons,
      completedLessons: 0,
      progress: 0,
      enrolledAt: new Date().toISOString(),
    }]);
    setPreviewCourse(null);
    setActiveTab("learning");
  }

  function updateLesson(id, amount) {
    const course = enrolledCourses.find(
      (item) => String(item.id) === String(id)
    );
    if (!course || !course.lessons) return;

    if (/^[a-f0-9]{24}$/i.test(String(id))) {
      // MongoDB courses: undo removes the most recently ordered completed lesson server-side.
      if (amount >= 0) return; // Lesson completions flow through setLessonCompleted with a lesson ID.
      const doneIds = new Set(course.completedLessonIds || []);
      const target = [...(course.lessonItems || [])]
        .filter((lesson) => doneIds.has(String(lesson.id)))
        .sort((a, b) => ((Number(b.order) || 0) - (Number(a.order) || 0)) || String(b.id).localeCompare(String(a.id)))[0];
      if (!target) return;
      setLessonCompleted(id, target.id, false)
        .then((progress) => mergeMongoProgress(id, progress))
        .catch((error) => window.alert(error.message));
      return;
    }

    setEnrollments((previous) => {
      const index = previous.findIndex((item) => String(item.id) === String(id));
      const current = index >= 0 ? Number(previous[index].completedLessons) || 0 : 0;
      const completed = Math.min(
        course.lessons,
        Math.max(0, current + amount)
      );
      if (index >= 0) {
        return previous.map((item, position) =>
          position === index ? { ...item, completedLessons: completed } : item
        );
      }
      // Keep per-lesson progress for MongoDB-enrolled courses (access itself lives in MongoDB).
      return [...previous, {
        id: course.id,
        teacherEmail: course.teacherEmail || "",
        title: course.title,
        completedLessons: completed,
        enrolledAt: course.enrolledAt || new Date().toISOString(),
      }];
    });
  }

  function openCoursePlayer(courseId) {
    const course = enrolledCourses.find(
      (item) => String(item.id) === String(courseId)
    );
    if (!course) return;
    setPreviewCourse(null);
    setPlayerCourseId(courseId);
    const total = course.lessons || 0;
    setPlayerLessonIndex(Math.max(0, Math.min(Math.max(0, total - 1), Number(course.completedLessons) || 0)));
    setActiveTab("player");
  }

  function hasCourseAccess(course) {
    if (course.mongoContent || /^[a-f0-9]{24}$/i.test(String(course.id))) {
      return getContentState().accesses.some((entry) => entry.kind === "course" && String(entry.contentId) === String(course.id));
    }
    const ownerEmail = String(course.teacherEmail || course.instructorEmail || "").trim().toLowerCase();
    const enrolled = enrollments.some((item) => String(item.id) === String(course.id) &&
      String(item.teacherEmail || "").trim().toLowerCase() === ownerEmail);
    const purchased = orders.some((order) => ["completed", "demo completed", "paid"].includes(String(order.status || "").toLowerCase()) &&
      (order.items || []).some((item) => item.itemType !== "book" && String(item.id) === String(course.id) &&
        String(item.teacherEmail || "").trim().toLowerCase() === ownerEmail));
    return enrolled || purchased;
  }

  async function openPdfResource(book, download = false) {
    const resourceTargetId = `${String(book.teacherEmail || book.course?.teacherEmail || "").toLowerCase()}::${book.course?.id || ""}::${book.id}`;
    if (!isModerationVisible("pdf", resourceTargetId)) { setResourceNotice("This PDF is temporarily unavailable while it is reviewed."); return false; }
    if (book.course && !hasCourseAccess(book.course)) { setResourceNotice("Enroll in or purchase this course before opening its PDF materials."); return false; }
    const readingTab = download ? null : window.open("about:blank", "_blank");
    if (readingTab) readingTab.opener = null;
    try {
      const file = await loadCurriculumResource(book.id);
      const url = URL.createObjectURL(file);
      if (download) {
        const link = document.createElement("a");
        link.href = url;
        link.download = book.name || "ebook.pdf";
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        if (readingTab) readingTab.location.href = url;
        else setResourceNotice("Allow pop-ups to read this PDF online.");
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      return download || Boolean(readingTab);
    } catch (error) {
      readingTab?.close();
      setResourceNotice(error.message || "PDF could not be opened.");
      return false;
    }
  }

  async function openStudentBook(book, download = false, preview = false) {
    if (!isModerationVisible("pdf", book.id)) { setResourceNotice("This eBook is temporarily unavailable while it is reviewed."); return false; }
    const accessible = Boolean(book.isFree || bookPurchases.some((item) => String(item.id) === String(book.id)) || isBookPurchased(email, book.id));
    if (!accessible && !preview) { setResourceNotice("Purchase this eBook before opening the full PDF."); return false; }
    if (download && !book.downloadAllowed) { setResourceNotice("The teacher has not allowed PDF downloads."); return false; }
    const readingTab = download ? null : window.open("about:blank", "_blank");
    if (readingTab) readingTab.opener = null;
    try {
      if (book.mongoContent && book.isFree && !preview) await enrollContent([{ ...book, itemType: "book" }]);
      const file = await loadBookFile(preview ? book.previewFileId : book.pdfFileId);
      if (!file) throw new Error("This PDF is not available in this browser.");
      const url = URL.createObjectURL(file);
      if (download) { const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${book.title || "ebook"}.pdf`; anchor.click(); }
      else if (readingTab) readingTab.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      return download || Boolean(readingTab);
    } catch (error) { if (readingTab) readingTab.close(); setResourceNotice(error.message); return false; }
  }

  function completePlayerLesson() {
    if (!playerCourseId) return;
    const course = enrolledCourses.find(
      (item) => String(item.id) === String(playerCourseId)
    );
    if (!course || !course.lessons) return;
    const completed = Math.max(0, Number(course.completedLessons) || 0);
    // Sequential completion keeps the existing count-based demo storage compatible.
    if (playerLessonIndex !== completed || completed >= course.lessons) return;
    if (/^[a-f0-9]{24}$/i.test(String(course.id))) {
      const lesson = course.lessonItems?.[playerLessonIndex];
      if (!lesson?.id) { window.alert("This lesson cannot be recorded yet. Please refresh and try again."); return; }
      setLessonCompleted(course.id, lesson.id, true)
        .then((progress) => {
          mergeMongoProgress(course.id, progress);
          if (playerLessonIndex + 1 < course.lessons) setPlayerLessonIndex(playerLessonIndex + 1);
        })
        .catch((error) => window.alert(error.message));
      return;
    }
    updateLesson(playerCourseId, 1);
    if (playerLessonIndex + 1 < course.lessons) {
      setPlayerLessonIndex(playerLessonIndex + 1);
    }
  }

  async function removeEnrollment(id) {
    const isMongo = /^[a-f0-9]{24}$/i.test(String(id));
    if (!window.confirm(isMongo ? "Remove this enrollment? You will lose access to this course." : "Remove this demo enrollment?")) return;

    if (isMongo) {
      try {
        await unenrollContent({ kind: "course", id });
      } catch (error) {
        setResourceNotice(error.message);
        window.alert(error.message);
        return;
      }
    }
    setEnrollments((previous) =>
      previous.filter((item) => String(item.id) !== String(id))
    );
    if (playerCourseId === id) {
      setPlayerCourseId(null);
      setActiveTab("learning");
    }
  }

  function toggleWishlist(id) {
    setWishlist((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id]
    );
  }
  function toggleSavedBook(id) {
    setSavedBookIds((previous) =>
      previous.some((item) => String(item) === String(id))
        ? previous.filter((item) => String(item) !== String(id))
        : [...previous, String(id)]
    );
  }

  function toggleGoal(id) {
    setDailyGoals((previous) =>
      previous.map((goal) =>
        goal.id === id ? { ...goal, done: !goal.done } : goal
      )
    );
  }

  function addGoal(event) {
    event.preventDefault();

    const title = newGoal.trim();
    if (!title) return;

    setDailyGoals((previous) => [
      ...previous,
      { id: Date.now(), title, done: false },
    ]);

    setNewGoal("");
  }

  function navigateTo(tab, learningFilter = "all") {
    setActiveTab(tab);
    if (tab === "learning") setLearningInitialFilter(learningFilter);
    if (location.pathname !== "/student/dashboard") {
      navigate("/student/dashboard");
    }
  }

  function CourseCard({ course }) {
    const courseTargetId = `${String(course.teacherEmail || course.instructorEmail || "demo").toLowerCase()}::${course.id}`;
    if (!isModerationVisible("course", courseTargetId)) return null;
    const isEnrolled = enrollments.some(
      (item) => item.id === course.id
    );

    const isSaved = wishlist.includes(course.id);

    return (
      <article className="edc-course-card">
        <div className={`edc-course-cover edc-cover-${course.color}`}>
          <span className="edc-course-emoji">{course.icon}</span>
          <span className="edc-cover-label">DEMO COURSE</span>
        </div>

        <div className="edc-course-body">
          <span className="edc-category">{course.category}</span>
          <h3>{course.title}</h3>
          <p>By {course.instructor}</p>

          <div className="edc-course-meta">
            <span>
              <BookOpen size={14} /> {Array.isArray(course.lessons) ? course.lessons.length : course.lessons} lessons
            </span>
            <span>
              <Star size={14} /> Beginner friendly
            </span>
          </div>

          <div className="edc-course-actions">
            <button
              className="edc-btn edc-btn-primary"
              onClick={() => enrollCourse(course.id)}
            >
              {isEnrolled ? "Go to Learning" : "Demo Enroll"}
              <ArrowRight size={16} />
            </button>

            <button type="button" className="edc-btn edc-btn-light" onClick={() => { addCart(course); navigateTo("cart"); }}><ShoppingCart size={16}/> Add to Cart</button>

            <button
              className={`edc-icon-btn ${isSaved ? "edc-saved" : ""}`}
              onClick={() => toggleWishlist(course.id)}
              title={isSaved ? "Remove from wishlist" : "Add to wishlist"}
              aria-label={isSaved ? "Remove from wishlist" : "Add to wishlist"}
            >
              <Heart size={18} fill={isSaved ? "currentColor" : "none"} />
            </button>
            <ReportAction reporterEmail={email} reporterName={studentProfile.fullName || "Student"} target={{ reportType: "content", targetType: "course", targetId: courseTargetId, targetTitle: course.title, targetOwnerEmail: course.teacherEmail || course.instructorEmail || "", targetOwnerName: course.instructor || course.instructorName || "", targetRole: "Teacher" }} />
          </div>
        </div>
      </article>
    );
  }

  function LearningCard({ course }) {
    return (
      <article className="edc-learning-card">
        <div className={`edc-learning-icon edc-cover-${course.color}`}>
          {course.icon}
        </div>

        <div className="edc-learning-details">
          <div className="edc-learning-top">
            <div>
              <span className="edc-category">{course.category}</span>
              <h3>{course.title}</h3>
              <p>{course.instructor}</p>
            </div>
            <span className="edc-percentage">{course.progress}%</span>
          </div>

          <ProgressBar value={course.progress} label={`${course.title} lesson progress`} />

          <div className="edc-learning-footer">
            <span>
              {course.completedLessons} of {course.lessons} lessons completed
            </span>
            {course.progress === 100 && (
              <span className="edc-completed">
                <CheckCircle2 size={14} /> Completed
              </span>
            )}
          </div>

          <div className="edc-learning-actions">
            <button
              className="edc-btn edc-btn-primary"
              disabled={!course.lessons}
              onClick={() => openCoursePlayer(course.id)}
            >
              <Play size={15} />
              {!course.lessons
                ? "No lessons available"
                : course.progress === 100
                ? "Review Lessons"
                : "Open Learning Player"}
            </button>

            <button
              className="edc-btn edc-btn-light"
              disabled={course.completedLessons === 0}
              onClick={() => updateLesson(course.id, -1)}
            >
              <RotateCcw size={15} /> Undo
            </button>

            <button
              className="edc-icon-btn edc-danger"
              onClick={() => removeEnrollment(course.id)}
              title="Remove enrollment"
              aria-label="Remove enrollment"
            >
              <Trash2 size={17} />
            </button>
          </div>
        </div>
      </article>
    );
  }

  function Overview() {
    const legacyTasks = [
      ...availableAssignments.filter(task => !submissions[task.id]).map(task => ({ id: task.id, title: task.title, type: "assignment", tab: "assignments" })),
      ...availableQuizzes.filter(quiz => !quizResults[quiz.id]).map(quiz => ({ id: quiz.id, title: quiz.title, type: "quiz", tab: "assignments" })),
    ];
    return <StudentOverview
      email={email}
      profile={studentProfile}
      courses={enrolledCourses}
      publishedCourses={latestPublishedCourses}
      demoCourses={COURSES}
      activity={learningActivity}
      dailyGoals={dailyGoals}
      goalProgress={goalProgress}
      wishlist={wishlist}
      legacyTasks={legacyTasks}
      legacyQuizPasses={passedQuizzes.length}
      legacySubmissions={submittedCount}
      serverRecommendations={serverRecommendations}
      interestProfile={interestProfile}
      onNavigate={navigateTo}
      onResume={openCoursePlayer}
      onExplore={() => navigate("/courses")}
      onCourseAction={course => course.teacherEmail ? enrollPublishedCourse(course) : enrollCourse(course.id)}
      onToggleWishlist={toggleWishlist}
      onMetric={slug => navigate(`/student/dashboard/overview/${slug}`)}
    />;
  }
  const Learning = () => <StudentLearning
    email={email}
    courses={enrolledCourses}
    publishedCourses={latestPublishedCourses}
    activity={learningActivity}
    initialFilter={learningInitialFilter}
    searchQuery={learningSearch}
    onSearchChange={setLearningSearch}
    onClearSearch={() => setLearningSearch("")}
    onResume={openCoursePlayer}
    onCertificate={course => {
      navigateTo("portfolio");
      setPortfolioTab("certificates");
      printDemoCertificate(course);
    }}
    onUndo={id => updateLesson(id, -1)}
    onRemove={removeEnrollment}
    onNavigate={navigateTo}
    onExplore={() => navigate("/courses")}
  >
    <div className="edc-search">
      <Search size={18} />
      <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search sample courses..." />
    </div>
    <div className="edc-course-grid">
      {filteredCourses.map(course => <CourseCard key={course.id} course={course} />)}
    </div>
    {filteredCourses.length === 0 && <EmptyState icon={Search} title="No matching courses" description="Try another search term." />}
  </StudentLearning>;
  function LearningPlayer() {
    const course = playerCourse;
    if (!course) {
      return (
        <div className="edc-tab-content edc-panel">
          <EmptyState icon={BookOpen} title="Course not found" description="Select an enrolled course from My Learning." />
          <button type="button" className="edc-btn edc-btn-primary" onClick={() => navigateTo("learning")}>Back to My Learning</button>
        </div>
      );
    }
    const index = Math.max(0, Math.min(course.lessons - 1, playerLessonIndex));
    const lesson = course.lessonItems?.[index];
    const lessonTitle = lesson?.title || `Lesson ${index + 1} â€” ${course.title}`;
    const videoReportTargetId = `${String(course.teacherEmail || course.instructorEmail || "demo").toLowerCase()}::${course.id}::${String(lesson?.id ?? index)}`;
    const videoVisible = isModerationVisible("video", videoReportTargetId);
    const media = videoVisible ? (localVideoUrl ? { type: "video", src: localVideoUrl } : getLessonMedia(lesson)) : null;
    const previewOnly = playerPreviewOnly;
    const isCompleted = index < course.completedLessons;
    const isNext = index === course.completedLessons;
    const notesCourse = { ...course, teacherEmail: course.teacherEmail || course.instructorEmail || "demo" };
    return (
      <div className="edc-tab-content edc-player-page">
        <button type="button" className="edc-text-btn" onClick={() => navigateTo("learning")}>
          <ChevronLeft size={17} /> Back to My Learning
        </button>
        <SectionHeading eyebrow="COURSE LEARNING PLAYER" title={course.title}
          description={`By ${course.instructor} Â· ${previewOnly ? "Free preview" : `${course.lessons} lessons`}`} />
        <div className="edc-player-layout">
          <section className="edc-panel edc-player-main">
            <div className="edc-player-screen edc-player-screen-premium">
              <span className="edc-player-screen-tag"><BookOpen size={14} /> EDUCONNECT AI CLASSROOM</span>
              {media?.type === "youtube" ? (
                <iframe
                  key={media.src}
                  src={media.src}
                  title={lessonTitle}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  style={{ width: "100%", aspectRatio: "16 / 9", border: 0, borderRadius: 12 }}
                />
              ) : media?.type === "video" ? (
                <video key={media.src} src={media.src} controls playsInline
                  ref={lessonVideoRef}
                  onTimeUpdate={event => {
                    setLessonVideoTime(event.currentTarget.currentTime);
                    handlePlaybackTick(event);
                  }}
                  onPlaying={() => { playbackClock.current = performance.now(); }}
                  onPause={flushPlayback}
                  onEnded={flushPlayback}
                  onSeeking={flushPlayback}
                  onSeeked={() => { playbackClock.current = null; }}
                  onRateChange={() => { playbackClock.current = performance.now(); }}
                  onLoadedMetadata={applyPendingSeek}
                  style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 12 }} />
              ) : (
                <div className="edc-player-play-symbol"><Play size={34} fill="currentColor" /></div>
              )}
              <div className="edc-player-screen-caption">
                <span>LESSON {String(index + 1).padStart(2, "0")} / {String(course.lessons).padStart(2, "0")}</span>
                <h3>{lessonTitle}</h3>
                <p>{lesson?.description || `Part ${index + 1} Â· Learning preview`}</p>
              </div>
              <div className="edc-player-screen-bottom"><span><Video size={14} /> {media ? "Lesson video" : "Video coming soon"}</span><span>{previewOnly ? "Free preview Â· progress is not saved" : "Course learning"}</span></div>
            </div>
            <div className="edc-player-details edc-player-details-premium">
              <div className="edc-player-lesson-heading">
                <div><span className="edc-player-eyebrow">CURRENT LESSON</span><h3>{lessonTitle}</h3></div>
                <span className={`edc-player-state ${isCompleted ? "is-done" : ""}`}>{isCompleted ? "Completed" : "In progress"}</span>
              </div>
              {lesson.content && <p>{lesson.content}</p>}
              {lesson.fileId && <a href={contentFileUrl(lesson.fileId)} target="_blank" rel="noreferrer">Open lesson PDF</a>}
              <div className="edc-player-inline-note"><Video size={18} /><span>{!videoVisible ? "This lecture is temporarily unavailable while it is reviewed." : previewOnly ? "This is a free preview lecture. Enroll or purchase the course to continue the full curriculum." : media ? "Watch the lesson, then mark it complete to save your progress." : "No video has been attached to this lesson yet."}</span></div>
              <div className="edc-player-actions">
                <ReportAction reporterEmail={email} reporterName={studentProfile.fullName || "Student"} target={{ reportType: "content", targetType: "video", targetId: videoReportTargetId, targetTitle: `${course.title}: ${lessonTitle}`, targetOwnerEmail: course.teacherEmail || course.instructorEmail || "", targetOwnerName: course.instructor || course.instructorName || "", targetRole: "Teacher" }} />
                <button type="button" className="edc-btn edc-btn-light" disabled={previewOnly || index === 0}
                  onClick={() => setPlayerLessonIndex(index - 1)}>Previous Lesson</button>
                {!previewOnly && <button type="button" className="edc-btn edc-btn-primary"
                  disabled={!isNext || course.completedLessons >= course.lessons}
                  onClick={completePlayerLesson}>
                  <CheckCircle2 size={17} /> {isCompleted ? "Already Completed" : course.progress === 100 ? "Course Completed" : "Mark Lesson Complete"}
                </button>}
                <button type="button" className="edc-btn edc-btn-light" disabled={previewOnly || index >= course.lessons - 1 || index >= course.completedLessons}
                  onClick={() => setPlayerLessonIndex(index + 1)}>Next Lesson</button>
              </div>
              {!previewOnly && <CourseNotes email={email} courses={[notesCourse]} activeCourse={notesCourse}
                activeLessonIndex={index} currentTime={lessonVideoTime}
                canTimestamp={media?.type === "video"}
                onJump={jumpToNote} compact />}
            </div>
          </section>
          <aside className="edc-panel edc-player-sidebar">
            <h3>Course Content</h3>
            <p>{previewOnly ? "Free preview lesson" : `${course.completedLessons} / ${course.lessons} lessons completed Â· ${course.progress}%`}</p>
            {!previewOnly && <ProgressBar value={course.progress} label={`${course.title} lesson progress`} />}
            <div className="edc-player-lessons">
              {(previewOnly ? [index] : Array.from({ length: course.lessons }, (_, lessonIndex) => lessonIndex)).map((lessonIndex) => {
                const done = lessonIndex < course.completedLessons;
                const locked = !previewOnly && lessonIndex > course.completedLessons;
                return (
                  <button type="button" key={lessonIndex}
                    className={`edc-player-lesson ${index === lessonIndex ? "active" : ""}`}
                    disabled={locked}
                    onClick={() => setPlayerLessonIndex(lessonIndex)}>
                    {done ? <CheckCircle2 size={18} /> : locked ? <LockKeyhole size={17} /> : <Play size={17} />}
                    <span>{course.lessonItems?.[lessonIndex]?.title || `Lesson ${lessonIndex + 1}`}<small>{done ? "Completed" : locked ? "Complete previous lessons first" : "Ready to learn"}</small></span>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  function IdentityVerification() {
    return (
      <section id="edc-student-identity-verification" className="edc-identity-section" aria-label="Student identity verification">
        <h2><CheckCircle2 size={21} />Verification {identityVerified && <VerifiedBadge label="Verified Profile" />}</h2>
        <p>Submit both sides of your CNIC for review. Your profile receives a Verified badge after approval.</p>
        <TeacherCnicUpload
          role="student"
          cnicStatus={cnicStatus}
          rejectionReason={account?.cnicVerification?.rejectionReason}
          onSubmitted={onVerificationSubmitted}
        />
      </section>
    );
  }

  function StudentProfile() {
    const shown = editingProfile ? profileDraft : studentProfile;
    const inProgressCourses = enrolledCourses.filter((course) => course.progress > 0 && course.progress < 100);
    const subjectInterests = getStudentAcademicSubjects(studentProfile);
    const educationComplete = studentProfile.educationLevel === "school"
      ? Boolean(studentProfile.classNumber)
      : studentProfile.educationLevel === "intermediate"
        ? Boolean(studentProfile.intermediateYear && studentProfile.stream)
        : studentProfile.educationLevel === "university"
            ? Boolean(studentProfile.degreeLevel && (studentProfile.programChoice || studentProfile.program))
          : studentProfile.educationLevel === "online"
              ? Boolean(studentProfile.programChoice || studentProfile.program)
            : false;
    const profileChecklist = [
      { label: "Add your name", complete: Boolean(studentProfile.fullName?.trim()) },
      { label: "Add contact details", complete: Boolean(studentProfile.phone?.trim() || studentProfile.city?.trim()) },
      { label: "Add education details", complete: educationComplete },
      { label: "Add a profile photo", complete: Boolean(studentProfile.avatar) },
      { label: "Add an introduction", complete: Boolean(studentProfile.about?.trim()) },
    ];
    const completionPercent = Math.round(profileChecklist.filter((item) => item.complete).length / profileChecklist.length * 100);
    const learningMinutes = Math.floor(Math.max(0, Number(learningActivity.totalSeconds) || 0) / 60);
    const learningTime = learningMinutes >= 60
      ? `${Math.floor(learningMinutes / 60)} hr${Math.floor(learningMinutes / 60) === 1 ? "" : "s"}`
      : `${learningMinutes} min`;
    const educationSummary = shown.educationLevel === "school"
      ? (shown.classNumber ? `Class ${shown.classNumber}` : "School level · class not added")
      : shown.educationLevel === "intermediate"
        ? `${shown.intermediateYear === "2" ? "2nd" : shown.intermediateYear === "1" ? "1st" : "Year not selected"} Year · ${INTERMEDIATE_STREAMS.find(([value]) => value === shown.stream)?.[1] || "Intermediate"}`
        : shown.educationLevel === "university"
          ? `${shown.degreeLevel ? `${shown.degreeLevel.toUpperCase()} · ` : ""}${shown.program || "Program not added"}`
          : shown.educationLevel === "online"
            ? (shown.program || "Course interest not selected")
            : "Not added yet";
    return (
      <div className="edc-tab-content edc-student-profile-page edc-profile-dashboard">
        <header className="edc-profile-hero">
          <div><span className="edc-profile-eyebrow">YOUR ACCOUNT</span><h1><UserRound size={27} />My Profile</h1>
            <p>Manage your personal information and see your learning activity.</p>
            <small>Only your saved profile details and account activity are shown.</small>
          </div>
          <div className="edc-profile-hero-art" aria-hidden="true"><UserRound /><Pencil /></div>
        </header>
        {!profileCompleted && (
          <div className="edc-profile-update-banner" role="status">
            <div className="edc-profile-update-banner-icon" aria-hidden="true"><Info size={20} /></div>
            <div>
              <strong>Update Your Profile</strong>
              <span>Complete your education details (Education Level, Class, Degree, Institution) to personalize your experience.</span>
            </div>
            <button type="button" onClick={beginProfileEdit}><Pencil size={14} />Update Profile</button>
          </div>
        )}

        <div className="edc-profile-layout">
          <aside className="edc-profile-aside">
            <section className="edc-profile-identity-card">
              <div className="edc-profile-avatar-wrap"><ProfileAvatar image={shown.avatar} /></div>
              <h2>{shown.fullName?.trim() || account?.fullName || "Student"} {identityVerified && <VerifiedBadge label="Verified Profile" />}</h2>
              <span className="edc-profile-role"><GraduationCap size={13} />Student</span>
              <div className="edc-profile-contact">
                <p><Mail size={14} /><span>{email}</span></p>
                <p><Phone size={14} /><span>{shown.phone || "Phone not added"}</span></p>
                <p><MapPin size={14} /><span>{shown.city || "City not added"}</span></p>
                <p><GraduationCap size={14} /><span>{educationSummary}</span></p>
              </div>
              <button type="button" className="edc-profile-edit-button" onClick={editingProfile ? () => {
                setProfileDraft({ ...studentProfile }); setEditingProfile(false); setProfileNotice("");
              } : beginProfileEdit}>
                <Pencil size={14} />{editingProfile ? "Cancel Edit" : "Edit Profile"}
              </button>
            </section>

            <section className="edc-profile-completion-card">
              <header><div><h3><Target size={18} />Profile Completion</h3></div><strong>{completionPercent}%</strong></header>
              <div className="edc-profile-progress" role="progressbar" aria-label="Profile completion"
                aria-valuenow={completionPercent} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${completionPercent}%` }} />
              </div>
              <ul>
                {profileChecklist.map(({ label, complete }) => <li key={label}>
                  {complete ? <CheckCircle2 size={14} className="complete" /> : <Clock3 size={14} className="incomplete" />}
                  <span>{label}</span><small>{complete ? "Added" : "Not added"}</small>
                </li>)}
              </ul>
            </section>
          </aside>

          <div className="edc-profile-main">
            <section className="edc-profile-panel edc-profile-account-card">
              <header className="edc-profile-panel-heading">
                <div><h2><UserRound size={19} />Account Details</h2><p>Your profile information and academic details.</p></div>
                {!editingProfile && <button type="button" onClick={beginProfileEdit}><Pencil size={14} />Edit</button>}
              </header>
              {editingProfile ? (
              <form className="edc-student-profile-form" onSubmit={saveStudentProfile}>
                <div className="edc-student-profile-photo-editor">
                  <ProfileAvatar image={profileDraft.avatar} size="small" />
                  <label className="edc-btn edc-btn-light edc-student-photo-button">
                    <Camera size={16} /> Choose Photo
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadStudentAvatar} />
                  </label>
                  {profileDraft.avatar && <button type="button" className="edc-btn edc-btn-light"
                    onClick={() => setProfileDraft((prev) => ({ ...prev, avatar: "" }))}>Remove Photo</button>}
                </div>
                <p className="edc-student-profile-hint">JPG, PNG or WebP Â· Maximum 1 MB</p>
                <div className="edc-student-profile-fields">
                  <label>Full Name *<input required maxLength={80} value={profileDraft.fullName}
                    onChange={(e) => setProfileDraft((prev) => ({ ...prev, fullName: e.target.value }))}
                    placeholder="Enter your full name" /></label>
                  <label>Email Address<input type="email" readOnly value={email} title="Email is managed by your login account" /></label>
                  <label>Phone Number<input type="tel" maxLength={25} value={profileDraft.phone}
                    onChange={(e) => setProfileDraft((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="Optional phone number" /></label>
                  <label>City<input maxLength={80} value={profileDraft.city}
                    onChange={(e) => setProfileDraft((prev) => ({ ...prev, city: e.target.value }))}
                    placeholder="Your city" /></label>
                  <label>Education Level
                    <select value={profileDraft.educationLevel || ""} onChange={(e) => setProfileDraft((prev) => ({ ...prev, educationLevel: e.target.value }))}>
                      <option value="">Select your education level</option>
                      <option value="school">School</option>
                      <option value="intermediate">College / Intermediate</option>
                      <option value="university">University</option>
                      <option value="online">Interest</option>
                    </select>
                  </label>
                  {profileDraft.educationLevel === "school" && <label>Class
                    <select value={profileDraft.classNumber || ""} onChange={(e) => setProfileDraft((prev) => ({ ...prev, classNumber: e.target.value }))}>
                      <option value="">Select your class</option>
                      {Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={String(index + 1)}>Class {index + 1}</option>)}
                    </select>
                  </label>}
                  {profileDraft.educationLevel === "intermediate" && <>
                    <label>Year
                      <select value={profileDraft.intermediateYear || ""} onChange={(e) => setProfileDraft((prev) => ({ ...prev, intermediateYear: e.target.value }))}>
                        <option value="">Select your year</option><option value="1">1st Year</option><option value="2">2nd Year</option>
                      </select>
                    </label>
                    <label>College Program / Group
                      <select value={profileDraft.stream || "PreEngineering"} onChange={(e) => setProfileDraft((prev) => ({ ...prev, stream: e.target.value }))}>
                        {INTERMEDIATE_STREAMS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                      </select>
                    </label>
                  </>}
                  {profileDraft.educationLevel === "university" && <>
                    <label>Degree Level
                      <select value={profileDraft.degreeLevel || ""} onChange={(e) => setProfileDraft((prev) => ({ ...prev, degreeLevel: e.target.value, programChoice: "", program: "" }))}>
                        <option value="">Select degree</option><option value="bs">BS / Bachelor's</option><option value="masters">Master's</option><option value="phd">PhD</option>
                      </select>
                    </label>
                    {profileDraft.degreeLevel && <label>{profileDraft.degreeLevel === "bs" ? "BS / Bachelor's Program" : profileDraft.degreeLevel === "masters" ? "Master's Program" : "PhD Program"}
                      <select value={profileDraft.programChoice || ""} onChange={(e) => setProfileDraft((prev) => ({ ...prev, programChoice: e.target.value, program: e.target.value === "Other" ? "" : e.target.value }))}>
                        <option value="">Select a program</option>{getProgramGroupsForDegreeLevel(profileDraft.degreeLevel).map((group) => <optgroup key={group.label} label={group.label}>{group.programs.map((program) => <option key={program} value={program}>{program}</option>)}</optgroup>)}<option value="Other">Other</option>
                      </select>
                    </label>}
                    {profileDraft.programChoice === "Other" && <label>Enter Your Program<input maxLength={100} value={profileDraft.program || ""} onChange={(e) => setProfileDraft((prev) => ({ ...prev, program: e.target.value }))} placeholder="Type your degree program" /></label>}
                  </>}
                  {profileDraft.educationLevel === "online" && <>
                    <label>Interest
                      <select value={profileDraft.programChoice || ""} onChange={(e) => setProfileDraft((prev) => ({ ...prev, programChoice: e.target.value, program: e.target.value === "Other" ? "" : e.target.value }))}>
                        <option value="">Choose a course</option>{ONLINE_COURSES.map((course) => <option key={course} value={course}>{course}</option>)}
                      </select>
                    </label>
                    {profileDraft.programChoice === "Other" && <label>Enter Course Name<input maxLength={100} value={profileDraft.program || ""} onChange={(e) => setProfileDraft((prev) => ({ ...prev, program: e.target.value }))} placeholder="Type the course name" /></label>}
                  </>}
                  {getStudentAcademicSubjects(profileDraft).length > 0 && <div className="edc-profile-subject-preview">
                    <strong>Subjects shown on Overview</strong><p>{getStudentAcademicSubjects(profileDraft).join(" Â· ")}</p>
                  </div>}
                </div>
                <label className="edc-student-profile-about-label">Interests (comma separated)
                  <input maxLength={500} value={profileDraft.interestsText || ""}
                    onChange={(e) => setProfileDraft((prev) => ({ ...prev, interestsText: e.target.value }))}
                    placeholder="e.g. Web Development, Data Science, Design" />
                  <small>Used for personalized course recommendations.</small></label>
                <label className="edc-student-profile-about-label">Learning Goals (comma separated)
                  <input maxLength={500} value={profileDraft.learningGoalsText || ""}
                    onChange={(e) => setProfileDraft((prev) => ({ ...prev, learningGoalsText: e.target.value }))}
                    placeholder="e.g. Become a full-stack developer, Pass data structures" />
                  <small>Saved to your MongoDB profile for recommendations.</small></label>
                <label className="edc-student-profile-about-label">About Me<textarea rows={5} maxLength={500}
                  value={profileDraft.about} onChange={(e) => setProfileDraft((prev) => ({ ...prev, about: e.target.value }))}
                  placeholder="Tell us about your interests and learning goals..." />
                  <small>{profileDraft.about.length} / 500 characters</small></label>
                <div className="edc-student-profile-actions">
                  <button type="submit" className="edc-btn edc-btn-primary"><Save size={16} /> Save Changes</button>
                  <button type="button" className="edc-btn edc-btn-light" onClick={() => {
                    setProfileDraft({ ...studentProfile, interestsText: (interestProfile.interests || []).join(", "), learningGoalsText: (interestProfile.learningGoals || []).join(", ") }); setEditingProfile(false); setProfileNotice("");
                  }}>Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <div className="edc-profile-detail-grid">
                  <div><UserRound size={16} /><span>Full Name</span><strong>{studentProfile.fullName || "Not added yet"}</strong></div>
                  <div><Mail size={16} /><span>Email Address</span><strong>{email}</strong></div>
                  <div><Phone size={16} /><span>Phone Number</span><strong>{studentProfile.phone || "Not added yet"}</strong></div>
                  <div><MapPin size={16} /><span>Location</span><strong>{studentProfile.city || "Not added yet"}</strong></div>
                  <div><GraduationCap size={16} /><span>Education</span><strong>{educationSummary}</strong></div>
                  <div><BookOpen size={16} /><span>Related Subjects</span><strong>{subjectInterests.length ? subjectInterests.join(", ") : "Not added yet"}</strong></div>
                  <div><Target size={16} /><span>Interests</span><strong>{(interestProfile.interests || []).length ? interestProfile.interests.join(", ") : "Not added yet"}</strong></div>
                  <div><GraduationCap size={16} /><span>Learning Goals</span><strong>{(interestProfile.learningGoals || []).length ? interestProfile.learningGoals.join(", ") : "Not added yet"}</strong></div>
                  <div className="edc-profile-about"><span>About Me</span><p>{studentProfile.about || "Not added yet"}</p></div>
                </div>
              </>
            )}
            {profileNotice && <p className="edc-student-profile-notice" role="status">{profileNotice}</p>}
            </section>

            {IdentityVerification()}

            <section className="edc-profile-panel edc-profile-activity">
              <header className="edc-profile-panel-heading"><div><h2><ChartNoAxesCombined size={19} />Activity Summary</h2><p>Based on your enrolled courses and recorded learning activity.</p></div></header>
              <div className="edc-profile-activity-grid">
                <button type="button" className="purple" onClick={() => navigateTo("learning", "all")} aria-label={`Courses Enrolled: ${enrolledCourses.length}. View all courses`}>
                  <span><BookOpen size={19} /></span><strong>{enrolledCourses.length.toLocaleString()}</strong><small>Courses Enrolled</small>
                </button>
                <button type="button" className="blue" onClick={() => navigateTo("learning", "progress")} aria-label={`Courses In Progress: ${inProgressCourses.length}. View in-progress courses`}>
                  <span><Play size={19} /></span><strong>{inProgressCourses.length.toLocaleString()}</strong><small>Courses In Progress</small>
                </button>
                <button type="button" className="green" onClick={() => navigateTo("learning", "completed")} aria-label={`Courses Completed: ${completedCourses.length}. View completed courses`}>
                  <span><CheckCircle2 size={19} /></span><strong>{completedCourses.length.toLocaleString()}</strong><small>Courses Completed</small>
                </button>
                <button type="button" className="violet" onClick={() => navigateTo("analytics")} aria-label={`Recorded Learning Time: ${learningTime}. View learning analytics`}>
                  <span><Clock3 size={19} /></span><strong>{learningTime}</strong><small>Recorded Learning Time</small>
                </button>
              </div>
              <small className="edc-profile-activity-note">Learning time is calculated from recorded course video playback.</small>
            </section>

            <section className="edc-profile-panel edc-profile-settings">
              <header className="edc-profile-panel-heading"><div><h2><Pencil size={19} />Profile &amp; Account</h2><p>Shortcuts to settings available in your student dashboard.</p></div></header>
              <div className="edc-profile-settings-list">
                <button type="button" onClick={beginProfileEdit}><span><UserRound size={17} /></span><span><strong>Personal Information</strong><small>Update your name, contact details, and education.</small></span><ChevronRight size={15} /></button>
                <button type="button" onClick={beginProfileEdit}><span><Target size={17} /></span><span><strong>Education &amp; Subjects</strong><small>Update your education details and related subjects.</small></span><ChevronRight size={15} /></button>
                <button type="button" onClick={() => navigateTo("notifications")}><span><Bell size={17} /></span><span><strong>Notifications</strong><small>Review notifications available to this account.</small></span><ChevronRight size={15} /></button>
                <button type="button" onClick={() => navigateTo("analytics")}><span><ChartNoAxesCombined size={17} /></span><span><strong>Learning Analytics</strong><small>See your course progress and activity details.</small></span><ChevronRight size={15} /></button>
              </div>
              <p className="edc-profile-storage-note">Profile details are stored in this browser and are not synced across devices.</p>
            </section>
          </div>
        </div>
      </div>
    );
  }

  function printOrderInvoice(order) {
    const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
    const money = value => `PKR ${Math.max(0, Number(value) || 0).toLocaleString()}`;
    const win = window.open("", "_blank", "width=850,height=700");
    if (!win) { setOrderNotice("Please allow pop-ups to print the demo invoice."); return; }
    const rows = (order.items || []).map(item => `<tr><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.instructor)}</td><td style="text-align:right">${money(item.price)}</td></tr>`).join("");
    win.document.open();
    const verified = String(order.status || "").toLowerCase() === "paid";
    const receiptTitle = verified ? "Purchase Receipt" : "Demo Purchase Receipt";
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>EduConnect ${verified ? "Receipt" : "Demo Invoice"} ${escapeHtml(order.id)}</title>
      <style>body{font-family:Arial,sans-serif;max-width:780px;margin:42px auto;color:#17223b;padding:0 20px}h1{margin-bottom:4px}p{line-height:1.6}table{border-collapse:collapse;width:100%;margin:25px 0}th,td{border-bottom:1px solid #ddd;padding:12px;text-align:left}th{background:#f5f7fa}.total{text-align:right;font-size:20px;font-weight:bold}.note{padding:15px;background:#fff6df;border-radius:8px}@media print{button{display:none}}</style>
      </head><body><h1>EduConnect AI</h1><p>${escapeHtml(receiptTitle)}</p>
      <p><b>Order:</b> ${escapeHtml(order.id)}<br/><b>Date:</b> ${escapeHtml(new Date(order.purchasedAt).toLocaleString())}<br/><b>Status:</b> ${escapeHtml(order.status)}<br/><b>Payment:</b> ${escapeHtml(order.paymentMethod)}</p>
      <table><thead><tr><th>Item</th><th>Instructor</th><th style="text-align:right">Price (PKR)</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="total">Total: ${money(order.total)}</p><p class="note">${verified ? "This receipt reflects a verified order recorded by EduConnect AI." : "Not a completed purchase. Payment for this order has not been verified."}</p>
      <button onclick="window.print()">Print / Save as PDF</button></body></html>`);
    win.document.close();
    win.focus();
  }

  function OrdersPage() {
    return <StudentPurchases
      orders={orders}
      bookPurchases={bookPurchases}
      completedCourses={completedCourses}
      enrolledCourses={enrolledCourses}
      orderNotice={orderNotice}
      onContinueCourse={(course) => openCoursePlayer(course.id)}
      onOpenBook={(book) => { navigateTo("ebooks"); if (book) openStudentBook(book); }}
      onDownloadBook={(book) => { navigateTo("ebooks"); openStudentBook(book, true); }}
      onPreviewCertificate={(course) => {
        navigateTo("portfolio");
        setPortfolioTab("certificates");
        printDemoCertificate(course);
      }}
      onPrintReceipt={printOrderInvoice}
      onBrowseBooks={() => navigateTo("books")}
    />;
  }

  function MyEbooksPage() {
    const publishedBooks = getPublishedBooks();
    const curriculumBooks = getPublishedPdfResources(latestPublishedCourses).filter((book) => hasCourseAccess(book.course));
    return <StudentEbooks
      email={email}
      studentName={studentProfile.fullName || studentProfile.name || "Student"}
      publishedBooks={publishedBooks}
      purchasedBooks={bookPurchases}
      savedBookIds={savedBookIds}
      curriculumBooks={curriculumBooks}
      notice={resourceNotice}
      onToggleSavedBook={toggleSavedBook}
      onReadBook={(book) => openStudentBook(book)}
      onDownloadBook={(book) => openStudentBook(book, true)}
      onReadResource={(book) => openPdfResource(book)}
      onDownloadResource={(book) => openPdfResource(book, true)}
      onAddBookToCart={(book) => { addBookToCart(book); navigateTo("cart"); }}
      onBrowseBooks={() => navigateTo("books")}
    />;
  }

  function ShoppingCartPage() {
    const currentItems = cart.filter(isCurrentCartItem);
    const unavailableItems = cart.filter((item) => !isCurrentCartItem(item));
    const availableItems = currentItems.filter(c => c.itemType === "book" ? !isBookPurchased(email, c.id) && !bookPurchases.some((item) => String(item.id) === String(c.id)) : !alreadyEnrolled(c));
    const visible = availableItems.filter((item) => cartSummaryFilter === "all" || (cartSummaryFilter === "courses" ? item.itemType !== "book" : item.itemType === "book"));
    const total = availableItems.reduce((sum, c) => sum + Math.max(0, Number(c.price) || 0), 0);
    const courseCount = availableItems.filter((item) => item.itemType !== "book").length;
    const ebookCount = availableItems.length - courseCount;
    const selectedCount = visible.filter((item) => cartSelection.includes(shopKey(item))).length;
    const allSelected = visible.length > 0 && selectedCount === visible.length;
    const availableCourses = shopCourses.filter((course) => !alreadyEnrolled(course) && !cart.some((item) => shopKey(item) === shopKey(course)));

    function selectCartSummary(filter) {
      if (filter === "total") {
        setCartSummaryFilter("all");
        window.requestAnimationFrame(() => document.getElementById("edc-cart-summary")?.scrollIntoView({ behavior: "smooth", block: "center" }));
        return;
      }
      setCartSummaryFilter(filter);
      window.requestAnimationFrame(() => document.getElementById("edc-cart-items")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }

    return <div className="edc-tab-content edc-shopping-cart-page">
      <header className="edc-cart-hero">
        <div>
          <span className="edc-cart-eyebrow">YOUR SELECTED LEARNING</span>
          <h1><ShoppingCart size={29} /> Shopping Cart</h1>
          <p>Review published courses and approved eBooks before secure checkout.</p>
        </div>
        <div className="edc-cart-hero-art" aria-hidden="true">
          <BookOpen size={54} />
          <ShoppingCart size={74} />
          <BookText size={42} />
        </div>
      </header>

      {cartNotice && <p className="edc-cart-notice" role="status">{cartNotice}</p>}

      <section className="edc-cart-stats" aria-label="Cart summary">
        {[
          { label: "Items in Cart", value: availableItems.length, icon: ShoppingCart, color: "purple", filter: "all" },
          { label: "Courses", value: courseCount, icon: BookOpen, color: "blue", filter: "courses" },
          { label: "eBooks", value: ebookCount, icon: BookText, color: "green", filter: "books" },
          { label: "Cart Total", value: `PKR ${total.toLocaleString()}`, icon: ReceiptText, color: "pink", filter: "total" },
        ].map(({ label, value, icon: Icon, color, filter }) => <button type="button" className={`edc-cart-stat ${color}`} key={label} onClick={() => selectCartSummary(filter)} aria-pressed={filter !== "total" && cartSummaryFilter === filter} aria-label={`${label}: ${value}. ${filter === "total" ? "View order summary" : "Show matching cart items"}`}>
          <span><Icon size={21} /></span><div><small>{label}</small><strong>{value}</strong></div>
        </button>)}
      </section>

      {unavailableItems.length > 0 && <section className="edc-cart-unavailable" aria-label="Unavailable cart items">
        <strong>Some saved cart items are no longer available.</strong>
        <p>They are excluded from the total and checkout. Remove them here to clear the old entries.</p>
        {unavailableItems.map((item) => <div key={shopKey(item)}><span>{item.title || "Unavailable item"}</span><button type="button" onClick={() => removeCart(item)}><Trash2 size={14} /> Remove</button></div>)}
      </section>}

      <div className="edc-cart-layout">
        <section className="edc-cart-items-panel" id="edc-cart-items">
          <div className="edc-cart-items-heading">
            <label className="edc-cart-select-all">
              <input type="checkbox" checked={allSelected} onChange={() => setCartSelection(allSelected ? [] : visible.map(shopKey))} aria-label="Select all available cart items" />
              <span>Cart Items ({visible.length})</span>
            </label>
            <div>
              <button type="button" disabled={!selectedCount} onClick={() => removeSelectedCart(visible)}><Trash2 size={15} /> Remove Selected</button>
              <button type="button" disabled={!selectedCount} onClick={() => moveSelectedToWishlist(visible)}><Heart size={15} /> Move to Wishlist</button>
            </div>
          </div>

          {visible.length ? <div className="edc-cart-item-list">
            {visible.map((item) => <article className="edc-cart-item" key={shopKey(item)}>
              <label className="edc-cart-item-check">
                <input type="checkbox" checked={cartSelection.includes(shopKey(item))} onChange={() => toggleCartSelection(item)} aria-label={`Select ${item.title}`} />
              </label>
              <div className={`edc-cart-item-art ${item.itemType === "book" ? "ebook" : ""}`}>
                {item.thumbnail
                  ? <img src={item.thumbnail} alt="" />
                  : item.itemType === "book" ? <BookText size={29} /> : <BookOpen size={29} />}
              </div>
              <div className="edc-cart-item-details">
                <span className="edc-cart-item-type">{item.itemType === "book" ? "Approved eBook" : "Published Course"}</span>
                <h2>{item.title}</h2>
                <p>{item.instructor || "Teacher"}{item.category ? ` · ${item.category}` : ""}</p>
              </div>
              <strong className="edc-cart-item-price">PKR {Math.max(0, Number(item.price) || 0).toLocaleString()}</strong>
              <button type="button" className="edc-cart-remove" onClick={() => removeCart(item)} aria-label={`Remove ${item.title} from cart`} title="Remove from cart"><Trash2 size={17} /></button>
            </article>)}
          </div> : <div className="edc-cart-empty">
            <span><ShoppingCart size={30} /></span>
            <h2>{availableItems.length ? `No ${cartSummaryFilter === "courses" ? "courses" : "eBooks"} in your cart` : "Your cart is empty"}</h2>
            <p>{availableItems.length ? "Choose another cart summary card to view the other items." : "Add a published course or approved eBook to see it here. Sample courses are not included."}</p>
            {availableItems.length
              ? <button type="button" onClick={() => setCartSummaryFilter("all")}>View All Cart Items</button>
              : <button type="button" onClick={() => navigateTo("books")}>Browse Books & Teachers <ArrowRight size={15} /></button>}
          </div>}

          <div className="edc-cart-items-footer">
            <span><input type="checkbox" checked={allSelected} onChange={() => setCartSelection(allSelected ? [] : visible.map(shopKey))} aria-label="Select all available cart items" /> Select All ({visible.length})</span>
            <button type="button" disabled={!cart.length} onClick={removeAllCartItems}><Trash2 size={14} /> Remove All</button>
          </div>
        </section>

        <aside className="edc-cart-summary" id="edc-cart-summary">
          <h2><BookOpen size={20} /> Order Summary</h2>
          <div className="edc-cart-summary-row"><span>Subtotal ({availableItems.length} {availableItems.length === 1 ? "item" : "items"})</span><strong>PKR {total.toLocaleString()}</strong></div>
          <div className="edc-cart-summary-total"><span>Total</span><strong>PKR {total.toLocaleString()}</strong></div>
          {availableItems.length > 0 && (availableItems.reduce((sum, c) => sum + Math.max(0, Number(c.price) || 0), 0) > 0) && (
            <PaymentProviderPicker
              providers={payProviders}
              mode={payProvidersMode}
              selected={selectedPayProvider}
              onSelect={setSelectedPayProvider}
              demoEnabled={payDemoEnabled}
            />
          )}
          {useDemo ? (
            <p className="edc-cart-demo-note">Sandbox demo checkout — no real money. Development only. Demo purchases are recorded for testing.</p>
          ) : (
            <p className="edc-cart-demo-note">Payments are verified server-side before access is granted.</p>
          )}
          <button type="button" className="edc-cart-checkout" onClick={checkoutCart} disabled={!availableItems.length || cartBusy}><ShoppingCart size={17} /> {useDemo ? "Proceed to Sandbox Checkout" : "Proceed to Secure Checkout"} <ArrowRight size={17} /></button>
        </aside>
      </div>

      <section className="edc-cart-browse">
        <div><span className="edc-cart-eyebrow">REAL PUBLISHED CONTENT</span><h2>Explore Courses</h2><p>Only published teacher courses are shown here.</p></div>
        <button type="button" onClick={() => navigateTo("books")}>Browse Books & Teachers <ArrowRight size={15} /></button>
        {availableCourses.length
          ? <div className="edc-cart-course-list">{availableCourses.map((course) =>
            <article key={shopKey(course)}>
              <span><BookOpen size={19} /></span>
              <div><strong>{course.title}</strong><small>{course.instructor} · {course.category || course.subject || "Published course"}</small></div>
              <strong>{course.price > 0 ? `PKR ${course.price.toLocaleString()}` : "Free"}</strong>
              <button type="button" onClick={() => addCart(course)}><ShoppingCart size={14} /> Add</button>
            </article>,
          )}</div>
          : <p className="edc-cart-no-courses">No other published courses are available to add right now.</p>}
      </section>
    </div>;
  }

  function Wishlist() {
    return <StudentWishlist
      email={email}
      publishedCourses={latestPublishedCourses}
      enrolledCourses={enrolledCourses}
      wishlist={wishlist}
      savedBookIds={savedBookIds}
      bookPurchases={bookPurchases}
      onToggleWishlist={toggleWishlist}
      onToggleSavedBook={toggleSavedBook}
      onCourseAction={enrollPublishedCourse}
      onBookAction={(book) => {
        if (book.isFree || isBookPurchased(email, book.id) || bookPurchases.some((item) => String(item.id) === String(book.id))) {
          navigateTo("ebooks");
        } else {
          addBookToCart(book);
          navigateTo("cart");
        }
      }}
      onBrowseCourses={() => navigate("/courses")}
      onBrowseBooks={() => navigateTo("books")}
    />;
  }

  function Portfolio() {
    const query = portfolioSearch.trim().toLowerCase();
    const certificateEntries = [
      ...mongoCertificates.map((cert) => ({ id: String(cert.courseId), title: cert.courseTitle, teacherEmail: "", certificate: cert, lessons: null, progress: 100, mongoContent: true })),
      ...completedCourses.filter((course) => !/^[a-f0-9]{24}$/i.test(String(course.id))),
    ];
    const visibleCertificates = certificateEntries.filter((course) => !query || String(course.title || "").toLowerCase().includes(query));
    const visibleProjects = portfolioProjects.filter((project) =>
      [project.title, project.description, project.url, ...(Array.isArray(project.skills) ? project.skills : [])]
        .some((value) => String(value || "").toLowerCase().includes(query)),
    );
    const visibleSkills = portfolioSkills.filter((skill) => !query || skill.toLowerCase().includes(query));
    const visiblePassedQuizzes = passedQuizzes.filter((quiz) => !query || String(quiz.title || "").toLowerCase().includes(query));
    const badges = [
      { title: "Course Explorer", detail: `${enrolledCourses.length} enrolled`, earned: enrolledCourses.length > 0, icon: BookOpen },
      { title: "Course Finisher", detail: `${completedCourses.length} completed`, earned: completedCourses.length > 0, icon: Award },
      { title: "Quiz Challenger", detail: `${attemptedQuizzes.length} attempted`, earned: attemptedQuizzes.length > 0, icon: Brain },
      { title: "Quiz Achiever", detail: `${passedQuizzes.length} scored 70%+`, earned: passedQuizzes.length > 0, icon: Star },
      { title: "Project Builder", detail: `${portfolioProjects.length} projects`, earned: portfolioProjects.length > 0, icon: Target },
    ].filter((badge) => !query || `${badge.title} ${badge.detail}`.toLowerCase().includes(query));

    function changePortfolioTab(tab) {
      setPortfolioTab(tab);
      setPortfolioSearch("");
      setPortfolioMessage("");
    }

    function startProjectForm() {
      setProjectForm({ id: null, title: "", description: "", skills: "", url: "" });
      setProjectEditing(true);
      changePortfolioTab("projects");
    }

    function renderProjectCard(project) {
      const skills = Array.isArray(project.skills) ? project.skills : [];
      return <article className="edc-portfolio-project-card" key={project.id}>
        <div className="edc-portfolio-project-art"><BookOpen size={27} /><span>Student Project</span></div>
        <div className="edc-portfolio-project-copy">
          <h3>{project.title}</h3>
          <p>{project.description}</p>
          {skills.length > 0 && <div className="edc-portfolio-skill-list">{skills.map((skill) => <span key={skill}>{skill}</span>)}</div>}
          {project.url && <a href={project.url} target="_blank" rel="noopener noreferrer">Open Project Link ↗</a>}
          <div className="edc-portfolio-actions">
            <button type="button" className="edc-btn edc-btn-light" onClick={() => editPortfolioProject(project)}>Edit</button>
            <button type="button" className="edc-icon-btn edc-danger" aria-label={`Delete ${project.title}`} onClick={() => deletePortfolioProject(project.id)}><Trash2 size={17} /></button>
          </div>
        </div>
      </article>;
    }

    const stats = [
      { label: "Total Certificates", value: completedCourses.length, icon: Award, color: "purple", tab: "certificates" },
      { label: "Portfolio Projects", value: portfolioProjects.length, icon: BookOpen, color: "blue", tab: "projects" },
      { label: "Skills Added", value: portfolioSkills.length, icon: Target, color: "green", tab: "skills" },
      { label: "Quiz Passes", value: passedQuizzes.length, icon: CheckCircle2, color: "violet", tab: "achievements" },
    ];

    return (
      <div className="edc-tab-content edc-portfolio-page edc-portfolio-dashboard">
        <header className="edc-portfolio-hero">
          <div>
            <span className="edc-portfolio-eyebrow">YOUR LEARNING ACHIEVEMENTS</span>
            <h1><Award size={28} /> Certificates &amp; Portfolio</h1>
            <p>Keep your course completion records, projects, and skills together.</p>
            <small>Completion records are demo-only and are not accredited credentials.</small>
          </div>
          <div className="edc-portfolio-hero-art" aria-hidden="true"><GraduationCap /><Award /><BookOpen /></div>
        </header>

        <section className="edc-portfolio-stats" aria-label="Portfolio summary">
          {stats.map(({ label, value, icon: Icon, color, tab }) => <button type="button" className={`edc-portfolio-stat ${color}`} key={label} onClick={() => changePortfolioTab(tab)} aria-pressed={portfolioTab === tab} aria-label={`${label}: ${value}. Show matching records`}>
            <span><Icon size={22} /></span><div><small>{label}</small><strong>{value.toLocaleString()}</strong></div>
          </button>)}
        </section>

        <div className="edc-portfolio-toolbar">
          <nav className="edc-portfolio-tabs" aria-label="Portfolio sections">
            {[["certificates", "My Certificates", Award], ["projects", "My Portfolio", BookOpen], ["skills", "Skills & Badges", Target], ["achievements", "Achievements", Trophy], ["showcase", "Showcase", GraduationCap]].map(([id, label, Icon]) =>
              <button key={id} type="button" className={`edc-portfolio-tab ${portfolioTab === id ? "edc-portfolio-tab-active" : ""}`} aria-pressed={portfolioTab === id} onClick={() => changePortfolioTab(id)}>
                <Icon size={15} />{label}
              </button>,
            )}
          </nav>
          <label className="edc-portfolio-search"><Search size={16} /><input type="search" value={portfolioSearch} onChange={(event) => setPortfolioSearch(event.target.value)} placeholder={`Search ${portfolioTab === "projects" ? "projects" : portfolioTab === "skills" ? "skills and badges" : "certificates"}...`} aria-label="Search certificates and portfolio" />{portfolioSearch && <button type="button" aria-label="Clear portfolio search" onClick={() => setPortfolioSearch("")}><X size={14} /></button>}</label>
          <button type="button" className="edc-portfolio-add" onClick={startProjectForm}><Plus size={16} />Add Project</button>
        </div>
        {portfolioMessage && <p className="edc-portfolio-message" role="status">{portfolioMessage}</p>}

        {portfolioTab === "certificates" && (
          <div className="edc-portfolio-sections">
            <section className="edc-portfolio-section">
              <header><div><h2><Award size={19} />My Certificates</h2><p>Records based on courses completed in your account.</p></div>{completedCourses.length > 4 && <button type="button" onClick={() => navigate("/student/dashboard/portfolio/completed-courses")}>View All Certificates <ArrowRight size={14} /></button>}</header>
              <p className="edc-portfolio-notice">Certificates for completed EduConnect AI courses are verified records. Demo sample courses show unverified completion records.</p>
              {visibleCertificates.length ? <div className="edc-portfolio-certificate-grid">
                {visibleCertificates.map((course) => {
                  const cert = course.certificate;
                  const completionDate = certificateInfo(course).date;
                  const lessonCount = Array.isArray(course.lessons) ? course.lessons.length : Number(course.lessons) || 0;
                  return <article className="edc-portfolio-certificate-card" key={cert ? cert.certificateId : `${course.teacherEmail || ""}:${course.id}`}>
                    <div className="edc-portfolio-certificate-art"><Award size={31} /><span>Course Completion</span></div>
                    <div className="edc-portfolio-certificate-copy">
                      <span className="edc-portfolio-record-label">{cert ? "Verified certificate" : "Demo completion record"}</span>
                      <h3>{course.title}</h3>
                      <p>{cert ? <><CheckCircle2 size={13} />Certificate ID: {cert.certificateId}</> : <><CheckCircle2 size={13} />{lessonCount} lessons completed</>}</p>
                      <p><CalendarDays size={13} />{cert ? "Completed" : "Record date"}: {completionDate}</p>
                      <button type="button" onClick={() => printDemoCertificate(course)}>Preview / Save PDF <ArrowRight size={14} /></button>
                    </div>
                  </article>;
                })}
              </div> : <EmptyState icon={Award} title={query ? "No matching completion records" : "No completed courses yet"} description={query ? "Try another search." : "Course records appear here after you complete the lessons in an enrolled course."} />}
            </section>

            <section className="edc-portfolio-section">
              <header><div><h2><BookOpen size={19} />My Portfolio</h2><p>Projects you have added to your account.</p></div><button type="button" onClick={() => changePortfolioTab("projects")}>View Full Portfolio <ArrowRight size={14} /></button></header>
              {visibleProjects.length ? <div className="edc-portfolio-project-grid">{visibleProjects.slice(0, 4).map(renderProjectCard)}</div>
                : <EmptyState icon={BookOpen} title={query ? "No matching projects" : "No projects yet"} description={query ? "Try another search." : "Add a project to showcase your work and the skills you used."} />}
            </section>
          </div>
        )}

        {portfolioTab === "projects" && (
          <section className="edc-portfolio-section">
            <header><div><h2><BookOpen size={19} />My Portfolio</h2><p>Your saved projects and related skills.</p></div></header>
            {!projectEditing ? (
              <button type="button" className="edc-portfolio-add-inline" onClick={startProjectForm}><Plus size={16} />Add Project</button>
            ) : (
              <form className="edc-portfolio-form" onSubmit={savePortfolioProject}>
                <h3>{projectForm.id ? "Edit Project" : "Add a New Project"}</h3>
                <label>Project Title <input required maxLength={100} value={projectForm.title}
                  onChange={(event) => setProjectForm((previous) => ({ ...previous, title: event.target.value }))}
                  placeholder="e.g. React To-Do App" /></label>
                <label>Description <textarea required rows={4} maxLength={1500} value={projectForm.description}
                  onChange={(event) => setProjectForm((previous) => ({ ...previous, description: event.target.value }))}
                  placeholder="Explain what you built and what you learned..." /></label>
                <label>Skills (comma separated) <input maxLength={250} value={projectForm.skills}
                  onChange={(event) => setProjectForm((previous) => ({ ...previous, skills: event.target.value }))}
                  placeholder="React, JavaScript, CSS" /></label>
                <label>Project Link (optional) <input type="url" value={projectForm.url}
                  onChange={(event) => setProjectForm((previous) => ({ ...previous, url: event.target.value }))}
                  placeholder="https://github.com/..." /></label>
                <div className="edc-portfolio-actions">
                  <button type="submit" className="edc-btn edc-btn-primary"><CheckCircle2 size={16} /> Save Project</button>
                  <button type="button" className="edc-btn edc-btn-light" onClick={() => setProjectEditing(false)}>Cancel</button>
                </div>
              </form>
            )}
            {visibleProjects.length ? <div className="edc-portfolio-project-grid">{visibleProjects.map(renderProjectCard)}</div> : !projectEditing && <EmptyState icon={BookOpen} title={query ? "No matching projects" : "No projects yet"} description={query ? "Try another search." : "Add your first project to start building a portfolio."} />}
          </section>
        )}

        {portfolioTab === "skills" && (
          <div className="edc-portfolio-sections">
            <section className="edc-portfolio-section">
              <header><div><h2><Target size={19} />Skills Added</h2><p>Skills collected from the projects you saved.</p></div></header>
              {visibleSkills.length ? <div className="edc-portfolio-skill-cards">{visibleSkills.map((skill) => {
                const relatedProjects = portfolioProjects.filter((project) => Array.isArray(project.skills) && project.skills.includes(skill));
                return <article key={skill}><span><Target size={18} /></span><div><strong>{skill}</strong><small>Used in {relatedProjects.length} {relatedProjects.length === 1 ? "project" : "projects"}</small></div></article>;
              })}</div> : <EmptyState icon={Target} title={query ? "No matching skills" : "No skills listed yet"} description={query ? "Try another search." : "Add skills to your portfolio projects to list them here."} />}
            </section>
            <section className="edc-portfolio-section">
              <header><div><h2><Trophy size={19} />Learning Badges</h2><p>Milestones calculated from your account activity.</p></div></header>
              <div className="edc-portfolio-achievements">{badges.map(({ title, detail, earned, icon: Icon }) => <article key={title} className={earned ? "earned" : ""}><Icon size={25} /><strong>{title}</strong><span>{detail}</span><small>{earned ? "Recorded in your account" : "Not earned yet"}</small></article>)}</div>
              <p className="edc-portfolio-notice">Badges are demo milestones based on account activity, not verified qualifications.</p>
            </section>
          </div>
        )}

        {portfolioTab === "showcase" && (
          <section className="edc-portfolio-section">
            <header><div><h2><GraduationCap size={19} />Portfolio Showcase</h2><p>Preview of your saved projects and skills.</p></div></header>
            <label className="edc-portfolio-name-field">Portfolio display name<input value={portfolioName} maxLength={80} placeholder={studentProfile.fullName || studentProfile.name || "Enter your name"} onChange={(event) => setPortfolioName(event.target.value)} /></label>
            <div className="edc-portfolio-showcase">
              <div className="edc-portfolio-showcase-hero"><GraduationCap size={38} />
                <div><h3>{portfolioName.trim() || studentProfile.fullName || studentProfile.name || "Student"}</h3><p>Student | EduConnect AI</p></div>
              </div>
              <h3>Skills</h3>
              {visibleSkills.length ? <div className="edc-portfolio-skill-list">{visibleSkills.map((skill) => <span key={skill}>{skill}</span>)}</div>
                : <p className="edc-muted">Add skills to your projects to display them here.</p>}
              <h3>Featured Projects</h3>
              {visibleProjects.length ? <div className="edc-portfolio-project-grid">
                {visibleProjects.map((project) => <article className="edc-portfolio-project" key={project.id}>
                  <h4>{project.title}</h4><p>{project.description}</p>
                  {project.url && <a href={project.url} target="_blank" rel="noopener noreferrer">View Project Link</a>}
                </article>)}
              </div> : <p className="edc-muted">Your projects will appear here after you add them.</p>}
              <h3>Course Completion Records</h3>
              {visibleCertificates.length ? visibleCertificates.map((course) => <p key={`${course.teacherEmail || ""}:${course.id}`}><CheckCircle2 size={16} /> {course.title}</p>)
                : <p className="edc-muted">No completed courses to show yet.</p>}
            </div>
          </section>
        )}

        {portfolioTab === "achievements" && (
          <section className="edc-portfolio-section">
            <header><div><h2><Trophy size={19} />Learning Achievements</h2><p>Milestones calculated from your course, quiz, and project activity.</p></div></header>
            <div className="edc-portfolio-achievements">{badges.map(({ title, detail, earned, icon: Icon }) => <article key={title} className={earned ? "earned" : ""}><Icon size={25} /><strong>{title}</strong><span>{detail}</span><small>{earned ? "Recorded in your account" : "Not earned yet"}</small></article>)}</div>
            <p className="edc-portfolio-notice">These badges are demo milestones, not verified qualifications.</p>
            <h3 className="edc-portfolio-subheading">Quizzes Passed (70%+)</h3>
            {visiblePassedQuizzes.length ? <div className="edc-portfolio-passed-quizzes">{visiblePassedQuizzes.map((quiz) => {
              const result = quizResults[quiz.id];
              return <article key={quiz.id}><CheckCircle2 size={18} /><div><strong>{quiz.title}</strong><small>{result.correct} / {result.total} correct answers</small></div><strong>{result.percentage}%</strong></article>;
            })}</div> : <EmptyState icon={CheckCircle2} title={query ? "No matching quiz passes" : "No quizzes passed yet"} description={query ? "Try another search." : "Quizzes with an actual recorded score of 70% or higher will appear here."} />}
          </section>
        )}
      </div>
    );
  }

  const currentTab = activeTab === "player"
    ? { label: "Course Player" }
    : MENU.find((item) => item.id === activeTab);

  const researchDetailSection = location.pathname.startsWith("/student/dashboard/research/")
    ? RESEARCH_SECTIONS.find((section) => section.id === location.pathname.split("/").at(-1))
    : null;
  const researchDetailItems = researchDetailSection && Array.isArray(researchRecords[researchDetailSection.id])
    ? researchRecords[researchDetailSection.id]
    : [];

  if (researchDetailSection) {
    return (
      <main className="edc-academic-detail-page edc-research-detail-page" aria-live="polite">
        <button type="button" className="edc-text-btn edc-academic-detail-back" onClick={() => navigateTo("research")}>
          <ArrowRight size={16} className="edc-academic-back-icon" /> Back to Research Workspace
        </button>
        <SectionHeading eyebrow="RESEARCH WORKSPACE" title={researchDetailSection.title}
          description={`Review and manage your saved ${researchDetailSection.title.toLowerCase()} records.`}
          action={<button type="button" className="edc-btn edc-btn-primary" onClick={() => {
            switchResearchTab(researchDetailSection.id);
            navigateTo("research");
          }}><Plus size={16} /> Add Record</button>} />
        {researchDetailItems.length ? (
          <div className="edc-research-list edc-research-detail-list">
            {researchDetailItems.map((item) => (
              <article key={item.id} className="edc-research-item">
                <h4>{item.title}</h4>
                {researchDetailSection.fields.filter((field) => field.key !== "title" && item[field.key]).map((field) => (
                  <div key={field.key} className="edc-research-field">
                    <strong>{field.label}:</strong> {field.key === "url" && /^https?:\/\//i.test(item[field.key])
                      ? <a href={item[field.key]} target="_blank" rel="noopener noreferrer">Open link</a>
                      : <span>{item[field.key]}</span>}
                  </div>
                ))}
                <small>Updated {new Date(item.updatedAt).toLocaleDateString()}</small>
                <div className="edc-research-actions">
                  <button type="button" className="edc-btn edc-btn-light" onClick={() => {
                    switchResearchTab(researchDetailSection.id);
                    editResearchRecord(item);
                    navigateTo("research");
                  }}>Edit</button>
                  <button type="button" className="edc-btn edc-btn-light" onClick={() => deleteResearchRecord(item.id, researchDetailSection.id)}>
                    <Trash2 size={15} /> Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="edc-panel edc-academic-stat-empty">
            <EmptyState icon={Microscope} title={`No ${researchDetailSection.title.toLowerCase()} yet`}
              description="Add your first record from the Research Workspace." />
          </div>
        )}
      </main>
    );
  }

  const overviewDetailSlug = location.pathname.startsWith("/student/dashboard/overview/")
    ? location.pathname.split("/").at(-1)
    : "";
  const savedCourses = COURSES.filter((course) => wishlist.includes(course.id));
  const overviewDetailConfig = {
    "enrolled-courses": {
      title: "Enrolled Courses",
      description: "Your courses and current lesson progress.",
      courses: enrolledCourses,
      emptyMessage: "You are not enrolled in any courses yet. Explore demo courses to get started.",
    },
    "completed-courses": {
      title: "Completed Courses",
      description: "Courses where you have completed every lesson.",
      courses: completedCourses,
      emptyMessage: "No completed courses yet. Finish all lessons in a course to see it here.",
    },
    "average-progress": {
      title: "Average Progress",
      description: `Your average progress across ${enrolledCourses.length} enrolled ${enrolledCourses.length === 1 ? "course" : "courses"} is ${averageProgress}%.`,
      courses: enrolledCourses,
      emptyMessage: "Enroll in a course and complete lessons to track your progress.",
    },
    wishlist: {
      title: "Wishlist",
      description: "Courses you have saved to explore later.",
      courses: savedCourses,
      isWishlist: true,
      emptyMessage: "Your wishlist is empty. Add courses from Overview to save them here.",
    },
  }[overviewDetailSlug];

  const portfolioDetailSlug = location.pathname.startsWith("/student/dashboard/portfolio/")
    ? location.pathname.split("/").at(-1)
    : "";
  const portfolioDetailConfig = {
    "completed-courses": {
      title: "Completed Courses",
      description: "Your course completion records and demo certificates.",
      items: completedCourses.map((course) => ({
        id: course.id,
        title: course.title,
        detail: `All ${course.lessons} demo lessons completed. This is a demonstration record, not an accredited certificate.`,
        status: "100% complete",
        actionLabel: "Preview certificate",
        action: () => {
          navigateTo("portfolio");
          setPortfolioTab("certificates");
          printDemoCertificate(course);
        },
      })),
      emptyMessage: "No completed courses yet. Finish every lesson in a course to unlock a demo completion record.",
    },
    projects: {
      title: "Portfolio Projects",
      description: "Projects you have added to your learning portfolio.",
      items: portfolioProjects.map((project) => ({
        id: project.id,
        title: project.title,
        detail: `${project.description}${project.url ? ` Â· ${project.url}` : ""}`,
        status: `${project.skills.length} ${project.skills.length === 1 ? "skill" : "skills"}`,
        actionLabel: "Edit project",
        action: () => {
          editPortfolioProject(project);
          setPortfolioTab("projects");
          navigateTo("portfolio");
        },
      })),
      emptyMessage: "No portfolio projects yet. Add a project from the My Projects tab.",
    },
    "quizzes-passed": {
      title: "Quizzes Passed",
      description: "Quizzes with a score of 70% or higher.",
      items: passedQuizzes.map((quiz) => {
        const result = quizResults[quiz.id];
        const course = COURSES.find((item) => item.id === quiz.courseId);
        return {
          id: quiz.id,
          title: quiz.title,
          detail: `${course?.title || "Course"} Â· ${result.correct}/${result.total} correct Â· ${new Date(result.completedAt).toLocaleString()}`,
          status: `${result.percentage}%`,
          actionLabel: "Practice again",
          action: () => reviewMasteryQuiz(),
        };
      }),
      emptyMessage: "No quizzes passed yet. Complete a course quiz and score at least 70% to earn this milestone.",
    },
    skills: {
      title: "Skills Listed",
      description: "Skills collected from the projects in your portfolio.",
      items: portfolioSkills.map((skill) => ({
        id: skill,
        title: skill,
        detail: `Used in: ${portfolioProjects.filter((project) => project.skills.includes(skill)).map((project) => project.title).join(", ")}`,
        status: "Portfolio skill",
        actionLabel: "View showcase",
        action: () => {
          setPortfolioTab("showcase");
          navigateTo("portfolio");
        },
      })),
      emptyMessage: "No skills listed yet. Add skills to one of your portfolio projects.",
    },
  }[portfolioDetailSlug];

  if (portfolioDetailConfig) {
    return (
      <main className="edc-academic-detail-page" aria-live="polite">
        <button type="button" className="edc-text-btn edc-academic-detail-back" onClick={() => navigateTo("portfolio")}>
          <ArrowRight size={16} className="edc-academic-back-icon" /> Back to Certificates & Portfolio
        </button>
        <SectionHeading eyebrow="YOUR ACHIEVEMENTS" title={portfolioDetailConfig.title} description={portfolioDetailConfig.description} />
        {portfolioDetailConfig.items.length ? (
          <div className="edc-academic-results edc-overview-detail-courses">
            {portfolioDetailConfig.items.map((item) => (
              <article className="edc-academic-result" key={item.id}>
                <div><strong>{item.title}</strong><p>{item.detail}</p></div>
                <div className="edc-academic-stat-detail-actions">
                  <span className="edc-academic-status">{item.status}</span>
                  {item.action && <button type="button" className="edc-btn edc-btn-primary" onClick={item.action}>{item.actionLabel}</button>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="edc-panel edc-academic-stat-empty">{portfolioDetailConfig.emptyMessage}</div>
        )}
      </main>
    );
  }

  if (location.pathname.startsWith("/student/dashboard/mastery/")) {
    return <StudentTopicMastery email={email} courses={enrolledCourses}
      publishedCourses={latestPublishedCourses} onNavigate={navigateTo} onOpenQuiz={openStudentQuiz} />;
  }

  if (overviewDetailConfig) {
    return (
      <main className="edc-academic-detail-page" aria-live="polite">
        <button type="button" className="edc-text-btn edc-academic-detail-back" onClick={() => navigateTo("overview")}>
          <ArrowRight size={16} className="edc-academic-back-icon" /> Back to Overview
        </button>
        <SectionHeading eyebrow="YOUR LEARNING JOURNEY" title={overviewDetailConfig.title} description={overviewDetailConfig.description} />
        {overviewDetailConfig.courses.length ? (
          overviewDetailConfig.isWishlist ? (
            <div className="edc-course-grid edc-overview-detail-courses">
              {overviewDetailConfig.courses.map((course) => <CourseCard key={course.id} course={course} />)}
            </div>
          ) : (
            <div className="edc-learning-list edc-overview-detail-courses">
              {overviewDetailConfig.courses.map((course) => <LearningCard key={course.id} course={course} />)}
            </div>
          )
        ) : (
          <div className="edc-panel edc-academic-stat-empty">{overviewDetailConfig.emptyMessage}</div>
        )}
      </main>
    );
  }

  const academicDetailSlug = location.pathname.startsWith("/student/dashboard/academic/")
    ? location.pathname.split("/").at(-1)
    : "";
  const academicDetailConfig = {
    assignments: {
      title: "All Assignments",
      description: "Review every assignment available in your enrolled courses.",
      items: availableAssignments.map((task) => ({
        id: task.id,
        title: task.title,
        detail: COURSES.find((course) => course.id === task.courseId)?.title || "Course",
        status: submissions[task.id] ? "Submitted" : "Pending",
        actionLabel: submissions[task.id] ? "View submission" : "Open assignment",
        action: () => {
          setAcademicTab("assignments");
          openAssignment(task);
          navigateTo("assignments");
        },
      })),
    },
    submitted: {
      title: "Submitted Assignments",
      description: "Assignments you have saved, including their submission dates.",
      items: availableAssignments.filter((task) => submissions[task.id]).map((task) => ({
        id: task.id,
        title: task.title,
        detail: `Saved ${new Date(submissions[task.id].submittedAt).toLocaleString()}`,
        status: "Submitted",
        actionLabel: "View submission",
        action: () => {
          setAcademicTab("assignments");
          openAssignment(task);
          navigateTo("assignments");
        },
      })),
    },
    pending: {
      title: "Pending Assignments",
      description: "Assignments you have not submitted yet.",
      items: availableAssignments.filter((task) => !submissions[task.id]).map((task) => ({
        id: task.id,
        title: task.title,
        detail: COURSES.find((course) => course.id === task.courseId)?.title || "Course",
        status: "Pending",
        actionLabel: "Start assignment",
        action: () => {
          setAcademicTab("assignments");
          openAssignment(task);
          navigateTo("assignments");
        },
      })),
    },
    "quiz-scores": {
      title: "Quiz Scores",
      description: "Results from the quizzes you have completed.",
      items: availableQuizzes.filter((quiz) => quizResults[quiz.id]).map((quiz) => ({
        id: quiz.id,
        title: quiz.title,
        detail: `${COURSES.find((course) => course.id === quiz.courseId)?.title || "Course"} Â· ${quizResults[quiz.id].correct}/${quizResults[quiz.id].total} correct Â· ${new Date(quizResults[quiz.id].completedAt).toLocaleString()}`,
        status: `${quizResults[quiz.id].percentage}%`,
        actionLabel: "View grades",
        action: () => {
          setAcademicTab("grades");
          navigateTo("assignments");
        },
      })),
    },
  }[academicDetailSlug];

  if (academicDetailConfig) {
    return (
      <main className="edc-academic-detail-page" aria-live="polite">
        <button type="button" className="edc-text-btn edc-academic-detail-back" onClick={() => navigateTo("assignments")}>
          <ArrowRight size={16} className="edc-academic-back-icon" /> Back to Assignments & Grades
        </button>
        <SectionHeading eyebrow="ACADEMIC WORKSPACE" title={academicDetailConfig.title} description={academicDetailConfig.description} />
        {academicDetailConfig.items.length ? (
          <div className="edc-academic-results">
            {academicDetailConfig.items.map((item) => (
              <article className="edc-academic-result" key={item.id}>
                <div><strong>{item.title}</strong><p>{item.detail}</p></div>
                <div className="edc-academic-stat-detail-actions">
                  <span className="edc-academic-status">{item.status}</span>
                  <button type="button" className="edc-btn edc-btn-primary" onClick={item.action}>{item.actionLabel}</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="edc-panel edc-academic-stat-empty">
            {academicDetailSlug === "quiz-scores"
              ? "No quiz results yet. Complete a quiz to see your scores here."
              : academicDetailSlug === "submitted"
                ? "You have not submitted any assignments yet."
                : academicDetailSlug === "pending"
                  ? "You have no pending assignments."
                  : "No assignments yet. Enroll in a demo course from My Learning to see assignments here."}
          </div>
        )}
      </main>
    );
  }

  return (
    <div className="edc-student-shell">
      <WorkspaceSidebar
        menuConfig={MENU.filter((item) => item.id !== "notifications").map((item) => ({
          id: item.id,
          route: item.id,
          label: item.label,
          icon: item.icon,
          active: activeTab === item.id,
          ariaCurrent: activeTab === item.id ? "page" : undefined,
        }))}
        profile={{ avatar: profileAvatar, name: profileDisplayName, subline: "Student" }}
        ariaLabel="Student dashboard"
        onNavigate={navigateTo}
        footer={
          <div className="edc-workspace-sidebar-footer-card edc-student-sidebar-promo">
            <Crown size={24} fill="currentColor" aria-hidden="true" />
            <strong>Keep Growing</strong>
            <p>Build new skills and get closer to your learning goals.</p>
            <button type="button" onClick={() => navigateTo("planner")}>
              Study Planner <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        }
      />

      <div className="edc-main" data-active-tab={activeTab}>
        <div className="edc-main-header">
          <div>
            <span className="edc-breadcrumb">
              {activeTab === "overview" ? "STUDENT DASHBOARD" : currentTab?.label?.toUpperCase()}
            </span>
            <h2>{currentTab?.label}</h2>
            {activeTab === "overview" && <p className="edc-page-description">Track your learning, progress, and recommendations.</p>}
          </div>
        </div>
{activeTab === "overview" && Overview()}
{activeTab === "learning" && Learning()}
          {activeTab === "appeals" && <UserModerationAppeals email={email} name={studentProfile.fullName || studentProfile.name || "Student"} role="Student" />}
          {activeTab === "help-support" && <UserSupportCenter email={email} name={studentProfile.fullName || studentProfile.name || "Student"} role="Student" />}
          {activeTab === "reviews" && <CourseReviews role="student" email={email} studentName={studentProfile.fullName || profileDisplayName} courses={enrolledCourses} publishedCourses={latestPublishedCourses} onNavigate={navigateTo} />}
          {activeTab === "discussions" && <CourseDiscussions role="student" email={email} studentName={studentProfile.fullName || profileDisplayName} studentAvatar={studentProfile.avatar || ""} courses={enrolledCourses} publishedCourses={latestPublishedCourses} onNavigate={navigateTo} onExplore={() => navigate("/courses")} />}
          {activeTab === "notes" && <CourseNotes email={email} courses={enrolledCourses} publishedCourses={latestPublishedCourses} onNavigate={navigateTo} onJump={jumpToNote} />}
          {activeTab === "analytics" && <LearningAnalytics courses={enrolledCourses} activity={learningActivity} serverAnalytics={serverStudentAnalytics} />}
          {activeTab === "quizzes" && <CourseQuizzes role="student" email={email} courses={enrolledCourses} publishedCourses={latestPublishedCourses} onNavigate={navigateTo}
            quizRouteId={quizRouteId} quizCourseId={quizRouteCourseId} quizTeacherEmail={quizRouteTeacher}
            quizView={new URLSearchParams(location.search).get("view") || ""}
            onStartQuiz={(quiz, view = "attempt") => {
              setActiveTab("quizzes");
              navigate(`/student/dashboard/quiz/${encodeURIComponent(quiz.id)}?course=${encodeURIComponent(quiz.courseId)}&teacher=${encodeURIComponent(quiz.teacherEmail || "")}${view === "result" ? "&view=result" : ""}`);
            }}
            onBackToQuizzes={() => navigateTo("quizzes")} />}
          {activeTab === "course-assignments" && <CourseAssignments role="student" email={email} courses={enrolledCourses} publishedCourses={latestPublishedCourses} onNavigate={navigateTo} />}
          {activeTab === "learning-paths" && <LearningPaths email={email} courses={enrolledCourses} publishedCourses={latestPublishedCourses} onNavigate={navigateTo} onOpenCourse={courseId => { openCoursePlayer(courseId); navigateTo("player"); }} />}
          {activeTab === "curriculum" && <CurriculumBuilder role="student" email={email} courses={enrolledCourses} publishedCourses={latestPublishedCourses} onNavigate={navigateTo}
            onOpenQuiz={quiz => { setActiveTab("quizzes"); navigate(`/student/dashboard/quiz/${encodeURIComponent(quiz.id)}?course=${encodeURIComponent(quiz.courseId)}&teacher=${encodeURIComponent(quiz.teacherEmail || "")}`); }}
            onOpenLesson={(courseId,index)=>{openCoursePlayer(courseId);setPlayerLessonIndex(Math.max(0,index));navigateTo("player")}} />}
        {activeTab === "player" && LearningPlayer()}
          {activeTab === "planner" && <StudentStudyPlanner
            email={email}
            courses={enrolledCourses}
            publishedCourses={latestPublishedCourses}
            activity={learningActivity}
            dailyGoals={dailyGoals}
            newGoal={newGoal}
            setNewGoal={setNewGoal}
            onAddGoal={addGoal}
            onToggleGoal={toggleGoal}
            onDeleteGoal={(id) => setDailyGoals((previous) => previous.filter((goal) => goal.id !== id))}
            onNavigate={navigateTo}
          />}

        {activeTab === "assignments" && <CourseAssignments
          role="student"
          email={email}
          courses={enrolledCourses}
          publishedCourses={latestPublishedCourses}
          onNavigate={navigateTo}
          dashboardLayout
        />}
        {activeTab === "assignments-demo-disabled" && (
          <div className="edc-tab-content edc-academic-page">
            <SectionHeading eyebrow="ACADEMIC WORKSPACE" title="Assignments & Grades"
              description="Submit demo assignments, attempt quizzes and review results." />

            <div className="edc-stats">
              {[
                { label: "Assignments", value: availableAssignments.length, icon: ClipboardList, color: "purple" },
                { label: "Submitted", value: submittedCount, icon: CheckCircle2, color: "green" },
                { label: "Pending", value: availableAssignments.length - submittedCount, icon: Clock3, color: "pink" },
                { label: "Average Quiz Score", value: averageQuizScore === null ? "â€”" : `${averageQuizScore}%`, icon: Award, color: "blue" },
              ].map((stat) => {
                const Icon = stat.icon;
                return (
                  <button
                    type="button"
                    className="edc-stat-card edc-academic-stat-card"
                    key={stat.label}
                    onClick={() => navigate(`/student/dashboard/academic/${{
                      Assignments: "assignments",
                      Submitted: "submitted",
                      Pending: "pending",
                      "Average Quiz Score": "quiz-scores",
                    }[stat.label]}`)}
                  >
                    <div className={`edc-stat-icon edc-stat-${stat.color}`}><Icon size={21} /></div>
                    <span>{stat.label}</span><strong>{stat.value}</strong>
                  </button>
                );
              })}
            </div>

            <div className="edc-academic-tabs">
              {[
                ["assignments", "Assignments", ClipboardList],
                ["quizzes", "Quizzes", BookOpen],
                ["grades", "Grades & Results", Award],
                ["feedback", "Teacher Feedback", Users],
              ].map(([id, label, Icon]) => (
                <button type="button" key={id}
                  className={`edc-academic-tab ${academicTab === id ? "edc-academic-tab-active" : ""}`}
                  onClick={() => { setAcademicTab(id); setSelectedAssignment(null); setSelectedQuiz(null); setAcademicMessage(""); }}>
                  <Icon size={17} /> {label}
                </button>
              ))}
            </div>

            {academicMessage && <div className="edc-academic-message" role="status">{academicMessage}</div>}

            {academicTab === "assignments" && (
              <div className="edc-panel">
                {selectedAssignment ? (
                  <div className="edc-assignment-detail">
                    <button type="button" className="edc-text-btn"
                      onClick={() => { setSelectedAssignment(null); setAcademicMessage(""); }}>
                      â† Back to Assignments
                    </button>
                    {DEMO_ASSIGNMENTS.filter((task) => task.id === selectedAssignment).map((task) => (
                      <div key={task.id}>
                        <span className="edc-category">{COURSES.find((course) => course.id === task.courseId)?.title}</span>
                        <h2>{task.title}</h2><p>{task.description}</p>
                        <p><strong>Maximum Points:</strong> {task.points}</p>
                        <form onSubmit={submitAssignment}>
                          <label htmlFor="edc-assignment-answer">Your Assignment Answer</label>
                          <textarea id="edc-assignment-answer" rows={9} maxLength={10000}
                            value={assignmentAnswer} onChange={(event) => setAssignmentAnswer(event.target.value)}
                            placeholder="Write your assignment here..." />
                          <div className="edc-assignment-form-bottom">
                            <span>{assignmentAnswer.length} / 10000 characters</span>
                            <button type="submit" className="edc-btn edc-btn-primary"><CheckCircle2 size={16} /> Save Demo Submission</button>
                          </div>
                        </form>
                        {submissions[task.id] && <p className="edc-academic-message">
                          Last saved: {new Date(submissions[task.id].submittedAt).toLocaleString()}
                        </p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <SectionHeading eyebrow="COURSEWORK" title="My Assignments"
                      description="Enroll in a demo course to see its practice assignment." />
                    <div className="edc-search"><Search size={18} />
                      <input value={academicSearch} onChange={(event) => setAcademicSearch(event.target.value)}
                        placeholder="Search assignments..." />
                    </div>
                    <div className="edc-academic-grid">
                      {availableAssignments.filter((task) =>
                        `${task.title} ${COURSES.find((course) => course.id === task.courseId)?.title || ""}`
                          .toLowerCase().includes(academicSearch.toLowerCase())
                      ).map((task) => (
                        <article className="edc-academic-card" key={task.id}>
                          <span className="edc-category">{COURSES.find((course) => course.id === task.courseId)?.title}</span>
                          <h3>{task.title}</h3><p>{task.description}</p>
                          <div className="edc-academic-card-bottom">
                            <span>{task.points} points</span>
                            <span className={`edc-academic-status ${submissions[task.id] ? "edc-academic-submitted" : "edc-academic-pending"}`}>
                              {submissions[task.id] ? "Submitted" : "Pending"}
                            </span>
                          </div>
                          <button type="button" className="edc-btn edc-btn-primary" onClick={() => openAssignment(task)}>
                            {submissions[task.id] ? "View Submission" : "Open Assignment"} <ArrowRight size={16} />
                          </button>
                        </article>
                      ))}
                    </div>
                    {availableAssignments.length === 0 && <EmptyState icon={ClipboardList}
                      title="No assignments available" description="Enroll in a demo course from My Learning first." />}
                    {availableAssignments.length > 0 && !availableAssignments.some((task) =>
                      `${task.title} ${COURSES.find((course) => course.id === task.courseId)?.title || ""}`
                        .toLowerCase().includes(academicSearch.toLowerCase())
                    ) && <EmptyState icon={Search} title="No matching assignments" description="Try another search term." />}
                  </>
                )}
              </div>
            )}

            {academicTab === "quizzes" && (
              <div className="edc-panel">
                {selectedQuiz ? (
                  <div className="edc-quiz-area">
                    <button type="button" className="edc-text-btn" onClick={() => { setSelectedQuiz(null); setAcademicMessage(""); }}>
                      â† Back to Quizzes
                    </button>
                    {DEMO_QUIZZES.filter((quiz) => quiz.id === selectedQuiz).map((quiz) => (
                      <form key={quiz.id} onSubmit={submitQuiz}>
                        <h2>{quiz.title}</h2><p>Answer all questions to see your practice score.</p>
                        {quiz.questions.map((question, index) => (
                          <fieldset className="edc-quiz-question" key={index}>
                            <legend>{index + 1}. {question.question}</legend>
                            {question.options.map((option, optionIndex) => (
                              <label className="edc-quiz-option" key={optionIndex}>
                                <input type="radio" name={`academic-question-${index}`}
                                  checked={quizAnswers[index] === optionIndex}
                                  onChange={() => setQuizAnswers((previous) => ({ ...previous, [index]: optionIndex }))} />
                                <span>{option}</span>
                              </label>
                            ))}
                          </fieldset>
                        ))}
                        <button type="submit" className="edc-btn edc-btn-primary"><CheckCircle2 size={16} /> Submit Quiz</button>
                      </form>
                    ))}
                  </div>
                ) : (
                  <>
                    <SectionHeading eyebrow="PRACTICE" title="Practice Quizzes" description="Complete sample multiple-choice quizzes." />
                    <div className="edc-academic-grid">
                      {availableQuizzes.map((quiz) => (
                        <article className="edc-academic-card" key={quiz.id}>
                          <span className="edc-category">{COURSES.find((course) => course.id === quiz.courseId)?.title}</span>
                          <h3>{quiz.title}</h3><p>{quiz.questions.length} questions</p>
                          {quizResults[quiz.id] && <p className="edc-academic-score">Previous score: {quizResults[quiz.id].percentage}%</p>}
                          <button type="button" className="edc-btn edc-btn-primary" onClick={() => startQuiz(quiz.id)}>
                            <Play size={16} /> {quizResults[quiz.id] ? "Retake Quiz" : "Start Quiz"}
                          </button>
                        </article>
                      ))}
                    </div>
                    {availableQuizzes.length === 0 && <EmptyState icon={BookOpen}
                      title="No quizzes available" description="Enroll in a demo course to unlock its quiz." />}
                  </>
                )}
              </div>
            )}

            {academicTab === "grades" && (
              <div className="edc-panel">
                <SectionHeading eyebrow="PERFORMANCE" title="Grades & Results"
                  description="Practice quiz scores are automatic. Assignments await real teacher grading." />
                <div className="edc-academic-results">
                  {availableQuizzes.map((quiz) => (
                    <div className="edc-academic-result" key={quiz.id}>
                      <div><strong>{quiz.title}</strong><p>{COURSES.find((course) => course.id === quiz.courseId)?.title} Â· Quiz</p></div>
                      <span className="edc-academic-status">{quizResults[quiz.id] ? `${quizResults[quiz.id].percentage}%` : "Not Attempted"}</span>
                    </div>
                  ))}
                  {availableAssignments.map((task) => (
                    <div className="edc-academic-result" key={task.id}>
                      <div><strong>{task.title}</strong><p>{COURSES.find((course) => course.id === task.courseId)?.title} Â· Assignment</p></div>
                      <span className="edc-academic-status">{submissions[task.id] ? "Submitted Â· Not Graded" : "Pending"}</span>
                    </div>
                  ))}
                  {availableAssignments.length === 0 && availableQuizzes.length === 0 &&
                    <EmptyState icon={Award} title="No results yet" description="Enroll in a demo course first." />}
                </div>
              </div>
            )}

            {academicTab === "feedback" && (
              <div className="edc-panel">
                <div className="edc-academic-feedback">
                  <div className="edc-feature-large-icon"><Users size={36} /></div>
                  <h2>Teacher Feedback</h2>
                  <p>Teacher comments, assignment grades and suggestions will appear here after backend integration.</p>
                  <span className="edc-status-pill"><Clock3 size={15} /> Backend Integration Pending</span>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "mastery" && <StudentTopicMastery email={email}
          courses={enrolledCourses} publishedCourses={latestPublishedCourses}
          onNavigate={navigateTo} onOpenQuiz={openStudentQuiz} />}

        {activeTab === "ai" && <div className="edc-tab-content edc-ai-page"><SectionHeading eyebrow="PERSONALIZED LEARNING" title="AI Learning Help" description="Ask education-level questions, get guided explanations, and discover relevant materials." /><div className="edc-ai-notice"><Bot size={20} /><span><strong>AI integration pending.</strong> No AI service is connected, so this page does not generate answers. Browse published books and courses or send a help request to Admin from a teacher profile.</span></div><button type="button" className="edc-btn edc-btn-light" onClick={() => navigateTo("books")}>Browse Books & Teachers <ArrowRight size={16} /></button></div>}
        {activeTab === "ai-demo-disabled" && (
          <div className="edc-tab-content edc-ai-page">
            <SectionHeading
              eyebrow="PERSONALIZED LEARNING"
              title="Personal AI Tutor"
              description="Explore study tools in demo mode. Real AI answers require backend integration."
            />
            <div className="edc-ai-notice">
              <Bot size={20} />
              <span><strong>Frontend Demo:</strong> The replies below are fixed study templates, not real AI answers. Do not enter passwords or private information.</span>
            </div>
            <div className="edc-ai-layout">
              <aside className="edc-panel edc-ai-tools">
                <h3>Learning Modes</h3>
                <p className="edc-muted">Choose how you want to study.</p>
                <div className="edc-ai-mode-list">
                  {AI_MODES.map((mode) => (
                    <button key={mode} type="button"
                      className={`edc-ai-mode ${aiMode === mode ? "edc-ai-mode-active" : ""}`}
                      onClick={() => setAiMode(mode)}>
                      <Sparkles size={16} /> {mode}
                    </button>
                  ))}
                </div>
                <h3>Try a Topic</h3>
                <div className="edc-ai-prompts">
                  {["React components", "Python functions", "UI/UX wireframes"].map((topic) => (
                    <button type="button" key={topic} onClick={() => setAiInput(topic)}>
                      {topic} <ArrowRight size={14} />
                    </button>
                  ))}
                </div>
                <button type="button" className="edc-btn edc-btn-light edc-ai-clear"
                  onClick={clearAiHistory} disabled={aiHistory.length === 0}>
                  <Trash2 size={16} /> Clear Chat History
                </button>
              </aside>
              <section className="edc-panel edc-ai-chat" aria-label="Tutor chat demo">
                <div className="edc-ai-chat-header">
                  <div className="edc-ai-chat-heading"><span className="edc-ai-bot-icon"><Bot size={20} /></span>
                    <div><strong>EduConnect Study Assistant</strong><small>Demo Mode Â· {aiMode}</small></div>
                  </div>
                  <span className="edc-status-pill">Template replies</span>
                </div>
                <div className="edc-ai-messages" aria-live="polite">
                  {aiHistory.length === 0 ? (
                    <div className="edc-ai-welcome">
                      <Bot size={40} />
                      <h3>What would you like to study?</h3>
                      <p>Select a learning mode, enter a topic, and get a sample study template.</p>
                    </div>
                  ) : aiHistory.map((message) => (
                    <div key={message.id} className={`edc-ai-message ${message.role === "user" ? "edc-ai-user" : "edc-ai-demo"}`}>
                      <span>{message.role === "user" ? "You" : "Demo Study Guide"}</span>
                      <p>{message.text}</p>
                    </div>
                  ))}
                </div>
                <form className="edc-ai-compose" onSubmit={sendAiMessage}>
                  <label htmlFor="edc-ai-input">Your study topic or question</label>
                  <div className="edc-ai-input-row">
                    <input id="edc-ai-input" value={aiInput}
                      onChange={(event) => setAiInput(event.target.value)}
                      placeholder="e.g. Explain React components" maxLength={500} />
                    <button type="submit" className="edc-btn edc-btn-primary" disabled={!aiInput.trim()}>
                      Send <ArrowRight size={16} />
                    </button>
                  </div>
                </form>
              </section>
            </div>
          </div>
        )}

        {activeTab === "tutors-demo-disabled" && (
          <div className="edc-tab-content edc-tutors-page">
            <SectionHeading eyebrow="PERSONAL LEARNING SUPPORT" title="Hire a Personal Tutor"
              description="Browse fictional tutor profiles and try a sample booking workflow." />
            <div className="edc-tutor-warning"><Users size={20} />
              <span><strong>Frontend Demo:</strong> Profiles, ratings, availability, and bookings are fictional. No teacher is contacted, no payment is taken, and no live class is created.</span>
            </div>
            <div className="edc-tutor-tabs">
              <button type="button" className={tutorTab === "find" ? "edc-tutor-tab active" : "edc-tutor-tab"}
                onClick={() => { setTutorTab("find"); setTutorNotice(""); }}><Search size={17} /> Find Tutors</button>
              <button type="button" className={tutorTab === "sessions" ? "edc-tutor-tab active" : "edc-tutor-tab"}
                onClick={() => { setTutorTab("sessions"); setBookingTutorId(null); }}><CalendarDays size={17} /> My Sessions ({tutorBookings.filter((item) => item.status !== "Cancelled").length})</button>
            </div>
            {tutorNotice && <div className="edc-tutor-notice" role="status">{tutorNotice}</div>}
            {tutorTab === "find" && (
              <>
                <div className="edc-panel edc-tutor-filters">
                  <label><span>Search Tutors</span><div className="edc-search"><Search size={17} />
                    <input value={tutorSearch} onChange={(event) => setTutorSearch(event.target.value)} placeholder="Name, subject or level..." />
                  </div></label>
                  <label><span>Subject</span><select value={tutorSubject} onChange={(event) => setTutorSubject(event.target.value)}>
                    {["All Subjects", ...DEMO_TUTORS.map((tutor) => tutor.subject)].map((subject) => <option key={subject}>{subject}</option>)}
                  </select></label>
                </div>
                <div className="edc-tutor-grid">
                  {matchingTutors.map((tutor) => (
                    <article className="edc-panel edc-tutor-card" key={tutor.id}>
                      <div className="edc-tutor-profile"><div className="edc-tutor-avatar">{tutor.initials}</div>
                        <div><h3>{tutor.name}</h3><p>{tutor.subject}</p><span className="edc-tutor-demo-label">Fictional demo profile</span></div>
                      </div>
                      <p>{tutor.about}</p>
                      <div className="edc-tutor-meta"><span><Star size={15} /> {tutor.rating} sample rating</span><span><GraduationCap size={15} /> {tutor.level}</span><span><Clock3 size={15} /> {tutor.experience}</span></div>
                      <div className="edc-tutor-slots"><strong>Sample time slots</strong><div>{tutor.slots.map((slot) => <span key={slot}>{slot}</span>)}</div></div>
                      <button type="button" className="edc-btn edc-btn-primary" onClick={() => {
                        setBookingTutorId(tutor.id); setBookingSlot(""); setBookingNote(""); setTutorNotice("");
                      }}><CalendarDays size={16} /> Request Demo Session</button>
                    </article>
                  ))}
                </div>
                {matchingTutors.length === 0 && <EmptyState icon={Search} title="No matching demo tutors" description="Try a different name or subject." />}
                {bookingTutor && (
                  <div className="edc-tutor-modal-backdrop" onClick={() => setBookingTutorId(null)}>
                    <section className="edc-tutor-modal" role="dialog" aria-modal="true" aria-label="Request demo session" onClick={(event) => event.stopPropagation()}>
                      <div className="edc-tutor-modal-heading"><div><span className="edc-eyebrow">DEMO BOOKING</span><h3>Session with {bookingTutor.name}</h3></div>
                        <button type="button" className="edc-icon-btn" aria-label="Close" onClick={() => setBookingTutorId(null)}><X size={20} /></button>
                      </div>
                      <p>Choose a sample slot. These are not real calendar dates or confirmed appointments.</p>
                      <form onSubmit={saveTutorBooking} className="edc-tutor-booking-form">
                        <label>Available demo slot<select required value={bookingSlot} onChange={(event) => setBookingSlot(event.target.value)}>
                          <option value="">Select a slot</option>{bookingTutor.slots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
                        </select></label>
                        <label>What would you like help with? (optional)<textarea rows={4} maxLength={300} value={bookingNote}
                          onChange={(event) => setBookingNote(event.target.value)} placeholder="e.g. React components" /></label>
                        <button type="submit" className="edc-btn edc-btn-primary"><CheckCircle2 size={16} /> Save Demo Request</button>
                      </form>
                    </section>
                  </div>
                )}
              </>
            )}
            {tutorTab === "sessions" && (
              <div className="edc-panel"><SectionHeading eyebrow="YOUR REQUESTS" title="My Demo Sessions"
                description="Requests are stored locally in this browser and are not real appointments." />
                {tutorBookings.length ? <div className="edc-tutor-session-list">{[...tutorBookings].reverse().map((booking) => {
                  const tutor = DEMO_TUTORS.find((item) => item.id === booking.tutorId);
                  return <article key={booking.id} className="edc-tutor-session">
                    <div><strong>{tutor?.name || "Demo Tutor"}</strong><p>{tutor?.subject || "Subject"} Â· {booking.slot}</p>
                      {booking.note && <p>Study topic: {booking.note}</p>}
                      <small>Requested: {new Date(booking.createdAt).toLocaleString()}</small></div>
                    <div className="edc-tutor-session-actions"><span className="edc-tutor-demo-label">{booking.status}</span>
                      {booking.status !== "Cancelled" && <button type="button" className="edc-btn edc-btn-light"
                        onClick={() => cancelTutorBooking(booking.id)}>Cancel Request</button>}</div>
                  </article>;
                })}</div> : <EmptyState icon={CalendarDays} title="No demo sessions yet" description="Find a tutor and save a sample session request." />}
              </div>
            )}
          </div>
        )}

        {activeTab === "profile" && StudentProfile()}
        {activeTab === "wishlist" && Wishlist()}
        {activeTab === "cart" && ShoppingCartPage()}
        {activeTab === "orders" && OrdersPage()}
        {activeTab === "ebooks" && MyEbooksPage()}
        {activeTab === "books" && <div className="edc-tab-content"><SectionHeading eyebrow="LIBRARY & DIRECTORY" title="Books & Teachers" description="Search approved PDF/eBooks and real registered teacher profiles." /><BookTeacherHub email={email} profile={studentProfile} courses={latestPublishedCourses} cart={cart} purchasedBooks={bookPurchases} savedBookIds={savedBookIds} onToggleSavedBook={toggleSavedBook} onAddBookToCart={(book) => { addBookToCart(book); navigateTo("cart"); }} onOpenEbooks={() => navigateTo("ebooks")} /></div>}
        {activeTab === "tutors" && <div className="edc-tab-content"><SectionHeading eyebrow="TEACHER DIRECTORY" title="Find Teachers" description="Browse registered teacher profiles and request Admin help when they are unavailable." /><BookTeacherHub email={email} profile={studentProfile} courses={latestPublishedCourses} cart={cart} purchasedBooks={bookPurchases} savedBookIds={savedBookIds} onToggleSavedBook={toggleSavedBook} defaultTab="teachers" onAddBookToCart={addBookToCart} onOpenEbooks={() => navigateTo("ebooks")} /></div>}
        {activeTab === "notifications" && <NotificationsCenter notifications={notifications}
          onRead={markNotificationRead} onReadAll={markAllNotificationsRead}
          onDelete={deleteNotification} onNavigate={navigateTo} />}
{activeTab === "portfolio" && Portfolio()}
        {activeTab === "research" && (
          researchView === "overview" ? (
            <div className="edc-tab-content edc-research-page edc-research-dashboard">
              <header className="edc-research-hero">
                <div>
                  <span className="edc-research-eyebrow">YOUR RESEARCH, ORGANIZED</span>
                  <h1><Microscope size={27} />Research Workspace</h1>
                  <p>Plan and organize your own projects, sources, notes, datasets, and experiments.</p>
                  <small>Your records are private to your account, synchronized to MongoDB when available, and kept in this browser as a fallback.</small>
                </div>
                <div className="edc-research-hero-art" aria-hidden="true"><BookOpen /><Microscope /><NotebookPen /></div>
              </header>

              <section className="edc-research-overview" aria-label="Research record summary">
                {[
                  { label: "Research Projects", value: projectResearchItems.length, color: "purple", icon: BookOpen, tab: "projects" },
                  { label: "Research Papers", value: (researchRecords.papers || []).length, color: "blue", icon: BookText, tab: "papers" },
                  { label: "Literature Notes", value: (researchRecords.matrix || []).length, color: "green", icon: NotebookPen, tab: "matrix" },
                  { label: "References", value: (researchRecords.references || []).length, color: "violet", icon: NotebookPen, tab: "references" },
                ].map(({ label, value, color, icon: Icon, tab }) => <button key={label} type="button"
                  className={`edc-research-count edc-research-count-button ${color}`} onClick={() => switchResearchTab(tab)}
                  aria-label={`${label}: ${value}. Open related records`}>
                  <span className="edc-research-count-icon"><Icon size={20} /></span><span className="edc-research-count-copy"><small>{label}</small><strong>{value.toLocaleString()}</strong></span>
                </button>)}
              </section>

              <section className="edc-research-quick-actions" aria-label="Add research records">
                {[
                  { label: "New Research Project", icon: Plus, tab: "projects", primary: true },
                  { label: "Add Paper", icon: BookText, tab: "papers" },
                  { label: "Write Literature Note", icon: NotebookPen, tab: "matrix" },
                  { label: "Add Reference", icon: ClipboardList, tab: "references" },
                  { label: "Add Dataset", icon: Database, tab: "datasets" },
                  { label: "Track Experiment", icon: Microscope, tab: "experiments" },
                ].map(({ label, icon: Icon, tab, primary }) => <button key={tab} type="button"
                  className={primary ? "edc-research-quick-primary" : ""} onClick={() => switchResearchTab(tab)}>
                  <Icon size={18} /><span>{label}</span>
                </button>)}
              </section>

              <div className="edc-research-home-grid">
                <section className="edc-research-home-panel edc-research-projects-panel">
                  <header className="edc-research-home-heading">
                    <div><h2><BookOpen size={19} />My Research Projects ({projectResearchItems.length})</h2><p>Only projects you have saved are shown here.</p></div>
                    <button type="button" onClick={() => switchResearchTab("projects")}>View All <ArrowRight size={14} /></button>
                  </header>
                  <div className="edc-research-project-toolbar">
                    <label className="edc-research-search"><Search size={16} /><input type="search" aria-label="Search your research projects"
                      placeholder="Search projects..." value={researchDashboardSearch}
                      onChange={(event) => setResearchDashboardSearch(event.target.value)} /></label>
                    <select aria-label="Filter research projects by status" value={researchProjectStatus}
                      onChange={(event) => setResearchProjectStatus(event.target.value)}>
                      {["All Projects", "Planning", "In Progress", "Completed"].map((status) => <option key={status}>{status}</option>)}
                    </select>
                  </div>
                  {filteredProjectResearchItems.length ? <div className="edc-research-project-grid">
                    {filteredProjectResearchItems.slice(0, 4).map((project) => <button type="button" key={project.id}
                      className="edc-research-project-card" onClick={() => switchResearchTab("projects")}>
                      <span className="edc-research-project-icon"><BookOpen size={20} /></span>
                      <span className="edc-research-project-content">
                        <strong>{project.title}</strong>
                        <small className={`edc-research-status ${String(project.status || "").toLowerCase().replace(/\s+/g, "-")}`}>{project.status || "Status not set"}</small>
                        <span>{project.question || project.notes || "No project summary added yet."}</span>
                        <small className="edc-research-project-date"><CalendarDays size={12} />{project.updatedAt ? `Updated ${new Date(project.updatedAt).toLocaleDateString()}` : "Date not recorded"}</small>
                      </span>
                      <ArrowRight size={14} className="edc-research-project-arrow" />
                    </button>)}
                  </div> : <EmptyState icon={BookOpen}
                    title={researchDashboardSearch || researchProjectStatus !== "All Projects" ? "No matching projects" : "No research projects yet"}
                    description={researchDashboardSearch || researchProjectStatus !== "All Projects" ? "Try another search or status filter." : "Create a project to start organizing your own research."} />}
                  <p className="edc-research-disclaimer">Projects, papers, and other entries are saved in your browser and are not independently verified.</p>
                </section>

                <section className="edc-research-home-panel edc-research-recent-panel">
                  <header className="edc-research-home-heading">
                    <div><h2><NotebookPen size={19} />Recent Records</h2><p>Your most recently saved research entries.</p></div>
                    <button type="button" onClick={() => switchResearchTab("projects")}>Manage <ArrowRight size={14} /></button>
                  </header>
                  {recentResearchRecords.length ? <div className="edc-research-recent-list">
                    {recentResearchRecords.map((record) => <button key={`${record.sectionId}:${record.id}`} type="button"
                      onClick={() => switchResearchTab(record.sectionId)}>
                      <span className="edc-research-recent-icon"><BookText size={16} /></span>
                      <span><strong>{record.title}</strong><small>{record.sectionTitle}</small></span>
                      <small>{record.updatedAt ? new Date(record.updatedAt).toLocaleDateString() : "Date not recorded"}</small>
                      <ArrowRight size={14} />
                    </button>)}
                  </div> : <EmptyState icon={NotebookPen} title="No research records yet"
                    description="Records you add to this workspace will appear here." />}
                </section>

                <section className="edc-research-home-panel edc-research-tools-panel">
                  <header className="edc-research-home-heading">
                    <div><h2><Microscope size={19} />Research Tools</h2><p>Open a section to add or manage your own records.</p></div>
                  </header>
                  <div className="edc-research-tool-grid">
                    {[
                      { title: "Literature Review", description: "Save study notes, findings, and research gaps.", icon: NotebookPen, tab: "matrix" },
                      { title: "References", description: "Keep source details and citation notes together.", icon: ClipboardList, tab: "references" },
                      { title: "Datasets", description: "Record dataset sources, links, and formats.", icon: Database, tab: "datasets" },
                      { title: "Experiments", description: "Track your hypotheses, methods, and results.", icon: Microscope, tab: "experiments" },
                    ].map(({ title, description, icon: Icon, tab }) => <button key={tab} type="button" onClick={() => switchResearchTab(tab)}>
                      <span><Icon size={19} /></span><span><strong>{title}</strong><small>{description}</small></span><ChevronRight size={15} />
                    </button>)}
                  </div>
                </section>
              </div>
              <p className="edc-research-storage-note">Research entries are stored in this browser for this student account. They are not synced, uploaded, or automatically verified.</p>
            </div>
          ) : (
            <div className="edc-tab-content edc-research-page edc-research-section-view">
              <button type="button" className="edc-research-back" onClick={showResearchOverview}><ArrowRight size={15} />Back to Research Workspace</button>
              <SectionHeading eyebrow="RESEARCH WORKSPACE" title={currentResearchSection.title}
                description="Manage the research records you have added to this account." />
              <div className="edc-research-tabs" role="tablist" aria-label="Research workspace sections">
                {RESEARCH_SECTIONS.map((section) => <button key={section.id} type="button" role="tab"
                  aria-selected={researchTab === section.id} className={researchTab === section.id ? "active" : ""}
                  onClick={() => switchResearchTab(section.id)}>{section.title}</button>)}
              </div>
              <div className="edc-research-layout">
                <section className="edc-panel edc-research-editor">
                  <h3>{researchEditId ? "Edit" : "Add to"} {currentResearchSection.title}</h3>
                  <p className="edc-research-muted">Add your own information. Content is not checked against external sources.</p>
                  <form onSubmit={saveResearchRecord} className="edc-research-form">
                    {currentResearchSection.fields.map((field) => <label key={field.key}>
                      <span>{field.label}{field.required ? " *" : ""}</span>
                      {field.options ? <select value={researchForm[field.key] ?? field.options[0]}
                        onChange={(event) => setResearchForm((prev) => ({ ...prev, [field.key]: event.target.value }))}>
                        {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select> : field.multiline ? <textarea rows={3} maxLength={3000} value={researchForm[field.key] || ""}
                        onChange={(event) => setResearchForm((prev) => ({ ...prev, [field.key]: event.target.value }))} />
                      : <input type={field.type || "text"} maxLength={500} required={Boolean(field.required)}
                        value={researchForm[field.key] || ""} onChange={(event) => setResearchForm((prev) => ({ ...prev, [field.key]: event.target.value }))} />}
                    </label>)}
                    <label>
                      <span>Linked Course (optional)</span>
                      <select value={researchForm.courseId || ""} onChange={(event) => setResearchForm((prev) => ({ ...prev, courseId: event.target.value }))}>
                        <option value="">No linked course</option>
                        {(Array.isArray(enrolledCourses) ? enrolledCourses : []).map((course) => <option key={course.id} value={String(course.id)}>{course.title || "Untitled course"}</option>)}
                      </select>
                    </label>
                    <div className="edc-research-actions">
                      <button className="edc-btn edc-btn-primary" type="submit"><Plus size={16} /> {researchEditId ? "Update Record" : "Save Record"}</button>
                      {researchEditId && <button type="button" className="edc-btn edc-btn-light" onClick={() => { setResearchEditId(null); setResearchForm({}); setResearchNotice(""); }}>Cancel Edit</button>}
                    </div>
                    {researchNotice && <p role="status" className="edc-research-notice">{researchNotice}</p>}
                  </form>
                </section>
                <section className="edc-panel edc-research-library">
                  <div className="edc-research-library-head"><h3>{currentResearchSection.title} ({researchItems.length})</h3>
                    <label className="edc-research-search"><Search size={17} /><input aria-label={`Search ${currentResearchSection.title}`}
                      placeholder="Search saved records..." value={researchSearch}
                      onChange={(event) => setResearchSearch(event.target.value)} /></label></div>
                  {filteredResearchItems.length ? <div className="edc-research-list">
                    {filteredResearchItems.map((item) => <article key={item.id} className="edc-research-item">
                      <h4>{item.title}</h4>
                      {item.courseTitle && <div className="edc-research-field"><strong>Linked course:</strong> <span>{item.courseTitle}</span></div>}
                      {currentResearchSection.fields.filter((field) => field.key !== "title" && item[field.key]).map((field) => <div key={field.key} className="edc-research-field">
                        <strong>{field.label}:</strong> {field.key === "url" && /^https?:\/\//i.test(item[field.key])
                          ? <a href={item[field.key]} target="_blank" rel="noopener noreferrer">Open link</a> : <span>{item[field.key]}</span>}
                      </div>)}
                      <small>{item.updatedAt ? `Updated ${new Date(item.updatedAt).toLocaleDateString()}` : "Date not recorded"}</small>
                      <div className="edc-research-actions"><button type="button" className="edc-btn edc-btn-light" onClick={() => editResearchRecord(item)}>Edit</button>
                        <button type="button" className="edc-btn edc-btn-light" onClick={() => deleteResearchRecord(item.id)}><Trash2 size={15} /> Delete</button></div>
                    </article>)}
                  </div> : <EmptyState icon={Microscope} title={researchSearch ? "No matching records" : "No records saved yet"}
                    description={researchSearch ? "Try a different search term." : "Use the form to add your first research record."} />}
                </section>
              </div>
              <p className="edc-research-disclaimer">Research records are synchronized to your MongoDB account when available and kept in this browser as a fallback. Content is not externally verified; back up important research elsewhere.</p>
            </div>
          )
        )}

        <div className="edc-footer-note">
          EduConnect AI · Student Workspace
        </div>
      </div>
    </div>
  );
}

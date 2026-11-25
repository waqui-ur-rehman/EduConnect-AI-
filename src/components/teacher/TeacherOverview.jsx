import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Edit3,
  GraduationCap,
  Layers3,
  ListChecks,
  LogOut,
  MessageCircle,
  Plus,
  Star,
  Upload,
  UserRound,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import NotificationsCenter from "../notifications/NotificationsCenter";
import "../notifications/NotificationsCenter.css";
import {
  allSubmissions,
  assignmentKey,
  read,
} from "../assignments/assignmentStorage";
import { readDiscussions } from "../../utils/courseDiscussions";
import {
  discussionAnswered,
  visibleCourseDiscussions,
} from "../../utils/discussionHelpers";
import "./TeacherOverview.css";
import { SidebarTrigger } from "../workspace/WorkspaceSidebar";
import VerifiedBadge from "../verification/VerifiedBadge";

const currency = (value) =>
  `PKR ${Number(value || 0).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;

export function TeacherAvatar({ profile, size = "" }) {
  const [failed, setFailed] = useState("");
  const source = profile.avatar || "";
  const initials = String(profile.name || "Teacher")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  return (
    <span className={`edc-to-avatar ${size}`}>
      {source && failed !== source ? (
        <img src={source} alt="" onError={() => setFailed(source)} />
      ) : (
        <span>{initials.toUpperCase()}</span>
      )}
    </span>
  );
}

export function TeacherWorkspaceHeader({
  profile,
  identityVerified = false,
  unread,
  notifications = [],
  onReadNotification,
  onReadAllNotifications,
  onDeleteNotification,
  onNavigate,
  onLogout,
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  const notificationButton = useRef(null);
  const root = useRef(null);
  useEffect(() => {
    const close = (event) => {
      if (!root.current?.contains(event.target)) {
        setAccountOpen(false);
        setNotificationsOpen(false);
        setShowAllNotifications(false);
      }
    };
    const escape = (event) => {
      if (event.key === "Escape") {
        setAccountOpen(false);
        setNotificationsOpen(false);
        setShowAllNotifications(false);
        if (notificationsOpen) notificationButton.current?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [notificationsOpen]);

  return (
    <header className="edc-to-workspace-header" ref={root}>
      <SidebarTrigger label="teacher" />
      <div className="edc-to-notification-menu">
        <button
          ref={notificationButton}
          type="button"
          className="edc-to-notifications"
          aria-label={`Notifications, ${unread} unread`}
          aria-haspopup="dialog"
          aria-expanded={notificationsOpen}
          aria-controls="edc-to-notification-panel"
          onClick={() => {
            setNotificationsOpen((open) => !open);
            setShowAllNotifications(false);
            setAccountOpen(false);
          }}
        >
          <Bell size={24} />
          {unread > 0 && <span>{unread > 99 ? "99+" : unread}</span>}
        </button>
        {notificationsOpen && (
          <section
            className={`edc-to-notification-panel${showAllNotifications ? " is-showing-all" : ""}`}
            id="edc-to-notification-panel"
            role="dialog"
            aria-label="All teacher notifications"
          >
            <header className="edc-to-notification-heading">
              <div>
                <strong>Notifications</strong>
                <small>{unread ? `${unread} unread` : "You’re all caught up"}</small>
              </div>
              <button type="button" onClick={onReadAllNotifications} disabled={!unread}>
                Mark all as read
              </button>
            </header>
            <div className={`edc-to-notification-list${showAllNotifications ? " is-expanded" : ""}`}>
              <NotificationsCenter
                notifications={showAllNotifications ? notifications : notifications.slice(0, 5)}
                onRead={onReadNotification}
                onReadAll={onReadAllNotifications}
                onDelete={onDeleteNotification}
                onNavigate={(destination) => {
                  setNotificationsOpen(false);
                  setShowAllNotifications(false);
                  onNavigate(destination);
                }}
                audience="teacher"
              />
            </div>
            {notifications.length > 5 && (
              <button
                type="button"
                className="edc-to-notification-all"
                onClick={() => setShowAllNotifications((show) => !show)}
              >
                {showAllNotifications ? "Show fewer notifications" : "See all notifications"}
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            )}
          </section>
        )}
      </div>
      <div className="edc-to-account">
        <button
          type="button"
          className="edc-to-account-toggle"
          aria-expanded={accountOpen}
          aria-label="Teacher account menu"
          onClick={() => {
            setAccountOpen((value) => !value);
            setNotificationsOpen(false);
          }}
        >
          <TeacherAvatar profile={profile} />
          <ChevronDown size={18} />
        </button>
        {accountOpen && (
          <div className="edc-to-account-menu">
            <strong>{profile.name || "Teacher"} {identityVerified && <VerifiedBadge />}</strong>
            <button
              type="button"
              onClick={() => {
                setAccountOpen(false);
                onNavigate("profile");
              }}
            >
              <UserRound size={16} />
              My Profile
            </button>
            <button type="button" onClick={onLogout}>
              <LogOut size={16} />
              Log Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function CourseThumbnail({ course }) {
  const [failed, setFailed] = useState("");
  const source = course.thumbnail || course.image || "";
  return (
    <span className="edc-to-course-thumbnail">
      {source && source !== failed ? (
        <img src={source} alt="" onError={() => setFailed(source)} />
      ) : (
        <BookOpen size={25} />
      )}
    </span>
  );
}

function teachingTasks(email, courses) {
  const tasks = [];
  const owner = String(email).trim().toLowerCase();
  const ownCourses = courses.map((course) => ({
    ...course,
    teacherEmail: owner,
  }));
  const assignments = courses.flatMap((course) =>
    read(assignmentKey(owner, course.id)),
  );
  const assignmentIds = new Set(
    assignments.map((assignment) => String(assignment.id)),
  );
  const latestSubmissions = new Map();
  try {
    for (const submission of allSubmissions()) {
      if (
        String(submission?.teacherEmail || "")
          .trim()
          .toLowerCase() !== owner ||
        !assignmentIds.has(String(submission.assignmentId))
      )
        continue;
      const key = `${submission.studentEmail}:${submission.assignmentId}`;
      const previous = latestSubmissions.get(key);
      if (
        !previous ||
        Date.parse(submission.submittedAt) > Date.parse(previous.submittedAt)
      )
        latestSubmissions.set(key, submission);
    }
  } catch {
    /* Tasks can still include course and question records. */
  }
  const pending = [...latestSubmissions.values()].filter(
    (submission) => !submission.gradedAt,
  ).length;
  const unanswered = visibleCourseDiscussions(
    readDiscussions(),
    ownCourses,
  ).filter((question) => !discussionAnswered(question)).length;
  const drafts = courses.filter(
    (course) => !course.status || course.status === "Draft",
  ).length;
  const approved = courses.filter(
    (course) => course.status === "Approved",
  ).length;
  if (pending)
    tasks.push({
      id: "submissions",
      title: `Review ${pending} student submission${pending === 1 ? "" : "s"}`,
      tab: "course-assignments",
      icon: ClipboardList,
    });
  if (unanswered)
    tasks.push({
      id: "questions",
      title: `Answer ${unanswered} student question${unanswered === 1 ? "" : "s"}`,
      tab: "discussions",
      icon: MessageCircle,
    });
  if (drafts)
    tasks.push({
      id: "drafts",
      title: `Continue ${drafts} draft course${drafts === 1 ? "" : "s"}`,
      tab: "courses",
      icon: Edit3,
    });
  if (approved)
    tasks.push({
      id: "publish",
      title: `Publish ${approved} approved course${approved === 1 ? "" : "s"}`,
      tab: "courses",
      icon: CheckCircle2,
    });
  return tasks;
}

export default function TeacherOverview({
  email,
  profile,
  courses,
  data,
  onNavigate,
  onCreate,
  onEdit,
  onLessons,
}) {
  const [{ period, cutoff }, setEnrollmentPeriod] = useState({
    period: "all",
    cutoff: 0,
  });
  const enrollments = data.flatMap((course) => course.enrollmentRecords);
  const cohort = enrollments.filter(
    (record) => !cutoff || Date.parse(record.enrolledAt) >= cutoff,
  );
  const totalStudents = new Set(enrollments.map((record) => record.email)).size;
  const ratings = data.flatMap((course) => course.ratings);
  const averageRating = ratings.length
    ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
    : null;
  const totalLessons = courses.reduce(
    (sum, course) =>
      sum +
      (Array.isArray(course.lessons)
        ? course.lessons.length
        : Number(course.lessons) || 0),
    0,
  );
  const sales = data.reduce((sum, course) => sum + course.revenue, 0);
  const completed = cohort.filter((record) => record.progress === 100).length;
  const inProgress = cohort.filter(
    (record) => record.progress > 0 && record.progress < 100,
  ).length;
  const notStarted = cohort.length - completed - inProgress;
  const overall = cohort.length
    ? Math.round(
        cohort.reduce((sum, record) => sum + record.progress, 0) /
          cohort.length,
      )
    : 0;
  const percentage = (count) =>
    cohort.length ? Math.round((count / cohort.length) * 100) : 0;
  const completedStop = cohort.length ? (completed / cohort.length) * 100 : 0;
  const activeStop = cohort.length
    ? ((completed + inProgress) / cohort.length) * 100
    : 0;
  const performance = [...data]
    .sort((a, b) => b.students - a.students)
    .slice(0, 6)
    .map((course) => {
      const records = cohort.filter(
        (record) => record.courseId === String(course.id),
      );
      return {
        ...course,
        enrolled: records.length,
        completed: records.filter((record) => record.progress === 100).length,
      };
    });
  const maximum = Math.max(1, ...performance.map((course) => course.enrolled));
  const recent = [...courses]
    .sort(
      (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0),
    )
    .slice(0, 5);
  const courseData = new Map(data.map((course) => [String(course.id), course]));
  const tasks = teachingTasks(email, courses);
  const stats = [
    {
      label: "Total Students",
      value: totalStudents.toLocaleString(),
      icon: Users,
      tab: "students",
    },
    {
      label: "Total Courses",
      value: courses.length.toLocaleString(),
      icon: BookOpen,
      tab: "courses",
      gold: true,
    },
    {
      label: "Total Lessons",
      value: totalLessons.toLocaleString(),
      icon: Layers3,
      tab: "lessons",
    },
    {
      label: "Average Rating",
      value: averageRating === null ? "—" : averageRating.toFixed(1),
      suffix: averageRating === null ? "" : "/5",
      icon: Star,
      tab: "reviews",
      gold: true,
    },
    {
      label: "Recorded Course Sales",
      value: currency(sales),
      icon: Wallet,
      tab: "earnings",
    },
  ];

  return (
    <div className="edc-instructor-overview">
      <div className="edc-to-heading">
        <div>
          <h1>
            Teacher Overview <BookOpen size={28} />
          </h1>
          <p>
            Welcome back, {profile.name || "Teacher"}! Here’s your teaching
            performance and insights.
          </p>
        </div>
        <label className="edc-to-period">
          <CalendarDays size={19} />
          <span className="edc-to-sr-only">Enrollment period</span>
          <select
            value={period}
            onChange={(event) => {
              const value = event.target.value;
              setEnrollmentPeriod({
                period: value,
                cutoff:
                  value === "all" ? 0 : Date.now() - Number(value) * 86400000,
              });
            }}
          >
            <option value="all">All Time</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
          </select>
        </label>
      </div>

      <section className="edc-to-stats" aria-label="Your teaching totals">
        {stats.map(({ label, value, suffix, icon: Icon, tab, gold }) => (
          <button
            type="button"
            className={`edc-to-stat${gold ? " gold" : ""}`}
            key={label}
            onClick={() => onNavigate(tab)}
          >
            <span className="edc-to-stat-icon">
              <Icon size={29} />
            </span>
            <span>
              <span className="edc-to-stat-label">{label}</span>
              <strong>
                {value}
                {suffix && <small>{suffix}</small>}
              </strong>
            </span>
          </button>
        ))}
      </section>

      <div className="edc-to-charts">
        <section className="edc-to-panel edc-to-performance">
          <div className="edc-to-panel-heading">
            <h2>Course Performance</h2>
            <div className="edc-to-chart-key">
              <span>
                <i />
                Enrollments
              </span>
              <span>
                <i className="gold" />
                Completions
              </span>
            </div>
          </div>
          <p className="edc-to-chart-caption">
            {period === "all"
              ? "All saved course enrollments"
              : `Students enrolled in the last ${period} days`}
          </p>
          {performance.length ? (
            <div className="edc-to-bar-chart">
              <div className="edc-to-axis">
                {[maximum, Math.round(maximum / 2), 0].map((value, index) => (
                  <span key={index}>{value}</span>
                ))}
              </div>
              <div className="edc-to-bars">
                {performance.map((course) => (
                  <div className="edc-to-bar-column" key={course.id}>
                    <div className="edc-to-bar-pair">
                      <span
                        style={{
                          height: `${(course.enrolled / maximum) * 100}%`,
                        }}
                        title={`${course.title}: ${course.enrolled} enrollments`}
                      />
                      <span
                        className="gold"
                        style={{
                          height: `${(course.completed / maximum) * 100}%`,
                        }}
                        title={`${course.title}: ${course.completed} completions`}
                      />
                    </div>
                    <span className="edc-to-bar-title" title={course.title}>
                      {course.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="edc-to-empty">
              <GraduationCap size={35} strokeWidth={1.5} />
              <p>Create a course to see its performance here.</p>
            </div>
          )}
        </section>

        <section className="edc-to-panel edc-to-student-progress">
          <div className="edc-to-panel-heading">
            <h2>Students Progress</h2>
          </div>
          <div className="edc-to-progress-content">
            <div
              className="edc-to-donut"
              role="img"
              aria-label={`Average progress ${overall} percent across ${cohort.length} course enrollments`}
              style={{
                "--completed-stop": `${completedStop}%`,
                "--active-stop": `${activeStop}%`,
              }}
            >
              <div>
                <strong>{overall}%</strong>
                <span>Overall</span>
              </div>
            </div>
            <div className="edc-to-progress-key">
              {[
                ["Completed", completed, "complete"],
                ["In Progress", inProgress, "progress"],
                ["Not Started", notStarted, "remaining"],
              ].map(([label, count, tone]) => (
                <div key={label}>
                  <i className={tone} />
                  <span>
                    {label} <strong>({percentage(count)}%)</strong>
                  </span>
                </div>
              ))}
            </div>
          </div>
          {!cohort.length && (
            <p className="edc-to-chart-caption">
              No enrollment records for this period.
            </p>
          )}
        </section>

        <section className="edc-to-panel edc-to-actions-panel">
          <div className="edc-to-panel-heading">
            <h2>
              <Zap size={23} />
              Quick Actions
            </h2>
          </div>
          <div className="edc-to-quick-actions">
            <button type="button" onClick={onCreate}>
              <Plus size={25} />
              <span>Create Course</span>
            </button>
            <button type="button" onClick={() => onNavigate("lessons")}>
              <Upload size={25} />
              <span>Add Lessons</span>
            </button>
            <button type="button" onClick={() => onNavigate("quizzes")}>
              <ListChecks size={25} />
              <span>Create Quiz</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate("course-assignments")}
            >
              <ClipboardList size={25} />
              <span>Create Assignment</span>
            </button>
          </div>
        </section>
      </div>

      <div className="edc-to-bottom-grid">
        <section className="edc-to-panel edc-to-recent">
          <div className="edc-to-panel-heading">
            <h2>My Recent Courses</h2>
            <button
              type="button"
              className="edc-to-text-action"
              onClick={() => onNavigate("courses")}
            >
              View All <ArrowRight size={17} />
            </button>
          </div>
          <div className="edc-to-table-wrap">
            <table className="edc-to-course-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Students</th>
                  <th>Rating</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recent.length ? (
                  recent.map((course) => {
                    const details = courseData.get(String(course.id));
                    return (
                      <tr key={course.id}>
                        <td>
                          <div className="edc-to-course-cell">
                            <CourseThumbnail course={course} />
                            <span>
                              <strong>
                                {course.title || "Untitled course"}
                              </strong>
                              <small>
                                {[
                                  course.category,
                                  `${Array.isArray(course.lessons) ? course.lessons.length : Number(course.lessons) || 0} lessons`,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </small>
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="edc-to-table-students">
                            <Users size={16} />
                            {details?.students || 0}
                          </span>
                        </td>
                        <td>
                          <span className="edc-to-table-rating">
                            <Star
                              size={17}
                              fill={
                                details?.ratings.length
                                  ? "currentColor"
                                  : "none"
                              }
                            />
                            {details?.ratings.length
                              ? details.rating.toFixed(1)
                              : "—"}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`edc-to-course-status ${String(
                              course.status || "Draft",
                            )
                              .toLowerCase()
                              .replaceAll(" ", "-")}`}
                          >
                            {course.status || "Draft"}
                          </span>
                        </td>
                        <td>
                          <div className="edc-to-row-actions">
                            <button
                              type="button"
                              aria-label={`Edit ${course.title}`}
                              onClick={() => onEdit(course)}
                            >
                              <Edit3 size={17} />
                            </button>
                            <button
                              type="button"
                              aria-label={`Manage lessons for ${course.title}`}
                              onClick={() => onLessons(course)}
                            >
                              <ChevronRight size={19} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5}>
                      <div className="edc-to-empty">
                        <BookOpen size={30} />
                        <p>Your saved courses will appear here.</p>
                        <button
                          type="button"
                          className="edc-to-gold-button"
                          onClick={onCreate}
                        >
                          <Plus size={16} />
                          Create Your First Course
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="edc-to-panel edc-to-tasks">
          <div className="edc-to-panel-heading">
            <h2>
              <ClipboardList size={23} />
              To-Do List
            </h2>
          </div>
          {tasks.length ? (
            <div className="edc-to-task-list">
              {tasks.map(({ id, title, tab, icon: Icon }) => (
                <button type="button" key={id} onClick={() => onNavigate(tab)}>
                  <span>
                    <Icon size={19} />
                  </span>
                  <strong>{title}</strong>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <div className="edc-to-empty">
              <CheckCircle2 size={33} />
              <p>You’re up to date.</p>
              <small>No pending course, question or submission tasks.</small>
            </div>
          )}
        </section>
      </div>
      <p className="edc-to-data-note">
        Based on your saved courses, enrollments and reviews in this browser.
        Sales reflect saved checkout records.
      </p>
    </div>
  );
}

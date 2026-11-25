import MongoCourseQuizzes from "./MongoCourseQuizzes";
import { isMongoId, publishTeacherQuiz, removeTeacherQuiz, saveTeacherQuiz } from "../../utils/mongoQuizApi";
import { loadTeacherQuizCourse } from "../../utils/importBrowserQuizzes";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Clock3,
  Edit3,
  Eye,
  Plus,
  Search,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { notifyEnrolledStudents } from "../../utils/demoNotifications";
import "./CourseQuizzes.css";
import "./CourseQuizzesTeacher.css";
import StudentCourseQuizzes from "./StudentCourseQuizzes";

const normalize = (value) => String(value ?? "").trim().toLowerCase();
const quizIdentity = (courseId, quizId) => `${String(courseId)}::${String(quizId)}`;
const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID)
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const emptyQuestion = () => ({
  id: uid(),
  prompt: "",
  options: ["", "", "", ""],
  correct: 0,
});
const initialForm = () => ({
  id: uid(),
  title: "",
  passingScore: 60,
  timeLimit: 0,
  questions: [emptyQuestion()],
  published: false,
});
const sanitizeQuiz = (quiz) => ({
  ...quiz,
  questions: (quiz.questions || []).map((question) => ({
    ...question,
    options: [...(question.options || [])].slice(0, 4),
  })),
});
const formatDate = (value) => {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Date not recorded";
};
const formatMonthKey = (date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
const formatMonth = (date) =>
  date.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
const formatScore = (value) =>
  Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : "—";

function getMonths(count) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - count + index + 1, 1),
    );
    return { key: formatMonthKey(date), label: formatMonth(date) };
  });
}

function AttemptsTrend({ months, attempts }) {
  const values = months.map(({ key }) =>
    attempts.filter((attempt) => String(attempt.submittedAt || "").slice(0, 7) === key).length,
  );
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => ({
    x: 48 + (index * 552) / Math.max(1, values.length - 1),
    y: 170 - (value / max) * 130,
  }));
  const line = points
    .map(({ x, y }, index) => `${index ? "L" : "M"}${x},${y}`)
    .join(" ");
  const area = `${line} L${points[points.length - 1]?.x || 600},180 L${points[0]?.x || 48},180 Z`;

  return (
    <div className="edc-tq-chart">
      <svg viewBox="0 0 640 215" role="img" aria-label="Submitted quiz attempts by month">
        <defs>
          <linearGradient id="edc-tq-attempt-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#7412c7" stopOpacity=".24" />
            <stop offset="100%" stopColor="#7412c7" stopOpacity=".02" />
          </linearGradient>
        </defs>
        {[40, 75, 110, 145, 180].map((y) => (
          <line key={y} x1="48" x2="600" y1={y} y2={y} className="edc-tq-gridline" />
        ))}
        {points.length > 1 && <path d={area} fill="url(#edc-tq-attempt-area)" />}
        {points.length > 1 && <path d={line} className="edc-tq-attempt-line" />}
        {points.map(({ x, y }, index) => (
          <g key={months[index].key}>
            <circle cx={x} cy={y} r="4.5" className="edc-tq-attempt-dot">
              <title>{`${months[index].label}: ${values[index]} submitted attempts`}</title>
            </circle>
            <text x={x} y="207" textAnchor="middle" className="edc-tq-month-label">
              {months[index].label}
            </text>
          </g>
        ))}
      </svg>
      {!values.some((value) => value > 0) && (
        <p className="edc-tq-chart-empty">No submitted attempts in this period.</p>
      )}
    </div>
  );
}

function ScoreDistribution({ scores }) {
  const buckets = [
    { label: "90% and above", color: "#760bc2", count: 0, match: (score) => score >= 90 },
    { label: "70%–89%", color: "#a82ce1", count: 0, match: (score) => score >= 70 && score < 90 },
    { label: "50%–69%", color: "#ffb800", count: 0, match: (score) => score >= 50 && score < 70 },
    { label: "Below 50%", color: "#52bd70", count: 0, match: (score) => score < 50 },
  ];
  scores.forEach((score) => {
    const bucket = buckets.find(({ match }) => match(score));
    if (bucket) bucket.count += 1;
  });
  let stop = 0;
  const gradient = scores.length
    ? `conic-gradient(${buckets.map((bucket) => {
        const start = stop;
        stop += bucket.count / scores.length * 100;
        return `${bucket.color} ${start}% ${stop}%`;
      }).join(", ")})`
    : "#e9e3ef";

  return (
    <div className="edc-tq-score-layout">
      <div className="edc-tq-score-donut" style={{ background: gradient }}>
        <div><strong>{scores.length}</strong><small>latest scores</small></div>
      </div>
      <ul className="edc-tq-score-legend">
        {buckets.map((bucket) => (
          <li key={bucket.label}>
            <i style={{ background: bucket.color }} />
            <span>{bucket.label}</span>
            <strong>{scores.length ? `${Math.round(bucket.count / scores.length * 100)}% (${bucket.count})` : "—"}</strong>
          </li>
        ))}
      </ul>
      {!scores.length && <p className="edc-tq-score-empty">No submitted scores yet.</p>}
    </div>
  );
}

function TeacherQuizzes({ email, courses }) {
  const [records, setRecords] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [courseId, setCourseId] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState(6);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState(null);
  const selected = courses.find((course) => String(course.id) === String(courseId)) || courses[0];
  const selectedId = selected?.id;
  const refresh = useCallback(async () => {
    setLoading(true);
    const validCourses = courses.filter(course => isMongoId(course.id || course._id));
    const settled = await Promise.allSettled(validCourses.map(course => loadTeacherQuizCourse(course, email)));
    const errors = [];
    const next = settled.flatMap((result, index) => {
      const course = validCourses[index];
      if (result.status === "rejected") { errors.push(course.title + ": " + result.reason.message); return []; }
      errors.push(...result.value.warnings);
      return [{ course, ...result.value }];
    });
    setRecords(next);
    setLoading(false);
    if (errors.length) setMessage(errors.join(" "));
    return errors;
  }, [courses, email]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { window.clearTimeout(timer); window.removeEventListener("focus", onFocus); };
  }, [refresh]);
  const allQuizzes = useMemo(() => records.flatMap(({ course, quizzes }) =>
    quizzes.map(quiz => ({ ...quiz, id: String(quiz.id || quiz._id), courseId: String(course.id || course._id), courseTitle: course.title, teacherEmail: email })),
  ), [records, email]);
  const quizzes = allQuizzes.filter(quiz => String(quiz.courseId) === String(selectedId));
  const allAttempts = useMemo(() => records.flatMap(({ attempts = [] }) => attempts.map(attempt => ({ ...attempt, teacherEmail: email }))), [records, email]);
  const enrolledStudents = useMemo(() => new Map(records.map(({ course, students = [] }) => [
    String(course.id || course._id), new Map(students.map(student => [normalize(student.email), { studentEmail: student.email, studentName: student.name }])),
  ])), [records]);
  const quizRows = useMemo(
    () => allQuizzes.map((quiz) => {
      const identity = quizIdentity(quiz.courseId, quiz.id);
      const attempts = allAttempts.filter((attempt) =>
        attempt &&
        quizIdentity(attempt.courseId, attempt.quizId) === identity &&
        normalize(attempt.teacherEmail) === normalize(email),
      );
      const latest = new Map();
      [...attempts]
        .sort((left, right) =>
          (Date.parse(left.submittedAt || "") || 0) - (Date.parse(right.submittedAt || "") || 0),
        )
        .forEach((attempt) => latest.set(normalize(attempt.studentEmail), attempt));
      const scores = [...latest.values()]
        .map((attempt) => Number(attempt.percentage))
        .filter((score) => Number.isFinite(score) && score >= 0 && score <= 100);
      const average = scores.length
        ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length)
        : null;
      const roster = enrolledStudents.get(String(quiz.courseId)) || new Map();
      return { ...quiz, attempts, latest, scores, average, roster };
    }),
    [allAttempts, allQuizzes, email, enrolledStudents],
  );
  const filteredRows = quizRows.filter((row) => {
    if (courseFilter !== "all" && String(row.courseId) !== courseFilter) return false;
    if (statusFilter === "published" && !row.published) return false;
    if (statusFilter === "draft" && row.published) return false;
    const text = `${row.title || ""} ${row.courseTitle || ""}`.toLowerCase();
    return text.includes(search.trim().toLowerCase());
  });
  const publishedCount = quizRows.filter((row) => row.published).length;
  const submittedAttempts = quizRows.flatMap((row) => row.attempts);
  const latestScores = quizRows.flatMap((row) => row.scores);
  const averageScore = latestScores.length
    ? Math.round(latestScores.reduce((total, score) => total + score, 0) / latestScores.length)
    : null;
  const attemptedLearners = new Set(
    quizRows.flatMap((row) => [...row.latest.keys()].filter(Boolean)),
  ).size;
  const quizzesById = new Map(
    quizRows.map((row) => [quizIdentity(row.courseId, row.id), row]),
  );
  const recentAttempts = submittedAttempts
    .map((attempt) => {
      const row = quizzesById.get(quizIdentity(attempt.courseId, attempt.quizId));
      return row ? { ...attempt, quizTitle: row.title, courseTitle: row.courseTitle } : null;
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        (Date.parse(right.submittedAt || "") || 0) -
        (Date.parse(left.submittedAt || "") || 0),
    )
    .slice(0, 5);
  const scores = latestScores;
  const totalQuestions = quizRows.reduce((total, row) => total + row.questions.length, 0);
  const months = getMonths(period);
  const attemptsInPeriod = submittedAttempts.filter((attempt) =>
    months.some(({ key }) => String(attempt.submittedAt || "").slice(0, 7) === key),
  );
  const questionCountByQuiz = quizRows.map((row) => ({
    id: quizIdentity(row.courseId, row.id),
    title: row.title || "Untitled quiz",
    count: row.questions.length,
    courseTitle: row.courseTitle,
  }));

  const updateQuestion = (index, patch) =>
    setEditing((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...patch } : question,
      ),
    }));

  const save = async () => {
    if (!selected || !isMongoId(selected.id || selected._id)) {
      setMessage("Save or import this course in My Courses before adding quizzes.");
      return;
    }
    const title = editing.title.trim();
    if (!title || !editing.questions.length ||
      editing.questions.some((question) =>
        !question.prompt.trim() ||
        question.options.length !== 4 ||
        question.options.some((option) => !option.trim()) ||
        new Set(question.options.map(normalize)).size !== 4 ||
        ![0, 1, 2, 3].includes(Number(question.correct)),
      )) {
      setMessage("Enter a quiz title, a question for each MCQ, four different options, and the correct answer.");
      return;
    }
    const passingScore = Number(editing.passingScore);
    const timeLimit = Number(editing.timeLimit);
    if (!Number.isFinite(passingScore) || passingScore < 0 || passingScore > 100 ||
      !Number.isInteger(timeLimit) || timeLimit < 0 || timeLimit > 180) {
      setMessage("The passing score must be between 0 and 100%, and the timer must be between 0 and 180 minutes.");
      return;
    }
    const record = {
      ...sanitizeQuiz(editing),
      title,
      passingScore,
      timeLimit,
      questions: editing.questions.map((question) => ({
        ...question,
        prompt: question.prompt.trim(),
        options: question.options.map((option) => option.trim()),
        correct: Number(question.correct),
      })),
      teacherEmail: email,
      courseId: selected.id,
      updatedAt: new Date().toISOString(),
    };
    setBusy(true);
    setMessage("");
    try {
      const { quiz } = await saveTeacherQuiz(selected.id || selected._id, record);
      setEditing(null);
      if (record.published) {
        try { await publishTeacherQuiz(selected.id || selected._id, quiz.id || quiz._id, true); }
        catch (error) {
          await refresh();
          setMessage("Quiz saved as a draft. " + error.message);
          return;
        }
      }
      const warnings = await refresh();
      setMessage(["Quiz saved successfully.", ...warnings].join(" "));
    } catch (error) { setMessage(error.message || "Quiz could not be saved. Please try again."); }
    finally { setBusy(false); }
  };

  const startEditing = (quiz) => {
    setCourseId(String(quiz.courseId));
    setEditing(sanitizeQuiz(quiz));
    setMessage("");
  };

  const remove = async (quiz) => {
    if (!window.confirm('Delete "' + quiz.title + '"? Past student attempts will be retained.')) return;
    setBusy(true);
    setMessage("");
    try {
      await removeTeacherQuiz(quiz.courseId, quiz.id);
      const warnings = await refresh();
      setMessage(["Quiz deleted.", ...warnings].join(" "));
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const togglePublish = async (quiz) => {
    const publishing = !quiz.published;
    setBusy(true);
    setMessage("");
    try {
      await publishTeacherQuiz(quiz.courseId, quiz.id, publishing);
      const warnings = await refresh();
      setMessage([publishing ? "Quiz published." : "Quiz unpublished.", ...warnings].join(" "));
      if (publishing) {
        try {
          notifyEnrolledStudents(email, quiz.courseId, {
            id: "quiz-published:" + quiz.id + ":" + Date.now(), type: "quiz", title: "New quiz available",
            message: quiz.title + " is now available in " + (quiz.courseTitle || "your course") + ".", link: "quizzes",
          });
        } catch { /* Publication is already persisted even if a browser notification fails. */ }
      }
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  if (detail) {
    const row = quizzesById.get(quizIdentity(detail.courseId, detail.quizId));
    if (!row) {
      return (
        <div className="edc-quiz-root edc-quiz-detail-page">
          <section className="edc-quiz-panel">
            <button type="button" className="edc-quiz-back" onClick={() => setDetail(null)}>
              Back to Course Quizzes
            </button>
            <p>This quiz record is no longer available.</p>
          </section>
        </div>
      );
    }
    const students = [...row.roster.entries()].map(([student, record]) => ({
      email: record.studentEmail || record.email || student,
      name: record.studentName || record.fullName || record.name || student,
      attempt: row.latest.get(student),
    }));
    const attempted = students.filter((student) => student.attempt);
    const notAttempted = students.filter((student) => !student.attempt);
    const average = attempted.length
      ? Math.round(attempted.reduce((total, student) => total + Number(student.attempt.percentage || 0), 0) / attempted.length)
      : null;
    const rows = detail.panel === "attempted"
      ? attempted
      : detail.panel === "notAttempted"
        ? notAttempted
        : students;
    return (
      <div className="edc-quiz-root edc-quiz-detail-page">
        <section className="edc-quiz-panel">
          <button type="button" className="edc-quiz-back" onClick={() => setDetail(null)}>
            Back to Course Quizzes
          </button>
          <h2>{row.title} · {detail.panel === "total" ? "Enrolled Students" : detail.panel === "attempted" ? "Students Who Attempted" : detail.panel === "notAttempted" ? "Students Who Have Not Attempted" : "Average Score"}</h2>
          {detail.panel === "average" && (
            <p className="edc-quiz-average-summary">
              {average === null ? "No attempts yet" : `${average}% average score`}
              {" "}across {attempted.length} enrolled students who submitted this quiz.
            </p>
          )}
          <div className="edc-quiz-roster">
            {rows.length ? rows.map((student) => (
              <article key={student.email}>
                <div><strong>{student.name}</strong><small>{student.email}</small></div>
                <span className={student.attempt ? "is-attempted" : "is-pending"}>
                  {student.attempt
                    ? `${student.attempt.percentage}% · ${student.attempt.passed ? "Passed" : "Not passed"}`
                    : "Not attempted"}
                </span>
              </article>
            )) : (
              <p>{detail.panel === "notAttempted"
                ? "Every enrolled student has attempted this quiz."
                : detail.panel === "attempted" || detail.panel === "average"
                  ? "No enrolled students have attempted this quiz yet."
                  : "No students are enrolled in this course."}</p>
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <main className="edc-quiz-root edc-quiz-teacher">
      <header className="edc-tq-header">
        <div>
          <span>TEACHER WORKSPACE</span>
          <h1><ClipboardList size={26} /> Course Quizzes</h1>
          <p>Create quizzes and review actual student attempts and scores.</p>
        </div>
        <button
          type="button"
          className="edc-tq-create"
          disabled={!selected || loading || busy}
          onClick={() => {
            setEditing(initialForm());
            setMessage("");
          }}
        >
          <Plus size={18} /> Create New Quiz
        </button>
      </header>

      <p className="edc-tq-notice">
        <CircleAlert size={16} />
        Quizzes and student submissions are saved to your account. Previously saved browser quizzes are transferred automatically; browser originals are kept as a backup.
      </p>

      <section className="edc-tq-stats" aria-label="Quiz summary">
        <article className="purple"><span><ClipboardList size={22} /></span><small>Total Quizzes</small><strong>{quizRows.length}</strong></article>
        <article className="gold"><span><UsersRound size={22} /></span><small>Total Attempts</small><strong>{submittedAttempts.length}</strong></article>
        <article className="purple"><span><BarChart3 size={22} /></span><small>Avg. Score</small><strong>{averageScore === null ? "—" : `${averageScore}%`}</strong></article>
        <article className="gold"><span><UsersRound size={22} /></span><small>Learners Attempted</small><strong>{attemptedLearners}</strong></article>
      </section>

      {message && <p className="edc-quiz-message" role="status">{message}</p>}

      {editing && selected && (
        <section className="edc-quiz-panel edc-tq-editor">
          <header className="edc-tq-editor-heading">
            <div><h2>{quizzes.some((quiz) => quiz.id === editing.id) ? "Edit Quiz" : "New Quiz"}</h2><p>Questions and scores reflect content you enter and student submissions.</p></div>
            <button type="button" aria-label="Close quiz editor" onClick={() => setEditing(null)}><X size={19} /></button>
          </header>
          <label className="edc-quiz-label">Course for this quiz
            <select value={String(selected.id)} onChange={(event) => { setCourseId(event.target.value); setEditing(null); }}>
              {courses.map((course) => <option key={String(course.id)} value={String(course.id)}>{course.title || "Untitled course"}</option>)}
            </select>
          </label>
          <label className="edc-quiz-label">Quiz title
            <input value={editing.title} maxLength={120} onChange={(event) => setEditing((current) => ({ ...current, title: event.target.value }))} placeholder="Enter a quiz title" />
          </label>
          <div className="edc-quiz-two">
            <label className="edc-quiz-label">Passing score (%)
              <input type="number" min="0" max="100" value={editing.passingScore} onChange={(event) => setEditing((current) => ({ ...current, passingScore: event.target.value }))} />
            </label>
            <label className="edc-quiz-label">Time limit (minutes; 0 = none)
              <input type="number" min="0" max="180" value={editing.timeLimit} onChange={(event) => setEditing((current) => ({ ...current, timeLimit: event.target.value }))} />
            </label>
          </div>
          <label className="edc-quiz-checkbox">
            <input type="checkbox" checked={editing.published} onChange={(event) => setEditing((current) => ({ ...current, published: event.target.checked }))} />
            Published (visible to enrolled students)
          </label>
          {editing.questions.map((question, index) => (
            <div className="edc-quiz-question" key={question.id}>
              <div className="edc-quiz-between">
                <strong>Question {index + 1}</strong>
                <button type="button" disabled={editing.questions.length === 1} onClick={() => setEditing((current) => ({ ...current, questions: current.questions.filter((_, questionIndex) => questionIndex !== index) }))}>Remove</button>
              </div>
              <label className="edc-quiz-label">Question text
                <input value={question.prompt} onChange={(event) => updateQuestion(index, { prompt: event.target.value })} placeholder="Write a question" />
              </label>
              {question.options.map((option, optionIndex) => (
                <label className="edc-quiz-label" key={optionIndex}>
                  Option {String.fromCharCode(65 + optionIndex)}
                  <input value={option} onChange={(event) => updateQuestion(index, { options: question.options.map((value, itemIndex) => itemIndex === optionIndex ? event.target.value : value) })} />
                </label>
              ))}
              <label className="edc-quiz-label">Correct answer
                <select value={question.correct} onChange={(event) => updateQuestion(index, { correct: Number(event.target.value) })}>
                  {question.options.map((_, optionIndex) => <option key={optionIndex} value={optionIndex}>Option {String.fromCharCode(65 + optionIndex)}</option>)}
                </select>
              </label>
            </div>
          ))}
          <div className="edc-quiz-actions">
            <button type="button" onClick={() => setEditing((current) => ({ ...current, questions: [...current.questions, emptyQuestion()] }))}>+ Add MCQ</button>
            <button type="button" disabled={busy || loading} className="edc-quiz-primary" onClick={save}>{busy ? "Saving..." : "Save Quiz"}</button>
            <button type="button" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </section>
      )}

      <div className="edc-tq-filter-row">
        <div className="edc-tq-status-tabs" aria-label="Filter quizzes by status">
          {[
            ["all", "All Quizzes", quizRows.length],
            ["published", "Published", publishedCount],
            ["draft", "Draft", quizRows.length - publishedCount],
          ].map(([value, label, count]) => (
            <button type="button" key={value} className={statusFilter === value ? "active" : ""} aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)}>
              {label} <span>({count})</span>
            </button>
          ))}
        </div>
        <label className="edc-tq-course-filter">
          <BookOpen size={16} />
          <select aria-label="Filter quizzes by course" value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
            <option value="all">All Courses</option>
            {courses.map((course) => <option key={String(course.id)} value={String(course.id)}>{course.title || "Untitled course"}</option>)}
          </select>
        </label>
        <label className="edc-tq-search">
          <Search size={16} />
          <input type="search" aria-label="Search quizzes" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search quizzes..." />
        </label>
      </div>

      <div className="edc-tq-main-grid">
        <section className="edc-quiz-panel edc-tq-list-panel">
          <header className="edc-tq-panel-heading">
            <div><h2>Quiz List</h2><p>Saved quizzes for your courses</p></div>
            <span>{filteredRows.length} shown</span>
          </header>
          <div className="edc-tq-table-wrap">
            <table className="edc-tq-table">
              <thead><tr><th>#</th><th>Quiz Title</th><th>Course</th><th>Questions</th><th>Attempts</th><th>Avg. Score</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredRows.map((row, index) => (
                  <tr key={quizIdentity(row.courseId, row.id)}>
                    <td>{index + 1}</td>
                    <td><strong>{row.title || "Untitled quiz"}</strong></td>
                    <td>{row.courseTitle}</td>
                    <td>{row.questions.length}</td>
                    <td>{row.attempts.length}</td>
                    <td>{formatScore(row.average)}</td>
                    <td><span className={`edc-tq-status ${row.published ? "published" : "draft"}`}>{row.published ? "Published" : "Draft"}</span></td>
                    <td>
                      <div className="edc-tq-row-actions">
                        <button type="button" disabled={busy || loading} aria-label={`View ${row.title} attempts`} title="View enrolled students and attempts" onClick={() => setDetail({ quizId: row.id, courseId: row.courseId, panel: "total" })}><Eye size={15} /></button>
                        <button type="button" disabled={busy || loading} aria-label={`Edit ${row.title}`} title="Edit quiz" onClick={() => startEditing(row)}><Edit3 size={15} /></button>
                        <button type="button" disabled={busy || loading} aria-label={`View ${row.title} average score`} title="View latest scores" onClick={() => setDetail({ quizId: row.id, courseId: row.courseId, panel: "average" })}><BarChart3 size={15} /></button>
                        <button type="button" disabled={busy || loading} aria-label={`${row.published ? "Unpublish" : "Publish"} ${row.title}`} title={row.published ? "Unpublish quiz" : "Publish quiz"} onClick={() => togglePublish(row)}>{row.published ? <CheckCircle2 size={15} /> : <Clock3 size={15} />}</button>
                        <button type="button" disabled={busy || loading} aria-label={`Delete ${row.title}`} title="Delete quiz" onClick={() => remove(row)}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredRows.length && (
                  <tr><td colSpan={8} className="edc-tq-empty-cell">
                    {loading ? "Loading saved quizzes..." : quizRows.length
                      ? "No quizzes match these filters."
                      : courses.length
                        ? "No quizzes have been created yet. Create one to see it here."
                        : "Create a course before adding quizzes."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="edc-tq-side">
          <section className="edc-quiz-panel">
            <header className="edc-tq-panel-heading"><h2><ChartNoAxesCombined size={17} /> Quiz Performance</h2></header>
            <ScoreDistribution scores={scores} />
          </section>
          <section className="edc-quiz-panel edc-tq-recent">
            <header className="edc-tq-panel-heading">
              <div><h2><Clock3 size={17} /> Recent Quiz Attempts</h2><p>Latest saved submissions</p></div>
              <span>{submittedAttempts.length}</span>
            </header>
            {recentAttempts.length ? (
              <ul>
                {recentAttempts.map((attempt) => (
                  <li key={attempt.id}>
                    <span className="edc-tq-attempt-avatar">{String(attempt.studentEmail || "?").slice(0, 1).toUpperCase()}</span>
                    <div><strong>{attempt.studentName || attempt.studentEmail || "Student email not recorded"}</strong><small>{attempt.quizTitle} · {attempt.courseTitle}</small><small>{formatDate(attempt.submittedAt)}</small></div>
                    <b>{formatScore(attempt.percentage)}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="edc-tq-empty">No submitted attempts are saved yet.</p>
            )}
          </section>
        </aside>
      </div>

      <div className="edc-tq-bottom-grid">
        <section className="edc-quiz-panel">
          <header className="edc-tq-panel-heading">
            <div><h2><BarChart3 size={17} /> Attempts Trend</h2><p>Saved submissions by date</p></div>
            <label className="edc-tq-period"><CalendarDays size={14} /><select aria-label="Attempt trend period" value={period} onChange={(event) => setPeriod(Number(event.target.value))}><option value={6}>Last 6 Months</option><option value={12}>Last 12 Months</option></select></label>
          </header>
          <AttemptsTrend months={months} attempts={attemptsInPeriod} />
        </section>
        <section className="edc-quiz-panel edc-tq-question-panel">
          <header className="edc-tq-panel-heading"><div><h2><BookOpen size={17} /> Question Inventory</h2><p>Saved quiz questions by format</p></div></header>
          <div className="edc-tq-question-total"><strong>{totalQuestions}</strong><span>Multiple-choice questions</span></div>
          {questionCountByQuiz.length ? (
            <ul>{questionCountByQuiz.map((quiz) => <li key={quiz.id}><span>{quiz.title}</span><small>{quiz.courseTitle}</small><strong>{quiz.count}</strong></li>)}</ul>
          ) : (
            <p className="edc-tq-empty">No quiz question records are available yet.</p>
          )}
          <small className="edc-tq-question-note">The quiz builder currently stores multiple-choice questions only.</small>
        </section>
      </div>

      <p className="edc-tq-foot">
        Attempts and scores are saved to your account. Average scores use each learner’s latest saved attempt per quiz; no sample activity or growth rates are displayed.
      </p>
    </main>
  );
}


export default function CourseQuizzes({
  role,
  email,
  courses = [],
  ...props
}) {
  return role === "teacher" ? (
    <TeacherQuizzes
      key={email}
      email={email}
      courses={courses}
    />
  ) : courses.some(course => isMongoId(course.id || course._id)) ? (
    <MongoCourseQuizzes key={email} role={role} courses={courses} />
  ) : (
    <StudentCourseQuizzes
      key={email}
      email={email}
      courses={courses}
      {...props}
    />
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Hourglass,
  MessageCircle,
  Reply,
  Search,
  Send,
  ThumbsUp,
  Users,
} from "lucide-react";
import {
  courseDiscussionKey,
  makeDiscussionId,
  readDiscussions,
  saveDiscussions,
  subscribeDiscussions,
} from "../../utils/courseDiscussions";
import {
  discussionAnswered,
  discussionName,
  discussionProfile,
  discussionReplies,
  discussionReplyCount,
  filterCourseDiscussions,
  notifyDiscussionReply,
  visibleCourseDiscussions,
} from "../../utils/discussionHelpers";
import ReportAction from "../moderation/ReportAction";
import StudentCourseDiscussions from "./StudentCourseDiscussions";
import "./CourseDiscussions.css";

const formatDate = value => {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "Date unavailable";
};

const formatResponseTime = milliseconds => {
  const hours = milliseconds / (60 * 60 * 1000);
  return hours < 1 ? "Under 1 hour" : `${Math.round(hours * 10) / 10} hours`;
};

function Avatar({ name, image }) {
  const [failed, setFailed] = useState(false);
  const initials = String(name || "Student")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();

  return (
    <span className="edc-qa-avatar">
      {image && !failed ? <img src={image} alt="" onError={() => setFailed(true)} /> : initials}
    </span>
  );
}

function TeacherCourseDiscussions({ email = "", courses = [] }) {
  const user = email.trim().toLowerCase();
  const [items, setItems] = useState(() => readDiscussions());
  const [courseId, setCourseId] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [search, setSearch] = useState("");
  const [replies, setReplies] = useState({});
  const [activeReply, setActiveReply] = useState("");
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const refresh = () => setItems(readDiscussions());
    const unsubscribe = subscribeDiscussions(refresh);
    window.addEventListener("educonnect:moderation-visibility-changed", refresh);
    return () => {
      unsubscribe();
      window.removeEventListener("educonnect:moderation-visibility-changed", refresh);
    };
  }, []);

  const owned = useMemo(
    () => courses.map(course => ({ ...course, teacherEmail: course.teacherEmail || user })),
    [courses, user],
  );
  const eligible = useMemo(
    () => visibleCourseDiscussions(items, owned),
    [items, owned],
  );
  const answeredQuestions = eligible.filter(discussionAnswered);
  const pendingQuestions = eligible.filter(item => !discussionAnswered(item));
  const activeStudents = new Set(
    eligible
      .map(item => String(item.studentEmail || "").trim().toLowerCase())
      .filter(Boolean),
  ).size;
  const questionsByCourse = new Map();
  eligible.forEach(item => questionsByCourse.set(item.courseKey, (questionsByCourse.get(item.courseKey) || 0) + 1));
  const mostActiveCourse = owned
    .map(course => ({ course, count: questionsByCourse.get(courseDiscussionKey(course)) || 0 }))
    .filter(entry => entry.count > 0)
    .sort((left, right) => right.count - left.count)[0];
  const studentQuestions = new Map();
  eligible.forEach(item => {
    const key = String(item.studentEmail || item.studentName || "").trim().toLowerCase();
    if (!key) return;
    const existing = studentQuestions.get(key);
    studentQuestions.set(key, {
      name: discussionName(item.studentEmail, item.studentName),
      count: (existing?.count || 0) + 1,
    });
  });
  const mostActiveStudent = [...studentQuestions.values()].sort((left, right) => right.count - left.count)[0];
  const responseTimes = eligible
    .filter(item => item.reply?.text && item.createdAt && item.reply.createdAt)
    .map(item => new Date(item.reply.createdAt).getTime() - new Date(item.createdAt).getTime())
    .filter(value => Number.isFinite(value) && value >= 0);
  const averageResponseTime = responseTimes.length
    ? responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length
    : null;
  const answerRate = eligible.length
    ? Math.round((answeredQuestions.length / eligible.length) * 100)
    : null;

  const visible = filterCourseDiscussions(eligible, { course: courseId, search, status });
  const sorted = [...visible].sort((left, right) => {
    if (sort === "oldest") return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    if (sort === "replies") return discussionReplyCount(right) - discussionReplyCount(left);
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleQuestions = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedQuestion = pendingQuestions.find(item => item.id === selectedQuestionId) || pendingQuestions[0];

  function chooseStatus(next) {
    setStatus(next);
    setCourseId("all");
    setSearch("");
    setPage(1);
  }

  function updateQuestion(id, transform) {
    const latest = readDiscussions();
    if (!visibleCourseDiscussions(latest, owned).some(item => item.id === id)) {
      setMessage("This question is no longer available.");
      return null;
    }

    let changed;
    const next = latest.map(item => item.id === id ? (changed = transform(item)) : item);
    if (!saveDiscussions(next)) {
      setMessage("Could not save your answer. Please try again.");
      return null;
    }
    setItems(next);
    return changed;
  }

  function answer(item) {
    const text = (replies[item.id] || "").trim();
    if (text.length < 2 || text.length > 3000) {
      setMessage("Write an answer between 2 and 3,000 characters.");
      return;
    }
    const profile = discussionProfile("teacher", user);
    const changed = updateQuestion(item.id, question => ({
      ...question,
      reply: {
        ...question.reply,
        id: question.reply?.id || makeDiscussionId(),
        text,
        teacherEmail: user,
        teacherName: discussionName(user, "", "teacher"),
        teacherAvatar: profile.avatar || "",
        createdAt: new Date().toISOString(),
      },
    }));
    if (!changed) return;
    notifyDiscussionReply(changed, changed.reply, true);
    setReplies(previous => ({ ...previous, [item.id]: "" }));
    setActiveReply("");
    setSelectedQuestionId("");
    setMessage("Instructor answer saved.");
  }

  const summaryCards = [
    { key: "all", label: "Total Questions", value: eligible.length, icon: MessageCircle, color: "purple" },
    { key: "answered", label: "Answered", value: answeredQuestions.length, icon: CheckCircle2, color: "gold" },
    { key: "pending", label: "Pending", value: pendingQuestions.length, icon: Hourglass, color: "purple" },
    { key: "students", label: "Active Students", value: activeStudents, icon: Users, color: "gold" },
  ];

  return (
    <section className="edc-qa-page">
      <header className="edc-qa-heading">
        <h1><MessageCircle size={31} /> Course Q&amp;A</h1>
        <p>Manage student questions, provide answers, and support your course community.</p>
      </header>

      <section className="edc-qa-stats" aria-label="Course Q&A summary">
        {summaryCards.map(({ key, label, value, icon: Icon, color }) => (
          <button
            type="button"
            className={`edc-qa-stat ${color}`}
            key={key}
            onClick={() => key === "students"
              ? document.getElementById("edc-qa-insights")?.scrollIntoView({ behavior: "smooth", block: "center" })
              : chooseStatus(key)}
            aria-label={key === "students" ? `View student insights: ${value}` : `Show ${label.toLowerCase()}: ${value}`}
          >
            <span className="edc-qa-stat-icon"><Icon size={27} /></span>
            <span className="edc-qa-stat-copy"><small>{label}</small><strong>{value.toLocaleString()}</strong></span>
          </button>
        ))}
      </section>

      <div className="edc-qa-status-tabs" role="group" aria-label="Filter questions by status">
        {[
          ["all", "All Questions", eligible.length],
          ["pending", "Pending", pendingQuestions.length],
          ["answered", "Answered", answeredQuestions.length],
        ].map(([key, label, count]) => (
          <button type="button" className={status === key ? "active" : ""} aria-pressed={status === key} key={key} onClick={() => chooseStatus(key)}>
            {label} ({count.toLocaleString()})
          </button>
        ))}
      </div>

      <div className="edc-qa-toolbar">
        <label className="edc-qa-search">
          <Search size={17} />
          <input type="search" aria-label="Search questions" placeholder="Search questions..." value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />
        </label>
        <select aria-label="Filter questions by course" value={courseId} onChange={event => { setCourseId(event.target.value); setPage(1); }}>
          <option value="all">All Courses</option>
          {owned.map(course => <option key={courseDiscussionKey(course)} value={courseDiscussionKey(course)}>{course.title || "Untitled course"}</option>)}
        </select>
        <select aria-label="Sort questions" value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}>
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="replies">Most Replies</option>
        </select>
      </div>

      {message && <p className="edc-qa-message" role="status">{message}</p>}

      {!owned.length ? (
        <div className="edc-qa-empty">
          <BookOpen size={30} />
          <strong>No courses to show</strong>
          <p>Create a course to receive student questions.</p>
        </div>
      ) : (
        <div className="edc-qa-layout">
          <section className="edc-qa-feed" aria-label="Student questions">
            {visibleQuestions.length ? visibleQuestions.map(item => {
              const studentName = discussionName(item.studentEmail, item.studentName);
              const studentAvatar = item.studentAvatar || discussionProfile("student", item.studentEmail).avatar;
              const resolved = discussionAnswered(item);
              const peerReplies = discussionReplies(item);
              const isReplyOpen = activeReply === item.id;

              return (
                <article className="edc-qa-question-card" key={item.id}>
                  <div className="edc-qa-question-author">
                    <Avatar name={studentName} image={studentAvatar} />
                    <div className="edc-qa-author-copy">
                      <strong>{studentName}</strong>
                      <span>{formatDate(item.createdAt)}</span>
                    </div>
                    <span className={`edc-qa-status ${resolved ? "answered" : "pending"}`}>
                      {resolved ? <CheckCircle2 size={13} /> : <Hourglass size={13} />}
                      {item.resolved ? "Resolved" : resolved ? "Answered" : "Pending"}
                    </span>
                  </div>

                  <h2>{item.title}</h2>
                  <div className="edc-qa-course-tag"><GraduationCap size={14} /> {item.courseTitle || "Untitled course"}{item.lessonTitle && <span>· {item.lessonTitle}</span>}</div>
                  {item.body && <p className="edc-qa-question-body">{item.body}</p>}

                  <div className="edc-qa-question-metrics">
                    <span><ThumbsUp size={14} /> {item.votes?.length || 0} likes</span>
                    <span><MessageCircle size={14} /> {discussionReplyCount(item)} {discussionReplyCount(item) === 1 ? "reply" : "replies"}</span>
                  </div>

                  {item.reply?.text && (
                    <div className="edc-qa-instructor-answer">
                      <strong><Reply size={15} /> Instructor answer</strong>
                      <p>{item.reply.text}</p>
                      <time dateTime={item.reply.createdAt}>{formatDate(item.reply.createdAt)}</time>
                    </div>
                  )}
                  {peerReplies.map(reply => (
                    <div className="edc-qa-peer-reply" key={reply.id}>
                      <strong>{reply.name || discussionName(reply.email)}</strong>
                      <p>{reply.text}</p>
                      <time dateTime={reply.createdAt}>{formatDate(reply.createdAt)}</time>
                    </div>
                  ))}

                  <div className="edc-qa-card-actions">
                    <button type="button" onClick={() => setActiveReply(isReplyOpen ? "" : item.id)}>
                      <Reply size={15} /> {item.reply?.text ? "Update Answer" : "Answer"}
                    </button>
                    <button type="button" onClick={() => {
                      const changed = updateQuestion(item.id, question => ({ ...question, resolved: !question.resolved }));
                      if (changed) setMessage(changed.resolved ? "Question marked resolved." : "Question reopened.");
                    }}>
                      <CheckCircle2 size={15} /> {item.resolved ? "Reopen" : "Mark resolved"}
                    </button>
                    <ReportAction
                      reporterEmail={email}
                      reporterName={discussionName(user, "", "teacher")}
                      reporterRole="Teacher"
                      target={{ reportType: "content", targetType: "comment", targetId: String(item.id), targetTitle: `Question: ${item.title}`, targetOwnerEmail: item.studentEmail, targetRole: "Student" }}
                    />
                  </div>

                  {isReplyOpen && (
                    <form className="edc-qa-reply-form" onSubmit={event => { event.preventDefault(); answer(item); }}>
                      <textarea
                        rows={3}
                        maxLength={3000}
                        value={replies[item.id] || ""}
                        onChange={event => setReplies(previous => ({ ...previous, [item.id]: event.target.value }))}
                        placeholder="Write an answer to this question..."
                        aria-label={`Answer ${studentName}'s question`}
                      />
                      <button type="submit"><Send size={15} /> {item.reply ? "Update Answer" : "Send Answer"}</button>
                    </form>
                  )}
                </article>
              );
            }) : (
              <div className="edc-qa-empty">
                <MessageCircle size={30} />
                <strong>{eligible.length ? "No questions match these filters" : "No student questions yet"}</strong>
                <p>{eligible.length ? "Try another status, course, or search term." : "Questions from students in your courses will appear here."}</p>
              </div>
            )}

            {totalPages > 1 && (
              <nav className="edc-qa-pagination" aria-label="Question pages">
                <span>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, sorted.length)} of {sorted.length}</span>
                <div>
                  <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
                  <span>Page {currentPage} of {totalPages}</span>
                  <button type="button" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Next</button>
                </div>
              </nav>
            )}
          </section>

          <aside className="edc-qa-sidebar">
            <form className="edc-qa-answer-panel" onSubmit={event => { event.preventDefault(); if (selectedQuestion) answer(selectedQuestion); }}>
              <h2><Reply size={20} /> Answer a Question</h2>
              <label htmlFor="edc-qa-pending-question">Pending student question</label>
              <select
                id="edc-qa-pending-question"
                value={selectedQuestion?.id || ""}
                onChange={event => setSelectedQuestionId(event.target.value)}
                disabled={!pendingQuestions.length}
              >
                {pendingQuestions.length
                  ? pendingQuestions.map(item => <option value={item.id} key={item.id}>{item.title}</option>)
                  : <option value="">No pending questions</option>}
              </select>
              {selectedQuestion && <p className="edc-qa-selected-course">{selectedQuestion.courseTitle || "Untitled course"}</p>}
              <textarea
                rows={4}
                maxLength={3000}
                value={selectedQuestion ? replies[selectedQuestion.id] || "" : ""}
                onChange={event => selectedQuestion && setReplies(previous => ({ ...previous, [selectedQuestion.id]: event.target.value }))}
                placeholder="Write a helpful answer..."
                aria-label="Write an answer"
                disabled={!selectedQuestion}
              />
              <button type="submit" disabled={!selectedQuestion}><Send size={15} /> Send Answer</button>
            </form>

            <section className="edc-qa-insights" id="edc-qa-insights" aria-label="Course Q&A insights">
              <h2><Clock3 size={20} /> Q&amp;A Insights</h2>
              <div><span><Clock3 size={16} /> Average Response Time</span><strong>{averageResponseTime === null ? "—" : formatResponseTime(averageResponseTime)}</strong></div>
              <div><span><CheckCircle2 size={16} /> Answer Rate</span><strong>{answerRate === null ? "—" : `${answerRate}%`}</strong></div>
              <div><span><BookOpen size={16} /> Most Active Course</span><strong>{mostActiveCourse ? `${mostActiveCourse.course.title || "Untitled course"} (${mostActiveCourse.count})` : "—"}</strong></div>
              <div><span><Users size={16} /> Most Active Student</span><strong>{mostActiveStudent ? `${mostActiveStudent.name} (${mostActiveStudent.count})` : "—"}</strong></div>
            </section>
          </aside>
        </div>
      )}
    </section>
  );
}

export default function CourseDiscussions({ role, ...props }) {
  return role === "teacher" ? <TeacherCourseDiscussions {...props} /> : <StudentCourseDiscussions {...props} />;
}

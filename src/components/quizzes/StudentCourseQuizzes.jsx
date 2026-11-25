import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpen, ChartNoAxesCombined, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock3, Eye, GraduationCap, LayoutGrid, List, Play, RotateCw, Search, Trophy, X } from "lucide-react";
import { addDemoNotification } from "../../utils/demoNotifications";
import { filterStudentQuizzes, makeQuizSession, quizCourseKey, quizLibraryStats, quizSecondsRemaining, quizSignature, saveQuizDraft, studentQuizLibrary, submitQuizSession, subscribeStudentQuizzes } from "../../utils/studentQuizzes";
import quizArt from "../../assets/student-quizzes.svg";
import "./StudentCourseQuizzes.css";

const STATUS = { passed: "Passed", failed: "Not Passed", progress: "In Progress", new: "Not Started" };
const formatTime = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const dateLabel = value => { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Date not recorded"; };

function QuizCover({ course }) {
  const [failed, setFailed] = useState(null);
  const image = course.thumbnail || course.image;
  return <span className="edc-sq-cover">{image && image !== failed ? <img src={image} alt="" onError={() => setFailed(image)} /> : <GraduationCap size={31} strokeWidth={1.5} />}</span>;
}

function QuizDetails({ entry, onClose, onOpen }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  const { quiz, course, status, latest, draft } = entry;
  return <dialog ref={dialog} className="edc-sq-dialog" aria-labelledby="edc-sq-dialog-title" onCancel={onClose}>
    <header><span><ClipboardList size={22} /><h3 id="edc-sq-dialog-title">Quiz Details</h3></span><button type="button" aria-label="Close quiz details" onClick={onClose}><X size={20} /></button></header>
    <div className="edc-sq-dialog-body"><span className="edc-sq-dialog-course">{course.title}</span><h4>{quiz.title}</h4><span className={`edc-sq-status ${status}`}>{STATUS[status]}</span><dl><div><dt><ClipboardList size={16} /> Questions</dt><dd>{quiz.questions.length}</dd></div><div><dt><Clock3 size={16} /> Time Limit</dt><dd>{Number(quiz.timeLimit) > 0 ? `${quiz.timeLimit} minutes` : "No time limit"}</dd></div><div><dt><CheckCircle2 size={16} /> Passing Score</dt><dd>{quiz.passingScore ?? 60}%</dd></div>{latest && <div><dt><Trophy size={16} /> Latest Score</dt><dd>{latest.correct} / {latest.total} ({latest.percentage}%)</dd></div>}</dl>{quiz.description && <p>{quiz.description}</p>}<footer>{latest && <button type="button" className="edc-sq-secondary" onClick={() => onOpen(entry, "result")}><ChartNoAxesCombined size={14} /> View Result</button>}<button type="button" className="edc-sq-primary" onClick={() => onOpen(entry)}><Play size={14} />{draft ? "Continue Quiz" : latest ? "Retake Quiz" : "Start Quiz"}</button></footer></div>
  </dialog>;
}

function QuizResult({ entry, record, onBack, onRetry }) {
  const [attemptId, setAttemptId] = useState(record?.id || "");
  const selected = entry.attempts.find(attempt => attempt.id === attemptId) || record || entry.latest;
  if (!selected) return <section className="edc-sq-empty"><Trophy size={32} /><h3>No result yet</h3><p>Submit this quiz to see your actual score.</p><button type="button" className="edc-sq-secondary" onClick={onBack}>Back to quizzes</button></section>;
  return <section className="edc-sq-result"><button type="button" className="edc-sq-back" onClick={onBack}><ArrowLeft size={15} /> Course Quizzes</button><div className={`edc-sq-result-summary ${selected.passed ? "passed" : "failed"}`}><span className="edc-sq-result-icon"><Trophy size={31} /></span><span>QUIZ RESULT</span><h2>{selected.quizTitle || entry.quiz.title}</h2><p>{entry.course.title}</p><strong>{selected.percentage}%</strong><h3>{selected.passed ? "You passed!" : "Keep practicing"}</h3><p>{selected.correct} of {selected.total} answers correct{selected.timedOut ? " · Time limit reached" : ""}</p><small>Submitted {dateLabel(selected.submittedAt)}</small><span className={`edc-sq-status ${selected.passed ? "passed" : "failed"}`}>{selected.passed ? <Check size={12} /> : <RotateCw size={12} />}{selected.passed ? "Passed" : "Not Passed"}</span><div><button type="button" className="edc-sq-secondary" onClick={onBack}>Back to Quizzes</button><button type="button" className="edc-sq-primary" onClick={onRetry}><Play size={14} />{entry.draft ? "Continue Quiz" : "Retake Quiz"}</button></div></div>{entry.attempts.length > 1 && <label className="edc-sq-attempt-select">Your saved attempts<select value={selected.id} onChange={event => setAttemptId(event.target.value)}>{entry.attempts.map(attempt => <option key={attempt.id} value={attempt.id}>{dateLabel(attempt.submittedAt)} — {attempt.percentage}%</option>)}</select></label>}{Array.isArray(selected.questions) && selected.answers && <section className="edc-sq-answer-review"><h3>Answer Review</h3>{selected.questions.map((question, index) => {
    const chosen = selected.answers[index], correct = Number(question.correct), answered = Number.isInteger(chosen);
    return <article key={question.id || index}><h4>{index + 1}. {question.prompt}</h4><p className={chosen === correct ? "correct" : "incorrect"}>{answered ? `Your answer: ${question.options[chosen]}` : "Not answered"}</p>{chosen !== correct && <p className="correct">Correct answer: {question.options[correct]}</p>}</article>;
  })}</section>}</section>;
}

function QuizAttempt({ email, entry, onBack }) {
  // The parent remounts this component when quiz content changes. Keep the
  // current snapshot stable while progress events refresh the library.
  const [quiz] = useState(() => entry.quiz);
  const [session, setSession] = useState(() => makeQuizSession(email, quiz));
  const [now, setNow] = useState(() => Date.now());
  const [completed, setCompleted] = useState(null);
  const [error, setError] = useState("");
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const submitting = useRef(false);
  const remaining = quizSecondsRemaining(quiz, session, now);
  const answered = Object.keys(session.answers).length;
  const question = quiz.questions[session.questionIndex];
  useEffect(() => {
    if (completed) return;
    const writer = window.setTimeout(() => {
      try { saveQuizDraft(email, quiz, session); }
      catch { setError("Your progress could not be saved. Keep this page open and try again."); }
    }, 0);
    return () => window.clearTimeout(writer);
  }, [email, quiz, session, completed]);
  const submit = useCallback((timedOut = false) => {
    if (submitting.current) return;
    submitting.current = true;
    try {
      const outcome = submitQuizSession(email, quiz, session, timedOut || quizSecondsRemaining(quiz, session) === 0);
      setCompleted(outcome.record); setError("");
      if (outcome.isNew) {
        try { addDemoNotification("teacher", quiz.teacherEmail, { id: `quiz-attempt:${outcome.record.id}`, type: "quiz", title: "Student completed a quiz", message: `${email} completed ${quiz.title} with a score of ${outcome.record.percentage}%.`, link: "quizzes" }); } catch { /* The saved result remains available if notifications fail. */ }
      }
    } catch (failure) { setError(failure.message || "Could not save your result. Please try again."); submitting.current = false; }
  }, [email, quiz, session]);
  useEffect(() => {
    if (!Number(quiz.timeLimit) || completed) return;
    const tick = () => { setNow(Date.now()); if (quizSecondsRemaining(quiz, session) === 0) submit(true); };
    const initial = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [quiz, session, completed, submit]);
  const requestSubmit = () => { if (answered < quiz.questions.length) setConfirmSubmit(true); else submit(); };
  const go = index => setSession(previous => ({ ...previous, questionIndex: index }));
  const exit = () => { try { saveQuizDraft(email, quiz, session); onBack(); } catch { setError("Your progress could not be saved. Please try again before leaving."); } };
  const restart = () => { submitting.current = false; setSession(makeQuizSession(email, quiz)); setCompleted(null); setNow(Date.now()); setConfirmSubmit(false); };
  if (completed) return <QuizResult entry={entry} record={completed} onBack={onBack} onRetry={restart} />;
  return <section className="edc-sq-attempt"><button type="button" className="edc-sq-back" onClick={exit}><ArrowLeft size={15} /> Course Quizzes</button><header><span>{entry.course.title}</span><h2>{quiz.title}</h2><p>Choose one answer for each question. Your progress is saved so you can continue later.</p></header><div className="edc-sq-attempt-layout"><main className="edc-sq-question-panel"><div className="edc-sq-question-heading"><strong>Question {session.questionIndex + 1}</strong><span>{session.questionIndex + 1} of {quiz.questions.length}</span></div><div className="edc-sq-progress-track"><span style={{ width: `${answered / quiz.questions.length * 100}%` }} /></div><h3>{question.prompt}</h3><div className="edc-sq-options">{question.options.map((option, index) => <label key={index} className={session.answers[session.questionIndex] === index ? "selected" : ""}><span>{String.fromCharCode(65 + index)}</span><input type="radio" name={`quiz-${quiz.id}-${session.questionIndex}`} checked={session.answers[session.questionIndex] === index} disabled={remaining === 0} onChange={() => setSession(previous => ({ ...previous, answers: { ...previous.answers, [previous.questionIndex]: index } }))} /><strong>{option}</strong>{session.answers[session.questionIndex] === index && <CheckCircle2 size={18} />}</label>)}</div><div className="edc-sq-question-controls"><button type="button" className="edc-sq-secondary" disabled={session.questionIndex === 0} onClick={() => go(session.questionIndex - 1)}><ChevronLeft size={14} /> Previous</button><span>{answered} answered</span>{session.questionIndex < quiz.questions.length - 1 ? <button type="button" className="edc-sq-primary" onClick={() => go(session.questionIndex + 1)}>Next <ChevronRight size={14} /></button> : <button type="button" className="edc-sq-primary" onClick={requestSubmit}>Submit Quiz</button>}</div>{error && <p className="edc-sq-error" role="alert">{error}</p>}{confirmSubmit && <div className="edc-sq-submit-confirm" role="alert"><p>{quiz.questions.length - answered} questions are unanswered. Submit your answers now?</p><button type="button" className="edc-sq-secondary" onClick={() => setConfirmSubmit(false)}>Keep Answering</button><button type="button" className="edc-sq-primary" onClick={() => submit()}>Submit Anyway</button></div>}</main><aside><section className="edc-sq-timer"><Clock3 size={21} /><strong>{remaining === null ? "Untimed" : formatTime(remaining)}</strong><span>{remaining === null ? "No time limit" : "Time remaining"}</span></section><section className="edc-sq-question-list"><h3>Question List <span>{answered}/{quiz.questions.length}</span></h3><div>{quiz.questions.map((item, index) => <button type="button" key={item.id || index} className={`${index === session.questionIndex ? "active" : ""} ${session.answers[index] !== undefined ? "answered" : ""}`} aria-current={index === session.questionIndex ? "step" : undefined} onClick={() => go(index)}><span>{String(index + 1).padStart(2, "0")}</span>Question {index + 1}{session.answers[index] !== undefined && <Check size={14} />}</button>)}</div><button type="button" className="edc-sq-primary" onClick={requestSubmit}>Submit Quiz</button><button type="button" className="edc-sq-save-exit" onClick={exit}>Save & Exit</button></section></aside></div></section>;
}

export default function StudentCourseQuizzes({ email, courses = [], publishedCourses = [], quizRouteId = "", quizCourseId = "", quizTeacherEmail = "", quizView = "", onStartQuiz, onBackToQuizzes, onNavigate }) {
  const [version, setVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [status, setStatus] = useState("all");
  const [view, setView] = useState("list");
  const [page, setPage] = useState(1);
  const [localRoute, setLocalRoute] = useState(null);
  const [detailsKey, setDetailsKey] = useState("");
  useEffect(() => subscribeStudentQuizzes(() => setVersion(value => value + 1)), []);
  const entries = useMemo(() => { void version; return studentQuizLibrary(email, courses, publishedCourses); }, [email, courses, publishedCourses, version]);
  const stats = quizLibraryStats(entries);
  const filtered = filterStudentQuizzes(entries, { search, course: courseFilter, status });
  const pages = Math.max(1, Math.ceil(filtered.length / 5)), currentPage = Math.min(page, pages);
  const pageNumbers = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, pages])].filter(value => value >= 1 && value <= pages).sort((a, b) => a - b);
  const route = quizRouteId ? { id: quizRouteId, course: quizCourseId, teacher: quizTeacherEmail, mode: quizView } : localRoute;
  const active = route ? entries.find(entry => String(entry.quiz.id) === String(route.id) && String(entry.quiz.courseId) === String(route.course) && String(entry.quiz.teacherEmail).trim().toLowerCase() === String(route.teacher).trim().toLowerCase()) : null;
  const details = entries.find(entry => entry.key === detailsKey);
  const open = (entry, mode = "attempt") => { setDetailsKey(""); if (onStartQuiz) onStartQuiz(entry.quiz, mode); else setLocalRoute({ id: entry.quiz.id, course: entry.quiz.courseId, teacher: entry.quiz.teacherEmail, mode }); };
  const back = () => { setLocalRoute(null); onBackToQuizzes?.(); };
  const changeFilter = (setter, value) => { setter(value); setPage(1); };
  const metricFilter = value => { setStatus(value); setSearch(""); setCourseFilter("all"); setPage(1); };

  if (route) return <div className="edc-student-quizzes">{!active ? <section className="edc-sq-empty"><ClipboardList size={33} /><h2>Quiz unavailable</h2><p>This quiz may have been unpublished or removed, or you may no longer be enrolled in its course.</p><button type="button" className="edc-sq-secondary" onClick={back}><ArrowLeft size={15} /> Back to Quizzes</button></section> : route.mode === "result" ? <QuizResult key={`${active.key}-result`} entry={active} record={active.latest} onBack={back} onRetry={() => open(active)} /> : <QuizAttempt key={`${email}-${active.key}-${quizSignature(active.quiz)}`} email={email} entry={active} onBack={back} />}</div>;

  return <section className="edc-student-quizzes"><header className="edc-sq-heading"><h2>Course Quizzes</h2><p>Attempt quizzes, check your scores, and track your progress.</p><img src={quizArt} alt="" /></header>
    <div className="edc-sq-stats"><button type="button" className="edc-sq-stat" aria-pressed={status === "all"} onClick={() => metricFilter("all")}><span><ClipboardList size={27} /></span><span><small>Total Quizzes</small><strong>{stats.total}</strong></span></button><button type="button" className="edc-sq-stat amber" aria-pressed={status === "attempted"} onClick={() => metricFilter("attempted")}><span><Play size={27} /></span><span><small>Attempted</small><strong>{stats.attempted}</strong></span></button><button type="button" className="edc-sq-stat green" aria-pressed={status === "passed"} onClick={() => metricFilter("passed")}><span><CheckCircle2 size={27} /></span><span><small>Passed</small><strong>{stats.passed}</strong></span></button><button type="button" className="edc-sq-stat pink" title="Average of your latest submitted score for each quiz. Click to show submitted quizzes." disabled={stats.average === null} aria-pressed={status === "submitted"} onClick={() => metricFilter("submitted")}><span><Trophy size={27} /></span><span><small>Avg. Score</small><strong>{stats.average === null ? "—" : `${stats.average}%`}</strong></span></button></div>
    <div className="edc-sq-toolbar"><label className="edc-sq-search"><Search size={17} /><input type="search" aria-label="Search quizzes" value={search} onChange={event => changeFilter(setSearch, event.target.value)} placeholder="Search quizzes..." />{search && <button type="button" aria-label="Clear quiz search" onClick={() => changeFilter(setSearch, "")}><X size={14} /></button>}</label><label className="edc-sq-course-filter"><GraduationCap size={20} /><select aria-label="Filter quizzes by course" value={courseFilter} onChange={event => changeFilter(setCourseFilter, event.target.value)}><option value="all">All Courses</option>{courses.map(course => <option key={quizCourseKey(course)} value={quizCourseKey(course)}>{course.title}</option>)}</select></label><label className="edc-sq-status-filter"><ChartNoAxesCombined size={18} /><select aria-label="Filter quizzes by status" value={status} onChange={event => changeFilter(setStatus, event.target.value)}><option value="all">All Status</option><option value="new">Not Started</option><option value="progress">In Progress</option><option value="passed">Passed</option><option value="failed">Not Passed</option><option value="attempted">Attempted</option><option value="submitted">Submitted</option></select></label><div className="edc-sq-view-buttons" aria-label="Quiz layout"><button type="button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}><LayoutGrid size={18} /></button><button type="button" aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={19} /></button></div></div>
    {filtered.length ? <div className={`edc-sq-quiz-list ${view === "grid" ? "grid" : ""}`}>{filtered.slice((currentPage - 1) * 5, currentPage * 5).map(entry => <article className="edc-sq-quiz-row" key={entry.key}><QuizCover course={entry.course} /><div className="edc-sq-quiz-info"><h3>{entry.course.title}</h3><p title={entry.quiz.title}>{entry.quiz.title}</p><button type="button" className="edc-sq-details-link" onClick={() => setDetailsKey(entry.key)}><Eye size={12} /> View Details</button><div><span><ClipboardList size={14} />{entry.quiz.questions.length} Questions</span><span><Clock3 size={14} />{Number(entry.quiz.timeLimit) > 0 ? `${entry.quiz.timeLimit} min` : "Untimed"}</span></div></div><div className="edc-sq-progress"><small>Progress</small><div><span className="edc-sq-progress-track" role="progressbar" aria-label={`${entry.quiz.title} progress`} aria-valuenow={entry.progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${entry.progress}%` }} /></span><strong>{entry.progress}%</strong></div></div><div className="edc-sq-score"><small>Score</small>{entry.latest ? <span className={entry.latest.passed ? "passed" : "failed"}><Trophy size={14} />{entry.latest.correct} / {entry.latest.total} ({entry.latest.percentage}%){entry.draft && <em>Last result</em>}</span> : <span className="edc-sq-no-score">{entry.draft ? "Not submitted" : "—"}</span>}</div><div className="edc-sq-row-end"><span className={`edc-sq-status ${entry.status}`}>{entry.status === "passed" ? <Check size={12} /> : entry.status === "progress" ? <RotateCw size={12} /> : <Play size={11} />}{STATUS[entry.status]}</span><button type="button" className={entry.draft ? "edc-sq-primary" : "edc-sq-secondary"} onClick={() => open(entry, entry.draft || !entry.latest ? "attempt" : "result")}>{entry.draft || !entry.latest ? <Play size={13} fill="currentColor" /> : <ChartNoAxesCombined size={14} />}{entry.draft ? "Continue Quiz" : entry.latest ? "View Result" : "Start Quiz"}</button></div></article>)}</div> : <section className="edc-sq-empty"><ClipboardList size={32} /><h3>{entries.length ? "No quizzes match your filters" : "No published quizzes yet"}</h3><p>{entries.length ? "Try a different search, course, or status." : courses.length ? "Quizzes will appear here when your instructors publish them for your enrolled courses." : "Enroll in a course to access quizzes published by its instructor."}</p>{entries.length ? <button type="button" className="edc-sq-secondary" onClick={() => metricFilter("all")}>Clear Filters</button> : onNavigate && <button type="button" className="edc-sq-secondary" onClick={() => onNavigate("learning")}><BookOpen size={15} /> My Learning</button>}</section>}
    <footer className="edc-sq-pagination"><span>{filtered.length ? `Showing ${(currentPage - 1) * 5 + 1}–${Math.min(currentPage * 5, filtered.length)} of ${filtered.length} quizzes` : "0 quizzes"}</span><nav aria-label="Quiz pages"><button type="button" aria-label="Previous quiz page" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button>{pageNumbers.map((number, index) => <span key={number}>{index > 0 && number - pageNumbers[index - 1] > 1 && <span>…</span>}<button type="button" aria-label={`Quiz page ${number}`} aria-current={currentPage === number ? "page" : undefined} onClick={() => setPage(number)}>{number}</button></span>)}<button type="button" aria-label="Next quiz page" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></nav></footer>
    {details && <QuizDetails entry={details} onClose={() => setDetailsKey("")} onOpen={open} />}
  </section>;
}

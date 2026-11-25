import { useCallback, useEffect, useMemo, useState } from "react";
import { isMongoId, teacherQuizzes, studentQuizzes, saveTeacherQuiz, publishTeacherQuiz, removeTeacherQuiz, submitStudentAttempt, startStudentAttempt } from "../../utils/mongoQuizApi";
import "./MongoCourseQuizzes.css";
const randomId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const blankQuestion = () => ({ id: randomId(), prompt: "", options: ["", "", "", ""], correct: 0 });
const blankQuiz = () => ({ title: "", passingScore: 60, timeLimit: 0, questions: [blankQuestion()] });
const friendly = error => error?.message || "Something went wrong. Please try again.";

function TeacherMongoQuizzes({ courses }) {
  const validCourses = useMemo(() => courses.filter(c => isMongoId(c.id || c._id)), [courses]);
  const [courseId, setCourseId] = useState("");
  const selected = validCourses.find(c => String(c.id || c._id) === courseId) || validCourses[0];
  const id = String(selected?.id || selected?._id || "");
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    if (!id) { setRows([]); return; }
    try { const data = await teacherQuizzes(id); setRows(data.quizzes || []); setMessage(""); }
    catch(error) { setRows([]); setMessage(friendly(error)); }
  }, [id]);
  useEffect(() => { void refresh(); setEditing(null); }, [refresh]);
  const updateQuestion = (index, patch) => setEditing(prev => ({ ...prev, questions: prev.questions.map((q, i) => i === index ? { ...q, ...patch } : q) }));
  const action = async fn => { setBusy(true); setMessage(""); try { await fn(); await refresh(); } catch(error) { setMessage(friendly(error)); } finally { setBusy(false); } };
  const save = () => action(async () => {
    await saveTeacherQuiz(id, { ...editing, id: editing.id, questions: editing.questions.map(q => ({...q, prompt: q.prompt.trim(), options: q.options.map(o => o.trim()), correct: Number(q.correct) })) });
    setEditing(null);
  });
  return <div className="edc-mq">
    <header><h2>Course Quizzes</h2><p>Create quizzes for your MongoDB courses. Only enrolled students of approved courses can access published quizzes.</p></header>
    {!validCourses.length ? <p>No MongoDB courses found yet. Create a course in My Courses first.</p> : <>
      <div className="edc-mq-toolbar"><label>Course <select value={id} onChange={e => setCourseId(e.target.value)}>{validCourses.map(c => <option key={String(c.id || c._id)} value={String(c.id || c._id)}>{c.title}</option>)}</select></label><button onClick={() => setEditing(blankQuiz())}>+ Create Quiz</button></div>
      {message && <p role="alert" className="edc-mq-message">{message}</p>}
      {editing && <section className="edc-mq-panel"><h3>{editing.id ? "Edit Quiz" : "Create Quiz"}</h3>
        <label>Quiz Title <input value={editing.title} maxLength={160} onChange={e => setEditing(p => ({...p, title: e.target.value}))}/></label>
        <div className="edc-mq-pair"><label>Passing Score (%) <input type="number" min="0" max="100" value={editing.passingScore} onChange={e => setEditing(p => ({...p, passingScore: Number(e.target.value)}))}/></label><label>Time Limit (minutes; 0 = untimed) <input type="number" min="0" max="180" value={editing.timeLimit} onChange={e => setEditing(p => ({...p, timeLimit: Number(e.target.value)}))}/></label></div>
        {editing.questions.map((q, i) => <div key={q.id || i} className="edc-mq-question"><div className="edc-mq-toolbar"><strong>Question {i+1}</strong><button type="button" disabled={editing.questions.length === 1} onClick={() => setEditing(p => ({...p,questions:p.questions.filter((_, index) => index!==i)}))}>Remove</button></div><label>Question <input value={q.prompt} onChange={e => updateQuestion(i, {prompt:e.target.value})}/></label>{q.options.map((opt, optI) => <label key={optI}>Option {optI+1} <input value={opt} onChange={e => updateQuestion(i,{options:q.options.map((o,j)=>j===optI?e.target.value:o)})}/></label>)}<label>Correct option <select value={q.correct} onChange={e=>updateQuestion(i,{correct:Number(e.target.value)})}>{[0,1,2,3].map(n=><option key={n} value={n}>Option {n+1}</option>)}</select></label></div>)}
        <div className="edc-mq-toolbar"><button type="button" onClick={() => setEditing(p => ({...p,questions:[...p.questions,blankQuestion()]}))}>+ Add Question</button><button disabled={busy} onClick={save}>Save Quiz</button><button type="button" onClick={() => setEditing(null)}>Cancel</button></div></section>}
      {rows.length ? rows.map(q => <article key={q.id || q._id} className="edc-mq-panel"><div className="edc-mq-toolbar"><div><h3>{q.title}</h3><p>{q.questions?.length || 0} questions · {q.passingScore}% pass · {q.published ? "Published" : "Draft"}</p></div><button disabled={busy} onClick={() => setEditing({ ...q, id: q.id || q._id })}>Edit</button><button disabled={busy} onClick={() => action(() => publishTeacherQuiz(id, q.id || q._id, !q.published))}>{q.published ? "Unpublish" : "Publish"}</button><button disabled={busy} onClick={() => { if(window.confirm(`Delete ${q.title}?`)) void action(() => removeTeacherQuiz(id, q.id || q._id)); }}>Delete</button></div></article>) : <p>No quizzes saved for this course.</p>}
    </>}
  </div>;
}
function StudentMongoQuizzes({ courses }) {
  const validCourses = useMemo(() => courses.filter(c => isMongoId(c.id || c._id)), [courses]);
  const [records, setRecords] = useState([]);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [sessionId, setSessionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [expiresAt, setExpiresAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const remaining = expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000)) : null;
  const refresh = useCallback(async () => {
    if (!validCourses.length) {setRecords([]);return;}
    const settled = await Promise.allSettled(validCourses.map(c => studentQuizzes(c.id || c._id)));
    setRecords(settled.flatMap((out, i) => out.status === "fulfilled" ? (out.value.quizzes || []).map(q => ({...q,course:validCourses[i]})) : []));
    // 403 for unenrolled course is expected; don't show private quiz data.
  }, [validCourses]);
  useEffect(() => { void refresh(); }, [refresh]);
  const begin = async quiz => {
    setBusy(true);setMessage("");
    try {
      const session = await startStudentAttempt(quiz.courseId, quiz.id);
      setSelected(quiz);setAnswers({});setResult(null);setSessionId(session.sessionId);setExpiresAt(session.expiresAt);setNow(Date.now());
    } catch(error) { setMessage(friendly(error)); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    setBusy(true);setMessage("");
    try { const data = await submitStudentAttempt(selected.courseId, selected.id, { sessionId, revision:selected.revision,answers }); setResult(data.attempt);await refresh(); }
    catch(error) { setMessage(friendly(error)); } finally { setBusy(false); }
  };
  return <div className="edc-mq"><header><h2>Course Quizzes</h2><p>Published quizzes for your enrolled and approved courses.</p></header>
    {message && <p role="alert" className="edc-mq-message">{message}</p>}
    {selected ? <section className="edc-mq-panel"><button onClick={() => {setSelected(null);setResult(null);}}>← Back to Quizzes</button><h3>{selected.title}</h3><p>{selected.course?.title}</p>{!result && selected.timeLimit > 0 && <p>Time remaining: {Math.floor((remaining || 0) / 60)}:{String((remaining || 0) % 60).padStart(2, "0")}</p>}{result ? <><h3>Result: {result.percentage}% · {result.passed ? "Passed" : "Not Passed"}</h3><p>{result.correct} of {result.total} correct. Result saved in MongoDB.</p><button onClick={() => void begin(selected)}>Retake Quiz</button></> : <>{selected.questions.map((q,i) => <div key={q.id || i} className="edc-mq-question"><h4>{i+1}. {q.prompt}</h4>{q.options.map((opt,j) => <label key={j} className="edc-mq-option"><input type="radio" checked={answers[i]===j} name={`q-${i}`} onChange={() => setAnswers(p=>({...p,[i]:j}))}/>{opt}</label>)}</div>)}<button disabled={busy || (selected.timeLimit > 0 && remaining === 0)} onClick={submit}>Submit Quiz</button></>}</section> : records.length ? records.map(q=><article key={q.id} className="edc-mq-panel"><h3>{q.title}</h3><p>{q.course?.title} · {q.questions.length} questions · {q.attempts?.length || 0} saved attempts</p><button disabled={busy} onClick={()=>void begin(q)}>Start Quiz</button></article>) : <p>No published quizzes for your enrolled courses yet.</p>}
  </div>;
}
export default function MongoCourseQuizzes({ role, courses = [] }) {
  return role === "teacher" ? <TeacherMongoQuizzes courses={courses}/> : <StudentMongoQuizzes courses={courses}/>;
}

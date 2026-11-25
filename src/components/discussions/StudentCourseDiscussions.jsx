import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Bell, BellRing, Bookmark, BookmarkCheck, CheckCircle2, Flame, GraduationCap, Hourglass, MessageCircle, MoreHorizontal, PencilLine, Plus, Reply, Search, Send, ThumbsUp, Trash2, Users, X } from "lucide-react";
import { courseDiscussionKey, readDiscussions, saveDiscussions, subscribeDiscussions } from "../../utils/courseDiscussions";
import { addCourseDiscussionReply, createCourseQuestion, discussionAnswered, discussionEmail, discussionName, discussionProfile, discussionReplies, discussionReplyCount, editOwnCourseQuestion, filterCourseDiscussions, notifyDiscussionReply, removeOwnCourseQuestion, toggleDiscussionFollow, toggleDiscussionVotes, visibleCourseDiscussions } from "../../utils/discussionHelpers";
import { addDemoNotification } from "../../utils/demoNotifications";
import ReportAction from "../moderation/ReportAction";
import questionArtwork from "../../assets/student-qa.svg";
import "./StudentCourseDiscussions.css";

const readSaved = key => { try { const values = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(values) ? values : []; } catch { return []; } };
const when = value => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Just now";
  const [unit, amount] = seconds < 3600 ? ["minute", Math.floor(seconds / 60)] : seconds < 86400 ? ["hour", Math.floor(seconds / 3600)] : ["day", Math.floor(seconds / 86400)];
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-amount, unit);
};

function Avatar({ name, image, small = false }) {
  const [failed, setFailed] = useState(false);
  return <span className={`edc-dq-avatar${small ? " small" : ""}`}>{image && !failed ? <img src={image} alt="" onError={() => setFailed(true)}/> : String(name || "Learner").split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</span>;
}

export default function StudentCourseDiscussions({ email = "", studentName = "", studentAvatar = "", courses = [], publishedCourses = [], onExplore }) {
  const user = discussionEmail(email);
  const savedKey = `educonnect.student.${user}.discussionBookmarks`;
  const [items, setItems] = useState(() => readDiscussions());
  const [saved, setSaved] = useState(() => readSaved(savedKey));
  const [courseFilter, setCourseFilter] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("all");
  const [showCourseGroups, setShowCourseGroups] = useState(false);
  const [message, setMessage] = useState("");
  const [more, setMore] = useState("");
  const [expanded, setExpanded] = useState({});
  const [replyDrafts, setReplyDrafts] = useState({});
  const [replyErrors, setReplyErrors] = useState({});
  const [highlight, setHighlight] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState({ courseKey: "", title: "", body: "", lessonTitle: "", tags: "" });
  const [formError, setFormError] = useState("");
  const dialog = useRef(null);
  const searchInput = useRef(null);
  const questionRefs = useRef({});
  const replyRefs = useRef({});
  useEffect(() => {
    const refresh = () => setItems(readDiscussions());
    const unsubscribe = subscribeDiscussions(refresh);
    const refreshSaved = event => { if (!event.key || event.key === savedKey) setSaved(readSaved(savedKey)); };
    const outside = event => { if (!event.target.closest(".edc-dq-menu")) setMore(""); };
    const escape = event => { if (event.key === "Escape") setMore(""); };
    window.addEventListener("educonnect:moderation-visibility-changed", refresh);
    window.addEventListener("storage", refreshSaved);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      unsubscribe(); window.removeEventListener("educonnect:moderation-visibility-changed", refresh);
      window.removeEventListener("storage", refreshSaved); document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape);
    };
  }, [savedKey]);
  useEffect(() => {
    if (editorOpen && !dialog.current.open) dialog.current.showModal();
    else if (!editorOpen && dialog.current.open) dialog.current.close();
  }, [editorOpen]);
  const owned = useMemo(() => courses.map(course => ({ ...publishedCourses.find(item => courseDiscussionKey(item) === courseDiscussionKey(course)), ...course, key: courseDiscussionKey(course) })), [courses, publishedCourses]);
  const courseMap = new Map(owned.map(course => [course.key, course]));
  const eligible = visibleCourseDiscussions(items, owned);
  const visible = filterCourseDiscussions(eligible, { course: courseFilter, search, status, view, email, saved });
  const answered = eligible.filter(discussionAnswered).length;
  const courseGroups = owned.map(course => {
    const questions = eligible.filter(item => item.courseKey === course.key);
    return { course, total: questions.length, answered: questions.filter(discussionAnswered).length };
  }).filter(group => group.total > 0);
  const ownQuestions = eligible.filter(item => discussionEmail(item.studentEmail) === user);
  const following = eligible.filter(item => (item.followers || []).map(discussionEmail).includes(user));
  const savedQuestions = eligible.filter(item => saved.includes(item.id));
  const popular = eligible.slice().sort((a, b) => discussionReplyCount(b) - discussionReplyCount(a) || (b.votes?.length || 0) - (a.votes?.length || 0)).slice(0, 4);
  const currentName = discussionName(user, studentName);
  const currentAvatar = studentAvatar || discussionProfile("student", user).avatar || "";

  function commit(mutator) {
    try {
      const next = mutator(readDiscussions());
      if (!saveDiscussions(next)) throw new Error("Could not save your changes. Please try again.");
      setItems(next); return true;
    } catch (error) { setMessage(error.message || "Could not save your changes."); return false; }
  }
  function updateQuestion(id, transform) {
    let changed;
    const success = commit(latest => {
      if (!visibleCourseDiscussions(latest, owned).some(item => item.id === id)) throw new Error("This question is no longer available.");
      return latest.map(item => item.id === id ? (changed = transform(item)) : item);
    });
    return success ? changed : null;
  }
  function showView(next, nextStatus = "all") { setView(next); setStatus(nextStatus); setCourseFilter("all"); setSearch(""); setMore(""); setShowCourseGroups(false); }
  function selectSummary(id) {
    const openCourses = id === "courses" && !showCourseGroups;
    showView("all", ["answered", "pending"].includes(id) ? id : "all");
    if (openCourses) setShowCourseGroups(true);
  }
  function summarySelected(id) {
    if (id === "courses") return showCourseGroups || courseFilter !== "all";
    return !showCourseGroups && courseFilter === "all" && view === "all" && !search.trim() && status === id;
  }
  function toggleSaved(item) {
    const next = saved.includes(item.id) ? saved.filter(id => id !== item.id) : [...saved, item.id];
    try { localStorage.setItem(savedKey, JSON.stringify(next)); setSaved(next); setMessage(next.includes(item.id) ? "Question saved." : "Question removed from saved questions."); }
    catch { setMessage("Could not save this question. Please try again."); }
    setMore("");
  }
  function openQuestion(item) {
    const selected = item ? courseMap.get(item.courseKey) : courseMap.get(courseFilter) || owned[0];
    if (!selected || (item && discussionEmail(item.studentEmail) !== user)) return;
    setDraft({ courseKey: selected.key, title: item?.title || "", body: item?.body || "", lessonTitle: item?.lessonTitle || "", tags: (item?.tags || []).join(", ") });
    setEditingId(item?.id || ""); setFormError(""); setMore(""); setEditorOpen(true);
  }
  function postQuestion(event) {
    event.preventDefault();
    try {
      const question = createCourseQuestion({ course: courseMap.get(draft.courseKey), email, name: currentName, avatar: currentAvatar, ...draft });
      const success = commit(latest => {
        if (!editingId) return [question, ...latest];
        return editOwnCourseQuestion(latest, editingId, question, user);
      });
      if (!success) { setFormError("Could not save your question. Please try again."); return; }
      if (!editingId && question.teacherEmail) {
        try { addDemoNotification("teacher", question.teacherEmail, { id: `qa-question:${question.id}`, type: "discussion", title: "New course question", message: `${currentName} asked a question in ${question.courseTitle}.`, link: "discussions" }); } catch { /* The question is already saved. */ }
      }
      setEditorOpen(false); showView("all"); setMessage(editingId ? "Your question has been updated." : "Your question has been posted.");
    } catch (error) { setFormError(error.message); }
  }
  function openReplies(id) {
    setExpanded(previous => ({ ...previous, [id]: true }));
    window.requestAnimationFrame(() => replyRefs.current[id]?.focus());
  }
  function postReply(event, item) {
    event.preventDefault();
    const text = (replyDrafts[item.id] || "").trim();
    if (text.length < 2 || text.length > 3000) { setReplyErrors(previous => ({ ...previous, [item.id]: "Write a reply between 2 and 3,000 characters." })); return; }
    const changed = updateQuestion(item.id, question => addCourseDiscussionReply(question, { email, name: currentName, avatar: currentAvatar, text }));
    if (!changed) { setReplyErrors(previous => ({ ...previous, [item.id]: "Could not post your reply. Please try again." })); return; }
    notifyDiscussionReply(changed, changed.replies.at(-1));
    setReplyDrafts(previous => ({ ...previous, [item.id]: "" })); setReplyErrors(previous => ({ ...previous, [item.id]: "" })); setMessage("Your reply has been posted.");
  }
  function resolve(item) {
    const changed = updateQuestion(item.id, question => {
      if (discussionEmail(question.studentEmail) !== user) throw new Error("Only your own question can be marked resolved here.");
      return { ...question, resolved: !question.resolved };
    });
    if (changed) setMessage(changed.resolved ? "Question marked resolved." : "Question reopened.");
    setMore("");
  }
  function remove(item) {
    if (discussionEmail(item.studentEmail) !== user || !window.confirm("Delete your question and its replies?")) return;
    if (commit(latest => removeOwnCourseQuestion(latest, item.id, user))) setMessage("Your question has been deleted.");
    setMore("");
  }
  function reveal(item) {
    showView("all"); setHighlight(item.id); setExpanded(previous => ({ ...previous, [item.id]: true }));
    window.requestAnimationFrame(() => { questionRefs.current[item.id]?.scrollIntoView({ behavior: "smooth", block: "center" }); questionRefs.current[item.id]?.focus({ preventScroll: true }); });
  }

  return <section className="edc-course-qa">
    <header className="edc-dq-heading"><h2>Course Q&amp;A</h2><p>Ask questions, get answers, and discuss with instructors and other learners.</p><img src={questionArtwork} alt=""/></header>
    <div className="edc-dq-stats">{[{ id: "all", label: "Total Questions", value: eligible.length, icon: MessageCircle, color: "purple" }, { id: "answered", label: "Answered", value: answered, icon: CheckCircle2, color: "green" }, { id: "pending", label: "Pending", value: eligible.length - answered, icon: Hourglass, color: "amber" }, { id: "courses", label: "Course Discussions", value: courseGroups.length, icon: Users, color: "blue" }].map(stat => <button type="button" className={`edc-dq-stat edc-dq-stat-${stat.color}`} key={stat.id} aria-pressed={summarySelected(stat.id)} aria-expanded={stat.id === "courses" ? showCourseGroups : undefined} aria-controls={stat.id === "courses" ? "edc-dq-course-groups" : undefined} onClick={() => selectSummary(stat.id)}><span><stat.icon size={27} strokeWidth={1.8}/></span><span className="edc-dq-stat-copy"><small>{stat.label}</small><strong>{stat.value}</strong></span></button>)}</div>
    <form className="edc-dq-toolbar" role="search" aria-label="Search course questions" onSubmit={event => event.preventDefault()}><label className="edc-dq-search"><Search size={17}/><input ref={searchInput} type="search" aria-label="Search questions" placeholder="Search questions..." value={search} onChange={event => setSearch(event.target.value)}/>{search && <button type="button" aria-label="Clear question search" onClick={() => { setSearch(""); searchInput.current?.focus(); }}><X size={14}/></button>}</label><select aria-label="Filter questions by course" value={courseFilter} onChange={event => setCourseFilter(event.target.value)}><option value="all">All Courses</option>{owned.map(course => <option key={course.key} value={course.key}>{course.title}</option>)}</select><select aria-label="Filter questions by status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All Status</option><option value="answered">Answered</option><option value="pending">Pending</option><option value="resolved">Resolved</option></select><button type="button" className="edc-dq-primary" disabled={!owned.length} onClick={() => openQuestion()}><Plus size={16}/> Ask a Question</button></form>
    {showCourseGroups && <section className="edc-dq-course-groups" id="edc-dq-course-groups" aria-label="Courses with discussions"><header><h3>Course Discussions</h3><button type="button" aria-label="Close course discussions list" onClick={() => setShowCourseGroups(false)}><X size={17}/></button></header><div>{courseGroups.map(({ course, total, answered: courseAnswered }) => <button type="button" key={course.key} onClick={() => { setCourseFilter(course.key); setShowCourseGroups(false); }}><GraduationCap size={20}/><span><strong>{course.title}</strong><small>{total} {total === 1 ? "question" : "questions"} · {courseAnswered} answered</small></span><ArrowRight size={16}/></button>)}</div>{!courseGroups.length && <p>No course discussions yet. Ask a question to start one.</p>}</section>}
    {message && <p className="edc-dq-notice" role="status">{message}</p>}
    {view !== "all" && <div className="edc-dq-view-label"><span>{view === "mine" ? "My Questions" : view === "following" ? "Following" : "Saved Questions"}</span><button type="button" onClick={() => showView("all")}><X size={13}/> Show All Questions</button></div>}
    <div className="edc-dq-layout"><div className="edc-dq-feed" aria-label="Course question discussions">
      {visible.map(item => {
        const mine = discussionEmail(item.studentEmail) === user;
        const name = discussionName(item.studentEmail, item.studentName);
        const avatar = item.studentAvatar || discussionProfile("student", item.studentEmail).avatar;
        const course = courseMap.get(item.courseKey);
        const teacherEmail = item.reply?.teacherEmail || item.teacherEmail || course?.teacherEmail;
        const teacherProfile = discussionProfile("teacher", teacherEmail);
        const teacherName = discussionName(teacherEmail, item.reply?.teacherName || course?.instructorName || course?.instructor, "teacher");
        const followingItem = (item.followers || []).map(discussionEmail).includes(user);
        const peers = discussionReplies(item);
        return <article className={`edc-dq-card${highlight === item.id ? " highlighted" : ""}`} key={item.id} ref={node => { questionRefs.current[item.id] = node; }} tabIndex={-1} aria-label={item.title}>
          <div className="edc-dq-card-top"><Avatar name={name} image={avatar}/><div className="edc-dq-author"><strong>{name}{mine && <small>You</small>}</strong><span>{when(item.createdAt)}<b>·</b>{item.courseTitle}</span></div><span className={`edc-dq-status ${discussionAnswered(item) ? "answered" : "pending"}`}>{discussionAnswered(item) ? <CheckCircle2 size={11}/> : <Hourglass size={11}/>} {item.resolved ? "Resolved" : discussionAnswered(item) ? "Answered" : "Pending"}</span><button type="button" className="edc-dq-icon-button" aria-label={`${saved.includes(item.id) ? "Unsave" : "Save"} question: ${item.title}`} aria-pressed={saved.includes(item.id)} onClick={() => toggleSaved(item)}>{saved.includes(item.id) ? <BookmarkCheck size={16}/> : <Bookmark size={16}/>}</button><div className="edc-dq-menu"><button type="button" className="edc-dq-icon-button" aria-label={`More actions for ${item.title}`} aria-expanded={more === item.id} onClick={() => setMore(more === item.id ? "" : item.id)}><MoreHorizontal size={19}/></button>{more === item.id && <div className="edc-dq-menu-panel">{mine && <><button type="button" onClick={() => openQuestion(item)}><PencilLine size={14}/> Edit Question</button><button type="button" onClick={() => resolve(item)}><CheckCircle2 size={14}/> {item.resolved ? "Reopen Question" : "Mark Resolved"}</button></>}<button type="button" onClick={() => toggleSaved(item)}><Bookmark size={14}/> {saved.includes(item.id) ? "Unsave Question" : "Save Question"}</button><button type="button" onClick={() => { setCourseFilter(item.courseKey); setView("all"); setStatus("all"); setSearch(""); setMore(""); }}><MessageCircle size={14}/> View Course Questions</button>{mine && <button type="button" className="danger" onClick={() => remove(item)}><Trash2 size={14}/> Delete My Question</button>}</div>}</div></div>
          <h3>{item.title}</h3>{item.body && <p className="edc-dq-question-body">{item.body}</p>}
          {(item.tags?.length > 0 || item.lessonTitle) && <div className="edc-dq-tags">{item.lessonTitle && <span>{item.lessonTitle}</span>}{(item.tags || []).map(tag => <span key={tag}>{tag}</span>)}</div>}
          <div className="edc-dq-card-actions"><button type="button" aria-pressed={(item.votes || []).map(discussionEmail).includes(user)} onClick={() => updateQuestion(item.id, question => ({ ...question, votes: toggleDiscussionVotes(question.votes, user) }))}><ThumbsUp size={16}/> {item.votes?.length || 0} Likes</button><button type="button" aria-expanded={!!expanded[item.id]} onClick={() => setExpanded(previous => ({ ...previous, [item.id]: !previous[item.id] }))}><MessageCircle size={16}/> {discussionReplyCount(item)} Replies</button>{!mine && <ReportAction label="Report" reporterEmail={email} reporterName={currentName} reporterRole="Student" target={{ reportType: "content", targetType: "comment", targetId: String(item.id), targetTitle: `Question: ${item.title}`, targetOwnerEmail: item.studentEmail, targetRole: "Student" }}/>}<button type="button" className={`edc-dq-follow${followingItem ? " active" : ""}`} aria-pressed={followingItem} onClick={() => updateQuestion(item.id, question => toggleDiscussionFollow(question, user))}>{followingItem ? <BellRing size={14}/> : <Bell size={14}/>} {followingItem ? "Following" : "Follow"}</button></div>
          {item.reply?.text && <div className="edc-dq-instructor-answer"><Avatar name={teacherName} image={item.reply.teacherAvatar || teacherProfile.avatar} small/><div><div className="edc-dq-answer-author"><strong>{teacherName}</strong><span><GraduationCap size={11}/> Instructor</span></div><time>{when(item.reply.createdAt)}</time><p>{item.reply.text}</p><div className="edc-dq-answer-actions"><button type="button" aria-pressed={(item.reply.votes || []).map(discussionEmail).includes(user)} onClick={() => updateQuestion(item.id, question => ({ ...question, reply: { ...question.reply, votes: toggleDiscussionVotes(question.reply?.votes, user) } }))}><ThumbsUp size={13}/> {item.reply.votes?.length || 0} Likes</button><button type="button" onClick={() => openReplies(item.id)}><Reply size={13}/> Reply</button>{mine && <ReportAction label="Report answer" reporterEmail={email} reporterName={currentName} target={{ reportType: "content", targetType: "comment", targetId: String(item.id), targetTitle: `Instructor answer: ${item.title}`, targetOwnerEmail: teacherEmail, targetRole: "Teacher" }}/>}</div></div></div>}
          {expanded[item.id] && <div className="edc-dq-replies">{peers.map(reply => <div className="edc-dq-peer-reply" key={reply.id}><Avatar name={reply.name || discussionName(reply.email)} image={reply.avatar} small/><div><strong>{reply.name || discussionName(reply.email)}</strong><time>{when(reply.createdAt)}</time><p>{reply.text}</p><button type="button" aria-pressed={(reply.votes || []).map(discussionEmail).includes(user)} onClick={() => updateQuestion(item.id, question => ({ ...question, replies: (question.replies || []).map(entry => entry.id === reply.id ? { ...entry, votes: toggleDiscussionVotes(entry.votes, user) } : entry) }))}><ThumbsUp size={13}/> {reply.votes?.length || 0} Likes</button></div></div>)}<form className="edc-dq-reply-form" onSubmit={event => postReply(event, item)}><label htmlFor={`dq-reply-${item.id}`}>Join the discussion</label><textarea id={`dq-reply-${item.id}`} ref={node => { replyRefs.current[item.id] = node; }} rows={2} maxLength={3000} value={replyDrafts[item.id] || ""} onChange={event => setReplyDrafts(previous => ({ ...previous, [item.id]: event.target.value }))} placeholder="Write a helpful reply..." required/>{replyErrors[item.id] && <p className="edc-dq-error" role="alert">{replyErrors[item.id]}</p>}<button className="edc-dq-primary" type="submit"><Send size={14}/> Post Reply</button></form></div>}
        </article>;
      })}
      {!visible.length && <div className="edc-dq-empty"><MessageCircle size={32}/><h3>{!owned.length ? "Join a course to start a conversation" : eligible.length ? "No questions match your filters" : "Start the first course discussion"}</h3><p>{!owned.length ? "Your enrolled courses will appear here when you start learning." : eligible.length ? "Try a different search, course, or question status." : "Ask your instructor a question and learn together with your classmates."}</p>{eligible.length ? <button type="button" className="edc-dq-secondary" onClick={() => showView("all")}>Clear Filters</button> : owned.length ? <button type="button" className="edc-dq-primary" onClick={() => openQuestion()}><Plus size={15}/> Ask a Question</button> : onExplore && <button type="button" className="edc-dq-primary" onClick={onExplore}>Explore Courses <ArrowRight size={14}/></button>}</div>}
      <p className="edc-dq-result-count" role="status" aria-live="polite">Showing {visible.length} of {eligible.length} questions</p>
    </div>
    <aside className="edc-dq-sidebar"><section className="edc-dq-side-panel"><div className="edc-dq-panel-heading"><h3><MessageCircle size={19}/> My Questions</h3><button type="button" aria-label="View my questions" onClick={() => showView("mine")}><ArrowRight size={17}/></button></div><button type="button" className="edc-dq-summary-row" onClick={() => showView("mine")}><span>Questions Asked</span><strong>{ownQuestions.length}</strong></button><button type="button" className="edc-dq-summary-row" onClick={() => showView("mine", "answered")}><span>Answers Received</span><strong>{ownQuestions.filter(discussionAnswered).length}</strong></button><button type="button" className="edc-dq-summary-row" onClick={() => showView("following")}><span>Following</span><strong>{following.length}</strong></button><button type="button" className="edc-dq-summary-row" onClick={() => showView("saved")}><span>Saved Questions</span><strong>{savedQuestions.length}</strong></button></section><section className="edc-dq-side-panel"><div className="edc-dq-panel-heading"><h3><Flame size={19}/> Popular Discussions</h3></div><div className="edc-dq-popular">{popular.map(item => <button type="button" key={item.id} onClick={() => reveal(item)}><span><MessageCircle size={17}/></span><div><strong>{item.title}</strong><small>{discussionReplyCount(item)} {discussionReplyCount(item) === 1 ? "reply" : "replies"}</small></div></button>)}{!popular.length && <p>Your course discussions will appear here.</p>}</div></section></aside></div>
    <dialog className="edc-dq-dialog" ref={dialog} onCancel={event => { event.preventDefault(); setEditorOpen(false); }} onClose={() => setEditorOpen(false)} onClick={event => { if (event.target === event.currentTarget) setEditorOpen(false); }} aria-labelledby="edc-dq-dialog-title"><form onSubmit={postQuestion}><div className="edc-dq-editor-heading"><div><span>COURSE COMMUNITY</span><h3 id="edc-dq-dialog-title">{editingId ? "Edit Your Question" : "Ask a Question"}</h3></div><button type="button" aria-label="Close question form" onClick={() => setEditorOpen(false)}><X size={19}/></button></div><label>Course<select required disabled={!!editingId} value={draft.courseKey} onChange={event => setDraft({ ...draft, courseKey: event.target.value })}>{owned.map(course => <option key={course.key} value={course.key}>{course.title}</option>)}</select></label><label>Your Question<input required minLength={5} maxLength={300} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="What would you like to understand?"/></label><label>Details <small>(optional)</small><textarea rows={4} maxLength={3000} value={draft.body} onChange={event => setDraft({ ...draft, body: event.target.value })} placeholder="Describe what you tried and where you need help..."/></label><div className="edc-dq-editor-grid"><label>Lesson <small>(optional)</small><input maxLength={120} value={draft.lessonTitle} onChange={event => setDraft({ ...draft, lessonTitle: event.target.value })} placeholder="Lesson title"/></label><label>Tags <small>(optional)</small><input maxLength={180} value={draft.tags} onChange={event => setDraft({ ...draft, tags: event.target.value })} placeholder="React, Components"/></label></div>{formError && <p className="edc-dq-error" role="alert">{formError}</p>}<div className="edc-dq-editor-footer"><button type="button" className="edc-dq-secondary" onClick={() => setEditorOpen(false)}>Cancel</button><button type="submit" className="edc-dq-primary"><Send size={14}/> {editingId ? "Save Changes" : "Post Question"}</button></div></form></dialog>
  </section>;
}

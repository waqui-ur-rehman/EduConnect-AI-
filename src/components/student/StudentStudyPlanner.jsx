import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flame,
  Flag,
  Plus,
  Target,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import {
  assignmentCourseKey,
  studentAssignmentLibrary,
  subscribeStudentAssignments,
} from "../assignments/studentAssignmentHelpers";
import "./StudentStudyPlanner.css";

const STUDY_PLANNER_EVENT = "educonnect:study-planner-updated";
const TIME_SLOTS = Array.from({ length: 7 }, (_, index) => `${String(8 + index * 2).padStart(2, "0")}:00`);

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function mondayOf(date) {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

function plannerStorageKey(email) {
  return `educonnect.student.${String(email || "").trim().toLowerCase()}.studyPlanner.v1`;
}

function readPlannerData(key) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || "null");
    const plans = Array.isArray(saved?.plans)
      ? saved.plans.filter((plan) => plan && plan.id && /^\d{4}-\d{2}-\d{2}$/.test(plan.date) && /^\d{2}:\d{2}$/.test(plan.time) && Number(plan.durationMinutes) > 0)
      : [];
    const target = Number(saved?.weeklyGoalHours);
    return {
      plans,
      weeklyGoalHours: Number.isFinite(target) && target > 0 ? target : null,
    };
  } catch {
    return { plans: [], weeklyGoalHours: null };
  }
}

function formatDuration(minutes) {
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  return `${(safeMinutes / 60).toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs`;
}

function formatDueDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "Date unavailable";
}

function studyStreak(days) {
  let date = new Date();
  date.setHours(0, 0, 0, 0);
  if (!(Number(days?.[dateKey(date)]) > 0)) date.setDate(date.getDate() - 1);
  let count = 0;
  while (Number(days?.[dateKey(date)]) > 0 && count < 366) {
    count += 1;
    date.setDate(date.getDate() - 1);
  }
  return count;
}

export default function StudentStudyPlanner({
  email,
  courses = [],
  publishedCourses = [],
  activity = {},
  dailyGoals = [],
  newGoal,
  setNewGoal,
  onAddGoal,
  onToggleGoal,
  onDeleteGoal,
  onNavigate,
}) {
  const storageKey = plannerStorageKey(email);
  const [plannerData, setPlannerData] = useState(() => readPlannerData(storageKey));
  const [assignmentRevision, setAssignmentRevision] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [activeView, setActiveView] = useState("week");
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState("");
  const [planTitle, setPlanTitle] = useState("");
  const [planCourse, setPlanCourse] = useState("");
  const [planDate, setPlanDate] = useState(() => dateKey(new Date()));
  const [planTime, setPlanTime] = useState("08:00");
  const [planDuration, setPlanDuration] = useState("60");
  const planForm = useRef(null);
  const [goalHours, setGoalHours] = useState(() => {
    const saved = readPlannerData(storageKey).weeklyGoalHours;
    return saved ? String(saved) : "";
  });
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const refresh = () => setPlannerData(readPlannerData(storageKey));
    window.addEventListener("storage", refresh);
    window.addEventListener(STUDY_PLANNER_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(STUDY_PLANNER_EVENT, refresh);
    };
  }, [storageKey]);

  useEffect(() => subscribeStudentAssignments(() => setAssignmentRevision((value) => value + 1)), []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const assignments = useMemo(() => {
    void assignmentRevision;
    return studentAssignmentLibrary(email, courses, publishedCourses);
  }, [email, courses, publishedCourses, assignmentRevision]);

  const courseByKey = useMemo(
    () => new Map(courses.map((course) => [assignmentCourseKey(course), course])),
    [courses],
  );
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + index);
      return date;
    }),
    [weekStart],
  );
  const weekKeys = weekDays.map(dateKey);
  const weekPlans = plannerData.plans.filter((plan) => weekKeys.includes(plan.date));
  const activityDays = activity.days || {};
  const completedSeconds = weekKeys.reduce((total, key) => total + Math.max(0, Number(activityDays[key]) || 0), 0);
  const plannedMinutes = weekPlans.reduce((total, plan) => total + Number(plan.durationMinutes), 0);
  const goalPercent = plannerData.weeklyGoalHours
    ? Math.min(100, Math.round((completedSeconds / (plannerData.weeklyGoalHours * 3600)) * 100))
    : 0;
  const todayKey = dateKey(now);
  const upcomingAssignments = assignments
    .filter((entry) => !entry.latest && entry.assignment.dueAt && Date.parse(entry.assignment.dueAt) >= now.getTime())
    .sort((a, b) => Date.parse(a.assignment.dueAt) - Date.parse(b.assignment.dueAt))
    .slice(0, 4);
  const weekLabel = `${weekDays[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${weekDays[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  const dailyMinutes = weekKeys.map((key) => Math.round(Math.max(0, Number(activityDays[key]) || 0) / 60));
  const chartMax = Math.max(1, ...dailyMinutes);

  function persist(next, message = "") {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setPlannerData(next);
      setNotice(message);
      window.dispatchEvent(new Event(STUDY_PLANNER_EVENT));
    } catch (error) {
      setNotice(error?.message || "Study Planner changes could not be saved in this browser.");
    }
  }

  function openSummaryView(view, sectionId) {
    setActiveView(view);
    window.requestAnimationFrame(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function addPlan(event) {
    event.preventDefault();
    const title = planTitle.trim();
    const durationMinutes = Number(planDuration);
    if (!title || !planDate || !TIME_SLOTS.includes(planTime) || !Number.isFinite(durationMinutes) || durationMinutes < 5 || durationMinutes > 720) {
      setNotice("Enter a plan title, date, time, and duration between 5 minutes and 12 hours.");
      return;
    }
    const existing = plannerData.plans.find((item) => item.id === editingPlanId);
    const plan = {
      ...(existing || {}),
      id: existing?.id || globalThis.crypto?.randomUUID?.() || `plan-${Date.now()}`,
      title: title.slice(0, 100),
      courseKey: planCourse,
      date: planDate,
      time: planTime,
      durationMinutes,
    };
    const plans = existing
      ? plannerData.plans.map((item) => item.id === existing.id ? plan : item)
      : [...plannerData.plans, plan];
    persist({ ...plannerData, plans }, existing ? "Study plan updated." : "Study plan saved.");
    setEditingPlanId("");
    setPlanTitle("");
    setPlanCourse("");
    setShowPlanForm(false);
  }

  function editPlan(plan) {
    setEditingPlanId(plan.id);
    setPlanTitle(plan.title);
    setPlanCourse(plan.courseKey || "");
    setPlanDate(plan.date);
    setPlanTime(plan.time);
    setPlanDuration(String(plan.durationMinutes));
    setShowPlanForm(true);
    setActiveView("week");
    setNotice("");
    window.requestAnimationFrame(() => planForm.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function startPlanForm() {
    if (showPlanForm && !editingPlanId) {
      setShowPlanForm(false);
      return;
    }
    setEditingPlanId("");
    setPlanTitle("");
    setPlanCourse("");
    setPlanDate(weekKeys.includes(planDate) ? planDate : weekKeys[0]);
    setPlanTime("08:00");
    setPlanDuration("60");
    setShowPlanForm(true);
    window.requestAnimationFrame(() => planForm.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function closePlanForm() {
    setShowPlanForm(false);
    setEditingPlanId("");
    setPlanTitle("");
    setPlanCourse("");
  }

  function removePlan(id) {
    persist({ ...plannerData, plans: plannerData.plans.filter((plan) => plan.id !== id) }, "Study plan removed.");
  }

  function saveGoal(event) {
    event.preventDefault();
    const target = Number(goalHours);
    if (!Number.isFinite(target) || target <= 0 || target > 168) {
      setNotice("Set a weekly goal between 0.5 and 168 hours.");
      return;
    }
    persist({ ...plannerData, weeklyGoalHours: target }, "Weekly study goal saved.");
  }

  function goalList(compact = false) {
    return dailyGoals.length ? (
      <div className={`edc-sp-goals${compact ? " compact" : ""}`}>
        {dailyGoals.map((goal) => (
          <div className="edc-sp-goal" key={goal.id}>
            <label>
              <input type="checkbox" checked={Boolean(goal.done)} onChange={() => onToggleGoal(goal.id)} />
              <span className={goal.done ? "done" : ""}>{goal.title}</span>
            </label>
            {!compact && <button type="button" aria-label={`Delete ${goal.title}`} onClick={() => onDeleteGoal(goal.id)}><Trash2 size={14} /></button>}
          </div>
        ))}
      </div>
    ) : (
      <div className="edc-sp-empty"><CheckCircle2 size={21} /><span>No study tasks yet. Add one when you are ready.</span></div>
    );
  }

  function renderDeadlines() {
    return (
      <section className="edc-sp-panel edc-sp-deadlines">
        <header><h3><Flag size={16} />Upcoming Deadlines</h3><button type="button" onClick={() => onNavigate?.("course-assignments")}>View All</button></header>
        {upcomingAssignments.length ? upcomingAssignments.map((entry) => (
          <article key={entry.key}>
            <BookOpen size={15} />
            <div><strong>{entry.assignment.title}</strong><small>{entry.course.title}</small></div>
            <time dateTime={entry.assignment.dueAt}>{formatDueDate(entry.assignment.dueAt)}</time>
          </article>
        )) : <p className="edc-sp-empty-text">{assignments.some((entry) => entry.assignment.dueAt) ? "No upcoming assignment deadlines." : "No published assignment deadlines from your courses."}</p>}
      </section>
    );
  }

  function renderProgress() {
    return (
      <section className="edc-sp-panel edc-sp-progress">
        <header><h3><BarChart3 size={16} />Study Progress</h3><span>This Week</span></header>
        <div className="edc-sp-progress-summary">
          <div className="edc-sp-progress-ring" style={{ "--progress": `${goalPercent}%` }}><strong>{plannerData.weeklyGoalHours ? `${goalPercent}%` : "--"}</strong></div>
          <div><strong>{formatDuration(Math.round(completedSeconds / 60))}</strong><small>{plannerData.weeklyGoalHours ? `of ${plannerData.weeklyGoalHours} hr goal` : "time recorded"}</small></div>
        </div>
        <div className="edc-sp-chart" aria-label="Recorded learning time for each day this week">
          {weekDays.map((date, index) => (
            <div className="edc-sp-chart-day" key={weekKeys[index]}>
              <span><i style={{ height: `${Math.max(3, (dailyMinutes[index] / chartMax) * 100)}%` }} /></span>
              <small>{date.toLocaleDateString(undefined, { weekday: "narrow" })}</small>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function renderCalendar() {
    return (
      <div className="edc-sp-calendar-scroll">
        <div className="edc-sp-calendar">
          <div className="edc-sp-calendar-head edc-sp-time-head">Time</div>
          {weekDays.map((date, index) => (
            <div className={`edc-sp-calendar-head${weekKeys[index] === todayKey ? " today" : ""}`} key={weekKeys[index]}>
              <strong>{date.toLocaleDateString(undefined, { weekday: "short" })}</strong>
              <small>{date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small>
            </div>
          ))}
          {TIME_SLOTS.map((time) => (
            <div className="edc-sp-calendar-row" key={time}>
              <div className="edc-sp-calendar-time">{new Date(`2000-01-01T${time}:00`).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</div>
              {weekDays.map((date, index) => {
                const plans = weekPlans.filter((plan) => plan.date === weekKeys[index] && plan.time === time);
                return (
                  <div className="edc-sp-calendar-cell" key={`${weekKeys[index]}-${time}`}>
                    {plans.map((plan) => (
                      <article className={`edc-sp-event tone-${weekPlans.indexOf(plan) % 4}`} key={plan.id}>
                        <button type="button" className="edc-sp-event-open" aria-label={`Edit study plan: ${plan.title}`} onClick={() => editPlan(plan)}>
                          <strong>{plan.title}</strong>
                          {plan.courseKey && <small>{courseByKey.get(plan.courseKey)?.title || "Enrolled course"}</small>}
                          <span>{formatDuration(plan.durationMinutes)}</span>
                        </button>
                        <button type="button" className="edc-sp-event-remove" aria-label={`Remove ${plan.title}`} onClick={() => removePlan(plan.id)}><X size={11} /></button>
                      </article>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="edc-study-planner">
      <header className="edc-sp-heading">
        <div className="edc-sp-heading-title"><span><CalendarDays size={25} /></span><div><h2>Study Planner</h2><p>Plan your study, manage tasks, and stay on track with your learning goals.</p></div></div>
      </header>

      <section className="edc-sp-stats" aria-label="Study summary">
        <button type="button" className="tone-purple" onClick={() => openSummaryView("goals", "edc-sp-weekly-goal")} aria-label={`Weekly Goal: ${plannerData.weeklyGoalHours ? `${plannerData.weeklyGoalHours} hours` : "not set"}. Open goal settings`}>
          <span><Target size={23} /></span><div><small>Weekly Goal</small><strong>{plannerData.weeklyGoalHours ? `${plannerData.weeklyGoalHours} hrs` : "Not set"}</strong></div>
        </button>
        <button type="button" className="tone-blue" onClick={() => openSummaryView("week", "edc-sp-week-schedule")} aria-label={`Planned Time: ${formatDuration(plannedMinutes)}. View weekly schedule`}>
          <span><Clock3 size={23} /></span><div><small>Planned Time</small><strong>{formatDuration(plannedMinutes)}</strong></div>
        </button>
        <button type="button" className="tone-green" onClick={() => openSummaryView("reports", "edc-sp-recorded-time")} aria-label={`Completed: ${formatDuration(Math.round(completedSeconds / 60))}. View study reports`}>
          <span><CheckCircle2 size={23} /></span><div><small>Completed</small><strong>{formatDuration(Math.round(completedSeconds / 60))}</strong></div>
        </button>
        <button type="button" className="tone-purple" onClick={() => openSummaryView("reports", "edc-sp-weekly-summary")} aria-label={`Study Streak: ${studyStreak(activityDays)} days. View weekly summary`}>
          <span><Flame size={23} /></span><div><small>Study Streak</small><strong>{studyStreak(activityDays)} days</strong></div>
        </button>
      </section>

      <div className="edc-sp-toolbar">
        <nav className="edc-sp-tabs" aria-label="Study Planner views">
          {[["week", "Weekly Plan", CalendarDays], ["tasks", "My Tasks", Check], ["goals", "Goals", Flag], ["reports", "Reports", BarChart3]].map(([view, label, Icon]) => (
            <button type="button" key={view} className={activeView === view ? "active" : ""} aria-pressed={activeView === view} onClick={() => setActiveView(view)}><Icon size={15} />{label}</button>
          ))}
        </nav>
        {activeView === "week" && <div className="edc-sp-week-controls"><button type="button" aria-label="Previous week" onClick={() => setWeekStart((date) => { const next = new Date(date); next.setDate(next.getDate() - 7); return next; })}><ChevronLeft size={16} /></button><strong>{weekLabel}</strong><button type="button" aria-label="Next week" onClick={() => setWeekStart((date) => { const next = new Date(date); next.setDate(next.getDate() + 7); return next; })}><ChevronRight size={16} /></button></div>}
        {activeView === "week" && <button type="button" className="edc-sp-primary" onClick={startPlanForm}><Plus size={16} />Add Study Plan</button>}
      </div>

      {notice && <p className="edc-sp-notice" role="status">{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice("")}><X size={14} /></button></p>}

      {showPlanForm && activeView === "week" && <form className="edc-sp-plan-form" ref={planForm} onSubmit={addPlan}>
        <label>Study plan title<input required maxLength={100} value={planTitle} onChange={(event) => setPlanTitle(event.target.value)} placeholder="What would you like to study?" /></label>
        <label>Related course<select value={planCourse} onChange={(event) => setPlanCourse(event.target.value)}><option value="">No course selected</option>{courses.map((course) => <option key={assignmentCourseKey(course)} value={assignmentCourseKey(course)}>{course.title}</option>)}</select></label>
        <label>Date<input type="date" required value={planDate} onChange={(event) => setPlanDate(event.target.value)} /></label>
        <label>Start time<select value={planTime} onChange={(event) => setPlanTime(event.target.value)}>{TIME_SLOTS.map((time) => <option key={time} value={time}>{new Date(`2000-01-01T${time}:00`).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</option>)}</select></label>
        <label>Duration (minutes)<input type="number" min="5" max="720" step="5" required value={planDuration} onChange={(event) => setPlanDuration(event.target.value)} /></label>
        <div className="edc-sp-form-actions"><button type="button" className="edc-sp-secondary" onClick={closePlanForm}>Cancel</button><button type="submit" className="edc-sp-primary"><Check size={15} />{editingPlanId ? "Update Plan" : "Save Plan"}</button></div>
      </form>}

      {activeView === "week" && <div className="edc-sp-week-layout">
        <section className="edc-sp-panel edc-sp-schedule" id="edc-sp-week-schedule">
          <header><h3><CalendarDays size={17} />Weekly Study Schedule</h3><span>{weekPlans.length} planned</span></header>
          {renderCalendar()}
          <div className="edc-sp-legend"><span><i className="tone-purple" />Study plan</span><small>Plans you add appear in your schedule.</small></div>
        </section>
        <aside className="edc-sp-side">
          <section className="edc-sp-panel edc-sp-today">
            <header><h3><CheckCircle2 size={16} />Today's Tasks</h3><span>{dailyGoals.filter((goal) => goal.done).length} of {dailyGoals.length} completed</span></header>
            {dailyGoals.length ? <>{goalList(true)}<button type="button" className="edc-sp-text-button" onClick={() => setActiveView("tasks")}>Manage Tasks</button></> : <div className="edc-sp-empty"><span>No tasks added yet.</span><button type="button" onClick={() => setActiveView("tasks")}>Add a Task</button></div>}
          </section>
          {renderDeadlines()}
          {renderProgress()}
        </aside>
      </div>}

      {activeView === "tasks" && <div className="edc-sp-secondary-layout">
        <section className="edc-sp-panel">
          <header><h3><CheckCircle2 size={17} />My Study Tasks</h3><span>{dailyGoals.filter((goal) => goal.done).length} of {dailyGoals.length} completed</span></header>
          <form className="edc-sp-task-form" onSubmit={onAddGoal}><input aria-label="New study task" value={newGoal} onChange={(event) => setNewGoal(event.target.value)} placeholder="Add a study task..." maxLength={100} /><button type="submit" className="edc-sp-primary"><Plus size={15} />Add Task</button></form>
          {goalList()}
        </section>
        {renderDeadlines()}
      </div>}

      {activeView === "goals" && <div className="edc-sp-secondary-layout">
        <section className="edc-sp-panel edc-sp-goal-setting" id="edc-sp-weekly-goal">
          <header><h3><Target size={17} />Weekly Study Goal</h3></header>
          <p>Set a weekly learning-time target. Completed time is based on recorded course video activity.</p>
          <form onSubmit={saveGoal}><label>Hours per week<input type="number" min="0.5" max="168" step="0.5" value={goalHours} onChange={(event) => setGoalHours(event.target.value)} placeholder="Enter your target" /></label><button type="submit" className="edc-sp-primary">Save Goal</button></form>
          <div className="edc-sp-goal-progress"><span><strong>{formatDuration(Math.round(completedSeconds / 60))}</strong> completed this week</span><span>{plannerData.weeklyGoalHours ? `${goalPercent}% of ${plannerData.weeklyGoalHours} hrs` : "No weekly goal set"}</span><div><i style={{ width: `${goalPercent}%` }} /></div></div>
        </section>
        <section className="edc-sp-panel"><header><h3><Flag size={17} />Daily Tasks</h3><button type="button" className="edc-sp-text-button" onClick={() => setActiveView("tasks")}>Manage Tasks</button></header>{goalList()}</section>
      </div>}

      {activeView === "reports" && <div className="edc-sp-reports">
        <section className="edc-sp-panel" id="edc-sp-recorded-time">
          <header><h3><BarChart3 size={17} />Recorded Study Time</h3><span>{weekLabel}</span></header>
          <p>Only course learning time recorded in your account is included.</p>
          <div className="edc-sp-report-chart">{weekDays.map((date, index) => (
            <div key={weekKeys[index]}><span>{formatDuration(dailyMinutes[index])}</span><i><b style={{ height: `${Math.max(3, (dailyMinutes[index] / chartMax) * 100)}%` }} /></i><small>{date.toLocaleDateString(undefined, { weekday: "short" })}</small></div>
          ))}</div>
          <footer><span>Total this week</span><strong>{formatDuration(Math.round(completedSeconds / 60))}</strong></footer>
        </section>
        <section className="edc-sp-panel edc-sp-report-summary" id="edc-sp-weekly-summary"><header><h3><Trophy size={17} />Weekly Summary</h3></header><dl><div><dt>Weekly goal</dt><dd>{plannerData.weeklyGoalHours ? `${plannerData.weeklyGoalHours} hrs` : "Not set"}</dd></div><div><dt>Planned time</dt><dd>{formatDuration(plannedMinutes)}</dd></div><div><dt>Recorded time</dt><dd>{formatDuration(Math.round(completedSeconds / 60))}</dd></div><div><dt>Current streak</dt><dd>{studyStreak(activityDays)} days</dd></div></dl></section>
      </div>}
    </section>
  );
}

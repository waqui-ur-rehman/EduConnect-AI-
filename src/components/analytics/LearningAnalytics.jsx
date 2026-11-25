import React, { useMemo, useState } from "react";
import { ArrowLeft, Award, BookOpen, CalendarDays, CheckCircle2, Clock3, Download, Flame, PlayCircle, Target, TrendingUp } from "lucide-react";
import "./LearningAnalytics.css";

const localDay = (date = new Date()) => {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, "0"), d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const formatTime = seconds => {
  const minutes = Math.floor((Number(seconds) || 0) / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
};

export default function LearningAnalytics({ courses = [], activity = {}, serverAnalytics = null }) {
  const [detail, setDetail] = useState("");
  const [range, setRange] = useState(7);
  const [activeSection, setActiveSection] = useState("overview");
  const days = activity.days || {};
  const now = new Date();
  const today = localDay(now);
  const chartDays = useMemo(() => Array.from({ length: range }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (range - 1 - i));
    const key = localDay(date);
    return { key, label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }), shortLabel: date.toLocaleDateString(undefined, { weekday: "short" }), seconds: Math.max(0, Number(days[key]) || 0) };
  }), [activity, range]);
  const monthPrefix = today.slice(0, 7);
  const monthlySeconds = Object.entries(days).filter(([day]) => day.startsWith(monthPrefix)).reduce((sum, [, seconds]) => sum + Math.max(0, Number(seconds) || 0), 0);
  let streak = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!(Number(days[today]) > 0)) cursor.setDate(cursor.getDate() - 1);
  for (let i = 0; i < 365 && Number(days[localDay(cursor)]) > 0; i++) { streak++; cursor.setDate(cursor.getDate() - 1); }

  const serverSummary = serverAnalytics?.summary || null;
  const serverCourses = Array.isArray(serverAnalytics?.courses) ? serverAnalytics.courses : [];
  const displayCourses = serverCourses.length ? serverCourses.map((course) => ({ ...course, id: course.courseId || course.id, title: course.title, lessons: course.totalLessons ?? course.lessons ?? 0, completedLessons: course.completedLessons ?? 0, progress: course.progress ?? 0, teacherEmail: course.teacherEmail || "" })) : courses;
  const completedCourses = serverSummary ? Number(serverSummary.completedCourses || 0) : courses.filter(course => Number(course.progress) === 100).length;
  const activeCourses = serverSummary ? Math.max(0, Number(serverSummary.enrolledCourses || 0) - completedCourses) : courses.filter(course => Number(course.progress) > 0 && Number(course.progress) < 100).length;
  const untouchedCourses = serverSummary ? 0 : courses.length - completedCourses - activeCourses;
  const totalLessons = serverSummary ? Number(serverSummary.totalLessons || 0) : courses.reduce((sum, course) => sum + Math.max(0, Number(course.lessons) || 0), 0);
  const completedLessons = serverSummary ? Number(serverSummary.completedLessons || 0) : courses.reduce((sum, course) => sum + Math.max(0, Number(course.completedLessons) || 0), 0);
  const lessonProgress = serverSummary ? Number(serverSummary.overallProgress || 0) : (totalLessons ? Math.round(completedLessons / totalLessons * 100) : 0);
  const activeDays = chartDays.filter(day => day.seconds > 0).length;
  const maxSeconds = Math.max(60, ...chartDays.map(day => day.seconds));
  const chartPoints = chartDays.map((day, index) => ({
    ...day,
    x: 36 + index / Math.max(1, chartDays.length - 1) * 630,
    y: 190 - day.seconds / maxSeconds * 150,
  }));
  const linePath = chartPoints.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const areaPath = `${linePath} L${chartPoints.at(-1)?.x || 666},198 L${chartPoints[0]?.x || 36},198 Z`;
  const serverMilestones = Array.isArray(serverAnalytics?.milestones) ? serverAnalytics.milestones : null;
  const milestones = serverMilestones ? serverMilestones.map((item) => ({ title: item.title, earned: Boolean(item.earned), detail: item.detail || "", icon: item.earned ? Award : Target })) : [
    { title: "First Steps", earned: (Number(activity.totalSeconds) || 0) >= 60, detail: "Watch your first minute", icon: PlayCircle },
    { title: "Focused Learner", earned: (Number(activity.totalSeconds) || 0) >= 1800, detail: "Learn for 30 minutes", icon: Target },
    { title: "Consistent Learner", earned: streak >= 3, detail: "Build a 3-day streak", icon: Flame },
    { title: "Course Finisher", earned: completedCourses > 0, detail: "Complete a course", icon: Award },
  ];
  const quizPerformance = Array.isArray(serverAnalytics?.quizPerformance) ? serverAnalytics.quizPerformance : [];
  const revisionTopics = Array.isArray(serverAnalytics?.revisionTopics) ? serverAnalytics.revisionTopics : [];
  const goTo = (id, section) => { setActiveSection(section); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const exportReport = () => {
    const rows = [["Learning Analytics Report"], ["Range", `Last ${range} days`], ["Video watch time", formatTime(activity.totalSeconds)], ["Learning streak", `${streak} days`], [], ["Course", "Lessons completed", "Total lessons", "Progress"]];
    courses.forEach(course => rows.push([course.title || "Untitled course", course.completedLessons || 0, course.lessons || 0, `${Math.round(Number(course.progress) || 0)}%`]));
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "educonnect-learning-analytics.csv"; anchor.click(); URL.revokeObjectURL(url);
  };

  if (detail) {
    const completedView = detail === "completed";
    const videoView = detail === "video";
    const streakView = detail === "streak";
    const detailCourses = completedView ? courses.filter(course => Number(course.progress) === 100) : courses;
    const watchedDays = Object.entries(days).filter(([, seconds]) => Number(seconds) > 0).sort(([a], [b]) => b.localeCompare(a));
    const title = completedView ? "Completed courses" : videoView ? "Video watch time" : streakView ? "Learning streak" : "Enrolled courses";
    return <div className="edc-analytics edc-analytics-detail">
      <button className="edc-la-back" type="button" onClick={() => setDetail("")}><ArrowLeft size={17}/> Back to Learning Analytics</button>
      <header className="edc-la-header"><span>LEARNING ANALYTICS DETAILS</span><h2>{title}</h2><p>{videoView ? "Playback time from course videos recorded on this account." : streakView ? "A learning day counts when you watch at least one tracked video." : "Review your course progress and learning activity."}</p></header>
      {videoView ? <><section className="edc-la-stat-grid"><article><span>Total watch time</span><strong>{formatTime(activity.totalSeconds)}</strong></article><article><span>This month</span><strong>{formatTime(monthlySeconds)}</strong></article><article><span>Today</span><strong>{formatTime(days[today])}</strong></article></section><section className="edc-la-panel"><h3>Daily watch history</h3>{watchedDays.length ? <div className="edc-la-history">{watchedDays.map(([day, seconds]) => <div key={day}><span><PlayCircle size={16}/>{new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { dateStyle: "medium" })}</span><strong>{formatTime(seconds)}</strong></div>)}</div> : <p>No video watch time has been recorded yet.</p>}</section></>
        : streakView ? <><section className="edc-la-streak"><Flame size={30}/><div><span>Current learning streak</span><strong>{streak} {streak === 1 ? "day" : "days"}</strong></div></section><section className="edc-la-panel"><h3>Recent learning days</h3><p>Days with tracked video playback are marked as active.</p><div className="edc-la-history">{chartDays.slice().reverse().map(day => <div key={day.key}><span>{day.label}</span><strong>{day.seconds > 0 ? "Active" : "No activity"}</strong></div>)}</div></section></>
          : <section className="edc-la-panel"><h3>{completedView ? "Courses completed" : "Your enrolled courses"}</h3>{detailCourses.length ? <div className="edc-la-course-list">{detailCourses.map(course => <article key={`${course.teacherEmail || "demo"}:${course.id}`}><div><span>{course.category || "Course"}</span><strong>{course.title}</strong><small>By {course.instructor || "EduConnect Instructor"}</small></div>{completedView && <CheckCircle2 size={21}/>}<p>{course.completedLessons || 0} of {course.lessons || 0} lessons · {Math.round(Number(course.progress) || 0)}% complete</p></article>)}</div> : <p>{completedView ? "You have not completed a course yet." : "You are not enrolled in any courses yet."}</p>}</section>}
    </div>;
  }

  return <div className="edc-analytics">
    <header className="edc-la-header">
      <div className="edc-la-heading-row"><div><span>YOUR LEARNING JOURNEY</span><h2>Learning Analytics &amp; Progress</h2><p>Track your learning progress, course performance, and study activity.</p></div><div className="edc-la-header-actions"><label><CalendarDays size={16}/><select value={range} onChange={event => setRange(Number(event.target.value))}><option value={7}>Last 7 Days</option><option value={30}>Last 30 Days</option><option value={90}>Last 90 Days</option></select></label><button type="button" onClick={exportReport}><Download size={16}/> Export Report</button></div></div>
    </header>
    <nav className="edc-la-tabs" aria-label="Learning analytics sections"><button className={activeSection === "overview" ? "active" : ""} type="button" onClick={() => goTo("edc-la-overview", "overview")}><TrendingUp size={17}/> Overview</button><button className={activeSection === "courses" ? "active" : ""} type="button" onClick={() => goTo("edc-la-progress", "courses")}><BookOpen size={17}/> Course Progress</button><button className={activeSection === "activity" ? "active" : ""} type="button" onClick={() => goTo("edc-la-activity", "activity")}><PlayCircle size={17}/> Study Activity</button><button className={activeSection === "milestones" ? "active" : ""} type="button" onClick={() => goTo("edc-la-milestones", "milestones")}><Award size={17}/> Milestones</button></nav>
    <section className="edc-la-metrics" id="edc-la-overview">
      <button type="button" onClick={() => setDetail("enrolled")}><span className="edc-la-metric-icon violet"><BookOpen size={22}/></span><span><small>Enrolled Courses</small><strong>{courses.length}</strong></span></button>
      <button type="button" onClick={() => setDetail("video")}><span className="edc-la-metric-icon amber"><Clock3 size={22}/></span><span><small>Video Watch Time</small><strong>{formatTime(activity.totalSeconds)}</strong></span></button>
      <button type="button" onClick={() => goTo("edc-la-progress", "courses")}><span className="edc-la-metric-icon blue"><CheckCircle2 size={22}/></span><span><small>Lessons Completed</small><strong>{completedLessons}<small> / {totalLessons}</small></strong></span></button>
      <button type="button" onClick={() => setDetail("streak")}><span className="edc-la-metric-icon green"><Flame size={22}/></span><span><small>Learning Streak</small><strong>{streak} <small>{streak === 1 ? "day" : "days"}</small></strong></span></button>
    </section>
    <div className="edc-la-top-grid">
      <section className="edc-la-panel edc-la-progress-panel"><h3><Target size={18}/> Learning Progress</h3><div className="edc-la-progress-content"><div className="edc-la-donut" style={{ "--progress": `${lessonProgress}%` }}><div><strong>{lessonProgress}%</strong><span>Overall<br/>Progress</span></div></div><div className="edc-la-legend"><div><i className="complete"/><span>Completed</span><strong>{completedCourses}</strong></div><div><i className="active"/><span>In Progress</span><strong>{activeCourses}</strong></div><div><i className="not-started"/><span>Not Started</span><strong>{untouchedCourses}</strong></div></div></div></section>
      <section className="edc-la-panel edc-la-trend-panel" id="edc-la-activity"><div className="edc-la-panel-title"><div><h3><TrendingUp size={18}/> Learning Activity</h3><p>Video learning time over the last {range} days</p></div><span className="edc-la-change"><i/> {activeDays} active days</span></div><div className="edc-la-chart-wrap"><svg className="edc-la-chart" viewBox="0 0 700 235" role="img" aria-label={`Daily study activity over the last ${range} days`}><defs><linearGradient id="edc-learning-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#7624dd" stopOpacity=".30"/><stop offset="100%" stopColor="#7624dd" stopOpacity=".02"/></linearGradient></defs>{[40, 80, 120, 160, 198].map(y => <line key={y} x1="36" x2="666" y1={y} y2={y} className="edc-la-grid-line"/>)}<path d={areaPath} fill="url(#edc-learning-area)"/><path d={linePath} className="edc-la-line"/>{chartPoints.map(point => <circle key={point.key} cx={point.x} cy={point.y} r={range === 7 ? 4 : 2.5} className="edc-la-point"><title>{point.label}: {formatTime(point.seconds)}</title></circle>)}{chartPoints.filter((_, index) => index === 0 || index === chartPoints.length - 1 || index % Math.max(1, Math.floor(range / 6)) === 0).map(point => <text key={`label-${point.key}`} x={point.x} y="222" textAnchor="middle" className="edc-la-axis-label">{range === 7 ? point.shortLabel : point.label}</text>)}</svg>{!activeDays && <span className="edc-la-chart-empty">Your study activity will appear here</span>}</div></section>
      <section className="edc-la-panel edc-la-snapshot"><h3><Clock3 size={18}/> Study Snapshot</h3><strong className="edc-la-snapshot-total">{formatTime(activity.totalSeconds)}</strong><span className="edc-la-snapshot-caption">Total learning time</span><div className="edc-la-summary-row"><span>Today</span><strong>{formatTime(days[today])}</strong></div><div className="edc-la-summary-row"><span>This month</span><strong>{formatTime(monthlySeconds)}</strong></div><div className="edc-la-summary-row"><span>Lessons completed</span><strong>{completedLessons} / {totalLessons}</strong></div></section>
    </div>
    <div className="edc-la-bottom-grid">
      <section className="edc-la-panel edc-la-course-panel" id="edc-la-progress"><div className="edc-la-panel-title"><h3><BookOpen size={18}/> Course Performance</h3><button type="button" onClick={() => setDetail("enrolled")}>View All Courses →</button></div>{displayCourses.length ? <div className="edc-la-table-wrap"><table><thead><tr><th>Course Title</th><th>Lessons</th><th>Completion</th><th>Progress</th></tr></thead><tbody>{displayCourses.map(course => { const progress = Math.min(100, Math.max(0, Number(course.progress) || 0)); return <tr key={`${course.teacherEmail || "demo"}:${course.id}`}><td><span className="edc-la-course-icon"><BookOpen size={17}/></span><strong>{course.title || "Untitled course"}</strong></td><td>{course.completedLessons || 0} / {course.lessons || 0}</td><td>{Math.round(progress)}%</td><td><div className="edc-la-mini-track"><span style={{ width: `${progress}%` }}/></div></td></tr>; })}</tbody></table></div> : <p className="edc-la-empty">Enroll in a course to see your learning progress here.</p>}</section>
      <section className="edc-la-panel edc-la-milestone-panel" id="edc-la-milestones"><div className="edc-la-panel-title"><h3><Award size={18}/> Learning Milestones</h3><span className="edc-la-milestone-count">{milestones.filter(milestone => milestone.earned).length} / {milestones.length} earned</span></div><div className="edc-la-milestones">{milestones.map(milestone => { const Icon = milestone.icon; return <article key={milestone.title} className={milestone.earned ? "earned" : ""}><span className="edc-la-milestone-icon"><Icon size={18}/></span><div><strong>{milestone.title}</strong><small>{milestone.detail}</small></div>{milestone.earned && <CheckCircle2 size={17}/>}</article>; })}</div><p className="edc-la-footnote">{serverAnalytics ? "Progress, quiz, and milestone metrics are loaded from MongoDB. Video watch time is still recorded in this browser." : "Learning activity is based on course video playback recorded in this browser."}</p></section>
    </div>
    {serverAnalytics && <div className="edc-la-bottom-grid">
      <section className="edc-la-panel edc-la-course-panel"><div className="edc-la-panel-title"><h3><CheckCircle2 size={18}/> Quiz Performance</h3><span className="edc-la-milestone-count">{serverSummary?.passedQuizzes || 0} passed / {serverSummary?.quizAttempts || 0} attempts</span></div>{quizPerformance.length ? <div className="edc-la-table-wrap"><table><thead><tr><th>Course</th><th>Date</th><th>Score</th><th>Status</th></tr></thead><tbody>{quizPerformance.slice(0, 8).map((attempt, index) => <tr key={`${attempt.courseId}-${attempt.submittedAt || index}`}><td><strong>{attempt.courseTitle || "Course"}</strong></td><td>{attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleDateString() : "—"}</td><td>{Math.round(Number(attempt.percentage) || 0)}%</td><td>{attempt.passed ? "Passed" : "Needs revision"}</td></tr>)}</tbody></table></div> : <p className="edc-la-empty">No quiz attempts recorded in MongoDB yet.</p>}</section>
      <section className="edc-la-panel edc-la-milestone-panel"><div className="edc-la-panel-title"><h3><Target size={18}/> Revision Recommendations</h3></div>{revisionTopics.length ? <div className="edc-la-milestones">{revisionTopics.map((item, index) => <article key={`${item.topic}-${index}`}><span className="edc-la-milestone-icon"><Target size={18}/></span><div><strong>{item.topic}</strong><small>{item.reason}</small></div></article>)}</div> : <p className="edc-la-empty">No revision topics right now. Keep up the good work.</p>}</section>
    </div>}
  </div>;
}

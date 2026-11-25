import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Award, BookOpen, CalendarDays, CheckCircle2, CircleHelp, GraduationCap, Layers, Lightbulb, Play, Search, Target, TrendingUp, X } from "lucide-react";
import { quizCourseKey, studentQuizLibrary, subscribeStudentQuizzes } from "../../utils/studentQuizzes";
import "./StudentTopicMastery.css";

function questionReviews(entries) {
  return entries.flatMap(entry => {
    if (!entry.latest) return [];
    const questions = Array.isArray(entry.latest.questions) && entry.latest.questions.length
      ? entry.latest.questions
      : entry.quiz.questions;
    const answers = entry.latest.answers && typeof entry.latest.answers === "object" && !Array.isArray(entry.latest.answers)
      ? entry.latest.answers
      : {};

    return questions.map((question, index) => {
      const answer = answers[index];
      const answered = Number.isInteger(answer) && answer >= 0 && answer < question.options.length;
      return {
        id: `${entry.key}-${question.id || index}`,
        entry,
        prompt: question.prompt,
        status: !answered ? "unanswered" : answer === Number(question.correct) ? "strong" : "review",
      };
    });
  });
}

function ProgressRing({ value, label }) {
  const progress = value === null ? 0 : value;
  return <div className={`edc-tm-ring${value === null ? " is-empty" : ""}`} style={{ "--progress": `${progress}%` }} role="img" aria-label={value === null ? `${label}: no lesson progress recorded` : `${label}: ${value}% lesson progress`}>
    <strong>{value === null ? "—" : `${value}%`}</strong>
  </div>;
}

function dateLabel(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime())
    ? date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "Date not recorded";
}

export default function StudentTopicMastery({ email, courses = [], publishedCourses = [], onNavigate, onOpenQuiz }) {
  const [revision, setRevision] = useState(0);
  const [courseFilter, setCourseFilter] = useState("all");
  const [questionFilter, setQuestionFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => subscribeStudentQuizzes(() => setRevision(value => value + 1)), []);

  const entries = useMemo(() => {
    void revision;
    return studentQuizLibrary(email, courses, publishedCourses);
  }, [email, courses, publishedCourses, revision]);
  const searchTerms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visibleEntries = entries.filter(entry => {
    if (courseFilter !== "all" && quizCourseKey(entry.course) !== courseFilter) return false;
    const searchableText = [
      entry.course.title,
      entry.course.category,
      entry.course.instructor,
      entry.course.instructorName,
      entry.quiz.title,
      ...entry.quiz.questions.map(question => question.prompt),
    ].filter(Boolean).join(" ").toLowerCase();
    return searchTerms.every(term => searchableText.includes(term));
  });
  const reviews = questionReviews(visibleEntries);
  const assessed = reviews.filter(item => item.status !== "unanswered");
  const strongCount = assessed.filter(item => item.status === "strong").length;
  const reviewCount = assessed.filter(item => item.status === "review").length;
  const overall = assessed.length ? Math.round(strongCount / assessed.length * 100) : null;
  const availableQuestions = visibleEntries.reduce((total, entry) => total + entry.quiz.questions.length, 0);
  const displayedReviews = questionFilter === "all"
    ? reviews
    : questionFilter === "assessed"
      ? assessed
      : reviews.filter(item => item.status === questionFilter);
  const visibleCourses = courses.filter(course => {
    if (courseFilter !== "all" && quizCourseKey(course) !== courseFilter) return false;
    if (!searchTerms.length) return true;
    const searchableText = [course.title, course.category, course.instructor, course.instructorName]
      .filter(Boolean).join(" ").toLowerCase();
    return searchTerms.every(term => searchableText.includes(term)) ||
      visibleEntries.some(entry => quizCourseKey(entry.course) === quizCourseKey(course));
  });
  const courseStats = visibleCourses.map(course => {
    const courseEntries = visibleEntries.filter(entry => quizCourseKey(entry.course) === quizCourseKey(course));
    const courseReviews = reviews.filter(item => quizCourseKey(item.entry.course) === quizCourseKey(course));
    const courseAssessed = courseReviews.filter(item => item.status !== "unanswered");
    const courseStrong = courseAssessed.filter(item => item.status === "strong").length;
    return {
      course,
      quizzes: courseEntries.length,
      attempts: courseEntries.filter(entry => entry.latest).length,
      questions: courseAssessed.length,
      score: courseAssessed.length ? Math.round(courseStrong / courseAssessed.length * 100) : null,
    };
  });
  const attemptedEntries = visibleEntries.filter(entry => entry.latest);
  const quizGroups = attemptedEntries.map(entry => ({
    entry,
    questions: reviews.filter(item => item.entry.key === entry.key),
  }));
  const recommendations = reviews.filter(item => item.status === "review").slice(0, 3);
  const suggestedQuizzes = recommendations.length
    ? []
    : visibleEntries.filter(entry => !entry.latest).slice(0, 3);

  function selectQuestionFilter(filter) {
    setQuestionFilter(current => filter === "all" || current === filter ? "all" : filter);
    window.requestAnimationFrame(() => document.getElementById("edc-tm-question-breakdown")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return <section className="edc-topic-mastery">
    <header className="edc-tm-heading">
      <div className="edc-tm-heading-copy"><span className="edc-tm-heading-icon"><Layers size={25} /></span><div><h2>Topic Mastery</h2><p>Track strengths and areas to review using your completed course quizzes.</p></div></div>
      <div className="edc-tm-heading-art" aria-hidden="true"><GraduationCap /><Target /></div>
    </header>

    <div className="edc-tm-stats" aria-label="Quiz mastery summary">
      <button type="button" className="edc-tm-stat purple" aria-pressed={questionFilter === "all"} onClick={() => selectQuestionFilter("all")}>
        <span className="edc-tm-stat-icon"><Target size={23} /></span><span><small>Overall Mastery</small><strong>{overall === null ? "—" : `${overall}%`}</strong></span><em>Latest quiz answers</em>
      </button>
      <button type="button" className="edc-tm-stat blue" aria-pressed={questionFilter === "assessed"} onClick={() => selectQuestionFilter("assessed")}>
        <span className="edc-tm-stat-icon"><Layers size={23} /></span><span><small>Questions Assessed</small><strong>{assessed.length} / {availableQuestions}</strong></span><em>From submitted quizzes</em>
      </button>
      <button type="button" className="edc-tm-stat green" aria-pressed={questionFilter === "strong"} onClick={() => selectQuestionFilter("strong")}>
        <span className="edc-tm-stat-icon"><CheckCircle2 size={23} /></span><span><small>Strong Answers</small><strong>{strongCount}</strong></span><em>Correct responses</em>
      </button>
      <button type="button" className="edc-tm-stat violet" aria-pressed={questionFilter === "review"} onClick={() => selectQuestionFilter("review")}>
        <span className="edc-tm-stat-icon"><AlertTriangle size={23} /></span><span><small>Needs Review</small><strong>{reviewCount}</strong></span><em>Incorrect responses</em>
      </button>
    </div>

    <div className="edc-tm-toolbar">
      <label className="edc-tm-search"><Search size={16} /><input type="search" aria-label="Search courses, quizzes, and questions" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search courses, quizzes, questions..." />{search && <button type="button" aria-label="Clear Topic Mastery search" onClick={() => setSearch("")}><X size={14} /></button>}</label>
      <span><CircleHelp size={15} /> Mastery is calculated from your latest submitted answers only.</span>
      <label>Course
        <select aria-label="Filter mastery by course" value={courseFilter} onChange={event => setCourseFilter(event.target.value)}>
          <option value="all">All enrolled courses</option>
          {courses.map(course => <option key={quizCourseKey(course)} value={quizCourseKey(course)}>{course.title}</option>)}
        </select>
      </label>
    </div>

    <div className="edc-tm-layout">
      <div className="edc-tm-main-column">
        <section className="edc-tm-panel">
          <header className="edc-tm-panel-heading"><h3><TrendingUp size={18} /> Course Mastery</h3><button type="button" onClick={() => onNavigate?.("quizzes")}>Course Quizzes <ArrowRight size={14} /></button></header>
          {courseStats.length ? <div className="edc-tm-course-list">
            {courseStats.map(({ course, quizzes, attempts, questions, score }) => <article className="edc-tm-course-row" key={quizCourseKey(course)}>
              <span className={`edc-tm-course-icon edc-cover-${course.color || "purple"}`}>{course.icon || <GraduationCap size={19} />}</span>
              <div className="edc-tm-course-copy"><strong>{course.title}</strong><small>{attempts} of {quizzes} quizzes attempted · {questions} answers assessed</small>
                {score !== null && <span className="edc-tm-progress"><i><b style={{ width: `${score}%` }} /></i></span>}
              </div>
              <strong className={score === null ? "is-ungraded" : "edc-tm-course-score"}>{score === null ? "No score yet" : `${score}%`}</strong>
            </article>)}
          </div> : <div className="edc-tm-empty"><GraduationCap size={24} /><strong>No enrolled courses found</strong><p>Enroll in a course to see its quiz progress here.</p><button type="button" onClick={() => onNavigate?.("learning")}>Go to My Learning <ArrowRight size={14} /></button></div>}
        </section>

        <section className="edc-tm-panel" id="edc-tm-question-breakdown">
          <header className="edc-tm-panel-heading"><h3><BookOpen size={18} /> Topic Mastery by Course</h3><span>{displayedReviews.length} answers</span></header>
          {quizGroups.length ? <div className="edc-tm-quiz-groups">
            {quizGroups.map(({ entry, questions }) => {
              const correct = questions.filter(item => item.status === "strong").length;
              const answered = questions.filter(item => item.status !== "unanswered").length;
              return <article className="edc-tm-quiz-group" key={entry.key}>
                <header><div><strong>{entry.quiz.title}</strong><small>{entry.course.title} · Latest attempt {dateLabel(entry.latest.submittedAt)}</small></div><span>{correct} / {answered} correct</span></header>
                <div className="edc-tm-question-list">
                  {displayedReviews.filter(item => item.entry.key === entry.key).map(item => <div className="edc-tm-question-row" key={item.id}>
                    <span className={`edc-tm-question-icon ${item.status}`}>{item.status === "strong" ? <CheckCircle2 size={16} /> : item.status === "review" ? <AlertTriangle size={16} /> : <CircleHelp size={16} />}</span>
                    <span className="edc-tm-question-copy">{item.prompt}</span>
                    <span className={`edc-tm-question-status ${item.status}`}>{item.status === "strong" ? "Correct" : item.status === "review" ? "Review" : "Not answered"}</span>
                  </div>)}
                  {!displayedReviews.some(item => item.entry.key === entry.key) && <p className="edc-tm-filter-empty">No answers in this filter for this quiz.</p>}
                </div>
                <button type="button" className="edc-tm-text-action" onClick={() => onOpenQuiz?.(entry, "result")}>Review quiz results <ArrowRight size={14} /></button>
              </article>;
            })}
          </div> : <div className="edc-tm-empty"><BookOpen size={24} /><strong>No quiz answers to analyze yet</strong><p>Published quizzes and your recorded answers will appear here after you take a course quiz.</p><button type="button" onClick={() => onNavigate?.("quizzes")}>Open Course Quizzes <ArrowRight size={14} /></button></div>}
        </section>
      </div>

      <aside className="edc-tm-side-column">
        <section className="edc-tm-panel">
          <header className="edc-tm-panel-heading"><h3><Award size={18} /> Course Progress</h3><span>Lesson completion</span></header>
          {visibleCourses.length ? <div className="edc-tm-rings">
            {visibleCourses.slice(0, 4).map(course => <article className="edc-tm-ring-card" key={quizCourseKey(course)}>
              <ProgressRing value={course.progress != null && Number.isFinite(Number(course.progress)) ? Math.max(0, Math.min(100, Number(course.progress))) : null} label={course.title} />
              <strong>{course.title}</strong><small>{course.completedLessons || 0} / {course.lessons || 0} lessons</small>
            </article>)}
          </div> : <div className="edc-tm-empty"><p>Course progress will appear after you enroll.</p></div>}
          {visibleCourses.length > 4 && <button type="button" className="edc-tm-text-action" onClick={() => onNavigate?.("learning")}>View all {visibleCourses.length} courses <ArrowRight size={14} /></button>}
        </section>

        <section className="edc-tm-panel">
          <header className="edc-tm-panel-heading"><h3><Lightbulb size={18} /> Learning Recommendations</h3></header>
          {recommendations.length ? <div className="edc-tm-recommendations">
            {recommendations.map(item => <article className="edc-tm-recommendation" key={item.id}>
              <span className="edc-tm-recommendation-icon"><Target size={18} /></span>
              <div><strong>Review this question</strong><p>{item.prompt}</p><small>{item.entry.course.title} · {item.entry.quiz.title}</small></div>
              <button type="button" aria-label={`Review ${item.entry.quiz.title} results`} onClick={() => onOpenQuiz?.(item.entry, "result")}><ArrowRight size={15} /></button>
            </article>)}
          </div> : suggestedQuizzes.length ? <div className="edc-tm-recommendations">
            {suggestedQuizzes.map(entry => <article className="edc-tm-recommendation" key={entry.key}>
              <span className="edc-tm-recommendation-icon"><Play size={18} /></span>
              <div><strong>{entry.draft ? "Continue your saved quiz" : "Start a published quiz"}</strong><p>{entry.quiz.title}</p><small>{entry.course.title}</small></div>
              <button type="button" aria-label={`${entry.draft ? "Continue" : "Start"} ${entry.quiz.title}`} onClick={() => onOpenQuiz?.(entry)}><ArrowRight size={15} /></button>
            </article>)}
          </div> : <div className="edc-tm-empty edc-tm-recommendation-empty">
            <CheckCircle2 size={23} /><strong>No review items right now</strong><p>Recommendations will be based on answers from your latest quiz attempts.</p>
          </div>}
        </section>

        {overall === null && <p className="edc-tm-evidence-note"><CalendarDays size={14} /> Mastery appears after a published quiz has a submitted attempt.</p>}
      </aside>
    </div>
  </section>;
}

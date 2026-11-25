import { useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarDays, MessageCircle, Search, Star, Users } from "lucide-react";
import { courseReviewKey } from "../../utils/courseReviews";
import { fetchTeacherReviews, LEARNING_UPDATED_EVENT } from "../../utils/mongoLearningApi";
import ReportAction from "../moderation/ReportAction";
import StudentCourseReviews from "./StudentCourseReviews";
import "./CourseReviews.css";

const reviewDate = value => {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime())
    ? date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "Date not recorded";
};

const reviewTimestamp = value => {
  const timestamp = new Date(value || "").getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

function ReviewerAvatar({ name, source }) {
  const [failed, setFailed] = useState(false);
  const initials = String(name || "Student")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();

  return (
    <span className="edc-teacher-review-avatar">
      {source && !failed
        ? <img src={source} alt="" onError={() => setFailed(true)} />
        : initials}
    </span>
  );
}

function ReviewCourseImage({ course }) {
  const [failed, setFailed] = useState(false);
  const image = course.thumbnail || course.image;

  return (
    <span className="edc-teacher-review-course-image">
      {image && !failed
        ? <img src={image} alt="" onError={() => setFailed(true)} />
        : <BookOpen size={22} />}
    </span>
  );
}

function TeacherCourseReviews({ email, courses = [] }) {
  const [reviews, setReviews] = useState([]);
  const [ratingFilter, setRatingFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [studentFilter, setStudentFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => fetchTeacherReviews()
      .then(items => { if (!cancelled) setReviews(items); })
      .catch(error => { if (error.status !== 401 && error.status !== 403) console.error("Could not load course reviews", error); });
    refresh();
    [LEARNING_UPDATED_EVENT, "focus"].forEach(event => window.addEventListener(event, refresh));
    return () => { cancelled = true; [LEARNING_UPDATED_EVENT, "focus"].forEach(event => window.removeEventListener(event, refresh)); };
  }, []);

  const courseByKey = useMemo(() => new Map(courses.map(course => {
    const identified = { ...course, teacherEmail: course.teacherEmail || email };
    return [courseReviewKey(identified), identified];
  })), [courses, email]);
  const courseById = useMemo(() => new Map(courses.map(course => [String(course.id), { ...course, teacherEmail: course.teacherEmail || email }])), [courses, email]);

  const courseReviews = useMemo(() => reviews
    .filter(review => review && courseById.has(String(review.courseId)))
    .map(review => ({
      review: { ...review, courseKey: String(review.courseId), studentEmail: `${review.studentName || "student"}#${review.id}` },
      course: courseById.get(String(review.courseId)),
      author: { studentName: review.studentName || "Student", studentAvatar: "" },
      rating: Number(review.rating),
      date: review.updatedAt || review.createdAt,
    }))
    .filter(item => Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 5)
    .sort((left, right) => reviewTimestamp(right.date) - reviewTimestamp(left.date)),
  [courseById, reviews]);

  const averageRating = courseReviews.length
    ? courseReviews.reduce((sum, item) => sum + item.rating, 0) / courseReviews.length
    : null;
  const studentsRated = new Set(
    courseReviews
      .map(({ review }) => String(review.studentEmail || "").trim().toLowerCase())
      .filter(Boolean),
  ).size;
  const coursesReviewed = new Set(courseReviews.map(({ review }) => review.courseKey)).size;
  const ratingDistribution = [5, 4, 3, 2, 1].map(rating => ({
    rating,
    count: courseReviews.filter(item => item.rating === rating).length,
  }));
  const courseOptions = [...new Map(courseReviews.map(({ review, course }) => [
    review.courseKey,
    { key: review.courseKey, title: course.title || "Untitled course" },
  ])).values()];
  const studentOptions = [...new Map(courseReviews.map(({ review, author }) => {
    const key = String(review.studentEmail || `${review.courseKey}:${review.id || author.studentName}`).trim().toLowerCase();
    return [key, { key, name: author.studentName }];
  })).values()];
  const monthlyTrend = useMemo(() => {
    const today = new Date();
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth() - 5 + index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return {
        key,
        label: date.toLocaleDateString(undefined, { month: "short" }),
        count: 0,
      };
    });
    const monthIndex = new Map(months.map((month, index) => [month.key, index]));

    courseReviews.forEach(({ date }) => {
      const timestamp = reviewTimestamp(date);
      if (!timestamp) return;
      const reviewedAt = new Date(timestamp);
      const key = `${reviewedAt.getFullYear()}-${String(reviewedAt.getMonth() + 1).padStart(2, "0")}`;
      const index = monthIndex.get(key);
      if (index !== undefined) months[index].count += 1;
    });

    return months;
  }, [courseReviews]);

  const filteredReviews = courseReviews.filter(({ review, course, author, rating }) => (
    (ratingFilter === "all" || rating === Number(ratingFilter))
    && (courseFilter === "all" || review.courseKey === courseFilter)
    && (studentFilter === "all" || String(review.studentEmail || `${review.courseKey}:${review.id || author.studentName}`).trim().toLowerCase() === studentFilter)
    && (!search.trim() || `${author.studentName} ${course.title || ""} ${review.comment || ""}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()))
  ));
  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(filteredReviews.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleReviews = filteredReviews.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const maxMonthlyCount = Math.max(1, ...monthlyTrend.map(month => month.count));
  const hasMonthlyActivity = monthlyTrend.some(month => month.count > 0);
  const trendPoints = monthlyTrend.map((month, index) => ({
    ...month,
    x: 48 + index * 82,
    y: 120 - (month.count / maxMonthlyCount) * 90,
  }));
  const trendLine = trendPoints.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const trendArea = trendPoints.length
    ? `${trendLine} L ${trendPoints[trendPoints.length - 1].x} 120 L ${trendPoints[0].x} 120 Z`
    : "";
  const trendTicks = [...new Set([maxMonthlyCount, Math.ceil(maxMonthlyCount / 2), 0])];
  const jumpTo = id => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const showAllReviews = () => {
    setRatingFilter("all");
    setCourseFilter("all");
    setStudentFilter("all");
    setSearch("");
    setPage(1);
    jumpTo("edc-teacher-review-list");
  };
  const showStudentReviews = () => {
    showAllReviews();
    document.getElementById("edc-teacher-review-student-filter")?.focus({ preventScroll: true });
  };
  const showCourseReviews = () => {
    showAllReviews();
    document.getElementById("edc-teacher-review-course-filter")?.focus({ preventScroll: true });
  };

  return (
    <section className="edc-teacher-review-dashboard">
      <header className="edc-teacher-review-heading">
        <h1><Star size={31} /> Course Reviews &amp; Ratings</h1>
        <p>See what your students say about your courses and track your overall ratings.</p>
      </header>

      <section className="edc-teacher-review-stats" aria-label="Course review summary">
        {[
          { label: "Overall Rating", value: averageRating === null ? "—" : averageRating.toFixed(1), suffix: averageRating === null ? "" : "/ 5", icon: Star, color: "purple", onClick: () => jumpTo("edc-teacher-review-distribution"), ariaLabel: "View rating distribution" },
          { label: "Total Reviews", value: courseReviews.length.toLocaleString(), icon: MessageCircle, color: "gold", onClick: showAllReviews, ariaLabel: "View all reviews" },
          { label: "Students Rated", value: studentsRated.toLocaleString(), icon: Users, color: "purple", onClick: showStudentReviews, ariaLabel: "Filter reviews by student" },
          { label: "Courses Reviewed", value: coursesReviewed.toLocaleString(), icon: BookOpen, color: "gold", onClick: showCourseReviews, ariaLabel: "Filter reviews by course" },
        ].map(({ label, value, suffix, icon: Icon, color, onClick, ariaLabel }) => (
          <button type="button" className={`edc-teacher-review-stat ${color}`} key={label} onClick={onClick} aria-label={`${ariaLabel}: ${value}`}>
            <span><Icon size={25} fill={label === "Overall Rating" ? "currentColor" : "none"} /></span>
            <div>
              <small>{label}</small>
              <strong>{value}{suffix && <em>{suffix}</em>}</strong>
            </div>
          </button>
        ))}
      </section>

      <div className="edc-teacher-review-insights">
        <section className="edc-teacher-review-distribution" id="edc-teacher-review-distribution" aria-labelledby="edc-review-distribution-title">
          <h2 id="edc-review-distribution-title">Rating Distribution</h2>
          {courseReviews.length ? (
            <div className="edc-teacher-review-distribution-content">
              <div className="edc-teacher-review-average">
                <strong>{averageRating.toFixed(1)}<small> / 5</small></strong>
                <div aria-label={`${averageRating.toFixed(1)} out of 5 stars`}>
                  {Array.from({ length: 5 }, (_, index) => (
                    <Star key={index} size={20} fill={averageRating >= index + 1 ? "currentColor" : "none"} />
                  ))}
                </div>
                <span>{courseReviews.length.toLocaleString()} {courseReviews.length === 1 ? "Review" : "Reviews"}</span>
              </div>
              <div className="edc-teacher-review-rating-bars">
                {ratingDistribution.map(({ rating, count }) => {
                  const percentage = Math.round((count / courseReviews.length) * 100);
                  return (
                    <div className="edc-teacher-review-rating-row" key={rating}>
                      <strong>{rating} <Star size={13} fill="currentColor" /></strong>
                      <span className="edc-teacher-review-rating-track">
                        <span style={{ width: `${percentage}%` }} />
                      </span>
                      <small>{percentage}% <span>({count.toLocaleString()})</span></small>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="edc-teacher-review-chart-empty">Ratings will appear here when students review your courses.</p>
          )}
        </section>

        <section className="edc-teacher-review-trend" aria-labelledby="edc-review-trend-title">
          <div className="edc-teacher-review-section-heading">
            <h2 id="edc-review-trend-title">Reviews Trend</h2>
            <span><CalendarDays size={14} /> Last 6 Months</span>
          </div>
          {hasMonthlyActivity ? (
            <svg
              className="edc-teacher-review-chart"
              viewBox="0 0 500 165"
              role="img"
              aria-label={`Review counts by month: ${monthlyTrend.map(month => `${month.label} ${month.count}`).join(", ")}`}
            >
              {trendTicks.map((tick, index) => {
                const y = 120 - (tick / maxMonthlyCount) * 90;
                return (
                  <g key={`${tick}-${index}`}>
                    <line x1="42" y1={y} x2="470" y2={y} />
                    <text x="34" y={y + 4}>{tick}</text>
                  </g>
                );
              })}
              <path className="edc-teacher-review-chart-area" d={trendArea} />
              <path className="edc-teacher-review-chart-line" d={trendLine} />
              {trendPoints.map(point => (
                <g key={point.key}>
                  <circle cx={point.x} cy={point.y} r="4" />
                  <text className="edc-teacher-review-chart-month" x={point.x} y="145">{point.label}</text>
                </g>
              ))}
            </svg>
          ) : (
            <p className="edc-teacher-review-chart-empty">No review activity in the last six months.</p>
          )}
        </section>
      </div>

      <div className="edc-teacher-review-filterbar">
        <nav className="edc-teacher-review-filters" aria-label="Filter course reviews">
          <button type="button" className={ratingFilter === "all" ? "active" : ""} aria-pressed={ratingFilter === "all"} onClick={() => { setRatingFilter("all"); setPage(1); }}>
            All Reviews ({courseReviews.length.toLocaleString()})
          </button>
          {ratingDistribution.map(({ rating, count }) => (
            <button type="button" key={rating} className={ratingFilter === String(rating) ? "active" : ""} aria-pressed={ratingFilter === String(rating)} onClick={() => { setRatingFilter(String(rating)); setPage(1); }}>
              {rating} {rating === 1 ? "Star" : "Stars"} ({count.toLocaleString()})
            </button>
          ))}
        </nav>
        <div className="edc-teacher-review-selects">
          <select id="edc-teacher-review-student-filter" aria-label="Filter reviews by student" value={studentFilter} onChange={event => { setStudentFilter(event.target.value); setPage(1); }}>
            <option value="all">All Students</option>
            {studentOptions.map(student => <option key={student.key} value={student.key}>{student.name}</option>)}
          </select>
          <select id="edc-teacher-review-course-filter" aria-label="Filter reviews by course" value={courseFilter} onChange={event => { setCourseFilter(event.target.value); setPage(1); }}>
            <option value="all">All Courses</option>
            {courseOptions.map(course => <option key={course.key} value={course.key}>{course.title}</option>)}
          </select>
        </div>
        <label className="edc-teacher-review-search">
          <Search size={17} />
          <input type="search" aria-label="Search reviews" placeholder="Search reviews..." value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />
        </label>
      </div>

      <section className="edc-teacher-review-list" id="edc-teacher-review-list" aria-label="Student course reviews">
        {visibleReviews.length ? visibleReviews.map(({ review, course, author, rating }, index) => {
          const reviewKey = String(review.id || `${review.courseKey}:${review.studentEmail || index}`);
          const stars = Array.from({ length: 5 }, (_, starIndex) => (
            <Star key={starIndex} size={15} fill={starIndex < rating ? "currentColor" : "none"} />
          ));
          const reviewTargetId = String(review.id || `${review.courseKey}:${review.studentEmail}`);

          return (
            <article className="edc-teacher-review-card" key={reviewKey}>
              <div className="edc-teacher-review-person">
                <ReviewerAvatar name={author.studentName} source={author.studentAvatar} />
                <div>
                  <strong>{author.studentName}</strong>
                  <time dateTime={review.updatedAt || review.createdAt}>{reviewDate(review.updatedAt || review.createdAt)}</time>
                </div>
              </div>
              <div className="edc-teacher-review-comment">
                <div className="edc-teacher-review-card-rating">
                  <span>{stars}</span>
                  <strong>{rating.toFixed(1)}</strong>
                </div>
                <p>{review.comment || "No written feedback was included."}</p>
              </div>
              <div className="edc-teacher-review-course">
                <ReviewCourseImage course={course} />
                <div>
                  <strong>{course.title || "Untitled course"}</strong>
                  <span>{course.category || "Uncategorized"}</span>
                </div>
              </div>
              <div className="edc-teacher-review-report">
                <ReportAction
                  reporterEmail={email}
                  reporterName={email}
                  reporterRole="Teacher"
                  label="Report"
                  target={{
                    reportType: "content",
                    targetType: "review",
                    targetId: reviewTargetId,
                    targetTitle: `Review for ${course.title || "course"}`,
                    targetOwnerEmail: course.teacherEmail,
                    targetRole: "Teacher",
                  }}
                />
              </div>
            </article>
          );
        }) : (
          <div className="edc-teacher-review-empty">
            <MessageCircle size={28} />
            <strong>{courseReviews.length ? "No reviews match your filters." : "No student reviews yet."}</strong>
            <p>{courseReviews.length ? "Try another rating or search term." : "Reviews will appear here after students rate one of your courses."}</p>
          </div>
        )}
      </section>

      {totalPages > 1 && (
        <nav className="edc-teacher-review-pagination" aria-label="Review pages">
          <span>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredReviews.length)} of {filteredReviews.length}</span>
          <div>
            <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
            <span>Page {currentPage} of {totalPages}</span>
            <button type="button" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Next</button>
          </div>
        </nav>
      )}
    </section>
  );
}

export default function CourseReviews({ role, ...props }) {
  return role === "student" ? <StudentCourseReviews {...props} /> : <TeacherCourseReviews {...props} />;
}

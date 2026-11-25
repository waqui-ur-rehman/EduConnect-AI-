
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Clock3,
  GraduationCap,
  Star,
  UserRound,
} from "lucide-react";

import { getPublishedTeacherCourses } from "../../utils/teacherCourses";
import { getStudentEmail } from "../../utils/studentCart";
import { courseReviewKey, getReviews, REVIEW_EVENT } from "../../utils/courseReviews";
import { matchesCourseSearch } from "../../utils/studentSearch";
import {
  getRelatedPublishedCourses,
  isAcademicProfileComplete,
  normalizeRecommendationText,
} from "../../utils/studentRecommendations";

import CourseDetails from "./CourseDetails";
import CartPage from "./CartPage";
import { fetchCourseReviews, fetchTeacherSummary } from "../../utils/mongoLearningApi";
import "./PublishedCourses.css";

function teacherRatingSummary(course, courses, reviews) {
  const teacherEmail = String(course.teacherEmail || "").toLowerCase();
  const teacherCourseKeys = new Set(
    courses
      .filter((item) => String(item.teacherEmail || "").toLowerCase() === teacherEmail)
      .map(courseReviewKey)
  );
  const ratings = reviews
    .filter((review) => teacherCourseKeys.has(review.courseKey))
    .map((review) => Number(review.rating))
    .filter((rating) => Number.isFinite(rating) && rating >= 1 && rating <= 5);

  return {
    rating: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null,
    reviewCount: ratings.length,
  };
}

function courseRatingSummary(course, reviews) {
  const key = courseReviewKey(course);
  const courseReviews = reviews.filter((review) => review.courseKey === key);
  const ratings = courseReviews
    .map((review) => Number(review.rating))
    .filter((rating) => Number.isFinite(rating) && rating >= 1 && rating <= 5);

  return {
    rating: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null,
    reviewCount: ratings.length,
  };
}

function matchesEducationProfileLevel(course, profile) {
  if (!profile?.educationLevel) return true;
  const courseLevels = [
    course.educationLevel,
    course.targetLevel,
    course.instructorProfile?.teachingEducationLevel,
  ].filter(Boolean).map(normalizeRecommendationText);
  if (!courseLevels.length) return false;

  const expectedLevels = {
    school: ["school", "primary", "middle", "secondary", "higher secondary", "class"],
    intermediate: ["intermediate", "college", "higher secondary"],
    university: ["university", "undergraduate", "postgraduate", "doctoral", "phd", "bs", "masters"],
    online: ["online", "interest", "professional"],
  }[profile.educationLevel] || [];

  const levelMatches = courseLevels.some((courseLevel) =>
    expectedLevels.some((expected) => courseLevel.includes(expected))
  );
  if (!levelMatches) return false;

  const courseClass = Number(course.classNumber || course.grade || 0);
  if (profile.educationLevel === "school" && profile.classNumber && courseClass && courseClass !== Number(profile.classNumber)) return false;

  const courseYear = Number(course.intermediateYear || course.year || 0);
  if (profile.educationLevel === "intermediate" && profile.intermediateYear && courseYear && courseYear !== Number(profile.intermediateYear)) return false;
  if (profile.educationLevel === "intermediate" && profile.stream && course.stream
    && normalizeRecommendationText(profile.stream) !== normalizeRecommendationText(course.stream)) return false;

  const courseDegree = normalizeRecommendationText(course.degreeLevel || course.instructorProfile?.teachingDegreeLevel);
  if (profile.educationLevel === "university" && profile.degreeLevel && courseDegree && courseDegree !== normalizeRecommendationText(profile.degreeLevel)) return false;

  return true;
}

export default function PublishedCourses({
  title = "Courses From Our Instructors",
  eyebrow = "EDUCONNECT AI MARKETPLACE",
  description = "Explore courses reviewed and published by EduConnect AI.",
  layout = "grid",
  onViewAll,
  courseRoute = null,
  backTo = "/",
  educationProfile = null,
  subjectFilter = "All",
  relatedTo = null,
  searchQuery = "",
  categoryFilter = "All",
}) {
  const navigate = useNavigate();
  const location = useLocation();

  // Published teacher courses  
  const [courses, setCourses] = useState(() =>
    getPublishedTeacherCourses()
  );
  const [reviews, setReviews] = useState(() => getReviews());
  // MongoDB-backed rating aggregates (authorized database records) keyed by course/teacher ID.
  const [mongoSummaries, setMongoSummaries] = useState({});
  const [mongoTeacherSummaries, setMongoTeacherSummaries] = useState({});

  // Selected course
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState({});
  const carouselRef = useRef(null);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);

  // Cart page visibility
  const [showCart, setShowCart] = useState(false);

  const visibleCourses = useMemo(() => {
    let matching = courses.filter((course) => matchesEducationProfileLevel(course, educationProfile) && matchesCourseSearch(course, searchQuery)
      && (categoryFilter === "All" || normalizeRecommendationText(course.category) === normalizeRecommendationText(categoryFilter)));
    if (educationProfile && isAcademicProfileComplete(educationProfile)) {
      matching = getRelatedPublishedCourses(matching, educationProfile);
    }
    if (subjectFilter !== "All") {
      const selectedSubject = normalizeRecommendationText(subjectFilter);
      matching = matching.filter((course) =>
        (Array.isArray(course.subjects) ? course.subjects : [course.subject])
          .filter(Boolean)
          .some((item) => normalizeRecommendationText(item) === selectedSubject)
      );
    }
    if (Array.isArray(relatedTo)) {
      const relatedTerms = relatedTo
        .flatMap((value) => Array.isArray(value) ? value : [value])
        .map(normalizeRecommendationText)
        .filter(Boolean);
      matching = matching.filter((course) => {
        const courseTitle = normalizeRecommendationText(course.title);
        return relatedTerms.some((term) => (` ${courseTitle} `).includes(` ${term} `));
      });
    }
    return matching;
  }, [courses, educationProfile, subjectFilter, relatedTo, searchQuery, categoryFilter]);

  // Refresh published courses when teacher or admin data changes.
  useEffect(() => {
    let cancelled = false;
    const mongoCourses = courses.filter((course) => /^[a-f0-9]{24}$/i.test(String(course.id)));
    if (!mongoCourses.length) { setMongoSummaries({}); setMongoTeacherSummaries({}); return undefined; }
    const courseIds = [...new Set(mongoCourses.map((course) => String(course.id)))];
    Promise.all(courseIds.map((id) => fetchCourseReviews(id).then((data) => [id, data.summary]).catch(() => null)))
      .then((pairs) => {
        if (cancelled) return;
        setMongoSummaries(Object.fromEntries(pairs.filter(Boolean).map(([id, summary]) => [id, summary])));
      });
    const teacherIds = [...new Set(mongoCourses.map((course) => course.teacherId).filter(Boolean).map(String))];
    Promise.all(teacherIds.map((id) => fetchTeacherSummary(id).then((data) => [id, data.summary]).catch(() => null)))
      .then((pairs) => {
        if (cancelled) return;
        setMongoTeacherSummaries(Object.fromEntries(pairs.filter(Boolean).map(([id, summary]) => [id, summary])));
      });
    return () => { cancelled = true; };
  }, [courses]);

  const toMongoRating = (summary) => summary ? { rating: summary.count ? summary.average : null, reviewCount: summary.count || 0 } : null;
  const teacherRatingFor = (course) => {
    const mongo = toMongoRating(mongoTeacherSummaries[String(course?.teacherId || "")]);
    return mongo || teacherRatingSummary(course, courses, reviews);
  };
  const courseRatingFor = (course) => {
    const mongo = toMongoRating(mongoSummaries[String(course?.id || "")]);
    return mongo || courseRatingSummary(course, reviews);
  };

  useEffect(() => {
    function refreshCourses() {
      setCourses(getPublishedTeacherCourses());
    }

    window.addEventListener("storage", refreshCourses);
    window.addEventListener("focus", refreshCourses);
    window.addEventListener("educonnect:teacher-courses-changed", refreshCourses);
    window.addEventListener(
      "educonnect:admin-data-changed",
      refreshCourses
    );

    return () => {
      window.removeEventListener("storage", refreshCourses);
      window.removeEventListener("focus", refreshCourses);
      window.removeEventListener("educonnect:teacher-courses-changed", refreshCourses);
      window.removeEventListener(
        "educonnect:admin-data-changed",
        refreshCourses
      );
    };
  }, []);

  useEffect(() => {
    const refreshReviews = () => setReviews(getReviews());
    window.addEventListener(REVIEW_EVENT, refreshReviews);
    window.addEventListener("storage", refreshReviews);
    window.addEventListener("focus", refreshReviews);
    return () => {
      window.removeEventListener(REVIEW_EVENT, refreshReviews);
      window.removeEventListener("storage", refreshReviews);
      window.removeEventListener("focus", refreshReviews);
    };
  }, []);

  useEffect(() => {
    if (layout !== "carousel") return undefined;
    const track = carouselRef.current;
    if (!track) return undefined;

    const updateScrollControls = () => {
      const maxScroll = track.scrollWidth - track.clientWidth;
      setCanScrollBack(track.scrollLeft > 1);
      setCanScrollForward(maxScroll - track.scrollLeft > 1);
    };

    updateScrollControls();
    track.addEventListener("scroll", updateScrollControls, { passive: true });
    window.addEventListener("resize", updateScrollControls);
    return () => {
      track.removeEventListener("scroll", updateScrollControls);
      window.removeEventListener("resize", updateScrollControls);
    };
  }, [visibleCourses, layout]);

  function openCart() {
    const email = getStudentEmail();

    if (!email) {
      navigate("/login");
      return;
    }

    setSelectedCourse(null);
    setShowCart(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeCart() {
    setShowCart(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openCourse(course) {
    setShowCart(false);
    navigate(`/course/${encodeURIComponent(course.teacherEmail)}/${encodeURIComponent(course.id)}`, {
      state: { from: location.pathname },
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeCourse() {
    if (courseRoute) {
      navigate(backTo || "/");
      return;
    }
    setSelectedCourse(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // CART PAGE
  if (showCart) {
    const email = getStudentEmail();

    if (!email) {
      return (
        <section
          className="marketplace-published"
          style={{ textAlign: "center", padding: 40 }}
        >
          <h2>Student Login Required</h2>
          <p>Please log in as a student to view your cart.</p>

          <button
            type="button"
            onClick={() => navigate("/login")}
          >
            Log in as Student
          </button>

          <button
            type="button"
            onClick={closeCart}
            style={{ marginLeft: 12 }}
          >
            Back to Courses
          </button>
        </section>
      );
    }

    return (
      <CartPage
        email={email}
        onBack={closeCart}
        onComplete={() => {
          setShowCart(false);
          navigate("/student/dashboard");
        }}
      />
    );
  }

  // COURSE DETAILS PAGE
  if (selectedCourse) {
    const latestCourse = courses.find(
      (course) =>
        String(course.id) === String(selectedCourse.id) &&
        course.teacherEmail === selectedCourse.teacherEmail
    );

    return (
      <CourseDetails
        course={latestCourse || selectedCourse}
        teacherRating={teacherRatingFor(latestCourse || selectedCourse)}
        courseRating={courseRatingFor(latestCourse || selectedCourse)}
        courseReviews={reviews.filter((review) => review.courseKey === courseReviewKey(latestCourse || selectedCourse))}
        onBack={closeCourse}
        onOpenCart={openCart}
      />
    );
  }

  if (courseRoute) {
    const routeCourse = courses.find(
      (course) =>
        String(course.id) === String(courseRoute.id) &&
        String(course.teacherEmail || "").toLowerCase() === String(courseRoute.teacherEmail || "").toLowerCase()
    );

    if (!routeCourse) {
      return (
        <section className="marketplace-published" style={{ textAlign: "center", padding: 40 }}>
          <h2>Course not found</h2>
          <p>This course may have been unpublished or removed.</p>
          <button type="button" onClick={closeCourse}>Back to Courses</button>
        </section>
      );
    }

    return <CourseDetails course={routeCourse} teacherRating={teacherRatingFor(routeCourse)} courseRating={courseRatingFor(routeCourse)} courseReviews={reviews.filter((review) => review.courseKey === courseReviewKey(routeCourse))} onBack={closeCourse} onOpenCart={openCart} />;
  }

  if (layout === "carousel") {
    return (
      <section className="section courses-section marketplace-published-carousel" id="explore-courses">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
        </div>

        {visibleCourses.length === 0 ? (
          <div className="marketplace-empty">
            <BookOpen size={32} />
            <h3>{courses.length === 0 ? "No published courses yet" : "No courses match these filters"}</h3>
            <p>{courses.length === 0 ? "Courses appear here after Admin approval and teacher publishing." : "Try another education level, program or subject."}</p>
          </div>
        ) : (
          <div className="study-fields-carousel">
            <button
              type="button"
              className="study-fields-scroll-button"
              aria-label="Scroll to previous courses"
              title="Previous courses"
              aria-hidden={!canScrollBack}
              tabIndex={canScrollBack ? 0 : -1}
              onClick={() => carouselRef.current?.scrollBy({ left: -480, behavior: "smooth" })}
              style={{ visibility: canScrollBack ? "visible" : "hidden" }}
            >
              <ArrowLeft size={21} />
            </button>

            <div className="study-fields-track" ref={carouselRef}>
              {visibleCourses.map((course) => (
                <button
                  type="button"
                  className="edc-explore-course-card"
                  key={`${course.teacherEmail}-${course.id}`}
                  onClick={() => openCourse(course)}
                >
                  {course.thumbnail ? (
                    <img className="edc-explore-course-cover" src={course.thumbnail} alt={course.title} loading="lazy" />
                  ) : (
                    <span className="edc-explore-course-cover edc-explore-course-placeholder"><BookOpen size={34} /></span>
                  )}
                  <span className="edc-explore-course-content">
                    <strong className="edc-explore-course-title">{course.title}</strong>
                    <small>{course.category || course.program || "Teacher Course"}</small>
                    <span className="edc-explore-course-rating">
                      <Star size={14} fill="currentColor" />
                      {(() => {
                        const summary = teacherRatingFor(course);
                        return summary.rating === null
                          ? "No ratings yet"
                          : `${summary.rating.toFixed(1)} teacher rating · ${summary.reviewCount} reviews`;
                      })()}
                    </span>
                    <span className="edc-explore-course-price">
                      {Number(course.price || 0) === 0
                        ? "Free"
                        : `PKR ${Number(course.price).toLocaleString()}`}
                    </span>
                    <span className="edc-explore-course-teacher">
                      {course.instructorProfile?.avatar
                        ? <img src={course.instructorProfile.avatar} alt="" />
                        : <UserRound size={15} />}
                      <span>
                        {course.instructorName || "Teacher"}
                        {course.instructorProfile?.qualification && <small>{course.instructorProfile.qualification}</small>}
                      </span>
                    </span>
                  </span>
                  <span className="edc-explore-course-arrow"><ArrowRight size={17} /></span>
                </button>
              ))}
            </div>

            <button
              type="button"
              className="study-fields-scroll-button"
              aria-label="Scroll to more courses"
              title="More courses"
              aria-hidden={!canScrollForward}
              tabIndex={canScrollForward ? 0 : -1}
              onClick={() => carouselRef.current?.scrollBy({ left: 480, behavior: "smooth" })}
              style={{ visibility: canScrollForward ? "visible" : "hidden" }}
            >
              <ArrowRight size={21} />
            </button>
          </div>
        )}

        {onViewAll && (
          <div className="study-fields-view-all">
            <button className="text-link" type="button" onClick={onViewAll}>
              View All Courses <ArrowRight size={17} />
            </button>
          </div>
        )}
      </section>
    );
  }

  // MAIN MARKETPLACE
  return (
    <section className="marketplace-published">
      <div className="marketplace-published-heading">
        <div>
          <span className="marketplace-eyebrow">{eyebrow}</span>

          <h2>{title}</h2>

          <p>{description}</p>
        </div>
      </div>

      {visibleCourses.length === 0 ? (
        <div className="marketplace-empty">
          <BookOpen size={38} />

          <h3>
            {Array.isArray(relatedTo)
              ? "No related teacher courses yet"
              : courses.length === 0
                ? "No published courses yet"
                : "No courses match these filters"}
          </h3>

          <p>
            {Array.isArray(relatedTo)
              ? "A teacher course with this course name will appear here after publishing."
              : courses.length === 0
                ? "Courses appear here after Admin approval and teacher publishing."
                : "Try another education level, program or subject."}
          </p>
        </div>
      ) : (
        <div className="marketplace-course-grid">
          {visibleCourses.map((course) => {
            const descriptionKey = `${course.teacherEmail || ""}:${course.id}`;
            const courseImage = course.thumbnail || course.image;
            const fullDescription = course.description || "Learn with EduConnect AI.";
            const teacherRating = teacherRatingFor(course);
            const isLongDescription = fullDescription.length > 150;
            const isExpanded = Boolean(expandedDescriptions[descriptionKey]);
            const visibleDescription = isLongDescription && !isExpanded
              ? `${fullDescription.slice(0, 150).trimEnd()}… `
              : fullDescription;

            return (
            <article
              className="marketplace-course-card"
              key={descriptionKey}
            >
              {/* Course Thumbnail */}
              <div className={`marketplace-course-image${courseImage ? " has-thumbnail" : ""}`}>
                {courseImage ? (
                  <img
                    src={courseImage}
                    alt={course.title}
                  />
                ) : (
                  <GraduationCap size={48} />
                )}
              </div>

              {/* Course Information */}
              <div className="marketplace-course-body">
                <span className="marketplace-course-category">
                  {course.category || "General"}
                </span>

                <h3>{course.title}</h3>

                <p className="marketplace-instructor">
                  By {course.instructorName}
                </p>
                <p className="marketplace-teacher-qualification">
                  {course.instructorProfile?.qualification || "Qualification not provided"}
                </p>
                <p className="marketplace-teacher-rating">
                  <Star size={14} fill="currentColor" />
                  {teacherRating.rating === null
                    ? "No teacher ratings yet"
                    : `${teacherRating.rating.toFixed(1)} teacher rating · ${teacherRating.reviewCount} reviews`}
                </p>

                <p className="marketplace-description">
                  {visibleDescription}
                  {isLongDescription && (
                    <button
                      type="button"
                      className="marketplace-description-toggle"
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedDescriptions((previous) => ({
                        ...previous,
                        [descriptionKey]: !isExpanded,
                      }))}
                    >
                      {isExpanded ? "Less" : "More"}
                    </button>
                  )}
                </p>

                {/* Course Metadata */}
                <div className="marketplace-course-meta">
                  <span>
                    <BookOpen size={15} />
                    {Array.isArray(course.lessons)
                      ? course.lessons.length
                      : 0}{" "}
                    Lessons
                  </span>

                  <span>
                    <Clock3 size={15} />
                    {course.level || "All Levels"}
                  </span>
                </div>

                {/* Price and View Course Button */}
                <div className="marketplace-course-bottom">
                  <strong>
                    PKR{" "}
                    {Number(course.price || 0).toLocaleString()}
                  </strong>

                  <button
                    type="button"
                    onClick={() => openCourse(course)}
                  >
                    <BookOpen size={16} />
                    View Course
                  </button>
                </div>
              </div>
            </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

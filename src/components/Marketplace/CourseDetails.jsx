
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addToCart,
  getStudentEmail,
  getEnrollments,
} from "../../utils/studentCart";
import { fetchCourseReviews, fetchTeacherSummary } from "../../utils/mongoLearningApi";

import {
  BookOpen,
  ArrowLeft,
  GraduationCap,
  PlayCircle,
  Clock3,
  UserRound,
  ShoppingCart,
  CheckCircle2,
  Star,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import "./CourseDetails.css";

export default function CourseDetails({
  course,
  teacherRating = { rating: null, reviewCount: 0 },
  courseRating = { rating: null, reviewCount: 0 },
  courseReviews = [],
  onBack,
  onOpenCart,
}) {
  const navigate = useNavigate();
  const [cartMessage, setCartMessage] = useState("");
  const [showTeacherProfile, setShowTeacherProfile] = useState(false);
  const [mongoReviews, setMongoReviews] = useState(null);
  const [mongoCourseRating, setMongoCourseRating] = useState(null);
  const [mongoTeacherRating, setMongoTeacherRating] = useState(null);
  const isMongoCourse = /^[a-f0-9]{24}$/i.test(String(course?.id || ""));

  useEffect(() => {
    let cancelled = false;
    setMongoReviews(null);
    setMongoCourseRating(null);
    setMongoTeacherRating(null);
    if (!isMongoCourse) return undefined;
    fetchCourseReviews(course.id)
      .then((data) => {
        if (cancelled) return;
        setMongoReviews(data.reviews || []);
        setMongoCourseRating(data.summary || null);
      })
      .catch(() => {});
    if (course.teacherId) {
      fetchTeacherSummary(course.teacherId)
        .then((data) => { if (!cancelled) setMongoTeacherRating(data.summary || null); })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [course?.id, course?.teacherId, isMongoCourse]);

  if (mongoReviews && Array.isArray(mongoReviews)) courseReviews = mongoReviews;
  if (mongoCourseRating) courseRating = { rating: mongoCourseRating.average, reviewCount: mongoCourseRating.count };
  if (mongoTeacherRating) teacherRating = { rating: mongoTeacherRating.average, reviewCount: mongoTeacherRating.count };

  const lessons = Array.isArray(course?.lessons)
    ? course.lessons
    : [];

  const instructor = course?.instructorProfile || {};
  const teacherSubjects = [...new Set(
    [instructor.expertise, instructor.subjects, instructor.specializations, instructor.teachingSubjects]
      .flatMap((value) => Array.isArray(value) ? value : String(value || "").split(/[,;\n]+/))
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];
  const teachingFocus = [
    instructor.teachingEducationLevel,
    instructor.teachingClassNumber ? `Class ${instructor.teachingClassNumber}` : "",
    instructor.teachingIntermediateYear ? `${instructor.teachingIntermediateYear} Year` : "",
    instructor.teachingDegreeLevel,
    instructor.teachingProgram || instructor.program,
  ].filter(Boolean);

  async function handleAddToCart() {
    const email = getStudentEmail();

    if (!email) {
      navigate("/login");
      return;
    }

    if (!course) return;

    const enrolledCourses = await getEnrollments(email);
    const alreadyEnrolled = enrolledCourses.some(
      (item) => String(item.id) === String(course.id)
    );

    if (alreadyEnrolled) {
      setCartMessage(
        "You are already enrolled in this course."
      );
      return;
    }

    try {
      const added = await addToCart(email, course);

      setCartMessage(
        added
          ? "Course added to cart successfully!"
          : "This course is no longer available."
      );
    } catch (failure) {
      setCartMessage(failure.message || "Could not add this course to your cart.");
    }
  }

 
function handleViewCart() {
  const email = getStudentEmail();

  if (!email) {
    navigate("/login");
    return;
  }

  onOpenCart();
}


  if (!course) return null;

  return (
    <div className="edc-course-details">
      <button
        className="edc-details-back"
        onClick={onBack}
        type="button"
      >
        <ArrowLeft size={18} />
        Back to Courses
      </button>

      <div className="edc-details-layout">
        <div className="edc-details-main">
          <span className="edc-details-category">
            {course.category || "General"}
          </span>

          <h1>{course.title}</h1>

          <p className="edc-details-description">
            {course.description ||
              "Learn with EduConnect AI."}
          </p>

          <div className="edc-details-meta">
            <span>
              <GraduationCap size={17} />
              {course.level || "All Levels"}
            </span>

            <span>
              <BookOpen size={17} />
              {lessons.length} Lessons
            </span>
          </div>

          <section className="edc-details-section">
            <h2>Course Curriculum</h2>

            <p>
              Explore the lessons included in this course.
            </p>

            {lessons.length === 0 ? (
              <div className="edc-details-empty">
                No lessons have been added yet.
              </div>
            ) : (
              <div className="edc-details-lessons">
                {lessons.map((lesson, index) => (
                  <div
                    className="edc-details-lesson"
                    key={lesson.id || index}
                  >
                    <div className="edc-details-lesson-icon">
                      <PlayCircle size={21} />
                    </div>

                    <div className="edc-details-lesson-info">
                      <strong>
                        {index + 1}. {lesson.title}
                      </strong>

                      {lesson.description && (
                        <p>{lesson.description}</p>
                      )}

                      <div className="edc-details-lesson-meta">
                        {lesson.duration && (
                          <span>
                            <Clock3 size={14} />
                            {lesson.duration}
                          </span>
                        )}

                        {lesson.isFreePreview && (
                          <span className="edc-details-preview">
                            Free Preview
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="edc-details-section edc-details-reviews">
            <div className="edc-details-reviews-heading">
              <div>
                <h2>Student Reviews</h2>
                <p>Feedback shared by students enrolled in this course.</p>
              </div>
              <div className="edc-details-reviews-summary">
                <strong>{courseRating.rating === null ? "—" : courseRating.rating.toFixed(1)}</strong>
                <span><span aria-hidden="true">★★★★★</span><small>{courseRating.reviewCount} {courseRating.reviewCount === 1 ? "review" : "reviews"}</small></span>
              </div>
            </div>
            {courseReviews.length ? (
              <div className="edc-details-reviews-list">
                {courseReviews.map((review) => {
                  const emailName = String(review.studentEmail || "").split("@")[0].replace(/[._-]+/g, " ");
                  const name = String(review.studentName || emailName || "Student").trim();
                  const rating = Math.min(5, Math.max(1, Number(review.rating) || 1));
                  const date = new Date(review.updatedAt);
                  return <article className="edc-details-review" key={review.id || `${review.courseKey}:${review.studentEmail}`}>
                    <div className="edc-details-review-person">
                      <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
                      <div><strong>{name}</strong><small>{Number.isNaN(date.getTime()) ? "Student review" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</small></div>
                    </div>
                    <div className="edc-details-review-rating" aria-label={`${rating} out of 5 stars`}>
                      {Array.from({ length: 5 }, (_, index) => <Star key={index} size={15} fill={index < rating ? "currentColor" : "none"} />)}
                    </div>
                    <p>{review.comment}</p>
                  </article>;
                })}
              </div>
            ) : <div className="edc-details-reviews-empty">No student reviews for this course yet.</div>}
          </section>

          <section className="edc-details-section">
            <h2>Meet Your Instructor</h2>

            <div className="edc-details-instructor">
              {instructor.avatar ? (
                <img
                  src={instructor.avatar}
                  alt={
                    course.instructorName ||
                    "Course instructor"
                  }
                />
              ) : (
                <div className="edc-details-avatar">
                  <UserRound size={28} />
                </div>
              )}

              <div className="edc-details-instructor-summary">
                <span className="edc-details-profile-eyebrow">COURSE INSTRUCTOR</span>
                <h3>
                  {course.instructorName ||
                    "EduConnect Instructor"}
                </h3>

                <p>{instructor.headline || instructor.expertise || "Educator on EduConnect AI"}</p>
                <p className="edc-details-teacher-rating">
                  <Star size={16} fill="currentColor" />
                  {teacherRating.rating === null
                    ? "No teacher ratings yet"
                    : `${teacherRating.rating.toFixed(1)} teacher rating · ${teacherRating.reviewCount} reviews`}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="edc-details-profile-toggle"
              aria-expanded={showTeacherProfile}
              onClick={() => setShowTeacherProfile((visible) => !visible)}
            >
              {showTeacherProfile ? "Hide Teacher Profile" : "View Full Teacher Profile"}
              {showTeacherProfile ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
            </button>

            {showTeacherProfile && (
              <div className="edc-details-profile-card">
                <div className="edc-details-profile-header">
                  {instructor.avatar ? (
                    <img src={instructor.avatar} alt="" />
                  ) : (
                    <div className="edc-details-profile-avatar"><UserRound size={28} /></div>
                  )}
                  <div className="edc-details-profile-identity">
                    <span>INSTRUCTOR PROFILE</span>
                    <h3>{course.instructorName || "EduConnect Instructor"}</h3>
                    <p>{instructor.headline || instructor.expertise || "Educator on EduConnect AI"}</p>
                  </div>
                  <div className="edc-details-profile-rating">
                    <Star size={17} fill="currentColor" />
                    <strong>{teacherRating.rating === null ? "New" : teacherRating.rating.toFixed(1)}</strong>
                    <small>{teacherRating.reviewCount} {teacherRating.reviewCount === 1 ? "review" : "reviews"}</small>
                  </div>
                </div>

                <div className="edc-details-profile-facts">
                  <article>
                    <GraduationCap size={18} />
                    <span>Qualification</span>
                    <strong>{instructor.qualification || "Not added yet"}</strong>
                  </article>
                  <article>
                    <Clock3 size={18} />
                    <span>Teaching experience</span>
                    <strong>{instructor.experience || "Not added yet"}</strong>
                  </article>
                </div>

                {teachingFocus.length > 0 && (
                  <div className="edc-details-profile-group">
                    <h4>Teaching focus</h4>
                    <div className="edc-details-profile-tags">
                      {teachingFocus.map((item) => <span key={item}>{item}</span>)}
                    </div>
                  </div>
                )}

                <div className="edc-details-profile-group">
                  <h4>Expertise & subjects</h4>
                  {teacherSubjects.length > 0 ? (
                    <div className="edc-details-profile-tags">
                      {teacherSubjects.map((item) => <span key={item}>{item}</span>)}
                    </div>
                  ) : <p className="edc-details-profile-empty">No subjects have been added yet.</p>}
                </div>

                <div className="edc-details-profile-group">
                  <h4>About the instructor</h4>
                  <p className="edc-details-profile-bio">{instructor.bio || "The instructor has not added a biography yet."}</p>
                </div>

                {course.teacherEmail && (
                  <a className="edc-details-profile-contact" href={`mailto:${course.teacherEmail}`}>
                    Contact instructor <span>{course.teacherEmail}</span>
                  </a>
                )}
              </div>
            )}
          </section>
        </div>

        <aside className="edc-details-sidebar">
          <div className="edc-details-thumbnail">
            {course.thumbnail ? (
              <img
                src={course.thumbnail}
                alt={course.title}
              />
            ) : (
              <GraduationCap size={54} />
            )}
          </div>

          <div className="edc-details-sidebar-body">
            <span className="edc-details-price-label">
              Course Price
            </span>

            <strong className="edc-details-price">
              PKR{" "}
              {Number(
                course.price || 0
              ).toLocaleString()}
            </strong>

            <button
              className="edc-details-enroll edc-details-enroll-primary"
              type="button"
              onClick={handleAddToCart}
            >
              <ShoppingCart size={18} />
              Add to Cart
            </button>

            <button
              className="edc-details-enroll edc-details-enroll-secondary"
              type="button"
              onClick={handleViewCart}
            >
              <ShoppingCart size={18} />
              View Cart
            </button>

            {cartMessage && (
              <p
                role="status"
                className="edc-details-sidebar-note"
                data-state={cartMessage.includes("successfully") ? "success" : "info"}
              >
                <CheckCircle2 size={16} />
                {cartMessage}
              </p>
            )}

            <p className="edc-details-sidebar-note">
              Add this course to your cart and complete
              secure checkout to enroll. Payment is verified
              by the server before access is granted.
            </p>

            <div className="edc-details-includes">
              <h3>This Course Includes</h3>

              <p>
                <BookOpen size={17} />
                {lessons.length} Lessons
              </p>

              <p>
                <GraduationCap size={17} />
                {course.level || "All Levels"}
              </p>

              <p>
                <PlayCircle size={17} />
                Free preview labels where available
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

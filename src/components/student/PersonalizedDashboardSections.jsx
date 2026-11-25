import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, Clock3, Download, ExternalLink, PlayCircle, ShoppingCart, Sparkles, Star, UserRound, X } from "lucide-react";
import { getCourseReviewSummaries, getPublishedPdfResources, getRelatedLearningSuggestions, getRelatedPublishedCourses, getStudentAcademicContext, getStudentAcademicSubjects, isAcademicProfileComplete, rankRelatedTeachers } from "../../utils/studentRecommendations";
import ReportAction from "../moderation/ReportAction";
import { isModerationVisible } from "../../utils/moderationVisibility";
import "./PersonalizedDashboardSections.css";

const courseKey = (course) => `${String(course.teacherEmail || "").trim().toLowerCase()}::${String(course.id)}`;
const sameCourse = (item, course) => String(item.id) === String(course.id) && String(item.teacherEmail || "").trim().toLowerCase() === String(course.teacherEmail || "").trim().toLowerCase();

function hasPurchasedCourse(course, orders) {
  const ownerEmail = String(course.teacherEmail || course.instructorEmail || "").trim().toLowerCase();
  return orders.some((order) => ["completed", "demo completed", "paid"].includes(String(order.status || "").toLowerCase()) &&
    (order.items || []).some((item) => item.itemType !== "book" && String(item.id) === String(course.id) &&
      String(item.teacherEmail || "").trim().toLowerCase() === ownerEmail));
}

function CourseActions({ course, enrolled, purchased, onEnroll, onAddToCart, onGoToCourse }) {
  if (enrolled || purchased) return <button type="button" className="edc-pds-primary" onClick={() => onGoToCourse(course)}>Go to Course <ArrowRight size={15} /></button>;
  if (Number(course.price) > 0) return <button type="button" className="edc-pds-primary" onClick={() => onAddToCart(course)}><ShoppingCart size={15} /> Add to Cart</button>;
  return <button type="button" className="edc-pds-primary" onClick={() => onEnroll(course)}>Enroll for Free <ArrowRight size={15} /></button>;
}

export default function PersonalizedDashboardSections({
  studentName, email, notice, profile, courses, reviews, enrollments, orders,
  onEditProfile, onOpenEbooks, onBrowseCourses, onEnrollFree, onAddToCart, onGoToCourse,
  onPreviewLesson, onOpenLesson, onOpenPdf, canPlayLesson,
}) {
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [teacherFilter, setTeacherFilter] = useState("");
  const completeProfile = isAcademicProfileComplete(profile);
  const matchingCourses = useMemo(() => completeProfile ? getRelatedPublishedCourses(courses, profile) : [], [completeProfile, courses, profile]);
  const ratings = useMemo(() => getCourseReviewSummaries(courses, reviews), [courses, reviews]);
  const teachers = useMemo(() => rankRelatedTeachers(matchingCourses, reviews), [matchingCourses, reviews]);
  const books = useMemo(() => {
    const matchingKeys = new Set(matchingCourses.map(courseKey));
    return getPublishedPdfResources(courses).filter((book) => matchingKeys.has(courseKey(book.course)));
  }, [courses, matchingCourses]);
  const videoLectures = matchingCourses.flatMap((course) => (Array.isArray(course.lessons) ? course.lessons : [])
    .flatMap((lesson, index) => {
      const targetId = `${String(course.teacherEmail || course.instructorEmail || "demo").toLowerCase()}::${course.id}::${String(lesson?.id ?? index)}`;
      return (canPlayLesson(lesson) || lesson?.hasLocalVideo) && isModerationVisible("video", targetId) ? [{ course, lesson, targetId }] : [];
    }));
  const suggestions = completeProfile ? getRelatedLearningSuggestions(profile) : [];
  const browse = () => onBrowseCourses();

  function ownership(course) {
    const enrolled = enrollments.some((item) => sameCourse(item, course));
    const purchased = hasPurchasedCourse(course, orders);
    return { enrolled, purchased, accessible: enrolled || purchased };
  }

  if (!completeProfile) return <section className="edc-pds-panel">
    <header className="edc-pds-heading"><div><span>PERSONALIZED FOR YOU</span><h2>Complete your education profile</h2><p>Recommendations will use the education details already saved in your student profile.</p></div></header>
    <button type="button" className="edc-pds-primary" onClick={onEditProfile}>Open My Profile <ArrowRight size={15} /></button>
  </section>;

  const profileTitle = getStudentAcademicContext(profile).title;

  return <div className="edc-pds">
    {notice && <p className="edc-pds-notice" role="status">{notice}</p>}
    <section className="edc-pds-panel edc-pds-profile-summary">
      <div><span className="edc-pds-eyebrow">YOUR LEARNING PROFILE</span><h2>Welcome, {studentName || "Student"}</h2><p>{profileTitle}{profile.degreeLevel ? ` · ${profile.degreeLevel.toUpperCase()}` : ""}</p>
      {getStudentAcademicSubjects(profile).length > 0 && <div className="edc-pds-chips">{getStudentAcademicSubjects(profile).slice(0, 10).map((subject) => <span key={subject}>{subject}</span>)}</div>}
      </div><button type="button" className="edc-pds-secondary" onClick={onEditProfile}>Edit Profile</button>
    </section>

    <section className="edc-pds-panel" id="recommended-courses">
      <header className="edc-pds-heading"><div><span>RECOMMENDED FOR YOU</span><h2>Published Courses</h2><p>Ranked using your saved program and subjects. Only published teacher courses are shown.</p>{teacherFilter && <button type="button" className="edc-pds-link" onClick={() => setTeacherFilter("")}>Clear teacher filter</button>}</div><button type="button" className="edc-pds-link" onClick={browse}>Explore all courses <ArrowRight size={15} /></button></header>
      {matchingCourses.length ? <div className="edc-pds-grid">
        {matchingCourses.filter((course) => !teacherFilter || String(course.teacherEmail).toLowerCase() === teacherFilter).map((course) => {
          const access = ownership(course); const review = ratings.get(courseKey(course));
          const price = Math.max(0, Number(course.price) || 0);
          return <article className="edc-pds-course" key={courseKey(course)}>
            {course.thumbnail || course.image ? <img className="edc-pds-cover" src={course.thumbnail || course.image} alt="" /> : <div className="edc-pds-cover edc-pds-cover-empty"><BookOpen size={28} /></div>}
            <div className="edc-pds-card-body"><span className="edc-pds-tag">{course.category || "Published course"}</span><h3>{course.title}</h3><p>By {course.instructorName || "Instructor"}</p>
              <div className="edc-pds-meta">{course.educationLevel && <span>Education: {course.educationLevel}</span>}{course.program && <span>Program: {course.program}</span>}{course.level && <span>Difficulty: {course.level}</span>}</div>
              <div className="edc-pds-card-foot"><span className="edc-pds-rating">{review?.rating ? <><Star size={14} fill="currentColor" /> {review.rating.toFixed(1)} ({review.reviewCount})</> : "No ratings yet"}</span><strong>{price ? `PKR ${price.toLocaleString()}` : "Free"}</strong></div>
              <div className="edc-pds-actions"><button type="button" className="edc-pds-secondary" onClick={() => setSelectedCourse(course)}>View Course</button><CourseActions course={course} {...access} onEnroll={onEnrollFree} onAddToCart={onAddToCart} onGoToCourse={onGoToCourse} /><ReportAction reporterEmail={email} reporterName={studentName || "Student"} target={{ reportType: "content", targetType: "course", targetId: courseKey(course), targetTitle: course.title, targetOwnerEmail: course.teacherEmail, targetOwnerName: course.instructorName, targetRole: "Teacher" }} /></div>
            </div>
          </article>;
        })}
      </div> : <EmptyRecommendation message="No matching resources available yet." onBrowse={browse} />}
    </section>

    <section className="edc-pds-panel">
      <header className="edc-pds-heading"><div><span>YOUR LIBRARY</span><h2>Recommended Books & PDF eBooks</h2><p>PDF files attached to published course curricula. Paid course materials require course access.</p></div><button type="button" className="edc-pds-link" onClick={onOpenEbooks}>My eBooks <ArrowRight size={15} /></button></header>
      {books.length ? <div className="edc-pds-grid">
        {books.map((book) => {
          const access = ownership(book.course); const price = Math.max(0, Number(book.course.price) || 0);
          const lesson = (book.course.lessons || []).find((item) => String(item.id) === String(book.lessonId));
          return <article className="edc-pds-resource" key={`${courseKey(book.course)}-${book.id}`}>
            {book.course.thumbnail || book.course.image ? <img className="edc-pds-cover" src={book.course.thumbnail || book.course.image} alt="" /> : <div className="edc-pds-resource-icon"><BookOpen size={25} /></div>}<div className="edc-pds-resource-body"><h3>{String(book.name || "PDF eBook").replace(/\.pdf$/i, "")}</h3><p>{book.course.title} · {book.instructorName}</p>
              {book.course.educationLevel && <span>Education: {book.course.educationLevel}</span>}{book.course.program && <span>Program: {book.course.program}</span>}
              {book.subject && <span>Subject: {book.subject}</span>}{book.semester && <span>Semester: {book.semester}</span>}{lesson && <span>Lesson: {lesson.title}</span>}
              <div className="edc-pds-card-foot"><span>{price ? "Paid course resource" : "Free course resource"}</span><strong>{price ? `PKR ${price.toLocaleString()}` : "Free"}</strong></div>
              {access.accessible ? <div className="edc-pds-actions"><button type="button" className="edc-pds-secondary" onClick={() => onOpenPdf(book, false)}>Read Online <ExternalLink size={14} /></button><button type="button" className="edc-pds-primary" onClick={() => onOpenPdf(book, true)}><Download size={14} /> Download PDF</button></div>
                : price ? <button type="button" className="edc-pds-primary" onClick={() => onAddToCart(book.course)}><ShoppingCart size={14} /> Add to Cart</button>
                  : <button type="button" className="edc-pds-primary" onClick={() => onEnrollFree(book.course)}>Enroll in Free Course <ArrowRight size={14} /></button>}
              <ReportAction reporterEmail={email} reporterName={studentName || "Student"} target={{ reportType: "content", targetType: "pdf", targetId: `${String(book.teacherEmail || book.course.teacherEmail).toLowerCase()}::${book.course.id}::${book.id}`, targetTitle: book.name || "Course PDF eBook", targetOwnerEmail: book.teacherEmail || book.course.teacherEmail, targetOwnerName: book.instructorName, targetRole: "Teacher" }} />
            </div>
          </article>;
        })}
      </div> : <EmptyRecommendation message="No matching PDF eBooks are attached to published courses yet." onBrowse={browse} />}
    </section>

    <section className="edc-pds-panel">
      <header className="edc-pds-heading"><div><span>REAL INSTRUCTORS</span><h2>Recommended Teachers</h2><p>Teachers are listed through their matching published courses and actual saved student reviews.</p></div></header>
      {teachers.length ? <div className="edc-pds-grid">
        {teachers.map((teacher) => <article className="edc-pds-teacher" key={teacher.key}>
          <div className="edc-pds-teacher-head">{teacher.profile.avatar ? <img src={teacher.profile.avatar} alt="" /> : <span><UserRound size={25} /></span>}<div><h3>{teacher.name}</h3><p>{teacher.profile.headline || teacher.profile.qualification || "Teacher"}</p></div></div>
          {teacher.profile.experience && <p>{teacher.profile.experience}</p>}{teacher.profile.expertise && <p>Subjects / expertise: {teacher.profile.expertise}</p>}
          {teacher.subjects.length > 0 && <p>Course subjects: {teacher.subjects.join(", ")}</p>}{teacher.teachingLevels.length > 0 && <p>Teaching levels: {teacher.teachingLevels.join(", ")}</p>}{teacher.programs.length > 0 && <p>Programs: {teacher.programs.join(", ")}</p>}
          <p>{teacher.courses.length} matching published {teacher.courses.length === 1 ? "course" : "courses"}</p>
          <span className="edc-pds-rating">{teacher.rating === null ? "No ratings yet" : <><Star size={14} fill="currentColor" /> {teacher.rating.toFixed(1)} · {teacher.reviewCount} actual reviews</>}</span>
          <div className="edc-pds-actions"><button type="button" className="edc-pds-secondary" onClick={() => setSelectedTeacher(teacher)}>View Profile</button><button type="button" className="edc-pds-link" onClick={() => { setTeacherFilter(teacher.email); document.getElementById("recommended-courses")?.scrollIntoView({ behavior: "smooth" }); }}>View Courses <ArrowRight size={14} /></button><ReportAction label="Report teacher" reporterEmail={email} reporterName={studentName || "Student"} target={{ reportType: "user", targetType: "teacher", targetId: teacher.email, targetTitle: teacher.name, targetOwnerEmail: teacher.email, targetOwnerName: teacher.name, targetRole: "Teacher" }} /></div>
        </article>)}
      </div> : <EmptyRecommendation message="No matching teachers with published courses are available yet." onBrowse={browse} />}
    </section>

    <section className="edc-pds-panel">
      <header className="edc-pds-heading"><div><span>LECTURES FROM PUBLISHED COURSES</span><h2>Video Lectures for You</h2><p>Only lectures with a saved video are listed. Access follows course enrollment, purchase, and free-preview settings.</p></div></header>
      {videoLectures.length ? <div className="edc-pds-grid">
        {videoLectures.map(({ course, lesson, targetId }) => {
          const access = ownership(course); const preview = Boolean(lesson.isFreePreview); const price = Math.max(0, Number(course.price) || 0);
          const canWatch = preview || access.accessible;
          return <article className="edc-pds-video" key={targetId}>
            {course.thumbnail || course.image ? <img className="edc-pds-cover" src={course.thumbnail || course.image} alt="" /> : <div className="edc-pds-cover edc-pds-cover-empty"><PlayCircle size={28} /></div>}
            <div className="edc-pds-card-body"><span className="edc-pds-tag">{preview ? "Free Preview" : price ? "Paid Course" : "Enrollment Required"}</span><h3>{lesson.title || "Untitled lecture"}</h3><p>{course.title} · {course.instructorName}</p>
              {lesson.subject && <span>Subject: {lesson.subject}</span>}{lesson.duration && <span className="edc-pds-inline"><Clock3 size={13} /> {lesson.duration}</span>}
              {canWatch ? <button type="button" className="edc-pds-primary" onClick={() => (access.accessible ? onOpenLesson(course, lesson) : onPreviewLesson(course, lesson))}><PlayCircle size={15} /> Watch Lecture</button>
                : price ? <button type="button" className="edc-pds-primary" onClick={() => onAddToCart(course)}><ShoppingCart size={14} /> Add Course to Cart</button>
                  : <button type="button" className="edc-pds-primary" onClick={() => onEnrollFree(course)}>Enroll to Watch</button>}
              <ReportAction reporterEmail={email} reporterName={studentName || "Student"} target={{ reportType: "content", targetType: "video", targetId, targetTitle: `${course.title}: ${lesson.title || "Untitled lecture"}`, targetOwnerEmail: course.teacherEmail || course.instructorEmail || "", targetOwnerName: course.instructorName || course.instructor || "", targetRole: "Teacher" }} />
            </div>
          </article>;
        })}
      </div> : <EmptyRecommendation message="No matching published video lectures are available yet." onBrowse={browse} />}
    </section>

    <section className="edc-pds-panel">
      <header className="edc-pds-heading"><div><span>PERSONALIZED LEARNING PATH</span><h2>Suggested Topics</h2><p>Suggestions without a matching published course are clearly marked as topics, not courses.</p></div></header>
      {suggestions.length ? <div className="edc-pds-path-list">{suggestions.map((topic) => {
        const related = getRelatedPublishedCourses(matchingCourses, { ...profile, program: "" }).filter((course) => {
          const values = [course.subject, course.subjects, course.tags].flatMap((value) => Array.isArray(value) ? value : value ? [value] : []);
          return values.some((value) => normalizeSubject(value) === normalizeSubject(topic));
        });
        return <article key={topic}><Sparkles size={17} /><div><strong>{topic}</strong>{related.length ? <p>Published learning available: {related.map((course) => <button key={courseKey(course)} type="button" className="edc-pds-course-link" onClick={() => setSelectedCourse(course)}>{course.title}</button>)}</p> : <p>Learning suggestion · no matching published course yet</p>}</div></article>;
      })}</div> : <EmptyRecommendation message="Complete your profile to see learning suggestions." onBrowse={onEditProfile} browseLabel="Open My Profile" />}
    </section>

    {matchingCourses.length === 0 && <section className="edc-pds-panel"><EmptyRecommendation message="No matching resources available yet." onBrowse={browse} /></section>}

    {selectedCourse && <div className="edc-pds-modal-backdrop" role="presentation" onClick={() => setSelectedCourse(null)}><section className="edc-pds-modal" role="dialog" aria-modal="true" aria-label={`${selectedCourse.title} details`} onClick={(event) => event.stopPropagation()}>
      <button className="edc-pds-close" type="button" onClick={() => setSelectedCourse(null)} aria-label="Close"><X size={19} /></button><span className="edc-pds-tag">{selectedCourse.category || "Published course"}</span><h2>{selectedCourse.title}</h2><p>By {selectedCourse.instructorName}</p><p>{selectedCourse.description || "No course description has been provided."}</p><p>{selectedCourse.level ? `Difficulty: ${selectedCourse.level}` : ""}{selectedCourse.program ? ` · ${selectedCourse.program}` : ""}</p><strong>{Number(selectedCourse.price) > 0 ? `PKR ${Number(selectedCourse.price).toLocaleString()}` : "Free"}</strong><div className="edc-pds-actions"><CourseActions course={selectedCourse} {...ownership(selectedCourse)} onEnroll={onEnrollFree} onAddToCart={onAddToCart} onGoToCourse={onGoToCourse} /></div>
    </section></div>}

    {selectedTeacher && <div className="edc-pds-modal-backdrop" role="presentation" onClick={() => setSelectedTeacher(null)}><section className="edc-pds-modal" role="dialog" aria-modal="true" aria-label={`${selectedTeacher.name} profile`} onClick={(event) => event.stopPropagation()}>
      <button className="edc-pds-close" type="button" onClick={() => setSelectedTeacher(null)} aria-label="Close"><X size={19} /></button><div className="edc-pds-teacher-head">{selectedTeacher.profile.avatar ? <img src={selectedTeacher.profile.avatar} alt="" /> : <span><UserRound size={25} /></span>}<div><h2>{selectedTeacher.name}</h2><p>{selectedTeacher.profile.headline || "Teacher"}</p></div></div><p>{selectedTeacher.profile.bio || "No additional profile details have been provided."}</p><p>{selectedTeacher.profile.expertise || "No expertise details provided."}</p><p>{selectedTeacher.rating === null ? "No ratings yet" : `★ ${selectedTeacher.rating.toFixed(1)} from ${selectedTeacher.reviewCount} reviews`}</p><button type="button" className="edc-pds-primary" onClick={() => { setTeacherFilter(selectedTeacher.email); setSelectedTeacher(null); document.getElementById("recommended-courses")?.scrollIntoView({ behavior: "smooth" }); }}>View published courses <ArrowRight size={15} /></button>
    </section></div>}
  </div>;
}

function EmptyRecommendation({ message, onBrowse, browseLabel = "Explore All Courses" }) {
  return <div className="edc-pds-empty"><p>{message}</p><button type="button" className="edc-pds-secondary" onClick={onBrowse}>{browseLabel} <ArrowRight size={14} /></button></div>;
}

function normalizeSubject(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

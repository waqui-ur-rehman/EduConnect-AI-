import { enrollContent } from "../../utils/contentApi";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Download, ExternalLink, Heart, Search, Send, Star, UserRound, X } from "lucide-react";
import { createBookSystemId, getBookReviews, getPublishedBooks, isBookPurchased, loadBookFile, saveBookReview } from "../../utils/books";
import { createAdminSupportRequest } from "../admin/adminData";
import { getStudentAcademicSubjects, INTERMEDIATE_STREAMS, normalizeRecommendationText } from "../../utils/studentRecommendations";
import { getReviews } from "../../utils/courseReviews";
import ReportAction from "../moderation/ReportAction";
import { MODERATION_VISIBILITY_EVENT } from "../../utils/moderationVisibility";
import "./books.css";

const userList = () => { try { const value = JSON.parse(localStorage.getItem("educonnect.registeredUsers") || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } };
const profileFor = (email) => { try { return JSON.parse(localStorage.getItem(`educonnect.teacher.${String(email).toLowerCase()}.profile`) || "{}"); } catch { return {}; } };
const tokens = (value) => (Array.isArray(value) ? value : [value]).flatMap((item) => String(item || "").split(/[,;\n]+/)).map((item) => item.trim()).filter(Boolean);
const average = (values) => values.length ? values.reduce((sum, item) => sum + Number(item), 0) / values.length : null;
function teacherFocusFor(profile) {
  const focus = {
    educationLevel: profile.teachingEducationLevel || "",
    classNumber: profile.teachingClassNumber || "",
    intermediateYear: profile.teachingIntermediateYear || "",
    stream: profile.teachingStream || "",
    degreeLevel: profile.teachingDegreeLevel || "",
    program: profile.teachingProgram || "",
  };
  const levelNames = { school: "School", intermediate: "College / Intermediate", university: "University", online: "Interest / Online Courses" };
  const streamName = INTERMEDIATE_STREAMS.find(([key]) => key === focus.stream)?.[1] || "";
  const program = focus.program || (focus.educationLevel === "school" && focus.classNumber ? `Class ${focus.classNumber}` : "");
  const yearName = focus.intermediateYear === "2" ? "2nd Year" : focus.intermediateYear === "1" ? "1st Year" : "";
  const details = focus.educationLevel === "intermediate" ? [yearName, streamName].filter(Boolean).join(" · ") : focus.educationLevel === "university" && focus.degreeLevel ? focus.degreeLevel.toUpperCase() : "";
  return {
    label: [levelNames[focus.educationLevel], details, program].filter(Boolean).join(" · ") || "Not selected",
    educationLevel: focus.educationLevel,
    program,
    subjects: getStudentAcademicSubjects(focus),
  };
}
const educationCategory = (value) => {
  const level = normalizeRecommendationText(value);
  if (level.includes("school")) return "school";
  if (level.includes("college") || level.includes("intermediate")) return "intermediate";
  if (level.includes("university") || level.includes("bachelor") || level.includes("bs ") || level === "bs" || level.includes("master") || level.includes("phd") || level.includes("mphil")) return "university";
  if (level.includes("online") || level.includes("interest") || level.includes("youtube")) return "interest";
  return level;
};

export default function BookTeacherHub({ email, profile, courses = [], cart = [], purchasedBooks = [], savedBookIds = [], onToggleSavedBook, onAddBookToCart, onOpenEbooks, defaultTab = "books", recommendedOnly = false }) {
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [priceFilter, setPriceFilter] = useState("");
  const [ratingFilter, setRatingFilter] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("");
  const [programFilter, setProgramFilter] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [qualificationFilter, setQualificationFilter] = useState("");
  const [experienceFilter, setExperienceFilter] = useState("");
  const [selected, setSelected] = useState(null);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [requestTeacher, setRequestTeacher] = useState(null);
  const [question, setQuestion] = useState("");
  const [notice, setNotice] = useState("");
  const [bookRating, setBookRating] = useState(5);
  const [bookComment, setBookComment] = useState("");
  const [books, setBooks] = useState(getPublishedBooks);
  const [bookReviews, setBookReviews] = useState(getBookReviews);
  const [courseReviews, setCourseReviews] = useState(getReviews);
  useEffect(() => {
    const refresh = () => { setBooks(getPublishedBooks()); setBookReviews(getBookReviews()); setCourseReviews(getReviews()); };
    const events = ["storage", "educonnect:books-changed", "educonnect:book-reviews-changed", "educonnect:reviews-changed", "educonnect:teacher-profile-changed", "educonnect:teacher-courses-changed", MODERATION_VISIBILITY_EVENT];
    events.forEach((event) => window.addEventListener(event, refresh));
    return () => events.forEach((event) => window.removeEventListener(event, refresh));
  }, []);
  const subjects = getStudentAcademicSubjects(profile);
  const normalizedProgram = normalizeRecommendationText(profile.program || profile.classOrProgram || "");
  const teacherMap = useMemo(() => {
    const registered = userList().filter((user) => user.role === "Teacher" && (!user.status || ["approved", "active"].includes(String(user.status).toLowerCase())));
    return registered.map((user) => {
      const teacherEmail = String(user.email || "").trim().toLowerCase();
      const teacherProfile = profileFor(teacherEmail);
      const teacherCourses = courses.filter((course) => String(course.teacherEmail || "").toLowerCase() === teacherEmail);
      const teacherBooks = books.filter((book) => String(book.teacherEmail || "").toLowerCase() === teacherEmail);
      const focus = teacherFocusFor(teacherProfile);
      const publishedCourseKeys = new Set(teacherCourses.map((course) => `${teacherEmail}::${course.id}`));
      const ratings = courseReviews.filter((review) => publishedCourseKeys.has(String(review.courseKey || "").toLowerCase())).map((review) => Number(review.rating)).filter((rating) => rating >= 1 && rating <= 5);
      const ratingsFromBooks = bookReviews.filter((review) => String(review.teacherEmail || "").toLowerCase() === teacherEmail && !review.moderated).map((review) => Number(review.rating)).filter((rating) => rating >= 1 && rating <= 5);
      const bookSubjects = teacherBooks.map((book) => book.subject);
      const expertise = tokens(teacherProfile.expertise || teacherProfile.subjects || teacherProfile.specializations);
      const teachingLevels = [...new Set([...tokens(teacherProfile.teachingLevels), focus.educationLevel, ...teacherCourses.flatMap((course) => [course.educationLevel, course.targetLevel, course.classNumber ? `Class ${course.classNumber}` : "", course.intermediateYear ? `${course.intermediateYear}${Number(course.intermediateYear) === 2 ? "nd" : "st"}-Year` : ""])].filter(Boolean))];
      const programs = [...new Set([...tokens(teacherProfile.programs), focus.program, ...teacherCourses.flatMap((course) => tokens([course.program, course.programs]))].filter(Boolean))];
      return { email: teacherEmail, name: teacherProfile.name || user.name || teacherEmail.split("@")[0], profile: { ...teacherProfile, teachingLevels, programs }, courses: teacherCourses, books: teacherBooks, teachingFocus: focus.label, teachingLevels, programs, subjects: [...new Set([...expertise, ...focus.subjects, ...bookSubjects, ...teacherCourses.flatMap((course) => tokens([course.subjects, course.subject, course.specialization]))])], ratings: [...ratings, ...ratingsFromBooks], rating: average([...ratings, ...ratingsFromBooks]) };
    });
  }, [books, courses, bookReviews, courseReviews]);
  const filteredBooks = useMemo(() => {
    const query = normalizeRecommendationText(search);
    const filtered = books.filter((book) => {
      const teacherName = book.teacherName || profileFor(book.teacherEmail).name || "";
      const haystack = normalizeRecommendationText([book.title, book.author, book.subject, book.classOrProgram, book.description, book.teacherEmail, teacherName].join(" "));
      if (query && !haystack.includes(query)) return false;
      if (subjectFilter && normalizeRecommendationText(book.subject) !== normalizeRecommendationText(subjectFilter)) return false;
      if (levelFilter && educationCategory(book.educationLevel) !== levelFilter) return false;
      if (priceFilter === "free" && !book.isFree || priceFilter === "paid" && book.isFree) return false;
      if (minPrice && Number(book.price) < Number(minPrice)) return false;
      if (maxPrice && Number(book.price) > Number(maxPrice)) return false;
      const bookRating = average(bookReviews.filter((item) => String(item.bookId) === String(book.id) && !item.moderated).map((item) => item.rating));
      if (priceFilter === "rated" && bookRating === null || ["3", "4"].includes(priceFilter) && (bookRating === null || bookRating < Number(priceFilter))) return false;
      return true;
    });
    const score = (book) => {
      const text = normalizeRecommendationText([book.title, book.subject, book.classOrProgram].join(" "));
      const classText = profile.classNumber ? normalizeRecommendationText(`class ${profile.classNumber}`) : "";
      const yearText = profile.intermediateYear ? normalizeRecommendationText(`${profile.intermediateYear === "2" ? "2nd" : "1st"} year`) : "";
      const academicProgram = normalizeRecommendationText(profile.program || profile.classOrProgram || "");
      const classMatch = classText && text.includes(classText);
      const yearMatch = yearText && (text.includes(yearText) || text.includes(`${profile.intermediateYear} year`));
      const programMatch = academicProgram && text.includes(academicProgram);
      return subjects.reduce((sum, subject) => sum + (text.includes(normalizeRecommendationText(subject)) ? 2 : 0), 0) + (normalizedProgram && text.includes(normalizedProgram) ? 3 : 0) + (programMatch ? 3 : 0) + (classMatch || yearMatch ? 4 : 0);
    };
    const profileMatches = filtered.filter((book) => score(book) > 0);
    const results = recommendedOnly ? profileMatches : filtered;
    return results.sort((a, b) => score(b) - score(a));
  }, [books, search, subjectFilter, levelFilter, priceFilter, minPrice, maxPrice, bookReviews, subjects, normalizedProgram, profile, recommendedOnly]);
  const bookSubjectOptions = [...new Set(books.map((book) => book.subject).filter(Boolean))].sort();
  const teacherSubjectOptions = [...new Set(teacherMap.flatMap((teacher) => teacher.subjects).filter(Boolean))].sort();
  const subjectOptions = [...new Set([...books.map((book) => book.subject), ...teacherMap.flatMap((teacher) => teacher.subjects)].filter(Boolean))].sort();
  const levelOptions = [{ value: "school", label: "School" }, { value: "intermediate", label: "College / Intermediate" }, { value: "university", label: "University" }, { value: "interest", label: "Interest / Online Courses" }];
  const ownedBook = (bookId) => isBookPurchased(email, bookId) || purchasedBooks.some((item) => String(item.id) === String(bookId));
  const showTeachersOnly = defaultTab === "teachers";

  function matchingTeacher(teacher) {
    const searchText = normalizeRecommendationText([teacher.teachingFocus, ...teacher.subjects, ...teacher.programs, ...teacher.courses.map((course) => course.program || ""), ...teacher.books.map((book) => book.classOrProgram || "")].join(" "));
    const profileClass = profile.classNumber ? normalizeRecommendationText(`class ${profile.classNumber}`) : "";
    const profileYear = profile.intermediateYear ? normalizeRecommendationText(`${profile.intermediateYear === "2" ? "2nd" : "1st"} year`) : "";
    return subjects.some((subject) => searchText.includes(normalizeRecommendationText(subject))) || Boolean(normalizedProgram && searchText.includes(normalizedProgram)) || Boolean(profileClass && searchText.includes(profileClass)) || Boolean(profileYear && (searchText.includes(profileYear) || searchText.includes(`${profile.intermediateYear} year`)));
  }
  const teacherResults = teacherMap.filter((teacher) => {
    const query = normalizeRecommendationText(search);
    const fullText = normalizeRecommendationText([teacher.name, teacher.email, teacher.teachingFocus, teacher.profile.qualification, teacher.profile.experience, teacher.profile.headline, teacher.profile.bio, teacher.subjects.join(" "), teacher.programs.join(" "), teacher.courses.map((item) => item.program || item.title).join(" ")].join(" "));
    return (!recommendedOnly || matchingTeacher(teacher)) && (!query || fullText.includes(query)) && (!subjectFilter || teacher.subjects.some((subject) => normalizeRecommendationText(subject) === normalizeRecommendationText(subjectFilter))) && (!levelFilter || teacher.teachingLevels.some((level) => educationCategory(level) === levelFilter)) && (!availabilityFilter || normalizeRecommendationText(teacher.profile.availability) === normalizeRecommendationText(availabilityFilter)) && (!ratingFilter || (teacher.rating !== null && teacher.rating >= (ratingFilter === "1" ? 1 : Number(ratingFilter)))) && (!qualificationFilter || normalizeRecommendationText(teacher.profile.qualification).includes(normalizeRecommendationText(qualificationFilter))) && (!experienceFilter || normalizeRecommendationText(teacher.profile.experience).includes(normalizeRecommendationText(experienceFilter))) && (!programFilter || normalizeRecommendationText([teacher.programs, ...teacher.courses.map((course) => course.program), ...teacher.books.map((book) => book.classOrProgram)].join(" ")).includes(normalizeRecommendationText(programFilter)));
  }).sort((a, b) => matchingTeacher(b) - matchingTeacher(a) || (b.rating ?? -1) - (a.rating ?? -1));

  async function openPdf(book, download = false, preview = false) {
    const hasAccess = book.isFree || ownedBook(book.id);
    if (!hasAccess && !preview) { setNotice("Purchase this eBook before opening the full PDF."); return; }
    if (download && !book.downloadAllowed) { setNotice("The teacher has not allowed PDF downloads."); return; }
    const readingTab = download ? null : window.open("about:blank", "_blank");
    if (readingTab) readingTab.opener = null;
    try {
      if (book.mongoContent && book.isFree && !preview) await enrollContent([{ ...book, itemType: "book" }]);
      const file = await loadBookFile(preview ? book.previewFileId : book.pdfFileId);
      if (!file) throw new Error("This PDF is not available in this browser.");
      const url = URL.createObjectURL(file);
      if (download) { const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${book.title || "ebook"}.pdf`; anchor.click(); }
      else if (readingTab) readingTab.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { if (readingTab) readingTab.close(); setNotice(error.message); }
  }

  function submitReview(event) {
    event.preventDefault();
    if (!selected || !ownedBook(selected.id)) { setNotice("Only students who purchased this eBook can review it."); return; }
    saveBookReview({ id: createBookSystemId("review"), bookId: selected.id, teacherEmail: selected.teacherEmail, studentEmail: email.toLowerCase(), studentName: profile.fullName || profile.name || "Student", rating: Number(bookRating), comment: bookComment.trim(), createdAt: new Date().toISOString() });
    setBookReviews(getBookReviews()); setNotice("Your review was saved."); setBookComment("");
  }
  function submitHelp(event) {
    event.preventDefault();
    if (!requestTeacher || !question.trim()) return;
    createAdminSupportRequest({ subject: `Help request: ${requestTeacher.name}`, description: question.trim(), category: "Teacher Communication", priority: "Medium", requesterEmail: email.toLowerCase(), requesterName: profile.fullName || profile.name || "Student", requesterRole: "Student", requesterId: email.toLowerCase(), relatedRecordId: requestTeacher.email, relatedRecordTitle: requestTeacher.name, actor: email.toLowerCase() });
    setQuestion(""); setRequestTeacher(null); setNotice("Help request sent to Admin. No teacher assignment or AI response is automatic.");
  }
  function clearFilters() { setSearch(""); setSubjectFilter(""); setLevelFilter(""); setPriceFilter(""); setRatingFilter(""); setAvailabilityFilter(""); setProgramFilter(""); setMinPrice(""); setMaxPrice(""); setQualificationFilter(""); setExperienceFilter(""); }

  return <div className="edc-books-hub edc-books-directory">
    {notice && <p className="edc-book-message" role="status">{notice}</p>}
    <section className="edc-books-stats" aria-label="Books and teacher totals">
      <article><span className="edc-books-stat-icon"><BookOpen size={20} /></span><div><small>Approved Books</small><strong>{books.length.toLocaleString()}</strong></div></article>
      <article><span className="edc-books-stat-icon"><UserRound size={20} /></span><div><small>Registered Teachers</small><strong>{teacherMap.length.toLocaleString()}</strong></div></article>
      <article><span className="edc-books-stat-icon"><Download size={20} /></span><div><small>Free Books</small><strong>{books.filter((book) => book.isFree).length.toLocaleString()}</strong></div></article>
      <article><span className="edc-books-stat-icon"><Star size={20} /></span><div><small>Teachers With Ratings</small><strong>{teacherMap.filter((teacher) => teacher.rating !== null).length.toLocaleString()}</strong></div></article>
    </section>
    <div className="edc-books-toolbar">
      <label className="edc-books-search"><span>Search this directory</span><div><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search books or registered teachers..." /></div></label>
      <label><span>Education level</span><select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}><option value="">All levels</option>{levelOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <button type="button" className="edc-book-clear" onClick={clearFilters}>Clear Filters</button>
      {!showTeachersOnly && <button type="button" className="edc-books-library-button" onClick={onOpenEbooks}>My eBooks / My Library</button>}
      <details className="edc-books-advanced-filters">
        <summary>More filters</summary>
        <div className="edc-books-advanced-grid">
          <label><span>Book price / rating</span><select value={priceFilter} onChange={(event) => setPriceFilter(event.target.value)}><option value="">All</option><option value="free">Free</option><option value="paid">Paid</option><option value="4">Rating 4+</option><option value="3">Rating 3+</option><option value="rated">Rated</option></select></label>
          <label><span>Minimum price (PKR)</span><input type="number" min="0" placeholder="Min" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} /></label>
          <label><span>Maximum price (PKR)</span><input type="number" min="0" placeholder="Max" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} /></label>
          <label><span>Teacher subject</span><select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="">All subjects</option>{subjectOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Availability</span><select value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value)}><option value="">All</option>{["Available", "Busy", "Unavailable"].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Minimum teacher rating</span><select value={ratingFilter} onChange={(event) => setRatingFilter(event.target.value)}><option value="">Any</option><option value="4">4+</option><option value="3">3+</option><option value="1">Rated</option></select></label>
          <label><span>Program</span><input value={programFilter} onChange={(event) => setProgramFilter(event.target.value)} placeholder="Program name" /></label>
          <label><span>Qualification</span><input value={qualificationFilter} onChange={(event) => setQualificationFilter(event.target.value)} /></label>
          <label><span>Experience</span><input value={experienceFilter} onChange={(event) => setExperienceFilter(event.target.value)} placeholder="Experience" /></label>
        </div>
      </details>
    </div>
    <div className={`edc-books-directory-panels${showTeachersOnly ? " edc-books-teachers-only" : ""}`}>
      {!showTeachersOnly && <section className="edc-books-directory-panel">
        <div className="edc-books-panel-heading"><BookOpen size={20} /><div><h3>Browse Books</h3><span>{filteredBooks.length} matching</span></div></div>
        {bookSubjectOptions.length > 0 && <div className="edc-books-subject-chips"><button type="button" className={!subjectFilter ? "active" : ""} onClick={() => setSubjectFilter("")}>All Books</button>{bookSubjectOptions.map((subject) => <button type="button" className={subjectFilter === subject ? "active" : ""} key={subject} onClick={() => setSubjectFilter(subject)}>{subject}</button>)}</div>}
        {filteredBooks.length ? <div className="edc-books-grid edc-books-directory-grid">{filteredBooks.map((book) => <BookCard key={book.id} book={book} reviews={bookReviews.filter((item) => String(item.bookId) === String(book.id) && !item.moderated)} purchased={ownedBook(book.id)} inCart={cart.some((item) => item.itemType === "book" && String(item.id) === String(book.id))} saved={savedBookIds.some((id) => String(id) === String(book.id))} onToggleSave={() => onToggleSavedBook?.(book.id)} reporterEmail={email} reporterName={profile.fullName || profile.name || "Student"} onDetails={() => { setSelected(book); setBookRating(5); setBookComment(""); }} onRead={() => openPdf(book)} onDownload={() => openPdf(book, true)} onCart={() => onAddBookToCart(book)} />)}</div> : <p className="edc-books-empty">No approved books match your filters.</p>}
      </section>}
      <section className="edc-books-directory-panel">
        <div className="edc-books-panel-heading"><UserRound size={20} /><div><h3>Discover Teachers</h3><span>{teacherResults.length} matching</span></div></div>
        {!showTeachersOnly && teacherSubjectOptions.length > 0 && <div className="edc-books-subject-chips"><button type="button" className={!subjectFilter ? "active" : ""} onClick={() => setSubjectFilter("")}>All Teachers</button>{teacherSubjectOptions.map((subject) => <button type="button" className={subjectFilter === subject ? "active" : ""} key={subject} onClick={() => setSubjectFilter(subject)}>{subject}</button>)}</div>}
        <p className="edc-books-directory-caption">Profiles and ratings come from registered teachers and saved student reviews.</p>
        {teacherResults.length ? <div className="edc-books-grid edc-books-directory-grid">{teacherResults.map((teacher) => <article className="edc-teacher-public-card" key={teacher.email}><div className="edc-teacher-public-head">{teacher.profile.avatar ? <img src={teacher.profile.avatar} alt="" /> : <span><UserRound size={24} /></span>}<div><h4>{teacher.name}</h4><p>{teacher.profile.headline || teacher.profile.qualification || "Registered teacher"}</p></div></div><p>{teacher.profile.qualification && `Qualification: ${teacher.profile.qualification}`}{teacher.profile.experience && ` · Experience: ${teacher.profile.experience}`}</p><p>Subjects: {teacher.subjects.join(", ") || "Not provided"}</p><p>Published courses: {teacher.courses.length} · Published PDFs: {teacher.books.length}</p><p className="edc-books-rating">{teacher.rating === null ? "Not Yet Rated" : <><Star size={14} fill="currentColor" /> {teacher.rating.toFixed(1)} · {teacher.ratings.length} reviews</>}</p><p>Availability: {teacher.profile.availability || "Not specified"}</p><div className="edc-book-actions"><button type="button" className="edc-book-clear" onClick={() => setSelectedTeacher(teacher)}>View Profile</button>{["Busy", "Unavailable"].includes(teacher.profile.availability) && <button type="button" onClick={() => setRequestTeacher(teacher)}>Contact Admin</button>}<button type="button" className="edc-book-clear" onClick={() => { setSearch(teacher.email); }}>View Books</button><button type="button" className="edc-book-clear" onClick={() => setSelectedTeacher(teacher)}>View Courses</button></div></article>)}</div> : <p className="edc-books-empty">No registered teachers match your filters.</p>}
      </section>
    </div>
    {selected && <div className="edc-pds-modal-backdrop" onClick={() => setSelected(null)}><section className="edc-pds-modal" role="dialog" aria-modal="true" aria-label={`${selected.title} details`} onClick={(event) => event.stopPropagation()}><button type="button" className="edc-pds-close" onClick={() => setSelected(null)} aria-label="Close"><X size={18} /></button><h2>{selected.title}</h2><p>By {selected.author || selected.teacherName} · {selected.subject}</p><p>{selected.educationLevel}{selected.classOrProgram ? ` · ${selected.classOrProgram}` : ""}</p><p>{selected.description}</p><ReportAction reporterEmail={email} reporterName={profile.fullName || profile.name || "Student"} target={{ reportType: "content", targetType: "pdf", targetId: String(selected.id), targetTitle: selected.title, targetOwnerEmail: selected.teacherEmail, targetOwnerName: selected.teacherName, targetRole: "Teacher" }} />{bookReviews.filter((item) => String(item.bookId) === String(selected.id)).map((review) => <article className="edc-book-public-review" key={review.id}><strong>{review.studentName || review.studentEmail}</strong><span> &middot; {review.rating}/5</span>{review.comment && <p>{review.comment}</p>}<ReportAction reporterEmail={email} reporterName={profile.fullName || profile.name || "Student"} target={{ reportType: "content", targetType: "book-review", targetId: String(review.id), targetTitle: `Review of ${selected.title}`, targetOwnerEmail: review.teacherEmail || selected.teacherEmail, targetRole: "Teacher" }} /></article>)}<p>{selected.isFree ? "Free PDF" : `PKR ${Number(selected.price).toLocaleString()}`} · Rating: {average(bookReviews.filter((item) => String(item.bookId) === String(selected.id) && !item.moderated).map((item) => item.rating))?.toFixed(1) || "Not Yet Rated"}</p><p>Full PDF access requires purchase; a teacher-provided preview is available when shown.</p>{(selected.isFree || ownedBook(selected.id)) ? <><button type="button" onClick={() => openPdf(selected)}><ExternalLink size={15} /> Read Online</button>{selected.downloadAllowed && <button type="button" onClick={() => openPdf(selected, true)}><Download size={15} /> Download PDF</button>}</> : <button type="button" onClick={() => { onAddBookToCart(selected); setSelected(null); }}>Add to Cart</button>}
      {selected.previewFileId && !ownedBook(selected.id) && <button type="button" className="edc-book-clear" onClick={() => openPdf(selected, false, true)}>Read Preview</button>}
      {ownedBook(selected.id) && <form className="edc-book-review-form" onSubmit={submitReview}><h3>Rate this eBook</h3><label>Rating<select value={bookRating} onChange={(event) => setBookRating(Number(event.target.value))}>{[5,4,3,2,1].map((value) => <option key={value} value={value}>{value} stars</option>)}</select></label><textarea value={bookComment} onChange={(event) => setBookComment(event.target.value)} maxLength={1000} placeholder="Write a review (optional)" /><button type="submit"><Star size={15} /> Save Review</button></form>}</section></div>}
    {selectedTeacher && <div className="edc-pds-modal-backdrop" onClick={() => setSelectedTeacher(null)}><section className="edc-pds-modal" role="dialog" aria-modal="true" aria-label={`${selectedTeacher.name} profile`} onClick={(event) => event.stopPropagation()}><button type="button" className="edc-pds-close" onClick={() => setSelectedTeacher(null)} aria-label="Close"><X size={18} /></button><h2>{selectedTeacher.name}</h2><p>{selectedTeacher.profile.headline || "Registered Teacher"}</p><p>{selectedTeacher.profile.bio || "No biography provided."}</p><p>Qualification: {selectedTeacher.profile.qualification || "Not provided"} · Experience: {selectedTeacher.profile.experience || "Not provided"}</p><p>Teaching levels: {tokens(selectedTeacher.profile.teachingLevels).join(", ") || "Not provided"}</p><p>Subjects / specialization: {selectedTeacher.subjects.join(", ") || "Not provided"}</p><p>Programs: {tokens(selectedTeacher.profile.programs).join(", ") || "Not provided"}</p><p>{selectedTeacher.rating === null ? "Not Yet Rated" : `${selectedTeacher.rating.toFixed(1)} from ${selectedTeacher.ratings.length} reviews`}</p><ReportAction label="Report teacher" reporterEmail={email} reporterName={profile.fullName || profile.name || "Student"} target={{ reportType: "user", targetType: "teacher", targetId: selectedTeacher.email, targetTitle: selectedTeacher.name, targetRole: "Teacher", targetOwnerEmail: selectedTeacher.email, targetOwnerName: selectedTeacher.name }} /><h3>Published Courses</h3>{selectedTeacher.courses.length ? selectedTeacher.courses.map((course) => <div className="edc-teacher-profile-course" key={course.id}><p>{course.title} &middot; {course.program || course.category || ""}</p><ReportAction reporterEmail={email} reporterName={profile.fullName || profile.name || "Student"} target={{ reportType: "content", targetType: "course", targetId: `${selectedTeacher.email}::${course.id}`, targetTitle: course.title, targetOwnerEmail: selectedTeacher.email, targetOwnerName: selectedTeacher.name, targetRole: "Teacher" }} /></div>) : <p>No published courses.</p>}<h3>Published PDF/eBooks</h3>{selectedTeacher.books.length ? selectedTeacher.books.map((book) => <p key={book.id}>{book.title} · {book.subject}</p>) : <p>No published PDF/eBooks.</p>}</section></div>}
    {requestTeacher && <div className="edc-pds-modal-backdrop" onClick={() => setRequestTeacher(null)}><form className="edc-pds-modal" onSubmit={submitHelp} onClick={(event) => event.stopPropagation()}><button type="button" className="edc-pds-close" onClick={() => setRequestTeacher(null)} aria-label="Close"><X size={18} /></button><h2>Contact Admin</h2><p>{requestTeacher.name} is marked {requestTeacher.profile.availability}. Send a learning help request for Admin review.</p><label>Your question<textarea required maxLength={1500} rows={5} value={question} onChange={(event) => setQuestion(event.target.value)} /></label><button type="submit"><Send size={15} /> Send Help Request</button></form></div>}
  </div>;
}

function BookCard({ book, reviews, purchased, inCart, saved, onToggleSave, reporterEmail, reporterName, onDetails, onRead, onDownload, onCart }) {
  const [coverUrl, setCoverUrl] = useState("");
  const rating = average(reviews.map((item) => item.rating));
  useEffect(() => { let active = true; let objectUrl = ""; if (book.coverFileId) loadBookFile(book.coverFileId).then((file) => { if (active && file) { objectUrl = URL.createObjectURL(file); setCoverUrl(objectUrl); } }).catch(() => {}); return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [book.coverFileId]);
  return <article className="edc-public-book-card">{coverUrl ? <img className="edc-public-book-cover" src={coverUrl} alt="" /> : <div className="edc-public-book-cover edc-public-book-cover-empty"><BookOpen size={32} /></div>}<div className="edc-public-book-body"><span className="edc-book-status">{book.isFree ? "Free" : "Paid"}</span><h4>{book.title}</h4><p>{book.author || book.teacherName} · {book.subject}</p><p>{book.educationLevel}{book.classOrProgram ? ` · ${book.classOrProgram}` : ""}</p>{book.pages > 0 && <p>{book.pages} pages</p>}<p>{book.description || ""}</p><p className="edc-books-rating">{rating === null ? "Not Yet Rated" : <><Star size={14} fill="currentColor" /> {rating.toFixed(1)} · {reviews.length} reviews</>}</p><strong>{book.isFree ? "Free" : `PKR ${Number(book.price).toLocaleString()}`}</strong><div className="edc-book-actions"><button type="button" className="edc-book-clear" onClick={onDetails}>View Details</button><button type="button" className="edc-book-clear edc-book-save" onClick={onToggleSave} aria-pressed={saved} aria-label={`${saved ? "Remove" : "Save"} ${book.title} ${saved ? "from" : "to"} wishlist`} title={saved ? "Remove from wishlist" : "Save to wishlist"}><Heart size={14} fill={saved ? "currentColor" : "none"} />{saved ? "Saved" : "Save"}</button>{book.isFree || purchased ? <button type="button" onClick={onRead}>Read Online</button> : <button type="button" disabled={inCart} onClick={onCart}>{inCart ? "In Cart" : "Add to Cart"}</button>}{(book.isFree || purchased) && book.downloadAllowed && <button type="button" className="edc-book-clear" onClick={onDownload}>Download PDF <Download size={14} /></button>}<ReportAction reporterEmail={reporterEmail} reporterName={reporterName} target={{ reportType: "content", targetType: "pdf", targetId: String(book.id), targetTitle: book.title, targetOwnerEmail: book.teacherEmail, targetOwnerName: book.teacherName, targetRole: "Teacher" }} /></div></div></article>;
}

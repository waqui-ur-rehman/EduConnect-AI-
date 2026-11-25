import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Code2, Database, PencilLine, Plus, Search, SquarePen, Star, ThumbsUp, Trash2, UserRound, X } from "lucide-react";
import { fetchMyReviews, saveMongoReview, deleteMongoReview, LEARNING_UPDATED_EVENT } from "../../utils/mongoLearningApi";
import reviewArtwork from "../../assets/student-reviews.svg";
import reactLogo from "../../assets/partners/react.svg";
import pythonLogo from "../../assets/partners/python.svg";
import figmaLogo from "../../assets/partners/figma.svg";
import "./StudentCourseReviews.css";

const normalize = value => String(value || "").trim().toLowerCase();
const isMongoId = value => /^[a-f0-9]{24}$/i.test(String(value || ""));
const reviewId = review => review.id || review.courseKey;
const PAGE_SIZE = 6;

function ReviewThumbnail({ course }) {
  const [failed, setFailed] = useState(false);
  const title = `${course.title} ${course.category || ""}`.toLowerCase();
  const logo = title.includes("react") ? reactLogo : title.includes("python") ? pythonLogo : /figma|design|ui\/ux/.test(title) ? figmaLogo : null;
  const javascript = /javascript|java script/.test(title);
  const Icon = /database|sql/.test(title) ? Database : Code2;
  const image = course.thumbnail || course.image;
  return <span className={`edc-mr-thumbnail${javascript ? " edc-mr-thumbnail-js" : ""}`}>{image && !failed ? <img className="edc-mr-thumbnail-photo" src={image} alt="" onError={() => setFailed(true)}/> : logo ? <img src={logo} alt=""/> : javascript ? <b>JS</b> : <Icon size={30} strokeWidth={1.7}/>}</span>;
}

export default function StudentCourseReviews({ email, courses = [], publishedCourses = [] }) {
  const studentEmail = normalize(email);
  const [reviews, setReviews] = useState([]);
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState("");
  const [notice, setNotice] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState({ courseKey: "", rating: 5, comment: "" });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const dialog = useRef(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetchMyReviews()
      .then(items => { if (!cancelled) setReviews(items); })
      .catch(error => { if (error.status !== 401 && error.status !== 403) console.error("Could not load reviews", error); });
    load();
    [LEARNING_UPDATED_EVENT, "focus"].forEach(event => window.addEventListener(event, load));
    return () => { cancelled = true; [LEARNING_UPDATED_EVENT, "focus"].forEach(event => window.removeEventListener(event, load)); };
  }, [studentEmail]);
  useEffect(() => {
    if (editorOpen && !dialog.current.open) dialog.current.showModal();
    else if (!editorOpen && dialog.current.open) dialog.current.close();
  }, [editorOpen]);
  const enrolled = useMemo(() => courses
    .filter(course => isMongoId(course?.id))
    .map(course => ({
      ...publishedCourses.find(item => String(item.id) === String(course.id)),
      ...course,
      reviewKey: String(course.id),
    })), [courses, publishedCourses]);
  const enrolledByKey = new Map(enrolled.map(course => [course.reviewKey, course]));
  const own = reviews.map(review => ({ ...review, courseKey: String(review.courseId), studentEmail }));
  const items = own.map(review => {
    const published = publishedCourses.find(course => String(course.id) === review.courseKey);
    return { review, course: enrolledByKey.get(review.courseKey) || {
      ...published,
      title: published?.title || review.courseTitle || "Untitled Course",
      instructor: published?.instructorName || review.instructorName || "Course Instructor",
      instructorName: published?.instructorName || review.instructorName || "Course Instructor",
      thumbnail: published?.thumbnail || review.thumbnail,
      teacherEmail: review.teacherEmail,
    } };
  }).sort((a, b) => (new Date(b.review.updatedAt || 0).getTime() || 0) - (new Date(a.review.updatedAt || 0).getTime() || 0));
  const average = own.length ? (own.reduce((sum, review) => sum + Number(review.rating || 0), 0) / own.length).toFixed(1) : "\u2014";
  const positive = own.filter(review => Number(review.rating) >= 4).length;
  const editable = own.filter(review => enrolledByKey.has(review.courseKey)).length;
  const filterOptions = [...new Map(items.map(item => [item.review.courseKey, item.course.title])).entries()];
  const filtered = items.filter(({ review, course }) => (courseFilter === "all" || review.courseKey === courseFilter)
    && (ratingFilter === "all" || Number(review.rating) === Number(ratingFilter))
    && (!search.trim() || `${course.title} ${course.instructor || course.instructorName || ""} ${review.comment}`.toLowerCase().includes(search.trim().toLowerCase())));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const editingReview = own.find(review => review.courseKey === draft.courseKey);
  const chooseCourse = key => {
    const existing = own.find(review => review.courseKey === key);
    setDraft({ courseKey: key, rating: Number(existing?.rating) || 5, comment: existing?.comment || "" });
    setFormError("");
  };
  const openEditor = review => {
    const selected = review ? enrolledByKey.get(review.courseKey) : enrolled.find(course => !own.some(item => item.courseKey === course.reviewKey)) || enrolled[0];
    if (!selected) return;
    chooseCourse(selected.reviewKey);
    setEditorOpen(true);
    setNotice("");
  };
  const submit = async event => {
    event.preventDefault();
    if (submitting) return;
    const course = enrolledByKey.get(draft.courseKey);
    if (!course) { setFormError("Select one of your enrolled courses."); return; }
    const comment = draft.comment.trim();
    if (comment.length < 3 || comment.length > 1000) { setFormError("Your review must be between 3 and 1,000 characters."); return; }
    if (!Number.isInteger(draft.rating) || draft.rating < 1 || draft.rating > 5) { setFormError("Choose a rating from 1 to 5 stars."); return; }
    setSubmitting(true);
    try {
      const saved = await saveMongoReview(course.id, { rating: draft.rating, comment });
      setReviews(previous => [...previous.filter(item => String(item.courseId) !== String(course.id)), saved]);
      setEditorOpen(false); setNotice(editingReview ? "Your review has been updated." : "Your review has been published.");
      setCourseFilter("all"); setRatingFilter("all"); setSearch(""); setPage(1);
    } catch (error) {
      setFormError(error.message || "Could not save your review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };
  const erase = async review => {
    if (!window.confirm(`Delete your review for ${review.courseTitle || "this course"}?`)) return;
    try {
      await deleteMongoReview(review.courseKey);
      setReviews(previous => previous.filter(item => String(item.courseId) !== review.courseKey));
      setNotice("Your review has been deleted.");
    }
    catch { setNotice("Could not delete your review. Please try again."); }
  };
  const clearFilters = () => { setSearch(""); setCourseFilter("all"); setRatingFilter("all"); setPage(1); };

  return <section className="edc-my-reviews">
    <header className="edc-mr-heading"><h2>My Reviews</h2><p>View, manage, and update your course reviews and ratings.</p><img src={reviewArtwork} alt="" className="edc-mr-heading-art"/></header>
    <div className="edc-mr-controls"><div className="edc-mr-stats">{[{ label: "Total Reviews", value: own.length, icon: Star, color: "purple" }, { label: "Avg. Rating", value: `${average} / 5`, icon: Star, color: "amber" }, { label: "Positive Reviews", value: positive, icon: ThumbsUp, color: "green" }, { label: "Reviews You Can Edit", value: editable, icon: SquarePen, color: "purple" }].map(stat => <article key={stat.label} className={`edc-mr-stat edc-mr-stat-${stat.color}`}><span className="edc-mr-stat-icon"><stat.icon size={27} strokeWidth={1.8}/></span><div><span>{stat.label}</span><strong>{stat.value}</strong></div></article>)}</div>
      <div className="edc-mr-toolbar"><label className="edc-mr-search"><Search size={17}/><input type="search" aria-label="Search your reviews" placeholder="Search your reviews..." value={search} onChange={event => { setSearch(event.target.value); setPage(1); }}/></label><select aria-label="Filter reviews by course" value={courseFilter} onChange={event => { setCourseFilter(event.target.value); setPage(1); }}><option value="all">All Courses</option>{filterOptions.map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select><select aria-label="Filter reviews by rating" value={ratingFilter} onChange={event => { setRatingFilter(event.target.value); setPage(1); }}><option value="all">All Ratings</option>{[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>{value} {value === 1 ? "Star" : "Stars"}</option>)}</select><button type="button" className="edc-mr-primary" disabled={!enrolled.length} onClick={() => openEditor()}><Plus size={17}/> Write a Review</button></div>
    </div>
    {notice && <p className="edc-mr-notice" role="status">{notice}</p>}
    <div className="edc-mr-list-panel"><div className="edc-mr-list" aria-label="Your course reviews">{visible.map(({ review, course }) => {
      const key = reviewId(review);
      const canEdit = enrolledByKey.has(review.courseKey);
      const date = new Date(review.updatedAt || review.createdAt);
      const validDate = !Number.isNaN(date.getTime());
      const rating = Math.min(5, Math.max(1, Number(review.rating) || 1));
      const comment = String(review.comment || "");
      return <article className="edc-mr-row" key={key}>
        <div className="edc-mr-course"><ReviewThumbnail course={course}/><div><strong>{course.title}</strong><span><UserRound size={12}/>{course.instructor || course.instructorName || "EduConnect Instructor"}</span></div></div>
        <div className="edc-mr-review">
          <div className="edc-mr-stars" aria-label={`${rating} out of 5 stars`}><span aria-hidden="true">{[1, 2, 3, 4, 5].map(value => <Star key={value} size={13} fill={value <= rating ? "currentColor" : "none"} className={value <= rating ? "" : "empty"}/>)}</span><strong>{rating.toFixed(1)}</strong></div>
          <p>{expanded !== key && comment.length > 160 ? `${comment.slice(0, 160)}\u2026` : comment}</p>
          {comment.length > 160 && <button type="button" className="edc-mr-expand" onClick={() => setExpanded(expanded === key ? "" : key)}>{expanded === key ? "Show less" : "Read more"}</button>}
        </div>
        <time className="edc-mr-date" dateTime={validDate ? date.toISOString() : undefined}><CalendarDays size={15}/>{validDate ? date.toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" }) : "Date unavailable"}</time>
        <div className="edc-mr-row-actions"><button type="button" className="edc-mr-edit" disabled={!canEdit} title={canEdit ? "Edit your review" : "This course is no longer in My Learning"} aria-label={`Edit review for ${course.title}`} onClick={() => openEditor(review)}><PencilLine size={14}/> Edit</button><button type="button" className="edc-mr-delete" aria-label={`Delete review for ${course.title}`} onClick={() => erase(review)}><Trash2 size={14}/> Delete</button></div>
      </article>;
    })}{!visible.length && <div className="edc-mr-empty"><Star size={30}/><h3>{own.length ? "No reviews match your filters" : "Share your learning experience"}</h3><p>{own.length ? "Try another search, course, or rating." : enrolled.length ? "Write a review for a course you have enrolled in. Your feedback helps other learners." : "Enroll in a course to share your feedback here."}</p>{own.length ? <button type="button" className="edc-mr-secondary" onClick={clearFilters}>Clear Filters</button> : enrolled.length > 0 && <button type="button" className="edc-mr-primary" onClick={() => openEditor()}><Plus size={15}/> Write Your First Review</button>}</div>}</div>
      <footer className="edc-mr-footer"><span>Showing {filtered.length ? `${(currentPage - 1) * PAGE_SIZE + 1}\u2013${Math.min(currentPage * PAGE_SIZE, filtered.length)} of ${filtered.length}` : "0"} {filtered.length === 1 ? "review" : "reviews"}</span><nav className="edc-mr-pagination" aria-label="Review pages"><button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17}/></button>{Array.from({ length: totalPages }, (_, index) => index + 1).filter(value => value === 1 || value === totalPages || Math.abs(value - currentPage) <= 1).map(value => <button type="button" key={value} className={currentPage === value ? "active" : ""} aria-label={`Page ${value}`} aria-current={currentPage === value ? "page" : undefined} onClick={() => setPage(value)}>{value}</button>)}<button type="button" aria-label="Next page" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17}/></button></nav></footer>
    </div>
    <dialog className="edc-mr-dialog" ref={dialog} onCancel={event => { event.preventDefault(); setEditorOpen(false); }} onClose={() => setEditorOpen(false)} onClick={event => { if (event.target === event.currentTarget) setEditorOpen(false); }} aria-labelledby="edc-mr-editor-title"><form onSubmit={submit}><div className="edc-mr-editor-heading"><div><span>YOUR COURSE FEEDBACK</span><h3 id="edc-mr-editor-title">{editingReview ? "Edit Your Review" : "Write a Review"}</h3></div><button type="button" aria-label="Close review form" onClick={() => setEditorOpen(false)}><X size={19}/></button></div><label className="edc-mr-field">Course<select value={draft.courseKey} onChange={event => chooseCourse(event.target.value)} required>{enrolled.map(course => <option key={course.reviewKey} value={course.reviewKey}>{course.title}</option>)}</select></label><fieldset className="edc-mr-rating-field"><legend>Your Rating</legend><div>{[1, 2, 3, 4, 5].map(value => <label key={value} title={`${value} out of 5 stars`}><input type="radio" name="review-rating" value={value} checked={draft.rating === value} onChange={() => setDraft({ ...draft, rating: value })} aria-label={`${value} ${value === 1 ? "star" : "stars"}`}/><Star size={27} fill={value <= draft.rating ? "currentColor" : "none"} className={value <= draft.rating ? "selected" : ""}/></label>)}<strong>{draft.rating} / 5</strong></div></fieldset><label className="edc-mr-field">Your Review<textarea rows={5} required minLength={3} maxLength={1000} value={draft.comment} onChange={event => setDraft({ ...draft, comment: event.target.value })} placeholder="Share what you learned, what worked well, and what could be improved..."/></label><span className="edc-mr-character-count">{draft.comment.length} / 1,000</span>{formError && <p className="edc-mr-form-error" role="alert">{formError}</p>}<div className="edc-mr-editor-footer"><button type="button" className="edc-mr-secondary" onClick={() => setEditorOpen(false)}>Cancel</button><button type="submit" className="edc-mr-primary" disabled={submitting}>{editingReview ? "Save Changes" : "Publish Review"}</button></div></form></dialog>
  </section>;
}

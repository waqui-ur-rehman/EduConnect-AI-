import { useEffect, useMemo, useState } from "react";
import { BookOpen, BookText, ChevronLeft, ChevronRight, Code2, Grid2X2, Heart, List, Search, ShoppingBag, Star } from "lucide-react";
import { getBookReviews, getPublishedBooks, isBookPurchased } from "../../utils/books";
import { getReviews } from "../../utils/courseReviews";
import "./StudentWishlist.css";

const PAGE_SIZE = 6;

function itemMatches(item, query, type) {
  const text = type === "course"
    ? [item.title, item.category, item.subject, item.instructorName, item.instructor, item.teacherEmail]
    : [item.title, item.author, item.subject, item.classOrProgram, item.teacherName];
  return text.some((value) => String(value || "").toLowerCase().includes(query));
}

function CourseArtwork({ course }) {
  if (course.thumbnail || course.image) {
    return <img src={course.thumbnail || course.image} alt="" className="edc-wishlist-course-image" />;
  }
  return <div className="edc-wishlist-course-placeholder" aria-hidden="true"><Code2 size={34} /></div>;
}

export default function StudentWishlist({
  email,
  publishedCourses = [],
  enrolledCourses = [],
  wishlist = [],
  savedBookIds = [],
  bookPurchases = [],
  onToggleWishlist,
  onToggleSavedBook,
  onCourseAction,
  onBookAction,
  onBrowseCourses,
  onBrowseBooks,
}) {
  const [activeTab, setActiveTab] = useState("courses");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("title");
  const [view, setView] = useState("grid");
  const [page, setPage] = useState(1);
  const [bookCatalog, setBookCatalog] = useState(getPublishedBooks);
  const [reviews, setReviews] = useState(getReviews);
  const [bookReviews, setBookReviews] = useState(getBookReviews);

  useEffect(() => {
    const refresh = () => {
      setBookCatalog(getPublishedBooks());
      setReviews(getReviews());
      setBookReviews(getBookReviews());
    };
    ["storage", "educonnect:books-changed", "educonnect:book-reviews-changed", "educonnect:moderation-visibility-changed"].forEach((event) => window.addEventListener(event, refresh));
    return () => ["storage", "educonnect:books-changed", "educonnect:book-reviews-changed", "educonnect:moderation-visibility-changed"].forEach((event) => window.removeEventListener(event, refresh));
  }, []);

  const savedCourses = useMemo(
    () => publishedCourses.filter((course) => wishlist.some((id) => String(id) === String(course.id))),
    [publishedCourses, wishlist],
  );
  const savedEbooks = useMemo(() => {
    return bookCatalog.filter((book) => savedBookIds.some((id) => String(id) === String(book.id)));
  }, [bookCatalog, savedBookIds]);
  const books = [];
  const allCount = savedCourses.length + books.length + savedEbooks.length;
  const allSavedItems = [
    ...savedCourses.map((item) => ({ item, type: "course" })),
    ...books.map((item) => ({ item, type: "book" })),
    ...savedEbooks.map((item) => ({ item, type: "ebook" })),
  ];
  const currentItems = activeTab === "all" ? allSavedItems
    : activeTab === "courses" ? allSavedItems.filter((entry) => entry.type === "course")
      : activeTab === "books" ? allSavedItems.filter((entry) => entry.type === "book")
        : allSavedItems.filter((entry) => entry.type === "ebook");
  const categoryOptions = [...new Set(currentItems.map(({ item }) => item.category || item.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const filteredItems = currentItems.filter(({ item, type }) =>
    (!search || itemMatches(item, search.trim().toLowerCase(), type === "course" ? "course" : "book")) &&
    (!category || (item.category || item.subject) === category),
  ).sort((a, b) => {
    if (sort === "price-low" || sort === "price-high") {
      const difference = Number(a.item.price || 0) - Number(b.item.price || 0);
      return sort === "price-low" ? difference : -difference;
    }
    return String(a.item.title || "").localeCompare(String(b.item.title || ""));
  });
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const visibleItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  function changeTab(nextTab) {
    setActiveTab(nextTab);
    setSearch("");
    setCategory("");
    setPage(1);
  }

  function changeSearch(value) {
    setSearch(value);
    setPage(1);
  }

  function removeCourse(id) {
    onToggleWishlist(id);
    setPage(1);
  }

  function removeEbook(id) {
    onToggleSavedBook(id);
    setPage(1);
  }

  function reviewSummary(course) {
    const key = `${String(course.teacherEmail || "").trim().toLowerCase()}::${String(course.id)}`;
    const matching = reviews.filter((review) => String(review.courseKey || "").toLowerCase() === key);
    return matching.length
      ? matching.reduce((sum, review) => sum + Number(review.rating || 0), 0) / matching.length
      : null;
  }

  function renderCourse(course) {
    const enrolled = enrolledCourses.some((item) =>
      String(item.id) === String(course.id) &&
      String(item.teacherEmail || "").toLowerCase() === String(course.teacherEmail || "").toLowerCase(),
    );
    const rating = reviewSummary(course);
    const price = Number(course.price);
    return <article className="edc-wishlist-card" key={`${course.teacherEmail}::${course.id}`}>
      <div className="edc-wishlist-art">
        <CourseArtwork course={course} />
        <span className="edc-wishlist-item-kind">Course</span>
        <button type="button" className="edc-wishlist-remove" onClick={() => removeCourse(course.id)} aria-label={`Remove ${course.title} from wishlist`} title="Remove from wishlist">
          <Heart size={17} fill="currentColor" />
        </button>
      </div>
      <div className="edc-wishlist-card-body">
        <span className="edc-wishlist-category">{course.category || course.subject || "Course"}</span>
        <h3>{course.title}</h3>
        <p className="edc-wishlist-byline">By {course.instructorName || course.instructor || "Teacher"}</p>
        <div className="edc-wishlist-card-meta">
          {rating !== null ? <span><Star size={14} fill="currentColor" /> {rating.toFixed(1)}</span> : <span>No reviews yet</span>}
          {course.lessons && <span><BookOpen size={14} /> {Array.isArray(course.lessons) ? course.lessons.length : course.lessons} lessons</span>}
        </div>
        <div className="edc-wishlist-card-footer">
          <strong>{Number.isFinite(price) && price > 0 ? `PKR ${price.toLocaleString()}` : "Free"}</strong>
          <button type="button" className="edc-wishlist-action" onClick={() => onCourseAction(course)}>
            {enrolled ? "Continue Learning" : Number.isFinite(price) && price > 0 ? "Add to Cart" : "Enroll Now"}
          </button>
        </div>
      </div>
    </article>;
  }

  function renderEbook(book) {
    const hasAccess = book.isFree ||
      isBookPurchased(email, book.id) ||
      bookPurchases.some((item) => String(item.id) === String(book.id));
    const matchingReviews = bookReviews.filter((review) => String(review.bookId) === String(book.id) && !review.moderated);
    const rating = matchingReviews.length
      ? matchingReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / matchingReviews.length
      : null;
    return <article className="edc-wishlist-card" key={`ebook-${book.id}`}>
      <div className="edc-wishlist-art edc-wishlist-ebook-art">
        <BookText size={42} aria-hidden="true" />
        <span className="edc-wishlist-item-kind">eBook</span>
        <button type="button" className="edc-wishlist-remove" onClick={() => removeEbook(book.id)} aria-label={`Remove ${book.title} from wishlist`} title="Remove from wishlist">
          <Heart size={17} fill="currentColor" />
        </button>
      </div>
      <div className="edc-wishlist-card-body">
        <span className="edc-wishlist-category">{book.subject || book.educationLevel || "PDF eBook"}</span>
        <h3>{book.title}</h3>
        <p className="edc-wishlist-byline">By {book.author || book.teacherName || "Teacher"}</p>
        <div className="edc-wishlist-card-meta">
          {rating !== null ? <span><Star size={14} fill="currentColor" /> {rating.toFixed(1)} · {matchingReviews.length} reviews</span> : <span>No reviews yet</span>}
          {book.pages > 0 && <span>{book.pages} pages</span>}
        </div>
        <div className="edc-wishlist-card-footer">
          <strong>{book.isFree ? "Free" : `PKR ${Number(book.price || 0).toLocaleString()}`}</strong>
          <button type="button" className="edc-wishlist-action" onClick={() => onBookAction(book)}>
            {hasAccess ? "Open Library" : "Add to Cart"}
          </button>
        </div>
      </div>
    </article>;
  }

  return <div className="edc-tab-content edc-wishlist-page">
    <section className="edc-wishlist-hero">
      <div>
        <span className="edc-wishlist-eyebrow">YOUR SAVED LEARNING</span>
        <h1>My Wishlist</h1>
        <p>Keep published courses and approved eBooks you have saved together in one place.</p>
      </div>
      <button type="button" onClick={onBrowseCourses}><ShoppingBag size={17} /> Find Learning Resources</button>
    </section>

    <section className="edc-wishlist-stats" aria-label="Wishlist summary">
      {[
        { label: "Saved Courses", value: savedCourses.length, color: "purple", icon: BookOpen, filter: "courses" },
        { label: "Saved Books", value: books.length, color: "blue", icon: BookText, filter: "books" },
        { label: "Saved eBooks", value: savedEbooks.length, color: "green", icon: BookText, filter: "ebooks" },
        { label: "Total Saved Items", value: allCount, color: "pink", icon: Heart, filter: "all" },
      ].map(({ label, value, color, icon: Icon, filter }) => <button type="button" className={`edc-wishlist-stat ${color}`} key={label} onClick={() => changeTab(filter)} aria-pressed={activeTab === (filter === "ebooks" ? "ebooks" : filter)} aria-label={`${label}: ${value}. Show matching saved items`}>
        <span><Icon size={20} /></span><div><small>{label}</small><strong>{value}</strong></div>
      </button>)}
    </section>

    <section className="edc-wishlist-content">
      <div className="edc-wishlist-heading">
        <div><h2>Saved Items</h2><p>{allCount} item{allCount === 1 ? "" : "s"} saved to your account</p></div>
        <div className="edc-wishlist-tabs" role="tablist" aria-label="Wishlist content type">
          {[["all", "All Items", allCount], ["courses", "Courses", savedCourses.length], ["books", "Books", books.length], ["ebooks", "eBooks", savedEbooks.length]].map(([key, label, count]) =>
            <button type="button" key={key} role="tab" aria-selected={activeTab === key} className={activeTab === key ? "active" : ""} onClick={() => changeTab(key)}>
              {label}<span>{count}</span>
            </button>,
          )}
        </div>
      </div>

      <div className="edc-wishlist-toolbar">
        <label className="edc-wishlist-search"><Search size={17} /><input value={search} onChange={(event) => changeSearch(event.target.value)} placeholder={`Search saved ${activeTab === "all" ? "items" : activeTab}...`} aria-label={`Search saved ${activeTab === "all" ? "items" : activeTab}`} /></label>
        <label className="edc-wishlist-filter"><span>Category</span><select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="">All categories</option>{categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
        <label className="edc-wishlist-filter"><span>Sort by</span><select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="title">Title</option><option value="price-low">Price: Low to High</option><option value="price-high">Price: High to Low</option></select></label>
        <div className="edc-wishlist-view-toggle" aria-label="Display mode">
          <button type="button" className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="Grid view"><Grid2X2 size={17} /></button>
          <button type="button" className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="List view"><List size={18} /></button>
        </div>
      </div>

      {visibleItems.length ? <div className={`edc-wishlist-grid ${view === "list" ? "list-view" : ""}`}>
        {visibleItems.map(({ item, type }) => type === "course" ? renderCourse(item) : renderEbook(item))}
      </div> : <div className="edc-wishlist-empty">
        <span><Heart size={27} /></span>
        <h3>{search || category ? "No saved items match these filters" : activeTab === "all" ? "Your wishlist is empty" : activeTab === "courses" ? "No published courses saved yet" : activeTab === "books" ? "No physical books in your wishlist" : "No eBooks saved yet"}</h3>
        <p>{activeTab === "all"
          ? "Saved courses and approved eBooks will appear here. Demo content is not included."
          : activeTab === "courses"
          ? "Courses appear here when you save a published teacher course. Demo courses are not included."
          : activeTab === "books"
            ? "This library currently provides approved PDF eBooks. Save one from Books & Teachers to see it in the eBooks tab."
            : "Save an approved PDF eBook from Books & Teachers to keep it here."}</p>
        <button type="button" onClick={activeTab === "courses" ? onBrowseCourses : activeTab === "all" ? onBrowseCourses : onBrowseBooks}>
          {activeTab === "courses" || activeTab === "all" ? "Browse Courses" : "Browse Books & Teachers"}
        </button>
      </div>}

      {filteredItems.length > PAGE_SIZE && <nav className="edc-wishlist-pagination" aria-label="Wishlist pages">
        <button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)} aria-label="Previous page"><ChevronLeft size={17} /></button>
        <span>Page {page} of {pageCount}</span>
        <button type="button" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)} aria-label="Next page"><ChevronRight size={17} /></button>
      </nav>}
    </section>
  </div>;
}

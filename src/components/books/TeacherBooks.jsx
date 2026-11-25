import { refreshContent, saveContent, submitContent, removeContent, uploadContentFile } from "../../utils/contentApi";
import { importBrowserContent } from "../../utils/importBrowserContent";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileText,
  Grid2X2,
  List,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  BOOKS_CHANGED_EVENT,
  BOOKS_MAX_FILE_SIZE,
  createBookSystemId,
  getBookReviews,
  getTeacherBooks,
  loadBookFile,
  validateBookUpload,
} from "../../utils/books";
import "./books.css";

const blankForm = {
  title: "",
  description: "",
  author: "",
  subject: "",
  educationLevel: "",
  classOrProgram: "",
  pages: "",
  isFree: true,
  price: "",
  downloadAllowed: false,
};

const filters = [
  { id: "all", label: "All Books" },
  { id: "published", label: "Published" },
  { id: "pending", label: "Pending Approval" },
  { id: "draft", label: "Drafts" },
  { id: "rejected", label: "Needs Changes" },
];

const isPublished = (book) => ["approved", "published"].includes(String(book.status || "").toLowerCase());
const bookTimestamp = (book) => {
  const timestamp = Date.parse(book.updatedAt || book.createdAt || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
};

function formatUpdated(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Date not recorded";
}

function BookCover({ book }) {
  const [coverUrl, setCoverUrl] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";

    if (!book.coverFileId) return () => { active = false; };

    loadBookFile(book.coverFileId)
      .then((file) => {
        if (!file) return;
        objectUrl = URL.createObjectURL(file);
        if (active) setCoverUrl(objectUrl);
      })
      .catch((error) => {
        console.error("Could not load the saved book cover.", error);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [book.coverFileId]);

  return (
    <div className="edc-tb-cover">
      {coverUrl ? <img src={coverUrl} alt="" /> : <BookOpen size={42} aria-hidden="true" />}
      <span>PDF</span>
    </div>
  );
}

function statusRingStyle(counts, total) {
  if (!total) return { background: "conic-gradient(#eee8f5 0 100%)" };
  const segments = [
    { count: counts.published, color: "#7400d4" },
    { count: counts.pending, color: "#f0b400" },
    { count: counts.draft, color: "#a45be8" },
    { count: counts.rejected, color: "#e65b65" },
    { count: Math.max(0, total - counts.published - counts.pending - counts.draft - counts.rejected), color: "#ccc4d5" },
  ];
  let offset = 0;
  const stops = segments.flatMap(({ count, color }) => {
    if (!count) return [];
    const start = (offset / total) * 100;
    offset += count;
    return [`${color} ${start}% ${(offset / total) * 100}%`];
  });
  return { background: `conic-gradient(${stops.join(", ")})` };
}

export default function TeacherBooks({ email, profile }) {
  const [books, setBooks] = useState(() => getTeacherBooks(email));
  const [form, setForm] = useState(blankForm);
  const [pdf, setPdf] = useState(null);
  const [previewPdf, setPreviewPdf] = useState(null);
  const [cover, setCover] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("grid");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const draftId = useRef(null);

  useEffect(() => {
    const refresh = () => setBooks(getTeacherBooks(email));
    refreshContent().catch((error) => setError(error.message));
    window.addEventListener(BOOKS_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(BOOKS_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [email]);

  const counts = useMemo(() => ({
    published: books.filter(isPublished).length,
    pending: books.filter((book) => String(book.status).toLowerCase() === "pending approval").length,
    draft: books.filter((book) => String(book.status).toLowerCase() === "draft").length,
    rejected: books.filter((book) => String(book.status).toLowerCase() === "rejected").length,
  }), [books]);

  const visibleBooks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...books]
      .filter((book) => {
        const status = String(book.status || "").toLowerCase();
        const matchesFilter = filter === "all"
          || (filter === "published" && isPublished(book))
          || (filter === "pending" && status === "pending approval")
          || (filter === "draft" && status === "draft")
          || (filter === "rejected" && status === "rejected");
        const matchesSearch = !query || [
          book.title,
          book.author,
          book.subject,
          book.educationLevel,
          book.classOrProgram,
        ].some((value) => String(value || "").toLowerCase().includes(query));
        return matchesFilter && matchesSearch;
      })
      .sort((a, b) => bookTimestamp(b) - bookTimestamp(a));
  }, [books, filter, search]);

  const recentBooks = useMemo(
    () => [...books].sort((a, b) => bookTimestamp(b) - bookTimestamp(a)).slice(0, 4),
    [books],
  );

  function reset() {
    setForm(blankForm);
    setPdf(null);
    setPreviewPdf(null);
    setCover(null);
    setEditing(null);
    setShowForm(false);
  }

  function editBook(book) {
    setEditing(book);
    setForm({
      title: book.title || "",
      description: book.description || "",
      author: book.author || "",
      subject: book.subject || "",
      educationLevel: book.educationLevel || "",
      classOrProgram: book.classOrProgram || "",
      pages: book.pages || "",
      isFree: Boolean(book.isFree),
      price: book.price || "",
      downloadAllowed: Boolean(book.downloadAllowed),
    });
    setPdf(null);
    setPreviewPdf(null);
    setCover(null);
    setShowForm(true);
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openUploadForm() {
    draftId.current = createBookSystemId("book");
    reset();
    setShowForm(true);
    setError("");
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event, submit = false) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (saving) return;
    if (!String(form.title).trim()) { setError("Book title is required."); return; }
    if (!String(form.subject).trim() || !String(form.educationLevel).trim()) {
      setError("Subject and education level are required.");
      return;
    }
    const duplicate = books.find((book) =>
      String(book.id) !== String(editing?.id || "")
      && String(book.title || "").trim().toLowerCase() === String(form.title).trim().toLowerCase()
      && String(book.subject || "").trim().toLowerCase() === String(form.subject).trim().toLowerCase());
    if (duplicate) { setError("A book with this title and subject already exists in your uploads."); return; }
    if (!editing && !pdf) { setError("Choose a PDF file before saving."); return; }
    if (pdf) {
      const validation = validateBookUpload(pdf, form.title, form.price, form.isFree);
      if (validation) { setError(validation); return; }
    } else if (!form.isFree && (!Number.isFinite(Number(form.price)) || Number(form.price) <= 0)) {
      setError("Enter a valid price greater than Rs. 0.");
      return;
    }
    if (previewPdf && (previewPdf.type !== "application/pdf" || !/\.pdf$/i.test(previewPdf.name) || previewPdf.size > 5 * 1024 * 1024)) {
      setError("Preview must be a PDF file no larger than 5 MB.");
      return;
    }
    if (cover && (!/^image\/(jpeg|png|webp)$/.test(cover.type) || cover.size > 1024 * 1024)) {
      setError("Cover image must be JPG, PNG or WebP and 1 MB or smaller.");
      return;
    }

    setSaving(true);
    try {
      const pdfFileId = pdf ? await uploadContentFile("pdf", pdf) : editing?.pdfFileId;
      const previewFileId = previewPdf ? await uploadContentFile("preview", previewPdf) : editing?.previewFileId || "";
      const coverFileId = cover ? await uploadContentFile("image", cover) : editing?.coverFileId || "";
      const saved = await saveContent("books", {
        ...(editing || {}),
        id: editing?.id || draftId.current || (draftId.current = createBookSystemId("book")),
        ...form,
        category: String(form.subject).trim(),
        author: String(form.author).trim() || profile?.name || "",
        price: form.isFree ? 0 : Number(form.price),
        pages: Math.max(0, Number(form.pages) || 0),
        pdfFileId, previewFileId, coverFileId,
        fileName: pdf?.name || editing?.fileName || "book.pdf",
        previewFileName: previewPdf?.name || editing?.previewFileName || "",
      });
      if (submit) await submitContent("books", saved);
      setMessage(submit ? "Submitted to Admin for approval." : "Draft saved.");
      reset();
    } catch (saveError) {
      setError(saveError.message || "Book could not be saved to the server.");
    } finally {
      setSaving(false);
    }
  }

  async function submitForApproval(book) {
    try {
      await submitContent("books", book);
      setMessage("Submitted to Admin for approval.");
      setError("");
    } catch (error) { setError(error.message); }
  }

  async function removeBook(book) {
    if (!window.confirm(`Delete "${book.title}"?`)) return;
    try {
      await removeContent("books", book);
      setMessage("Book removed from the library.");
      setError("");
      if (editing?.id === book.id) reset();
    } catch (error) { setError(error.message); }
  }

  async function openPdf(book, download = false) {
    const tab = download ? null : window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const file = await loadBookFile(book.pdfFileId);
      if (!file) throw new Error("This PDF is no longer available in this browser.");
      const url = URL.createObjectURL(file);
      if (download) {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = book.fileName || `${book.title || "ebook"}.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } else if (tab) {
        tab.location.href = url;
      } else {
        URL.revokeObjectURL(url);
        throw new Error("Allow pop-ups to preview this PDF.");
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (openError) {
      if (tab) tab.close();
      setError(openError.message || "PDF could not be opened.");
    }
  }

  const publishedPercent = books.length ? Math.round(counts.published / books.length * 100) : 0;
  const ringStyle = statusRingStyle(counts, books.length);
  const reviewCount = (bookId) => getBookReviews().filter((review) => String(review.bookId) === String(bookId)).length;

  return (
    <div className="edc-tab-content edc-teacher-books">
      <header className="edc-tb-heading">
        <div>
          <span className="edc-tb-heading-icon"><BookOpen size={27} /></span>
          <div>
            <h1>My PDF/eBooks</h1>
            <p>Manage your PDF uploads, approval status, and published books.</p>
            <button type="button" className="edc-tb-secondary" onClick={() => importBrowserContent("books", email).then(setMessage).catch((error) => setError(error.message))}>Import browser books</button>
          </div>
        </div>
        <div className="edc-tb-heading-actions">
          <button type="button" className="edc-tb-secondary" onClick={() => { setFilter("published"); setSearch(""); }}>
            <BookOpen size={16} /> Browse Published
          </button>
          <button type="button" className="edc-tb-primary" onClick={openUploadForm}>
            <Upload size={16} /> Upload PDF/eBook
          </button>
        </div>
      </header>

      <section className="edc-tb-stats" aria-label="Your PDF and eBook totals">
        <button type="button" onClick={() => setFilter("all")}>
          <span className="edc-tb-stat-icon"><BookOpen size={22} /></span>
          <span><small>Total Books</small><strong>{books.length}</strong></span>
        </button>
        <button type="button" onClick={() => setFilter("published")}>
          <span className="edc-tb-stat-icon"><CheckCircle2 size={22} /></span>
          <span><small>Published</small><strong>{counts.published}</strong></span>
        </button>
        <button type="button" onClick={() => setFilter("pending")}>
          <span className="edc-tb-stat-icon"><Clock3 size={22} /></span>
          <span><small>Pending Approval</small><strong>{counts.pending}</strong></span>
        </button>
        <button type="button" onClick={() => setFilter("draft")}>
          <span className="edc-tb-stat-icon"><FileText size={22} /></span>
          <span><small>Drafts</small><strong>{counts.draft}</strong></span>
        </button>
      </section>

      {error && <p role="alert" className="edc-tb-message edc-tb-error"><AlertCircle size={16} />{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss error"><X size={15} /></button></p>}
      {message && <p role="status" className="edc-tb-message"><CheckCircle2 size={16} />{message}<button type="button" onClick={() => setMessage("")} aria-label="Dismiss message"><X size={15} /></button></p>}

      {showForm && (
        <section className="edc-tb-form-panel">
          <header><div><h2>{editing ? "Edit PDF/eBook" : "Upload PDF/eBook"}</h2><p>PDF only, up to {BOOKS_MAX_FILE_SIZE / 1024 / 1024} MB. Public books require Admin approval.</p></div><button type="button" onClick={reset} aria-label="Close upload form"><X size={19} /></button></header>
          <form className="edc-book-form" onSubmit={(event) => save(event, false)}>
            <label>Book title *<input required maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
            <label>Description<textarea rows={3} maxLength={2000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <div className="edc-book-form-grid">
              <label>Author<input value={form.author} onChange={(event) => setForm({ ...form, author: event.target.value })} /></label>
              <label>Subject *<input required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} /></label>
              <label>Education level *<select required value={form.educationLevel} onChange={(event) => setForm({ ...form, educationLevel: event.target.value })}><option value="">Select</option>{["School", "College / Intermediate", "BS / Bachelor's", "Master's", "PhD", "Online / Interest"].map((level) => <option key={level}>{level}</option>)}</select></label>
              <label>Class / Program<input value={form.classOrProgram} onChange={(event) => setForm({ ...form, classOrProgram: event.target.value })} placeholder="Class 10, BS Computer Science" /></label>
              <label>PDF pages (optional)<input type="number" min="1" value={form.pages} onChange={(event) => setForm({ ...form, pages: event.target.value })} /></label>
              <label>PDF file {editing ? "(optional replacement)" : "*"}<input type="file" accept="application/pdf,.pdf" required={!editing} onChange={(event) => setPdf(event.target.files?.[0] || null)} /></label>
              <label>Preview PDF for paid books (optional, max 5 MB)<input type="file" accept="application/pdf,.pdf" onChange={(event) => setPreviewPdf(event.target.files?.[0] || null)} /></label>
              <label>Cover image (optional)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setCover(event.target.files?.[0] || null)} /></label>
              <label>Price type<select value={form.isFree ? "free" : "paid"} onChange={(event) => setForm({ ...form, isFree: event.target.value === "free", price: event.target.value === "free" ? "" : form.price })}><option value="free">Free</option><option value="paid">Paid</option></select></label>
              {!form.isFree && <label>Price (PKR) *<input type="number" min="1" step="1" required value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label>}
            </div>
            <label className="edc-book-check"><input type="checkbox" checked={form.downloadAllowed} onChange={(event) => setForm({ ...form, downloadAllowed: event.target.checked })} /> Allow students to download after they have access</label>
            <div className="edc-tb-form-actions">
              <button type="submit" disabled={saving}><BookOpen size={15} />{saving ? "Saving..." : "Save as Draft"}</button>
              <button type="button" disabled={saving} onClick={(event) => save(event, true)}><Send size={15} />Submit for Admin Approval</button>
              <button type="button" className="edc-tb-secondary" disabled={saving} onClick={reset}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      <div className="edc-tb-layout">
        <main className="edc-tb-library">
          <section className="edc-tb-toolbar" aria-label="Book filters">
            <div className="edc-tb-tabs" role="tablist" aria-label="Filter your books">
              {filters.map((item) => {
                const count = item.id === "all" ? books.length : counts[item.id];
                return <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>{item.label} ({count})</button>;
              })}
            </div>
            <label className="edc-tb-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your library..." aria-label="Search your books" />{search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><X size={15} /></button>}</label>
            <div className="edc-tb-view-toggle" aria-label="Book display">
              <button type="button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}><Grid2X2 size={17} /></button>
              <button type="button" aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={18} /></button>
            </div>
          </section>

          {visibleBooks.length ? (
            <section className={`edc-tb-book-grid ${view === "list" ? "list-view" : ""}`} aria-label="Your uploaded books">
              {visibleBooks.map((book) => {
                const status = String(book.status || "Draft").toLowerCase().replaceAll(" ", "-");
                return (
                  <article className="edc-tb-book-card" key={book.id}>
                    <BookCover key={book.coverFileId || book.id} book={book} />
                    <div className="edc-tb-book-body">
                      <div className="edc-tb-book-status-row"><span className={`edc-book-status edc-book-status-${status}`}>{book.status || "Draft"}</span><span className="edc-tb-reviews">{reviewCount(book.id)} reviews</span></div>
                      <h2>{book.title}</h2>
                      <p className="edc-tb-book-author">{book.author || profile?.name || "Author not specified"}{book.subject ? ` · ${book.subject}` : ""}</p>
                      <p className="edc-tb-book-meta">{book.educationLevel || "Level not specified"}{book.classOrProgram ? ` · ${book.classOrProgram}` : ""}{Number(book.pages) > 0 ? ` · ${book.pages} pages` : ""}</p>
                      {book.rejectionReason && <p className="edc-tb-rejection">Admin feedback: {book.rejectionReason}</p>}
                      <div className="edc-tb-card-actions">
                        <button type="button" onClick={() => openPdf(book)}><Eye size={14} />Preview PDF</button>
                        <button type="button" className="edc-tb-icon-action" aria-label={`Download ${book.title}`} title="Download PDF" onClick={() => openPdf(book, true)}><Download size={15} /></button>
                        <button type="button" className="edc-tb-icon-action" aria-label={`Edit ${book.title}`} title="Edit book" onClick={() => editBook(book)}><Pencil size={15} /></button>
                        {!isPublished(book) && String(book.status).toLowerCase() !== "pending approval" && <button type="button" className="edc-tb-icon-action" aria-label={`Submit ${book.title} for approval`} title="Submit for Admin approval" onClick={() => submitForApproval(book)}><Send size={15} /></button>}
                        <button type="button" className="edc-tb-icon-action danger" aria-label={`Delete ${book.title}`} title="Delete book" onClick={() => removeBook(book)}><Trash2 size={15} /></button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          ) : (
            <section className="edc-tb-empty">
              <BookOpen size={33} />
              <h2>{books.length ? "No books match this filter" : "Your library is empty"}</h2>
              <p>{books.length ? "Try another status or search term." : "Upload your own PDF to add it to your teacher library. No sample books are shown."}</p>
              {books.length ? <button type="button" onClick={() => { setFilter("all"); setSearch(""); }}>Show all books</button> : <button type="button" onClick={openUploadForm}><Plus size={16} />Upload your first PDF</button>}
            </section>
          )}
        </main>

        <aside className="edc-tb-sidebar" aria-label="Library status and recent updates">
          <section className="edc-tb-side-card">
            <h2><FileText size={18} />Library Status</h2>
            <div className="edc-tb-ring-wrap">
              <div className="edc-tb-ring" style={ringStyle} role="img" aria-label={`${publishedPercent}% of your books are published`}>
                <div><strong>{publishedPercent}%</strong><small>Published</small></div>
              </div>
              <ul>
                <li><i className="published" />Published <strong>{counts.published}</strong></li>
                <li><i className="pending" />Pending <strong>{counts.pending}</strong></li>
                <li><i className="draft" />Drafts <strong>{counts.draft}</strong></li>
                <li><i className="rejected" />Needs changes <strong>{counts.rejected}</strong></li>
              </ul>
            </div>
          </section>

          <section className="edc-tb-side-card">
            <header><h2><Clock3 size={18} />Recently Updated</h2><button type="button" onClick={() => { setFilter("all"); setSearch(""); }}>View All</button></header>
            {recentBooks.length ? (
              <ul className="edc-tb-recent-list">
                {recentBooks.map((book) => <li key={book.id}><button type="button" onClick={() => editBook(book)}><span className="edc-tb-recent-icon"><BookOpen size={16} /></span><span><strong>{book.title}</strong><small>{formatUpdated(book.updatedAt || book.createdAt)}</small></span><i className={`edc-tb-recent-status ${String(book.status || "").toLowerCase().replaceAll(" ", "-")}`} /></button></li>)}
              </ul>
            ) : <p className="edc-tb-side-empty">Your saved books will appear here.</p>}
          </section>

          <section className="edc-tb-side-card edc-tb-approval-note">
            <h2><CheckCircle2 size={18} />Admin Approval</h2>
            <p>Only books approved by Admin appear in the student library. You can edit drafts and resubmit books that need changes.</p>
            <button type="button" onClick={() => setFilter(counts.pending ? "pending" : "rejected")}>
              {counts.pending ? `Review ${counts.pending} pending` : `View ${counts.rejected} needing changes`}
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}

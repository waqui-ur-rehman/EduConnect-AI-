import { useEffect, useMemo, useState } from "react";
import { BookOpen, BookText, Bookmark, CheckCircle2, Download, FileText, Grid2X2, Heart, List, Search, ShoppingBag } from "lucide-react";
import { isModerationVisible } from "../../utils/moderationVisibility";
import { loadBookFile } from "../../utils/books";
import ReportAction from "../moderation/ReportAction";
import "./StudentEbooks.css";

const readDownloads = (key) => {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

function formatFileSize(size) {
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function BookArtwork({ item }) {
  const [coverUrl, setCoverUrl] = useState("");
  const coverFileId = item.type === "ebook" ? item.record.coverFileId : "";

  useEffect(() => {
    if (!coverFileId) return undefined;
    let active = true;
    let objectUrl = "";
    loadBookFile(coverFileId).then((file) => {
      if (active && file) {
        objectUrl = URL.createObjectURL(file);
        setCoverUrl(objectUrl);
      }
    }).catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [coverFileId]);

  if (coverUrl) return <img className="edc-ebooks-art-image" src={coverUrl} alt="" />;
  const Icon = item.type === "course-pdf" ? FileText : BookOpen;
  return <div className={`edc-ebooks-art-placeholder ${item.type === "course-pdf" ? "course-pdf" : ""}`}>
    <Icon size={34} strokeWidth={1.6} />
    <span>{item.category}</span>
  </div>;
}

function itemMatches(item, query) {
  const record = item.record;
  return [item.title, item.category, item.author, item.courseTitle, item.instructor, record.description, record.classOrProgram, record.educationLevel]
    .some((value) => String(value || "").toLowerCase().includes(query));
}

export default function StudentEbooks({
  email,
  publishedBooks = [],
  purchasedBooks = [],
  savedBookIds = [],
  curriculumBooks = [],
  notice = "",
  onToggleSavedBook,
  onReadBook,
  onDownloadBook,
  onReadResource,
  onDownloadResource,
  onAddBookToCart,
  onBrowseBooks,
  studentName = "Student",
}) {
  const downloadKey = `educonnect.student.${String(email || "").trim().toLowerCase()}.ebookDownloads`;
  const [downloadedKeys, setDownloadedKeys] = useState(() => readDownloads(downloadKey));
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("recent");
  const [view, setView] = useState("grid");
  const [actionNotice, setActionNotice] = useState("");

  const items = useMemo(() => {
    const bookMap = new Map();
    const publishedById = new Map(publishedBooks.map((book) => [String(book.id), book]));
    purchasedBooks.filter((book) => isModerationVisible("pdf", book.id)).forEach((purchase) => {
      const current = publishedById.get(String(purchase.id));
      if (/^[a-f0-9]{24}$/i.test(String(purchase.id)) && !current) return;
      const book = { ...purchase, ...current, purchasedAt: purchase.purchasedAt, isPurchased: true };
      bookMap.set(String(book.id), book);
    });
    savedBookIds.forEach((id) => {
      const book = publishedById.get(String(id));
      if (!book) return;
      bookMap.set(String(id), { ...bookMap.get(String(id)), ...book, isSaved: true });
    });

    const ebookItems = [...bookMap.values()].map((record) => ({
      key: `book:${record.id}`,
      type: "ebook",
      title: record.title || "PDF eBook",
      author: record.author || record.teacherName || "Teacher",
      instructor: record.teacherName || record.author || "Teacher",
      category: record.subject || record.educationLevel || "PDF eBook",
      timestamp: Date.parse(record.purchasedAt || record.createdAt || record.publishedAt || record.updatedAt || "") || 0,
      record,
    }));
    const courseItems = curriculumBooks.map((record) => ({
      key: `course-pdf:${String(record.teacherEmail || "").toLowerCase()}:${record.course?.id || ""}:${record.id}`,
      type: "course-pdf",
      title: String(record.name || "Course PDF").replace(/\.pdf$/i, ""),
      author: record.instructorName || "Instructor",
      instructor: record.instructorName || "Instructor",
      courseTitle: record.course?.title || "",
      category: record.course?.category || record.course?.subject || "Course Material",
      timestamp: Date.parse(record.updatedAt || record.createdAt || "") || 0,
      record,
    }));
    return [...ebookItems, ...courseItems];
  }, [publishedBooks, purchasedBooks, savedBookIds, curriculumBooks]);

  const ebookCount = items.filter((item) => item.type === "ebook").length;
  const wishlistCount = items.filter((item) => item.type === "ebook" && item.record.isSaved).length;
  const downloadedCount = items.filter((item) => downloadedKeys.includes(item.key)).length;
  const coursePdfCount = items.filter((item) => item.type === "course-pdf").length;
  const tabs = [
    { id: "all", label: "All eBooks", count: items.length, icon: BookText },
    { id: "downloaded", label: "Downloaded", count: downloadedCount, icon: Download },
    { id: "wishlist", label: "Wishlist", count: wishlistCount, icon: Bookmark },
  ];
  const categories = [...new Set(items.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const filteredItems = items
    .filter((item) => activeFilter !== "ebooks" || item.type === "ebook")
    .filter((item) => activeFilter !== "downloaded" || downloadedKeys.includes(item.key))
    .filter((item) => activeFilter !== "wishlist" || (item.type === "ebook" && item.record.isSaved))
    .filter((item) => activeFilter !== "course-pdfs" || item.type === "course-pdf")
    .filter((item) => !category || item.category === category)
    .filter((item) => !search.trim() || itemMatches(item, search.trim().toLowerCase()))
    .sort((a, b) => sort === "title" ? a.title.localeCompare(b.title) : b.timestamp - a.timestamp);

  function selectLibraryFilter(filter) {
    setActiveFilter(filter);
    setSearch("");
    setCategory("");
  }

  async function downloadItem(item) {
    setActionNotice("");
    try {
      const success = item.type === "course-pdf"
        ? await onDownloadResource?.(item.record)
        : await onDownloadBook?.(item.record);
      if (!success) return;
      const next = [...new Set([...downloadedKeys, item.key])];
      localStorage.setItem(downloadKey, JSON.stringify(next));
      setDownloadedKeys(next);
    } catch (error) {
      setActionNotice(error.message || "The PDF download could not be completed.");
    }
  }

  const emptyDescription = search.trim() || category
    ? "Try another search or category."
    : activeFilter === "ebooks"
      ? "Purchased and saved eBooks will appear here."
    : activeFilter === "downloaded"
      ? "Downloaded eBooks and course PDFs will appear here."
      : activeFilter === "wishlist"
        ? "Books you save from Books & Teachers will appear here."
        : activeFilter === "course-pdfs"
          ? "PDFs from courses you can access will appear here."
        : "Purchased eBooks, saved books, and course PDFs you can access will appear here.";

  return <div className="edc-tab-content edc-ebooks-page" id="my-ebooks">
    <section className="edc-ebooks-hero">
      <div>
        <span className="edc-ebooks-eyebrow">YOUR DIGITAL LIBRARY</span>
        <h1><BookOpen size={27} /> My eBooks</h1>
        <p>Read and manage eBooks you purchased or saved, plus PDFs from courses you can access.</p>
      </div>
      <div className="edc-ebooks-hero-art" aria-hidden="true"><BookText size={76} /><BookOpen size={48} /></div>
    </section>

    <section className="edc-ebooks-stats" aria-label="eBook library summary">
      {[
        { label: "Total eBooks", value: ebookCount, icon: BookOpen, color: "purple", filter: "ebooks" },
        { label: "Downloaded", value: downloadedCount, icon: Download, color: "blue", filter: "downloaded" },
        { label: "Wishlist", value: wishlistCount, icon: Heart, color: "green", filter: "wishlist" },
        { label: "Course PDFs", value: coursePdfCount, icon: FileText, color: "violet", filter: "course-pdfs" },
      ].map(({ label, value, icon: Icon, color, filter }) => {
        return <button type="button" className={`edc-ebooks-stat ${color}`} key={label} onClick={() => selectLibraryFilter(filter)} aria-pressed={activeFilter === filter} aria-label={`${label}: ${value}. Show matching library items`}>
          <span><Icon size={23} /></span><div><small>{label}</small><strong>{value.toLocaleString()}</strong></div>
        </button>;
      })}
    </section>

    {notice && <p className="edc-ebooks-notice" role="status">{notice}</p>}
    {actionNotice && <p className="edc-ebooks-notice" role="status">{actionNotice}</p>}
    <section className="edc-ebooks-library">
      <div className="edc-ebooks-toolbar">
        <nav className="edc-ebooks-tabs" aria-label="Filter eBooks">
          {tabs.map(({ id, label, count, icon: Icon }) => <button type="button" key={id} className={activeFilter === id || (id === "all" && ["ebooks", "course-pdfs"].includes(activeFilter)) ? "active" : ""} aria-pressed={activeFilter === id} onClick={() => setActiveFilter(id)}>
            <Icon size={15} />{label}<span>{count}</span>
          </button>)}
        </nav>
        <div className="edc-ebooks-controls">
          <label className="edc-ebooks-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search eBooks..." aria-label="Search eBooks" /></label>
          <label className="edc-ebooks-category"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter eBooks by category"><option value="">All</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="edc-ebooks-sort"><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort eBooks"><option value="recent">Latest</option><option value="title">Title</option></select></label>
          <div className="edc-ebooks-view-toggle" aria-label="eBook layout">
            <button type="button" className={view === "grid" ? "active" : ""} aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}><Grid2X2 size={16} /></button>
            <button type="button" className={view === "list" ? "active" : ""} aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={17} /></button>
          </div>
        </div>
      </div>

      {filteredItems.length ? <div className={`edc-ebooks-grid ${view === "list" ? "list-view" : ""}`}>
        {filteredItems.map((item) => {
          const downloaded = downloadedKeys.includes(item.key);
          const isBook = item.type === "ebook";
          const canRead = !isBook || item.record.isFree || item.record.isPurchased;
          const canDownload = !isBook || (canRead && item.record.downloadAllowed);
          const targetId = isBook ? String(item.record.id) : `${String(item.record.teacherEmail || "").toLowerCase()}::${item.record.course?.id || ""}::${item.record.id}`;
          const openItem = () => canRead
            ? (isBook ? onReadBook?.(item.record) : onReadResource?.(item.record))
            : onAddBookToCart?.(item.record);
          return <article
            className="edc-ebooks-card"
            key={item.key}
            tabIndex={0}
            aria-label={`${canRead ? "Open" : "Get access to"} ${item.title}`}
            onClick={(event) => {
              if (!event.target.closest("button, a, input, select, textarea")) openItem();
            }}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
              event.preventDefault();
              openItem();
            }}
          >
            <div className="edc-ebooks-art">
              <BookArtwork item={item} />
              {downloaded && <span className="edc-ebooks-downloaded"><CheckCircle2 size={12} /> Downloaded</span>}
              {isBook && item.record.isSaved && <button type="button" className="edc-ebooks-save" aria-label={`Remove ${item.title} from wishlist`} title="Remove from wishlist" onClick={() => onToggleSavedBook?.(item.record.id)}><Heart size={15} fill="currentColor" /></button>}
            </div>
            <div className="edc-ebooks-card-body">
              <span className={`edc-ebooks-kind ${isBook ? "" : "course-pdf"}`}>{isBook ? (item.record.isPurchased ? "Purchased" : "Saved") : "Course material"}</span>
              <h2>{item.title}</h2>
              <p className="edc-ebooks-byline">By {item.author}</p>
              <span className="edc-ebooks-category-tag">{item.category}</span>
              <div className="edc-ebooks-meta">
                {isBook && item.record.pages > 0 && <span><FileText size={13} />{item.record.pages} pages</span>}
                {!isBook && item.courseTitle && <span><BookOpen size={13} />{item.courseTitle}</span>}
                {formatFileSize(item.record.size) && <span><Download size={12} />{formatFileSize(item.record.size)}</span>}
                {item.record.semester && <span>{item.record.semester}</span>}
              </div>
              <div className="edc-ebooks-actions">
                {canRead
                  ? <button type="button" className="primary" onClick={() => (isBook ? onReadBook?.(item.record) : onReadResource?.(item.record))}><BookOpen size={14} />{downloaded ? "Read Again" : "Read Online"}</button>
                  : <button type="button" className="primary" onClick={() => onAddBookToCart?.(item.record)}><ShoppingBag size={14} />Get Access</button>}
                {canDownload && <button type="button" className="secondary" onClick={() => downloadItem(item)}><Download size={14} />Download</button>}
              </div>
            </div>
            <ReportAction reporterEmail={email} reporterName={studentName} target={{
              reportType: "content",
              targetType: "pdf",
              targetId,
              targetTitle: item.title,
              targetOwnerEmail: item.record.teacherEmail || item.record.course?.teacherEmail,
              targetOwnerName: item.author,
              targetRole: "Teacher",
            }} />
          </article>;
        })}
      </div> : <div className="edc-ebooks-empty">
        <span><BookOpen size={25} /></span>
        <h2>{search.trim() || category ? "No eBooks match your filters" : activeFilter === "downloaded" ? "Nothing downloaded yet" : activeFilter === "wishlist" ? "Your eBook wishlist is empty" : activeFilter === "course-pdfs" ? "No course PDFs available" : "Your eBook library is empty"}</h2>
        <p>{emptyDescription}</p>
        {activeFilter !== "downloaded" && <button type="button" onClick={onBrowseBooks}><ShoppingBag size={15} />Browse Books & Teachers</button>}
      </div>}
      <footer className="edc-ebooks-footer">{filteredItems.length} {filteredItems.length === 1 ? "item" : "items"} shown</footer>
    </section>
  </div>;
}

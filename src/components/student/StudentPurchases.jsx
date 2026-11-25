import { useMemo, useState } from "react";
import { Award, BookOpen, BookText, CalendarDays, CheckCircle2, ChevronDown, Download, FileText, Printer, Search, ShoppingBag } from "lucide-react";
import "./StudentPurchases.css";

const itemKey = (item) => `${item.itemType === "book" ? "book" : "course"}::${String(item.teacherEmail || "").trim().toLowerCase()}::${String(item.id)}`;
const hasPrice = (value) => value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value));
const money = (value) => `PKR ${Math.max(0, Number(value) || 0).toLocaleString()}`;
const dateValue = (value) => {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : null;
};
const dateLabel = (value) => {
  const timestamp = dateValue(value);
  return timestamp === null ? "Date not recorded" : new Date(timestamp).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

function PurchaseArtwork({ item, certificate = false }) {
  if (certificate) return <div className="edc-purchase-art certificate"><Award size={28} /></div>;
  if (item.thumbnail || item.image) return <div className="edc-purchase-art"><img src={item.thumbnail || item.image} alt="" /></div>;
  return <div className={`edc-purchase-art ${item.itemType === "book" ? "ebook" : ""}`}>
    {item.itemType === "book" ? <BookText size={28} /> : <BookOpen size={28} />}
  </div>;
}

export default function StudentPurchases({
  orders = [],
  bookPurchases = [],
  completedCourses = [],
  enrolledCourses = [],
  orderNotice = "",
  onContinueCourse,
  onOpenBook,
  onDownloadBook,
  onPreviewCertificate,
  onPrintReceipt,
  onBrowseBooks,
}) {
  const [activeFilter, setActiveFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("latest");

  const purchases = useMemo(() => {
    const records = [];
    const seen = new Set();
    const findBook = (item) => bookPurchases.find((book) =>
      String(book.id) === String(item.id) &&
      (!item.teacherEmail || String(book.teacherEmail || "").trim().toLowerCase() === String(item.teacherEmail || "").trim().toLowerCase()),
    );
    const findCourse = (item) => enrolledCourses.find((course) =>
      String(course.id) === String(item.id) &&
      (!item.teacherEmail || String(course.teacherEmail || "").trim().toLowerCase() === String(item.teacherEmail || "").trim().toLowerCase()),
    );
    orders.forEach((order) => {
      (Array.isArray(order.items) ? order.items : []).forEach((item, index) => {
        const bookRecord = item.itemType === "book" ? findBook(item) : null;
        const itemType = item.itemType === "book" || bookRecord ? "book" : "course";
        const courseRecord = itemType === "course" ? findCourse(item) : null;
        const record = {
          ...(bookRecord || {}),
          ...item,
          itemType,
          thumbnail: item.thumbnail || courseRecord?.thumbnail || courseRecord?.image || "",
          purchasedAt: order.purchasedAt || item.purchasedAt || bookRecord?.purchasedAt || "",
          orderId: order.id || "",
          order,
          orderStatus: order.status || "pending",
          courseRecord,
          bookRecord,
          key: `${itemKey({ ...item, itemType })}::${order.id || index}`,
        };
        const productKey = itemKey(record);
        if (seen.has(productKey)) return;
        seen.add(productKey);
        records.push(record);
      });
    });
    bookPurchases.forEach((book) => {
      const record = { ...book, itemType: "book", purchasedAt: book.purchasedAt || "", orderId: "", order: null, bookRecord: book, key: itemKey({ ...book, itemType: "book" }) };
      const productKey = itemKey(record);
      if (seen.has(productKey)) return;
      seen.add(productKey);
      records.push(record);
    });
    return records;
  }, [orders, bookPurchases, enrolledCourses]);

  const certificates = useMemo(() => completedCourses.map((course) => ({
    ...course,
    itemType: "certificate",
    key: `${String(course.teacherEmail || "").toLowerCase()}::${course.id}`,
  })), [completedCourses]);

  const counts = {
    all: purchases.length,
    courses: purchases.filter((item) => item.itemType === "course").length,
    books: purchases.filter((item) => item.itemType === "book").length,
    certificates: certificates.length,
  };
  const activeItems = activeFilter === "certificates"
    ? certificates
    : purchases.filter((item) => activeFilter === "all" || (activeFilter === "courses" ? item.itemType === "course" : item.itemType === "book"));
  const filteredItems = activeItems.filter((item) => {
    const text = [item.title, item.instructor, item.author, item.category, item.subject, item.orderId, item.orderStatus, item.itemType].join(" ").toLowerCase();
    return text.includes(query.trim().toLowerCase());
  }).sort((a, b) => {
    if (sort === "title") return String(a.title || "").localeCompare(String(b.title || ""));
    if (sort === "price") return (Number(b.price) || 0) - (Number(a.price) || 0);
    const left = dateValue(a.purchasedAt || a.completedAt);
    const right = dateValue(b.purchasedAt || b.completedAt);
    if (left === null) return sort === "latest" ? 1 : -1;
    if (right === null) return sort === "latest" ? -1 : 1;
    return sort === "latest" ? right - left : left - right;
  });
  const recentPurchases = [...purchases].sort((a, b) => (dateValue(b.purchasedAt) || 0) - (dateValue(a.purchasedAt) || 0)).slice(0, 3);

  function selectPurchaseFilter(filter) {
    setActiveFilter(filter);
    setQuery("");
  }

  function renderPurchase(item) {
    const course = item.courseRecord || enrolledCourses.find((record) =>
      String(record.id) === String(item.id) &&
      String(record.teacherEmail || "").trim().toLowerCase() === String(item.teacherEmail || "").trim().toLowerCase(),
    );
    const book = item.bookRecord || bookPurchases.find((record) =>
      String(record.id) === String(item.id) &&
      String(record.teacherEmail || "").trim().toLowerCase() === String(item.teacherEmail || "").trim().toLowerCase(),
    );
    const isCertificate = item.itemType === "certificate";
    const typeLabel = isCertificate ? "Completion Record" : item.itemType === "book" ? "eBook" : "Course";
    const progress = Number(course?.progress) || 0;
    const status = isCertificate ? "Demo Completion" : item.itemType === "book" ? "Purchased" : progress >= 100 ? "Completed" : progress > 0 ? `${progress}% Complete` : "Purchased";

    return <article className="edc-purchase-row" key={item.key}>
      <div className="edc-purchase-item-cell">
        <PurchaseArtwork item={item} certificate={isCertificate} />
        <div><strong>{item.title || "Untitled item"}</strong><small>By {item.instructor || item.author || course?.instructor || book?.teacherName || "Teacher"}</small></div>
      </div>
      <span className={`edc-purchase-type ${isCertificate ? "certificate" : item.itemType}`}>{typeLabel}</span>
      <span className="edc-purchase-date"><CalendarDays size={13} /> {dateLabel(item.purchasedAt || item.completedAt)}</span>
      <strong className="edc-purchase-price">{isCertificate ? "—" : hasPrice(item.price) ? money(item.price) : "Not recorded"}</strong>
      <span className={`edc-purchase-status ${isCertificate || status === "Completed" || status === "Purchased" ? "complete" : "progress"}`}>
        {isCertificate || status === "Completed" || status === "Purchased" ? <CheckCircle2 size={13} /> : <span className="edc-purchase-progress-dot" />}
        {status}
      </span>
      <div className="edc-purchase-actions">
        {isCertificate
          ? <button type="button" onClick={() => onPreviewCertificate(item)}><Award size={14} /> Preview</button>
          : item.itemType === "book"
            ? <button type="button" onClick={() => book?.downloadAllowed ? onDownloadBook(book) : onOpenBook(book)}>{book?.downloadAllowed ? <Download size={14} /> : <BookText size={14} />}{book?.downloadAllowed ? "Download" : "Open eBook"}</button>
            : course
              ? <button type="button" onClick={() => onContinueCourse(course)}><BookOpen size={14} /> Continue</button>
              : <span className="edc-purchase-unavailable">Unavailable</span>}
        {item.order && <button type="button" className="receipt" onClick={() => onPrintReceipt(item.order)}><Printer size={13} /> Receipt</button>}
      </div>
    </article>;
  }

  return <div className="edc-tab-content edc-purchases-page">
    <header className="edc-purchases-hero">
      <div>
        <span className="edc-purchases-eyebrow">YOUR ACCOUNT RECORDS</span>
        <h1><ShoppingBag size={27} /> My Purchases</h1>
        <p>View your checkout records, purchased eBooks, and course completion records.</p>
        <small>Orders are recorded in MongoDB. Paid orders are fulfilled only after server-verified payment.</small>
      </div>
      <div className="edc-purchases-hero-art" aria-hidden="true"><ShoppingBag size={60} /><BookOpen size={44} /></div>
    </header>

    <section className="edc-purchases-stats" aria-label="Purchase summary">
      {[
        { label: "Total Purchases", value: purchases.length, icon: ShoppingBag, color: "purple" },
        { label: "Courses", value: counts.courses, icon: BookOpen, color: "blue" },
        { label: "eBooks", value: counts.books, icon: BookText, color: "green" },
        { label: "Certificates", value: counts.certificates, icon: Award, color: "violet" },
      ].map(({ label, value, icon: Icon, color }, index) => {
        const filter = ["all", "courses", "books", "certificates"][index];
        return <button type="button" className={`edc-purchases-stat ${color}`} key={label} onClick={() => selectPurchaseFilter(filter)} aria-pressed={activeFilter === filter} aria-label={`${label}: ${value}. Show matching records`}>
          <span><Icon size={21} /></span><div><small>{label}</small><strong>{value}</strong></div>
        </button>;
      })}
    </section>

    {orderNotice && <p className="edc-purchases-notice" role="status">{orderNotice}</p>}

    <section className="edc-purchases-records">
      <div className="edc-purchases-toolbar">
        <div className="edc-purchases-tabs" role="tablist" aria-label="Purchase categories">
          {[["all", "All Purchases"], ["courses", "Courses"], ["books", "Books"], ["certificates", "Certificates"]].map(([key, label]) =>
            <button type="button" key={key} role="tab" aria-selected={activeFilter === key} className={activeFilter === key ? "active" : ""} onClick={() => setActiveFilter(key)}>
              {key === "all" ? <ShoppingBag size={15} /> : key === "courses" ? <BookOpen size={15} /> : key === "books" ? <BookText size={15} /> : <Award size={15} />}
              {label} <span>({counts[key]})</span>
            </button>,
          )}
        </div>
        <label className="edc-purchases-search"><Search size={16} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search in purchases..." aria-label="Search purchases" /></label>
        <label className="edc-purchases-sort"><span>Sort:</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="latest">Latest</option><option value="oldest">Oldest</option><option value="title">Title</option><option value="price">Price</option></select><ChevronDown size={13} /></label>
      </div>

      <div className="edc-purchases-table-wrap">
        <div className="edc-purchases-table-head">
          <span>Item</span><span>Type</span><span>{activeFilter === "certificates" ? "Completion Date" : "Purchase Date"}</span><span>Price</span><span>Status</span><span>Action</span>
        </div>
        {filteredItems.length ? <div className="edc-purchases-table">{filteredItems.map(renderPurchase)}</div> : <div className="edc-purchases-empty">
          <span><FileText size={27} /></span>
          <h2>{query ? "No matching records" : activeFilter === "certificates" ? "No course completion records yet" : "No purchases recorded yet"}</h2>
          <p>{query
            ? "Try a different title, type, or instructor."
            : activeFilter === "certificates"
              ? "Completion records appear after you complete all lessons in an enrolled course."
              : "Verified checkout orders and purchased eBooks will appear here. No sample purchase records are added."}</p>
          {!query && activeFilter !== "certificates" && <button type="button" onClick={onBrowseBooks}>Browse Books & Teachers</button>}
        </div>}
      </div>
    </section>

    {activeFilter === "all" && recentPurchases.length > 0 && <section className="edc-recent-purchases">
      <header><div><span className="edc-purchases-eyebrow">LATEST ACCOUNT ACTIVITY</span><h2><Award size={18} /> Recently Purchased</h2></div><button type="button" onClick={() => { setActiveFilter("all"); setQuery(""); }}>View All <span aria-hidden="true">→</span></button></header>
      <div>{recentPurchases.map((item) => <article key={`recent-${item.key}`}>
        <PurchaseArtwork item={item} />
        <div><strong>{item.title}</strong><small>{item.instructor || item.author || "Teacher"}</small><span>{item.itemType === "book" ? "eBook" : "Course"} · {hasPrice(item.price) ? money(item.price) : "Price not recorded"}</span></div>
      </article>)}</div>
    </section>}
  </div>;
}

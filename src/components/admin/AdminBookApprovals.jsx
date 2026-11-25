import { refreshContent } from "../../utils/contentApi";
import { useEffect, useState } from "react";
import { Check, Download, Eye, X } from "lucide-react";
import { BOOKS_CHANGED_EVENT, adminSetBookStatus, getBookRecords, getBookReviews, loadBookFile, removeBookReview } from "../../utils/books";
import "../books/books.css";

export default function AdminBookApprovals() {
  const [books, setBooks] = useState(getBookRecords);
  const [reviews, setReviews] = useState(getBookReviews);
  const [reason, setReason] = useState({});
  const [notice, setNotice] = useState("");
  useEffect(() => {
    refreshContent().catch((error) => setNotice(error.message));
    const refresh = () => { setBooks(getBookRecords()); setReviews(getBookReviews()); };
    window.addEventListener(BOOKS_CHANGED_EVENT, refresh); window.addEventListener("storage", refresh);
    window.addEventListener("educonnect:book-reviews-changed", refresh);
    return () => { window.removeEventListener(BOOKS_CHANGED_EVENT, refresh); window.removeEventListener("storage", refresh); window.removeEventListener("educonnect:book-reviews-changed", refresh); };
  }, []);
  async function preview(book, download = false) {
    const tab = download ? null : window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const file = await loadBookFile(book.pdfFileId);
      if (!file) throw new Error("The PDF is missing from this browser's file storage.");
      const url = URL.createObjectURL(file);
      if (download) { const anchor = document.createElement("a"); anchor.href = url; anchor.download = book.fileName || `${book.title}.pdf`; anchor.click(); }
      else if (tab) tab.location.href = url;
      else throw new Error("Allow pop-ups to preview the PDF.");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { tab?.close(); setNotice(error.message); }
  }
  async function decide(book, status) {
    if (status === "Rejected" && !String(reason[book.id] || "").trim()) { setNotice("Enter a reason before rejecting a book."); return; }
    try { await adminSetBookStatus(book.id, status, reason[book.id] || ""); }
    catch (error) { setNotice(error.message); return; }
    const current = getBookRecords().find((item) => item.id === book.id);
    setNotice(`“${book.title}” is now ${current?.status || status}.`); setBooks(getBookRecords());
  }
  const pending = books.filter((book) => book.status === "Pending Approval");
  const approved = books.filter((book) => book.status === "Approved");
  const published = books.filter((book) => book.status === "Published");
  const unpublished = books.filter((book) => book.status === "Unpublished");
  const rejected = books.filter((book) => book.status === "Rejected");
  function renderList(items, heading) { return <section className="edc-admin-books-panel"><h3>{heading} ({items.length})</h3>{items.length ? items.map((book) => <article key={book.id}>
    <div><strong>{book.title}</strong><p>{book.teacherName} · {book.teacherEmail} · {book.subject} · {book.educationLevel}{book.classOrProgram ? ` · ${book.classOrProgram}` : ""} · {book.isFree ? "Free" : `PKR ${Number(book.price).toLocaleString()}`}</p><p>{book.description || "No description provided."}</p>{book.rejectionReason && <p>Reason: {book.rejectionReason}</p>}<button type="button" onClick={() => preview(book)}><Eye size={14} /> Preview PDF</button><button type="button" onClick={() => preview(book, true)}><Download size={14} /> Download for review</button></div>
    {book.status === "Pending Approval" ? <div className="edc-admin-book-actions"><textarea aria-label={`Rejection reason for ${book.title}`} placeholder="Reason required to reject" value={reason[book.id] || ""} onChange={(event) => setReason({ ...reason, [book.id]: event.target.value })} /><button type="button" onClick={() => decide(book, "Approved")}><Check size={15} /> Approve Book</button><button type="button" className="reject" onClick={() => decide(book, "Rejected")}><X size={15} /> Reject</button></div> : book.status === "Approved" ? <button type="button" onClick={() => decide(book, "Published")}>Mark as Published</button> : book.status === "Published" ? <button type="button" className="reject" onClick={() => decide(book, "Unpublished")}>Unpublish Book</button> : <button type="button" onClick={() => decide(book, "Pending Approval")}>Return to Review</button>}
  </article>) : <p>No books in this list.</p>}</section>; }
  return <div className="edc-admin-books"><p role="status">{notice}</p>{renderList(pending, "Pending Approval")}{renderList(approved, "Approved & Available to Students")}{renderList(published, "Published Books")}{renderList(unpublished, "Unpublished Books")}{renderList(rejected, "Rejected Books")}<section className="edc-admin-books-panel"><h3>Book Reviews ({reviews.length})</h3>{reviews.length ? reviews.map((review) => <article key={review.id}><div><strong>{books.find((book) => String(book.id) === String(review.bookId))?.title || "Removed book"}</strong><p>{review.studentName || review.studentEmail} · {review.rating}/5 · {new Date(review.createdAt).toLocaleDateString()}</p><p>{review.comment || "No written comment."}</p></div><button className="reject" type="button" onClick={() => { removeBookReview(review.id); setReviews(getBookReviews()); setNotice("Review removed from public ratings."); }}>Moderate / Remove Review</button></article>) : <p>No book reviews yet.</p>}</section></div>;
}

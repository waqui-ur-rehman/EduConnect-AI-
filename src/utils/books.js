import { isModerationVisible } from "./moderationVisibility";
import { getContentState, loadContentFile, reviewContent } from "./contentApi";
import { appendAdminActivityRecord } from "../components/admin/adminData";

export const BOOKS_STORAGE_KEY = "educonnect.books.v1";
export const BOOKS_CHANGED_EVENT = "educonnect:books-changed";
export const BOOK_HELP_REQUESTS_KEY = "educonnect.book-help-requests.v1";
export const BOOK_REVIEWS_KEY = "educonnect.book-reviews.v1";
export const BOOKS_MAX_FILE_SIZE = 20 * 1024 * 1024;

export function createBookSystemId(prefix = "record") {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
  const random = new Uint32Array(4);
  window.crypto?.getRandomValues?.(random);
  return `${prefix}-${Array.from(random, (value) => value.toString(36)).join("")}`;
}

const DB_NAME = "educonnect-pdf-books";
const DB_STORE = "files";

function readList(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function notify() {
  window.dispatchEvent(new Event(BOOKS_CHANGED_EVENT));
}

export function getBookRecords() {
  const state = getContentState();
  return ["teacher", "admin"].includes(state.role) ? state.managedBooks : state.books;
}

export function getTeacherBooks(email) {
  const owner = String(email || "").trim().toLowerCase();
  return getBookRecords().filter((book) => String(book.teacherEmail || "").trim().toLowerCase() === owner);
}

export function getPublishedBooks() {
  // Admin approval makes the book safe to show to students. “Published” is
  // retained as the explicit final catalog state for older/admin workflows.
  return getContentState().books.filter((book) => isModerationVisible("pdf", book.id));
}

export function saveBookRecords(records) {
  if (!Array.isArray(records)) throw new Error("Book records must be a list.");
  window.localStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify(records));
  notify();
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, action) {
  if (!window.indexedDB) throw new Error("This browser does not support local PDF storage.");
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, mode);
      const request = action(tx.objectStore(DB_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export function saveBookFile(id, file) {
  return withStore("readwrite", (store) => store.put(file, id));
}

export function loadBookFile(id) {
  if (String(id || "").startsWith("remote:")) return loadContentFile(id);
  return withStore("readonly", (store) => store.get(id));
}

export function deleteBookFile(id) {
  return id ? withStore("readwrite", (store) => store.delete(id)) : Promise.resolve();
}

export function saveBookRecord(book) {
  const books = getBookRecords();
  const index = books.findIndex((item) => String(item.id) === String(book.id));
  const previousBook = index >= 0 ? books[index] : null;
  if (index >= 0) books[index] = book;
  else books.unshift(book);
  window.localStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify(books));
  notify();

  let actorRole = "";
  let actor = "";
  try {
    actorRole = window.sessionStorage.getItem("educonnect.demoRole") || "";
    actor = window.sessionStorage.getItem("educonnect.demoEmail") || "";
  } catch {
    // Keep the book save successful if session storage is unavailable.
  }

  let auditAction = "";
  let auditDescription = "";
  if (actorRole === "Admin" && previousBook?.status !== book.status) {
    const adminActions = {
      Approved: ["Book Approved", "Admin approved a PDF/eBook."],
      Rejected: ["Book Rejected", "Admin rejected a PDF/eBook."],
      Published: ["Book Published", "Admin published a PDF/eBook."],
      Unpublished: ["Book Unpublished", "Admin unpublished a PDF/eBook."],
      "Pending Approval": ["Book Returned to Review", "Admin returned a PDF/eBook to review."],
    };
    [auditAction, auditDescription] = adminActions[book.status] || [];
  } else if (actorRole === "Teacher" && book.status === "Pending Approval") {
    auditAction = "Book Submitted";
    auditDescription = "Teacher submitted a PDF/eBook for Admin approval.";
  }

  if (auditAction) {
    try {
      appendAdminActivityRecord({
        actor: actor || book.teacherEmail || actorRole,
        actorRole: actorRole || (book.teacherEmail ? "Teacher" : "Admin"),
        action: auditAction,
        category: "book-approvals",
        module: "Course & Books",
        entityType: "PDF/eBook",
        entityId: String(book.id),
        targetId: String(book.id),
        targetName: book.title || "PDF/eBook",
        previousValue: previousBook?.status || "New submission",
        newValue: book.status,
        ...(book.status === "Rejected" && book.rejectionReason ? { reason: book.rejectionReason } : {}),
        description: auditDescription,
        result: "Success",
      });
    } catch {
      // Audit storage errors must not undo an already saved book change.
    }
  }
  return book;
}

export function deleteTeacherBook(email, id) {
  const owner = String(email || "").trim().toLowerCase();
  const books = getBookRecords();
  const book = books.find((item) => String(item.id) === String(id) && String(item.teacherEmail || "").toLowerCase() === owner);
  if (!book) return false;
  const hasBuyers = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
    .filter((key) => key?.startsWith("educonnect.student.") && key.endsWith(".bookPurchases"))
    .some((key) => readList(key).some((purchase) => String(purchase.id) === String(id)));
  if (hasBuyers) {
    book.status = "Unpublished";
    book.sellerDeleted = true;
    book.updatedAt = new Date().toISOString();
    window.localStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify(books));
    notify();
    return true;
  }
  window.localStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify(books.filter((item) => item !== book)));
  [...new Set([book.pdfFileId, ...(book.pdfFileIds || []), book.previewFileId, ...(book.previewFileIds || []), book.coverFileId, ...(book.coverFileIds || [])].filter(Boolean))].forEach((fileId) => deleteBookFile(fileId).catch(() => {}));
  notify();
  return true;
}

export async function adminSetBookStatus(id, status, reason = "") {
  const book = getBookRecords().find((item) => String(item.id) === String(id));
  if (!book) return false;
  if (book.mongoContent) {
    const decision = { Approved: "approve", Published: "publish", Rejected: "reject", Unpublished: "unpublish", "Pending Approval": "return" }[status];
    await reviewContent("books", book, decision, reason);
    return true;
  }
  const timestamp = new Date().toISOString();
  saveBookRecord({ ...book, status, rejectionReason: status === "Rejected" ? reason.trim() : "", reviewedAt: timestamp, publishedAt: status === "Published" ? timestamp : book.publishedAt });
  return true;
}

export function validateBookUpload(pdfFile, title, price, isFree) {
  if (!String(title || "").trim()) return "Enter a book title.";
  if (!pdfFile || pdfFile.type !== "application/pdf" || !/\.pdf$/i.test(pdfFile.name)) return "Choose a valid PDF file.";
  if (pdfFile.size > BOOKS_MAX_FILE_SIZE) return "PDF must be 20 MB or smaller.";
  if (!isFree && (!Number.isFinite(Number(price)) || Number(price) <= 0)) return "Enter a valid price greater than Rs. 0.";
  if (Number(price) < 0) return "Price cannot be negative.";
  return "";
}

export function getStudentBookPurchases(email) {
  return readList(`educonnect.student.${String(email || "").toLowerCase()}.bookPurchases`);
}

export function isBookPurchased(email, bookId) {
  const state = getContentState();
  if (state.role === "student" && state.email?.toLowerCase() === String(email).toLowerCase()
    && state.accesses.some((entry) => entry.kind === "book" && String(entry.contentId) === String(bookId))) return true;
  return getStudentBookPurchases(email).some((item) => String(item.id) === String(bookId));
}

export function addStudentHelpRequest(request) {
  const requests = readList(BOOK_HELP_REQUESTS_KEY);
  requests.unshift(request);
  window.localStorage.setItem(BOOK_HELP_REQUESTS_KEY, JSON.stringify(requests));
  window.dispatchEvent(new Event("educonnect:student-help-requests-changed"));
  return request;
}

export function getStudentHelpRequests() {
  return readList(BOOK_HELP_REQUESTS_KEY);
}

export function updateStudentHelpRequest(id, patch) {
  const requests = getStudentHelpRequests().map((request) => String(request.id) === String(id) ? { ...request, ...patch, updatedAt: new Date().toISOString() } : request);
  window.localStorage.setItem(BOOK_HELP_REQUESTS_KEY, JSON.stringify(requests));
  window.dispatchEvent(new Event("educonnect:student-help-requests-changed"));
}

export function getBookReviews(includeModerated = false) {
  const reviews = readList(BOOK_REVIEWS_KEY);
  return includeModerated ? reviews : reviews.filter((review) => !review.moderated);
}

export function saveBookReviews(reviews) {
  if (!Array.isArray(reviews)) throw new Error("Book reviews must be a list.");
  window.localStorage.setItem(BOOK_REVIEWS_KEY, JSON.stringify(reviews));
  window.dispatchEvent(new Event("educonnect:book-reviews-changed"));
}

export function saveBookReview(review) {
  const existing = getBookReviews(true).find((item) => String(item.bookId) === String(review.bookId) && String(item.studentEmail).toLowerCase() === String(review.studentEmail).toLowerCase());
  const reviews = getBookReviews(true).filter((item) => !(String(item.bookId) === String(review.bookId) && String(item.studentEmail).toLowerCase() === String(review.studentEmail).toLowerCase()));
  reviews.unshift(existing?.moderated ? { ...review, id: existing.id, moderated: true, moderationUpdatedAt: existing.moderationUpdatedAt } : review);
  window.localStorage.setItem(BOOK_REVIEWS_KEY, JSON.stringify(reviews));
  window.dispatchEvent(new Event("educonnect:book-reviews-changed"));
}

export function removeBookReview(id) {
  window.localStorage.setItem(BOOK_REVIEWS_KEY, JSON.stringify(getBookReviews().filter((item) => String(item.id) !== String(id))));
  window.dispatchEvent(new Event("educonnect:book-reviews-changed"));
}

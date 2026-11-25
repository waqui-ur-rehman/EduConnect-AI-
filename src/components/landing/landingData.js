import { getCourseCatalogForDisplay } from "../../utils/teacherCourses";
import { getBookReviews, getPublishedBooks } from "../../utils/books";
import { courseReviewKey, getReviews, resolveReviewStudent } from "../../utils/courseReviews";
import { isModerationVisible } from "../../utils/moderationVisibility";
import { coursePrograms } from "../../utils/courseCatalog";

const normalize = value => String(value ?? "").trim().toLowerCase();
const searchText = value => normalize(value).normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } };
export const landingCourseUrl = course => course.kind === "program"
  ? `/courses?${new URLSearchParams({ program: course.id })}`
  : course.isEnrollmentSnapshot
    ? "/courses"
  : `/course/${encodeURIComponent(course.teacherEmail)}/${encodeURIComponent(String(course.id))}`;
const courseUpdatedAt = course => {
  const timestamp = Date.parse(course.updatedAt || course.publishedAt || course.createdAt || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
};
export const featuredLandingCourses = (catalog, limit = 3) => [
  ...catalog.courses.slice().sort((a, b) =>
    Number(b.reviewCount > 0) - Number(a.reviewCount > 0) ||
    Number(Boolean(b.thumbnail || b.image)) - Number(Boolean(a.thumbnail || a.image)) ||
    courseUpdatedAt(b) - courseUpdatedAt(a)
  ),
  ...catalog.programs.filter(course => course.id.startsWith("professional-")),
  ...catalog.programs.filter(course => !course.id.startsWith("professional-")),
].slice(0, limit);
export function landingCatalogUrl(search = "", category = "All") {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  if (category !== "All") params.set("category", category);
  return `/courses${params.size ? `?${params}` : ""}`;
}
const average = rows => rows.length ? rows.reduce((sum, review) => sum + Number(review.rating), 0) / rows.length : null;

export function buildLandingCatalog(courses = [], books = [], registered = [], profiles = {}, reviews = [], bookReviews = []) {
  const seen = new Set();
  const visibleCourses = courses.filter(course => {
    if (!course?.id || (!course.isEnrollmentSnapshot && (course.status !== "Published" || !course.teacherEmail)) || typeof course.title !== "string" || !course.title.trim()) return false;
    const key = courseReviewKey(course); if (seen.has(key)) return false; seen.add(key); return true;
  });
  const courseMap = new Map(visibleCourses.map(course => [courseReviewKey(course), course]));
  const publicBooks = books.filter(book => book?.id && typeof book.title === "string" && book.title.trim() && ["Approved", "Published"].includes(book.status));
  const visibleReviews = reviews.filter(review => review && !review.moderated && courseMap.has(String(review.courseKey)) && Number(review.rating) >= 1 && Number(review.rating) <= 5);
  const listed = visibleCourses.map(course => {
    const ratings = visibleReviews.filter(review => review.courseKey === courseReviewKey(course));
    const lessonCount = Array.isArray(course.lessons)
      ? course.lessons.length
      : Math.max(0, Number(course.lessons) || 0);
    return { ...course, key: courseReviewKey(course), rating: average(ratings), reviewCount: ratings.length, lessonCount };
  });
  const usersByEmail = new Map();
  registered.forEach(user => { const email = normalize(user?.email); if (email && !usersByEmail.has(email)) usersByEmail.set(email, user); });
  const teacherEmails = new Set([
    ...registered.filter(user => normalize(user?.role) === "teacher").map(user => normalize(user.email)),
    ...listed.map(course => normalize(course.teacherEmail)),
    ...publicBooks.map(book => normalize(book.teacherEmail)),
    ...Object.keys(profiles).map(normalize),
  ].filter(Boolean));
  const teachers = [];
  for (const email of teacherEmails) {
    const user = usersByEmail.get(email);
    if (user && (normalize(user.role) !== "teacher" || ["blocked", "suspended", "deleted"].includes(normalize(user.status)))) continue;
    const ownCourses = listed.filter(course => normalize(course.teacherEmail) === email && !course.isEnrollmentSnapshot);
    const ownBooks = publicBooks.filter(book => normalize(book.teacherEmail) === email);
    const uploadedProfile = ownCourses.find(course => course.instructorProfile && typeof course.instructorProfile === "object")?.instructorProfile || {};
    const savedProfile = profiles[email] && typeof profiles[email] === "object" && !Array.isArray(profiles[email]) ? profiles[email] : {};
    const profile = { ...uploadedProfile, ...savedProfile };
    const ownKeys = new Set(ownCourses.map(course => course.key));
    const ownBookIds = new Set(ownBooks.map(book => String(book.id)));
    const ratings = [
      ...visibleReviews.filter(review => ownKeys.has(review.courseKey)),
      ...bookReviews.filter(review => review && !review.moderated && ownBookIds.has(String(review.bookId)) && Number.isFinite(Number(review.rating)) && Number(review.rating) >= 1 && Number(review.rating) <= 5),
    ];
    const name = [profile.name, user?.name, ownCourses.find(course => course.instructorName)?.instructorName, ownBooks.find(book => book.teacherName)?.teacherName, email.split("@")[0]].find(value => typeof value === "string" && value.trim());
    teachers.push({ email, name, profile, courses: ownCourses,
      books: ownBooks, rating: average(ratings), reviewCount: ratings.length });
  }
  teachers.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || b.courses.length - a.courses.length || a.name.localeCompare(b.name));
  const programs = coursePrograms.map(course => ({ ...course, kind: "program", key: `program:${course.id}` }));
  const categoryMap = new Map();
  [...listed, ...programs].forEach(course => { if (typeof course.category === "string" && course.category.trim()) { const key = normalize(course.category); const previous = categoryMap.get(key); categoryMap.set(key, { name: previous?.name || course.category.trim(), count: (previous?.count || 0) + 1 }); } });
  return { courses: listed, programs, books: publicBooks, teachers, categories: [...categoryMap.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    reviews: visibleReviews.filter(review => typeof review.comment === "string" && review.comment.trim()).map(review => ({ ...review, course: courseMap.get(review.courseKey) })) };
}

export function readLandingCatalog() {
  const users = read("educonnect.registeredUsers", []), profiles = {};
  const registered = Array.isArray(users) ? users : [];
  const courses = getCourseCatalogForDisplay(), books = getPublishedBooks();
  const teacherEmails = new Set([
    ...registered.filter(user => normalize(user?.role) === "teacher").map(user => normalize(user.email)),
    ...courses.map(course => normalize(course.teacherEmail)),
    ...books.map(book => normalize(book.teacherEmail)),
  ].filter(Boolean));
  // Earlier teacher workspaces may only have profile/course storage, without
  // a matching record in the current registration list.
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      const match = key?.match(/^educonnect\.teacher\.(.+)\.(profile|courses)$/);
      if (!match) continue;
      const saved = read(key, null);
      const email = normalize(match[1]);
      if (!email || !saved || (match[2] === "profile" ? typeof saved !== "object" || Array.isArray(saved) : !Array.isArray(saved))) continue;
      teacherEmails.add(email);
      if (match[2] === "profile") profiles[email] = saved;
    }
  } catch { /* Keep registered teachers available when storage cannot be enumerated. */ }
  teacherEmails.forEach(email => { profiles[email] = read(`educonnect.teacher.${email}.profile`, profiles[email] || {}); });
  const reviews = getReviews()
    .filter(review => isModerationVisible("review", review.id || `${review.courseKey}:${review.studentEmail}`))
    .map(review => ({ ...review, ...resolveReviewStudent(review) }));
  const bookReviews = getBookReviews().filter(review => isModerationVisible("book-review", review.id));
  return buildLandingCatalog(courses, books, registered, profiles, reviews, bookReviews);
}

export function searchLandingCatalog(catalog, query) {
  const words = searchText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const records = [
    ...catalog.courses.map(record => ({ kind: "course", key: record.key, title: record.title, detail: record.instructorName || "Course", text: [record.title, record.category, record.instructorName, record.subject, record.description].join(" "), record })),
    ...catalog.programs.map(record => ({ kind: "course", key: record.key, title: record.title, detail: `${record.category} · ${record.level}`, text: [record.title, record.category, record.level, ...record.subjects].join(" "), record })),
    ...catalog.books.map(record => ({ kind: "book", key: String(record.id), title: record.title, detail: record.author || record.teacherName || record.subject || "Book", text: [record.title, record.author, record.teacherName, record.subject, record.description].join(" "), record })),
    ...catalog.teachers.map(record => ({ kind: "teacher", key: record.email, title: record.name, detail: record.profile.headline || record.profile.expertise || "Teacher", text: [record.name, record.profile.headline, record.profile.expertise, record.profile.subjects, record.profile.bio, record.profile.qualification].join(" "), record })),
  ];
  return records.filter(item => words.every(word => searchText(item.text).includes(word)));
}

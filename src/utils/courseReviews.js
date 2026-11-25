const STORAGE_KEY = "educonnect.courseReviews.v1";
export const REVIEW_EVENT = "educonnect:reviews-changed";
export function getReviews(includeModerated = false) {
  try { const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); return Array.isArray(data) ? (includeModerated ? data : data.filter((review) => !review.moderated)) : []; }
  catch { return []; }
}
export function courseReviewKey(course) {
  return `${String(course.teacherEmail || "demo").trim().toLowerCase()}::${String(course.id)}`;
}

export function resolveReviewStudent(review) {
  const email = String(review.studentEmail || "").trim().toLowerCase();
  let profile = {};
  let account;

  try {
    const saved = JSON.parse(localStorage.getItem(`educonnect.student.${email}.profile`) || "null");
    if (saved && typeof saved === "object" && !Array.isArray(saved)) profile = saved;
  } catch { /* Older reviews can still use their saved author name. */ }

  try {
    const users = JSON.parse(localStorage.getItem("educonnect.registeredUsers") || "[]");
    if (Array.isArray(users)) {
      account = users.find(user => user && String(user.email || "").trim().toLowerCase() === email
        && String(user.role || "").toLowerCase() === "student");
    }
  } catch { /* A missing registration record must not hide a review. */ }

  const studentName = [profile.fullName, profile.name, account?.name, review.studentName, email.split("@")[0]]
    .find(name => typeof name === "string" && name.trim() && name.trim().toLowerCase() !== "student");
  const studentAvatar = [profile.avatar, review.studentAvatar]
    .find(avatar => typeof avatar === "string" && avatar.trim());

  return { studentName: studentName?.trim() || "Student", studentAvatar: studentAvatar || "" };
}

export function saveReview(review) {
  const existing = getReviews(true).find(r => r.courseKey === review.courseKey && r.studentEmail === review.studentEmail);
  const reviews = getReviews(true).filter(r => !(r.courseKey === review.courseKey && r.studentEmail === review.studentEmail));
  const namedReview = { ...review, ...resolveReviewStudent(review) };
  reviews.push(existing?.moderated ? { ...namedReview, id: existing.id, moderated: true, moderationUpdatedAt: existing.moderationUpdatedAt } : namedReview);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
  window.dispatchEvent(new Event(REVIEW_EVENT));
}

export function saveModeratedReview(targetId, moderated) {
  const reviews = getReviews(true);
  const next = reviews.map((review) => {
    const identity = String(review.id || `${review.courseKey}:${review.studentEmail}`);
    return identity === String(targetId) ? { ...review, moderated: Boolean(moderated), moderationUpdatedAt: new Date().toISOString() } : review;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(REVIEW_EVENT));
}
export function removeReview(courseKey, studentEmail) {
  const reviews = getReviews(true).filter(r => !(r.courseKey === courseKey && r.studentEmail === studentEmail));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
  window.dispatchEvent(new Event(REVIEW_EVENT));
}

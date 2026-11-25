import { courseDiscussionKey, makeDiscussionId } from "./courseDiscussions";
import { isModerationVisible } from "./moderationVisibility";
import { addDemoNotification } from "./demoNotifications";

export const discussionEmail = value => String(value || "").trim().toLowerCase();
const emails = values => [...new Set((Array.isArray(values) ? values : []).map(discussionEmail).filter(Boolean))];

export function discussionProfile(role, email) {
  try { return JSON.parse(localStorage.getItem(`educonnect.${role}.${discussionEmail(email)}.profile`) || "{}") || {}; }
  catch { return {}; }
}

export function discussionName(email, name = "", role = "student") {
  const profile = discussionProfile(role, email);
  return String(name || profile.fullName || profile.name || String(email || "Learner").split("@")[0].replace(/[._-]+/g, " ")).trim();
}

export const discussionAnswered = question => Boolean(question.resolved || question.reply?.text?.trim());
export const discussionReplies = question => (Array.isArray(question.replies) ? question.replies : []).filter(reply => !reply.moderated && isModerationVisible("comment", reply.id));
export const discussionReplyCount = question => (question.reply?.text ? 1 : 0) + discussionReplies(question).length;

export function visibleCourseDiscussions(items, courses) {
  const allowed = new Map(courses.map(course => [courseDiscussionKey(course), course]));
  return items.filter(item => allowed.has(item.courseKey) && !item.moderated && isModerationVisible("comment", item.id)).map(item => ({
    ...item,
    courseTitle: allowed.get(item.courseKey).title || item.courseTitle,
    reply: item.reply && !item.reply.moderated && isModerationVisible("comment", item.reply.id) ? item.reply : null,
  }));
}

export function filterCourseDiscussions(items, { course = "all", search = "", status = "all", view = "all", email = "", saved = [] } = {}) {
  const user = discussionEmail(email);
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(item => {
    if (course !== "all" && item.courseKey !== course) return false;
    if (status === "answered" && !discussionAnswered(item)) return false;
    if (status === "pending" && discussionAnswered(item)) return false;
    if (status === "resolved" && !item.resolved) return false;
    if (view === "mine" && discussionEmail(item.studentEmail) !== user) return false;
    if (view === "following" && !emails(item.followers).includes(user)) return false;
    if (view === "saved" && !saved.includes(item.id)) return false;
    const text = [item.title, item.body, item.courseTitle, item.lessonTitle, item.studentName, item.studentEmail,
      ...(item.tags || []), item.reply?.text, ...discussionReplies(item).map(reply => `${reply.name || ""} ${reply.text || ""}`)].join(" ").toLowerCase();
    return words.every(word => text.includes(word));
  }).sort((a, b) => (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0));
}

export function toggleDiscussionVotes(votes, email) {
  const user = discussionEmail(email);
  const values = emails(votes);
  if (!user) return values;
  return values.includes(user) ? values.filter(value => value !== user) : [...values, user];
}

export function toggleDiscussionFollow(question, email, now = new Date().toISOString()) {
  const user = discussionEmail(email);
  if (!user) throw new Error("Sign in to follow a discussion.");
  const followers = emails(question.followers);
  const following = followers.includes(user);
  const followedAt = { ...question.followedAt };
  if (following) delete followedAt[user];
  else followedAt[user] = now;
  return { ...question, followers: following ? followers.filter(value => value !== user) : [...followers, user], followedAt };
}

export function createCourseQuestion({ course, email, name, avatar = "", title, body = "", lessonTitle = "", tags = "" }, now = new Date().toISOString()) {
  if (!course?.id) throw new Error("Select one of your enrolled courses.");
  if (!discussionEmail(email)) throw new Error("Sign in to ask a question.");
  const cleanTitle = String(title || "").trim();
  if (cleanTitle.length < 5 || cleanTitle.length > 300) throw new Error("Your question title must be between 5 and 300 characters.");
  if (String(body).trim().length > 3000) throw new Error("Question details must be 3,000 characters or fewer.");
  return {
    id: makeDiscussionId(), courseKey: courseDiscussionKey(course), courseTitle: course.title,
    teacherEmail: discussionEmail(course.teacherEmail || course.instructorEmail), studentEmail: discussionEmail(email),
    studentName: discussionName(email, name), studentAvatar: avatar, title: cleanTitle, body: String(body).trim(),
    lessonTitle: String(lessonTitle).trim().slice(0, 120),
    tags: [...new Set((Array.isArray(tags) ? tags : String(tags).split(",")).map(tag => String(tag).trim().slice(0, 30)).filter(Boolean))].slice(0, 6),
    createdAt: now, votes: [], followers: [], followedAt: {}, replies: [], resolved: false, reply: null,
  };
}

export function addCourseDiscussionReply(question, { email, name, avatar = "", text }, now = new Date().toISOString()) {
  const user = discussionEmail(email);
  const clean = String(text || "").trim();
  if (!user) throw new Error("Sign in to join a discussion.");
  if (clean.length < 2 || clean.length > 3000) throw new Error("Your reply must be between 2 and 3,000 characters.");
  return { ...question, replies: [...(Array.isArray(question.replies) ? question.replies : []), {
    id: makeDiscussionId(), email: user, name: discussionName(email, name), avatar,
    role: "student", text: clean, createdAt: now, votes: [],
  }] };
}

export function editOwnCourseQuestion(items, id, draft, email, now = new Date().toISOString()) {
  const original = items.find(item => item.id === id);
  if (!original || discussionEmail(original.studentEmail) !== discussionEmail(email) || original.courseKey !== draft.courseKey) {
    throw new Error("You can only edit your own question in its original course.");
  }
  return items.map(item => item.id === id ? { ...item, title: draft.title, body: draft.body, lessonTitle: draft.lessonTitle, tags: draft.tags, updatedAt: now } : item);
}

export function removeOwnCourseQuestion(items, id, email) {
  const original = items.find(item => item.id === id);
  if (!original || discussionEmail(original.studentEmail) !== discussionEmail(email)) throw new Error("You can only delete your own question.");
  return items.filter(item => item.id !== id);
}

export function notifyDiscussionReply(question, reply, instructor = false) {
  const author = discussionEmail(instructor ? reply.teacherEmail : reply.email);
  const students = new Set([discussionEmail(question.studentEmail), ...emails(question.followers)]);
  try {
    students.forEach(email => {
      if (!email || email === author) return;
      addDemoNotification("student", email, {
        id: instructor ? `qa-reply:${question.id}:${reply.createdAt}` : `qa-discussion-reply:${question.id}:${reply.id}`,
        type: "discussion", title: instructor ? "Teacher replied to a course question" : "New course discussion reply",
        message: `New answer in ${question.courseTitle || "your course"}: ${question.title}`, link: "discussions",
      });
    });
    if (!instructor && question.teacherEmail && discussionEmail(question.teacherEmail) !== author) {
      addDemoNotification("teacher", question.teacherEmail, { id: `qa-discussion-reply:${question.id}:${reply.id}`, type: "discussion",
        title: "New discussion reply", message: `A student replied to ${question.title}.`, link: "discussions" });
    }
  } catch { /* The saved discussion remains available if notification storage is full. */ }
}

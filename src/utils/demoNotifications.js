const STUDENT_PREFIX = "educonnect.student.";
export const NOTIFICATIONS_EVENT = "educonnect:notifications-updated";

const normalize = value => String(value ?? "").trim().toLowerCase();
export const notificationKey = (role, email) =>
  `educonnect.${role}.${normalize(email)}.notifications`;

function readNotifications(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function addDemoNotification(role, email, notification) {
  if (!email || !notification?.id) return false;
  const key = notificationKey(role, email);
  const notifications = readNotifications(key);
  if (notifications.some(item => item.id === notification.id)) return false;
  localStorage.setItem(key, JSON.stringify([{
    ...notification,
    read: false,
    createdAt: notification.createdAt || new Date().toISOString(),
  }, ...notifications].slice(0, 150)));
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_EVENT, { detail: { key } }));
  return true;
}

export function notifyEnrolledStudents(teacherEmail, courseId, notification) {
  const students = new Set();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i) || "";
    if (!key.startsWith(STUDENT_PREFIX) || !key.endsWith(".enrollments")) continue;
    const email = key.slice(STUDENT_PREFIX.length, -".enrollments".length);
    let enrollments = [];
    try { enrollments = JSON.parse(localStorage.getItem(key) || "[]"); } catch { /* skip malformed browser demo data */ }
    if (Array.isArray(enrollments) && enrollments.some(row =>
      String(row.id) === String(courseId) && (!row.teacherEmail || normalize(row.teacherEmail) === normalize(teacherEmail)))) {
      students.add(email);
    }
  }
  students.forEach(email => addDemoNotification("student", email, notification));
  return students.size;
}

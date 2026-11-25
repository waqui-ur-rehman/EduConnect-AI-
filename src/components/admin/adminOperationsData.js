import {
  ADMIN_DATA_CHANGED_EVENT,
  ADMIN_USERS_KEY,
  appendAdminActivityRecord,
  notifyAdminDataChanged,
  readAdminArray,
} from "./adminData";

export const ADMIN_OPERATIONS_SETTINGS_KEY =
  "educonnect.adminOperationsSettings";

const DEFAULT_SETTINGS = {
  tutorReviews: {},
};

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function readAdminOperationsSettings() {
  try {
    const raw = window.localStorage.getItem(ADMIN_OPERATIONS_SETTINGS_KEY);
    if (raw === null) return { ...DEFAULT_SETTINGS, error: null };
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return {
        ...DEFAULT_SETTINGS,
        error: "Saved Admin operations preferences are not in a supported format.",
      };
    }

    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      tutorReviews: isRecord(parsed.tutorReviews) ? parsed.tutorReviews : {},
      error: null,
    };
  } catch {
    return {
      ...DEFAULT_SETTINGS,
      error: "Saved Admin operations preferences could not be read.",
    };
  }
}

function saveSettings(settings, next) {
  if (settings.error) throw new Error(settings.error);
  window.localStorage.setItem(
    ADMIN_OPERATIONS_SETTINGS_KEY,
    JSON.stringify({ ...settings, error: undefined, ...next }),
  );
  notifyAdminDataChanged();
}

export function updateTutorReviewStatus(settings, tutorId, status, actor) {
  saveSettings(settings, {
    tutorReviews: { ...settings.tutorReviews, [tutorId]: status },
  });
  appendAdminActivityRecord({
    actor,
    action: "Updated tutor marketplace review",
    category: "tutor-marketplace",
    entityType: "Tutor Profile",
    entityId: tutorId,
    targetName: tutorId,
    description: `Tutor marketplace review status changed to ${status}.`,
    result: "Success",
  });
}

export function getAdminTutorProfiles(settings, users = readAdminArray(ADMIN_USERS_KEY)) {
  const seenProfiles = new Set();
  return users
    .filter((user) =>
      isRecord(user) &&
      (user.role === "Tutor" ||
        user.isTutor === true ||
        isRecord(user.tutorProfile) ||
        isRecord(user.tutorApplication)),
    )
    .map((user) => {
      const profile = isRecord(user.tutorProfile) ? user.tutorProfile : {};
      const application = isRecord(user.tutorApplication) ? user.tutorApplication : {};
      const email = typeof user.email === "string" ? user.email.trim() : "";
      const id = email || String(user.id || user.userId || "").trim();
      if (!id || seenProfiles.has(id.toLowerCase())) return null;
      seenProfiles.add(id.toLowerCase());
      const subjects = profile.subjects || profile.expertise || profile.subject || application.subjects || application.subject || user.subjects || user.subject;
      const subjectList = Array.isArray(subjects)
        ? subjects.filter((item) => typeof item === "string" && item.trim())
        : typeof subjects === "string"
          ? subjects.split(",").map((item) => item.trim()).filter(Boolean)
          : [];
      const name = [user.name, profile.name].find((item) => typeof item === "string" && item.trim()) || "Name not provided";
      const savedStatus = settings.tutorReviews[id];
      return {
        id,
        name,
        email,
        subject: subjectList.join(", ") || "Not provided",
        subjects: subjectList,
        qualification: application.qualification || profile.qualification || user.qualification || "Not provided",
        experience: profile.experience || application.experience || user.experience || "Not provided",
        availability: profile.availability || user.availability || "Not provided",
        avatar: [profile.avatar, profile.profilePicture, user.profilePicture, user.avatar].find((item) => typeof item === "string" && item.trim()) || "",
        createdAt: application.createdAt || user.createdAt || user.registeredAt || "",
        about: profile.about || application.about || user.about || "",
        type: "Registered profile",
        status: settings.error
          ? application.reviewStatus || "Review status unavailable"
          : typeof savedStatus === "string" && savedStatus.trim()
            ? savedStatus
            : application.reviewStatus || "Pending Review",
      };
    })
    .filter(Boolean);
}

export function getAdminTutorBookings() {
  const records = [];
  const errors = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index) || "";
      if (!key.startsWith("educonnect.student.") || !key.endsWith(".tutorBookings")) {
        continue;
      }
      const studentEmail = key.slice(
        "educonnect.student.".length,
        -".tutorBookings".length,
      );
      try {
        const saved = JSON.parse(window.localStorage.getItem(key) || "[]");
        if (!Array.isArray(saved)) {
          errors.push(`Tutor booking data for ${studentEmail} is not in the expected format.`);
          continue;
        }
        saved.filter(isRecord).forEach((booking) => {
          records.push({
            ...booking,
            studentEmail,
            tutorName: "Demo catalog tutor",
            tutorSubject: "Not provided",
          });
        });
      } catch {
        errors.push(`Tutor booking data for ${studentEmail} could not be read.`);
      }
    }
  } catch {
    errors.push("Browser storage could not be scanned for demo tutor bookings.");
  }
  return { records, errors };
}

export function updateAdminTutorBookingStatus(booking, status, actor) {
  const key = `educonnect.student.${booking.studentEmail}.tutorBookings`;
  const saved = JSON.parse(window.localStorage.getItem(key) || "[]");
  if (!Array.isArray(saved)) throw new Error("Saved tutor booking data is not in the expected format.");
  let updated = false;
  const next = saved.map((item) => {
    if (String(item.id) !== String(booking.id)) return item;
    updated = true;
    return { ...item, status, adminReviewedAt: new Date().toISOString() };
  });
  if (!updated) throw new Error("The tutor booking could not be found.");
  window.localStorage.setItem(key, JSON.stringify(next));
  notifyAdminDataChanged();
  window.dispatchEvent(new Event("educonnect:student-data-changed"));
  appendAdminActivityRecord({
    actor,
    action: "Updated demo tutor booking",
    category: "tutor-marketplace",
    entityType: "Tutor Booking",
    entityId: String(booking.id),
    targetName: booking.tutorName,
    description: `Saved Student demo booking status changed to ${status}. No appointment or notification was created.`,
    result: "Success",
  });
}

export function getAdminSavedOrderItems() {
  const transactions = [];
  const errors = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index) || "";
      if (!key.startsWith("educonnect.student.") || !key.endsWith(".orders")) {
        continue;
      }
      const studentEmail = key.slice(
        "educonnect.student.".length,
        -".orders".length,
      );
      try {
        const saved = JSON.parse(window.localStorage.getItem(key) || "[]");
        if (!Array.isArray(saved)) {
          errors.push(`Order data for ${studentEmail} is not in the expected format.`);
          continue;
        }
        saved.filter(isRecord).forEach((order) => {
          (Array.isArray(order.items) ? order.items : []).filter(isRecord).forEach((item, itemIndex) => {
            const orderId = String(order.id || order.purchasedAt || "");
            const price = item.price === null || item.price === undefined || item.price === ""
              ? Number.NaN
              : Number(item.price);
            transactions.push({
              id: `${orderId || studentEmail}:${item.id ?? itemIndex}`,
              orderId,
              date: order.purchasedAt || "",
              description: typeof item.title === "string" && item.title.trim() ? item.title : "Title not provided",
              amount: Number.isFinite(price) ? Math.max(0, price) : null,
              status: typeof order.status === "string" && order.status.trim() ? order.status : "Status not recorded",
              studentEmail: order.studentEmail || studentEmail,
            });
          });
        });
      } catch {
        errors.push(`Order data for ${studentEmail} could not be read.`);
      }
    }
  } catch {
    errors.push("Browser storage could not be scanned for demo transactions.");
  }
  return { records: transactions, errors };
}

export { ADMIN_DATA_CHANGED_EVENT };

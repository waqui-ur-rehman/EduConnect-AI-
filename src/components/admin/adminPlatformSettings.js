export const ADMIN_PLATFORM_SETTINGS_KEY = "educonnect.adminPlatformSettings";
export const ADMIN_PLATFORM_SETTINGS_CHANGED_EVENT =
  "educonnect:admin-platform-settings-changed";

export const DEFAULT_ADMIN_PLATFORM_SETTINGS = {
  general: {
    websiteName: "EduConnect AI",
    tagline: "Learn, teach, and grow together.",
    logoUrl: "",
    faviconUrl: "",
    supportEmail: "support@educonnect.ai",
    language: "English",
    timezone: "Asia/Karachi",
  },
  appearance: { theme: "light", sidebar: "expanded" },
  rules: {
    teacherVerificationRequired: false,
    courseApprovalRequired: true,
    ebookApprovalRequired: true,
    contentPublishingRules: "Approved content only",
  },
  marketplace: {
    currency: "PKR",
    commissionRate: 15,
    allowFreeContent: true,
    allowPaidContent: true,
    demoCheckoutMode: true,
  },
  system: {
    maintenanceMode: false,
    registrationEnabled: true,
    courseUploadEnabled: true,
    pdfUploadLimitMb: 50,
  },
  notifications: {
    newTeacherApplicationAlerts: true,
    courseApprovalAlerts: true,
    pdfApprovalAlerts: true,
    studentHelpRequestAlerts: true,
    systemAnnouncements: true,
  },
};

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeSettings(value) {
  return {
    general: { ...DEFAULT_ADMIN_PLATFORM_SETTINGS.general, ...value.general },
    appearance: { ...DEFAULT_ADMIN_PLATFORM_SETTINGS.appearance, ...value.appearance },
    rules: { ...DEFAULT_ADMIN_PLATFORM_SETTINGS.rules, ...value.rules, teacherVerificationRequired: false },
    marketplace: { ...DEFAULT_ADMIN_PLATFORM_SETTINGS.marketplace, ...value.marketplace },
    system: { ...DEFAULT_ADMIN_PLATFORM_SETTINGS.system, ...value.system },
    notifications: { ...DEFAULT_ADMIN_PLATFORM_SETTINGS.notifications, ...value.notifications },
  };
}

export function validateAdminPlatformSettings(settings) {
  if (!isRecord(settings)) throw new Error("Platform settings are invalid.");
  ["general", "appearance", "rules", "marketplace", "system", "notifications"].forEach((group) => {
    if (settings[group] !== undefined && !isRecord(settings[group])) {
      throw new Error("One or more settings values are invalid.");
    }
  });

  const value = mergeSettings(settings);
  const stringFields = ["websiteName", "tagline", "logoUrl", "faviconUrl", "supportEmail", "language", "timezone"];
  if (stringFields.some((field) => typeof value.general[field] !== "string")) {
    throw new Error("One or more settings values are invalid.");
  }
  if (!value.general.websiteName.trim()) throw new Error("Enter a website name.");
  if (!value.general.supportEmail.trim()) throw new Error("Enter a support email.");
  if (
    !["light", "dark", "system"].includes(value.appearance.theme) ||
    !["expanded", "compact"].includes(value.appearance.sidebar)
  ) throw new Error("One or more settings values are invalid.");

  const booleanFields = {
    rules: ["teacherVerificationRequired", "courseApprovalRequired", "ebookApprovalRequired"],
    marketplace: ["allowFreeContent", "allowPaidContent", "demoCheckoutMode"],
    system: ["maintenanceMode", "registrationEnabled", "courseUploadEnabled"],
    notifications: [
      "newTeacherApplicationAlerts",
      "courseApprovalAlerts",
      "pdfApprovalAlerts",
      "studentHelpRequestAlerts",
      "systemAnnouncements",
    ],
  };
  if (Object.entries(booleanFields).some(([group, fields]) =>
    fields.some((field) => typeof value[group][field] !== "boolean")
  )) throw new Error("One or more settings values are invalid.");

  if (!["Approved content only", "Admin review required", "Allow teacher publishing"].includes(value.rules.contentPublishingRules)) {
    throw new Error("One or more settings values are invalid.");
  }
  if (!["PKR", "USD", "GBP", "AED"].includes(value.marketplace.currency)) {
    throw new Error("One or more settings values are invalid.");
  }
  if (
    !Number.isFinite(Number(value.marketplace.commissionRate)) ||
    Number(value.marketplace.commissionRate) < 0 ||
    Number(value.marketplace.commissionRate) > 50
  ) throw new Error("Commission must be between 0 and 50%.");
  if (
    !Number.isFinite(Number(value.system.pdfUploadLimitMb)) ||
    Number(value.system.pdfUploadLimitMb) < 1 ||
    Number(value.system.pdfUploadLimitMb) > 500
  ) throw new Error("PDF upload size must be from 1 to 500 MB.");

  return value;
}

export function getAdminPlatformSettings() {
  try {
    const raw = window.localStorage.getItem(ADMIN_PLATFORM_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_ADMIN_PLATFORM_SETTINGS, error: null };
    const parsed = JSON.parse(raw);
    const value = validateAdminPlatformSettings(parsed);
    return { ...value, error: null };
  } catch {
    return {
      ...DEFAULT_ADMIN_PLATFORM_SETTINGS,
      error: "Saved platform settings could not be read. Defaults are active.",
    };
  }
}

export function saveAdminPlatformSettings(settings) {
  const value = validateAdminPlatformSettings(settings);
  window.localStorage.setItem(ADMIN_PLATFORM_SETTINGS_KEY, JSON.stringify(value));
  window.dispatchEvent(new Event(ADMIN_PLATFORM_SETTINGS_CHANGED_EVENT));
}

export function resetAdminPlatformSettings() {
  window.localStorage.removeItem(ADMIN_PLATFORM_SETTINGS_KEY);
  window.dispatchEvent(new Event(ADMIN_PLATFORM_SETTINGS_CHANGED_EVENT));
}

export const ADMIN_PREFERENCES_KEY = "educonnect.adminPreferences";
export const ADMIN_PREFERENCES_CHANGED_EVENT =
  "educonnect:admin-preferences-changed";

export const ADMIN_DENSITY_OPTIONS = ["comfortable", "compact"];
export const DEFAULT_ADMIN_PREFERENCES = { density: "comfortable" };

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function getAdminPreferences() {
  try {
    const raw = window.localStorage.getItem(ADMIN_PREFERENCES_KEY);
    if (raw === null) {
      return { ...DEFAULT_ADMIN_PREFERENCES, error: null };
    }

    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || !ADMIN_DENSITY_OPTIONS.includes(parsed.density)) {
      return {
        ...DEFAULT_ADMIN_PREFERENCES,
        error: "Saved Admin interface preferences are not in a supported format.",
      };
    }

    return { density: parsed.density, error: null };
  } catch {
    return {
      ...DEFAULT_ADMIN_PREFERENCES,
      error: "Saved Admin interface preferences could not be read.",
    };
  }
}

function notifyAdminPreferencesChanged() {
  window.dispatchEvent(new Event(ADMIN_PREFERENCES_CHANGED_EVENT));
}

export function saveAdminPreferences(preferences) {
  if (
    !isRecord(preferences) ||
    !ADMIN_DENSITY_OPTIONS.includes(preferences.density)
  ) {
    throw new Error("Choose a supported Admin interface density.");
  }

  window.localStorage.setItem(
    ADMIN_PREFERENCES_KEY,
    JSON.stringify({ density: preferences.density }),
  );
  notifyAdminPreferencesChanged();
}

export function resetAdminPreferences() {
  window.localStorage.removeItem(ADMIN_PREFERENCES_KEY);
  notifyAdminPreferencesChanged();
}

export const MODERATION_VISIBILITY_KEY = "educonnect.moderationVisibility.v1";
export const MODERATION_VISIBILITY_EVENT = "educonnect:moderation-visibility-changed";

export function getModerationVisibilityMap() {
  try {
    const map = JSON.parse(window.localStorage.getItem(MODERATION_VISIBILITY_KEY) || "{}");
    return map && typeof map === "object" && !Array.isArray(map) ? map : {};
  } catch {
    return {};
  }
}

export function isModerationVisible(type, id) {
  if (id === undefined || id === null || id === "") return true;
  return !getModerationVisibilityMap()[`${type}:${String(id)}`];
}

export function setModerationVisibility(type, id, state) {
  const visibility = getModerationVisibilityMap();
  const key = `${type}:${String(id)}`;
  if (state) visibility[key] = state;
  else delete visibility[key];
  window.localStorage.setItem(MODERATION_VISIBILITY_KEY, JSON.stringify(visibility));
  window.dispatchEvent(new Event(MODERATION_VISIBILITY_EVENT));
}

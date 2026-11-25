const configuredBase = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "/api";
const apiUrl = new URL(configuredBase, window.location.origin);
const loopbackHosts = ["localhost", "127.0.0.1"];
if (loopbackHosts.includes(apiUrl.hostname) && loopbackHosts.includes(window.location.hostname)) {
  apiUrl.hostname = window.location.hostname;
}
const apiPath = apiUrl.pathname.replace(/\/+$/, "");
apiUrl.pathname = apiPath.endsWith("/api") ? apiPath : `${apiPath}/api`;
export const apiBase = apiUrl.toString().replace(/\/+$/, "");

export function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers);
  const method = String(options.method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers.set("X-Requested-With", "XMLHttpRequest");
  // JSON string bodies must declare the JSON content type: without it fetch sends
  // `text/plain;charset=UTF-8` and Express leaves req.body undefined (every
  // controller then reads an empty/undefined body). FormData/URLSearchParams
  // bodies already declare their own type, so they are left untouched.
  if (typeof options.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${apiBase}${path}`, { ...options, method, headers, credentials: "include" });
}

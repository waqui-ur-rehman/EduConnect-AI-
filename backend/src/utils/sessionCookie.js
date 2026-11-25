const isProduction = process.env.NODE_ENV === "production";
export const sessionCookieName = "edc_session";
const hours = Number(process.env.SESSION_HOURS || 12);
export const sessionMaxAge = (Number.isFinite(hours) && hours > 0 && hours <= 168 ? hours : 12) * 60 * 60 * 1000;
export const sessionCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  path: "/api",
};
export function setSessionCookie(res, token) {
  res.cookie(sessionCookieName, token, { ...sessionCookieOptions, maxAge: sessionMaxAge });
}
export function clearSessionCookie(res) {
  res.clearCookie(sessionCookieName, sessionCookieOptions);
}

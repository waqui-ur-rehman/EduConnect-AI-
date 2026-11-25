export const DEV_ADMIN_SESSION_KEY = "educonnect.devAdminSession";

export function getConfiguredDevelopmentAdminEmail({
  isDevelopment,
  adminEmail,
  adminPassword,
}) {
  if (!isDevelopment || typeof adminEmail !== "string" || !adminEmail.trim() ||
      typeof adminPassword !== "string" || !adminPassword) {
    return "";
  }
  return adminEmail.trim().toLowerCase();
}

export function matchesDevelopmentAdminCredentials(email, password, config) {
  const configuredEmail = getConfiguredDevelopmentAdminEmail(config);
  return Boolean(configuredEmail) &&
    String(email || "").trim().toLowerCase() === configuredEmail &&
    password === config.adminPassword;
}

export function isDevelopmentAdminSession({
  isDevelopment,
  adminEmail,
  adminPassword,
  role,
  email,
  marker,
}) {
  const configuredEmail = getConfiguredDevelopmentAdminEmail({
    isDevelopment,
    adminEmail,
    adminPassword,
  });
  return Boolean(configuredEmail) &&
    marker === "true" &&
    role === "Admin" &&
    String(email || "").trim().toLowerCase() === configuredEmail;
}

export function clearDevelopmentAdminSession() {
  window.sessionStorage.removeItem(DEV_ADMIN_SESSION_KEY);
}

import nodemailer from "nodemailer";

function resetOrigin() {
  const configured = process.env.PASSWORD_RESET_FRONTEND_ORIGIN || process.env.CLIENT_ORIGIN || "http://localhost:5173";
  // Use first configured origin, never the untrusted request Host header.
  const origin = configured.split(",")[0].trim();
  const parsed = new URL(origin);
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("Invalid PASSWORD_RESET_FRONTEND_ORIGIN");
  }
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error("Password reset links require HTTPS in production");
  }
  return parsed.origin;
}

export async function sendResetEmail(email, rawToken) {
  const url = new URL("/reset-password", resetOrigin());
  url.searchParams.set("token", rawToken);
  const link = url.toString();
  const isDevelopment = process.env.NODE_ENV !== "production";

  // Explicitly opt in for LOCAL testing. Never log real-user tokens.
  if (isDevelopment && process.env.PASSWORD_RESET_DEV_LINK === "true") {
    console.info("[DEV ONLY] Password reset test link:", link);
    return;
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    throw new Error("Password reset SMTP settings not configured");
  }
  const port = Number(SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid SMTP_PORT");
  const mailer = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: process.env.NODE_ENV === "production",
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  await mailer.sendMail({
    from: SMTP_FROM,
    to: email,
    subject: "EduConnect AI — Reset your password",
    text: `A password reset was requested for your account. Open this link within 20 minutes:\n\n${link}\n\nIf you did not request this, ignore the email.`,
  });
}

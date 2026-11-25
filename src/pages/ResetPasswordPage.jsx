import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, CircleAlert, CircleCheck, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { apiFetch } from "../utils/api";
import PasswordRecoveryLayout from "./PasswordRecoveryLayout";

export default function ResetPasswordPage() {
  const location = useLocation();
  const token = new URLSearchParams(location.search).get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const validToken = /^[a-f0-9]{64}$/i.test(token);

  async function submit(event) {
    event.preventDefault();
    if (pending || message || !validToken) return;
    setError("");
    setMessage("");
    if (password.length < 10) return setError("Use at least 10 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setPending(true);
    try {
      const response = await apiFetch("/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Reset failed.");
      setMessage(data.message || "Password updated. Please log in.");
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err.message || "Connection failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <PasswordRecoveryLayout
      title="Reset password"
      description={message
        ? "Your password has been updated. Log in to continue your learning journey."
        : "Choose a new password to secure your EduConnect account."}
      icon={message ? <CircleCheck size={28} /> : <LockKeyhole size={28} />}
    >
      {!validToken ? (
        <p className="recovery-feedback" role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <span>
            Reset link is missing or invalid. <Link to="/forgot-password">Request another link</Link>.
          </span>
        </p>
      ) : !message && (
        <form className="recovery-form" onSubmit={submit} aria-busy={pending}>
          <div className="recovery-field">
            <label htmlFor="new-password">New password</label>
            <div className="auth-input-wrap">
              <LockKeyhole size={18} aria-hidden="true" />
              <input
                id="new-password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter a new password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
                aria-describedby="password-hint"
                required
                disabled={pending}
              />
              <button
                className="auth-eye"
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide new password" : "Show new password"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="recovery-hint" id="password-hint">Use at least 10 characters.</p>
          </div>
          <div className="recovery-field">
            <label htmlFor="confirm-password">Confirm new password</label>
            <div className="auth-input-wrap">
              <LockKeyhole size={18} aria-hidden="true" />
              <input
                id="confirm-password"
                name="confirmPassword"
                type={showConfirm ? "text" : "password"}
                placeholder="Re-enter your new password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
                required
                disabled={pending}
              />
              <button
                className="auth-eye"
                type="button"
                onClick={() => setShowConfirm((visible) => !visible)}
                aria-label={showConfirm ? "Hide confirmed password" : "Show confirmed password"}
                aria-pressed={showConfirm}
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <button className="auth-submit" disabled={pending} type="submit">
            {pending ? "Updating…" : "Reset password"}
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </form>
      )}
      {error && (
        <p className="recovery-feedback" role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      {message && (
        <p className="recovery-feedback recovery-success" role="status">
          <CircleCheck size={18} aria-hidden="true" />
          <span>{message}</span>
        </p>
      )}
    </PasswordRecoveryLayout>
  );
}

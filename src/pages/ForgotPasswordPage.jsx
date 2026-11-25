import { useState } from "react";
import { ArrowRight, CircleAlert, CircleCheck, KeyRound, Mail } from "lucide-react";
import { apiFetch } from "../utils/api";
import PasswordRecoveryLayout from "./PasswordRecoveryLayout";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = await apiFetch("/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await result.json().catch(() => ({}));
      if (!result.ok) throw new Error(data.message || "Could not send reset instructions.");
      setMessage(data.message || "Check your email if an account exists.");
    } catch (err) {
      setError(err.message || "Connection failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <PasswordRecoveryLayout
      title="Forgot password?"
      description="Enter your registered email address and we’ll send you a link to reset your password."
      icon={<KeyRound size={28} />}
    >
      <form className="recovery-form" onSubmit={submit} aria-busy={pending}>
        <div className="recovery-field">
          <label htmlFor="reset-email">Email address</label>
          <div className="auth-input-wrap">
            <Mail size={18} aria-hidden="true" />
            <input
              id="reset-email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              disabled={pending}
            />
          </div>
        </div>
        <button className="auth-submit" type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </form>
      {message && (
        <p className="recovery-feedback recovery-success" role="status">
          <CircleCheck size={18} aria-hidden="true" />
          <span>{message}</span>
        </p>
      )}
      {error && (
        <p className="recovery-feedback" role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </PasswordRecoveryLayout>
  );
}

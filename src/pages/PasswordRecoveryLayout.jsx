import { ArrowLeft, GraduationCap } from "lucide-react";
import { Link } from "react-router-dom";
import "./AuthPages.css";
import "./PasswordRecovery.css";

export default function PasswordRecoveryLayout({ title, description, icon, children }) {
  return (
    <main className="auth-page recovery-page">
      <header className="auth-topbar">
        <Link className="auth-brand" to="/" aria-label="EduConnect AI home">
          <span className="auth-brand-icon" aria-hidden="true">
            <GraduationCap size={22} />
          </span>
          <span>EduConnect <b>AI</b></span>
        </Link>
      </header>

      <div className="recovery-content">
        <section className="recovery-card" aria-labelledby="recovery-title">
          <div className="recovery-icon" aria-hidden="true">{icon}</div>
          <h1 id="recovery-title">{title}</h1>
          <p className="recovery-description">{description}</p>
          {children}
          <div className="recovery-card-footer">
            <Link className="recovery-back" to="/login">
              <ArrowLeft size={16} aria-hidden="true" />
              Back to login
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Check,
  Eye,
  EyeOff,
  GraduationCap,
  LockKeyhole,
  Mail,
  UserRound,
  UsersRound,
} from "lucide-react";
import { appendAdminActivityRecord } from "../components/admin/adminData";
import { apiFetch } from "../utils/api";
import "./SignupPage.css";

async function registerAccount({ name, email, role, password }) {
  let response;
  try {
    response = await apiFetch("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: name,
        email,
        password,
        role: role.toLowerCase(),
      }),
    });
  } catch {
    throw new Error("Cannot connect to backend. Please check that it is running.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      response.status === 409
        ? "This email is already registered. Please log in."
        : data.message || "Registration failed. Please try again."
    );
  }
  
  return data;
}
function SignupPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [role, setRole] = useState(() => ["Student", "Teacher"].includes(location.state?.role) ? location.state.role : "");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] =
    useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (loading) return;

    setMessage("");
    setMessageIsError(false);

    const form = event.currentTarget;

    const name = form.elements.name.value.trim();

    const email = form.elements.email.value
      .trim()
      .toLowerCase();

    const password = form.elements.password.value;

    const confirmPassword =
      form.elements.confirmPassword.value;

    if (!name || name.length < 2) {
      setMessageIsError(true);
      setMessage("Please enter your full name.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessageIsError(true);
      setMessage("Please enter a valid email address.");
      return;
    }

    if (password.length < 8) {
      setMessageIsError(true);
      setMessage(
        "Password must contain at least 8 characters."
      );
      return;
    }

    if (password !== confirmPassword) {
      setMessageIsError(true);
      setMessage("Passwords do not match.");
      return;
    }

    if (!["Student", "Teacher"].includes(role)) {
      setMessageIsError(true);
      setMessage("Please select Student or Teacher.");
      return;
    }

    if (!form.elements.terms.checked) {
      setMessageIsError(true);
      setMessage(
        "Please accept the terms before registering."
      );
      return;
    }

    setLoading(true);

    try {
      await registerAccount({ name, email, role, password });

      try {
        appendAdminActivityRecord({
          actor: email,
          actorRole: role,
          action: "Account Created",
          category: "user-activity",
          module: "User Management",
          entityType: "User Account",
          entityId: email,
          targetId: email,
          targetName: name,
          newValue: role,
          description: `${role} account created successfully. Password and credential values were not recorded.`,
          result: "Success",
        });
      } catch {
        // Registration remains successful if local audit storage is unavailable.
      }

      navigate("/login", {
        state: {
          registeredEmail: email,
        },
      });
    } catch (error) {
      setMessageIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Registration failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="signup-page">
      <header className="signup-topbar">
        <Link
          className="signup-brand"
          to="/"
          aria-label="EduConnect AI home"
        >
          <span className="signup-brand-icon">
            <GraduationCap size={22} />
          </span>

          <span>
            EduConnect <b>AI</b>
          </span>
        </Link>

        <p>
          Already have an account?{" "}
          <Link to="/login">Log in</Link>
        </p>
      </header>

      <div className="signup-layout">
        <section className="signup-intro">
          <span className="signup-intro-kicker">
            <BookOpen size={15} />
            YOUR LEARNING JOURNEY
          </span>

          <h1>
            Start your <em>learning journey.</em>
          </h1>

          <p>
            Create your free account to explore
            learning resources and keep your
            studies organized.
          </p>

          <div className="signup-benefits">
            <div>
              <span>
                <Check size={16} />
              </span>

              <p>
                <b>Explore your way</b>
                <small>
                  Find classes, subjects, and skills
                  in one place.
                </small>
              </p>
            </div>

            <div>
              <span>
                <Check size={16} />
              </span>

              <p>
                <b>Learn at your pace</b>
                <small>
                  Pick up useful topics whenever
                  you're ready.
                </small>
              </p>
            </div>

            <div>
              <span>
                <Check size={16} />
              </span>

              <p>
                <b>One account, many possibilities</b>
                <small>
                  Choose the learner or teacher
                  experience for you.
                </small>
              </p>
            </div>
          </div>

          <div className="signup-note">
            <UsersRound size={18} />
            <span>
              A welcoming space for curious minds.
            </span>
          </div>

          <div
            className="signup-learning-art"
            aria-hidden="true"
          >
            <div className="signup-art-book">
              <BookOpen size={35} />
            </div>

            <div className="signup-art-card">
              <span>YOUR NEXT LESSON</span>
              <b>Learn at your pace</b>

              <i>
                <span />
                <span />
                <span />
                <span />
                <span />
              </i>
            </div>

            <div className="signup-art-cap">
              <GraduationCap size={18} />
            </div>
          </div>

          <div
            className="signup-orbit signup-orbit-one"
            aria-hidden="true"
          />

          <div
            className="signup-orbit signup-orbit-two"
            aria-hidden="true"
          />
        </section>

        <section className="signup-form-panel">
          <div className="signup-heading">
            <span className="signup-mobile-icon">
              <GraduationCap size={21} />
            </span>

            <span className="signup-eyebrow">
              GET STARTED FOR FREE
            </span>

            <h2>Create your account</h2>

            <p>
              Fill in your details to join the
              EduConnect community.
            </p>
          </div>

          <form
            className="signup-form"
            onSubmit={handleSubmit}
            autoComplete="on"
          >
            <label htmlFor="signup-name">
              Full name
            </label>

            <div className="signup-input-wrap">
              <UserRound size={17} />

              <input
                id="signup-name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder="e.g. Ayesha Khan"
                required
                minLength={2}
              />
            </div>

            <label htmlFor="signup-email">
              Email address
            </label>

            <div className="signup-input-wrap">
              <Mail size={17} />

              <input
                id="signup-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="signup-password-grid">
              <div>
                <label htmlFor="signup-password">
                  Password
                </label>

                <div className="signup-input-wrap">
                  <LockKeyhole size={17} />

                  <input
                    id="signup-password"
                    name="password"
                    type={
                      showPassword ? "text" : "password"
                    }
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    minLength={8}
                    required
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(!showPassword)
                    }
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      padding: "4px",
                      color: "#7c3aed",
                    }}
                  >
                    {showPassword ? (
                      <EyeOff size={17} />
                    ) : (
                      <Eye size={17} />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="signup-confirm-password">
                  Confirm password
                </label>

                <div className="signup-input-wrap">
                  <LockKeyhole size={17} />

                  <input
                    id="signup-confirm-password"
                    name="confirmPassword"
                    type={
                      showConfirm ? "text" : "password"
                    }
                    autoComplete="new-password"
                    placeholder="Enter it again"
                    minLength={8}
                    required
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowConfirm(!showConfirm)
                    }
                    aria-label={
                      showConfirm
                        ? "Hide confirmation password"
                        : "Show confirmation password"
                    }
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      padding: "4px",
                      color: "#7c3aed",
                    }}
                  >
                    {showConfirm ? (
                      <EyeOff size={17} />
                    ) : (
                      <Eye size={17} />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <fieldset className="signup-role-fieldset">
              <legend>
                I am joining as a
              </legend>

              <div className="signup-role-options">
                {["Student", "Teacher"].map(
                  (option) => (
                    <label
                      key={option}
                      className={
                        `signup-role-option${
                          role === option
                            ? " selected"
                            : ""
                        }`
                      }
                    >
                      <input
                        type="radio"
                        name="role"
                        value={option}
                        checked={role === option}
                        onChange={() =>
                          setRole(option)
                        }
                        required
                      />

                      <span className="signup-role-icon">
                        <GraduationCap size={18} />
                      </span>

                      <span>
                        <b>{option}</b>

                        <small>
                          {option === "Student"
                            ? "I want to learn"
                            : "I want to teach"}
                        </small>
                      </span>

                      <span className="signup-role-check">
                        <Check size={12} />
                      </span>
                    </label>
                  )
                )}
              </div>
            </fieldset>

            <label className="signup-terms">
              <input
                type="checkbox"
                name="terms"
                required
              />

              <span>
                I agree to the Terms and Conditions
                and Privacy Policy.
              </span>
            </label>

            {message && (
              <p
                className={
                  `signup-feedback${
                    messageIsError
                      ? " signup-feedback-error"
                      : ""
                  }`
                }
                role={
                  messageIsError
                    ? "alert"
                    : "status"
                }
              >
                {message}
              </p>
            )}

            <button
              className="signup-submit"
              type="submit"
              disabled={loading}
            >
              {loading
                ? "Creating account..."
                : "Create account"}

              {!loading && (
                <ArrowRight size={17} />
              )}
            </button>
          </form>

          <p className="signup-security-note">
            <LockKeyhole size={13} />
            Your registration is securely processed by our backend.
          </p>
        </section>
      </div>

      <footer className="signup-footer">
        Copyright 2026 EduConnect AI
        <span>·</span>
        Learn something new today.
      </footer>
    </main>
  );
}

export default SignupPage;

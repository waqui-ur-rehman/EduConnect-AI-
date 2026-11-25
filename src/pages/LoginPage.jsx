import { useEffect, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Eye,
  EyeOff,
  GraduationCap,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { appendAdminActivityRecord } from "../components/admin/adminData";
import { apiFetch } from "../utils/api";
import {
  clearDevelopmentAdminSession,
  DEV_ADMIN_SESSION_KEY,
  getConfiguredDevelopmentAdminEmail,
  matchesDevelopmentAdminCredentials,
} from "../utils/devAdminSession";
import "./AuthPages.css";

async function loginAccount(email, password) {
  let response;
  try {
    response = await apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw Object.assign(
      new Error("Cannot connect to backend. Please check that it is running."),
      { backendUnavailable: true },
    );
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(
      new Error(data.message || "Login failed. Please try again."),
      { status: response.status },
    );
  }
  if (!data.success || !data.user?.email || !["student", "teacher", "admin"].includes(data.user.role)) {
    throw new Error("Invalid login response from backend.");
  }
  return data;
}

function recordAdminLoginAttempt(email, success, description) {
  try {
    appendAdminActivityRecord({
      actor: email,
      actorRole: "Admin",
      action: success ? "Admin Login" : "Admin Login Failed",
      category: "security",
      module: "Security & Access",
      entityType: "Admin Session",
      entityId: email,
      targetId: email,
      targetName: "Admin sign-in",
      description,
      result: success ? "Success" : "Failed",
    });
  } catch {
    // Sign-in remains available if browser audit storage is unavailable.
  }
}

function findSavedAccount(email) {
  try {
    const users = JSON.parse(window.localStorage.getItem("educonnect.registeredUsers") || "[]");
    return Array.isArray(users)
      ? users.find((user) => String(user?.email || "").trim().toLowerCase() === email)
      : undefined;
  } catch {
    return undefined;
  }
}

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const savedEmail =
    window.localStorage.getItem(
      "educonnect.rememberedEmail"
    ) || "";

  const [email, setEmail] = useState(
    location.state?.registeredEmail || savedEmail
  );

  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(
    Boolean(savedEmail)
  );
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [notice, setNotice] = useState(
    location.state?.registeredEmail
      ? "Registration successful. You can now log in."
      : ""
  );

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setNotice("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      setError("Please enter a valid email address.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    if (password.length < 8) {
      setError(
        "Password must be at least 8 characters."
      );
      return;
    }

    const adminConfig = {
      isDevelopment: import.meta.env.DEV,
      adminEmail: import.meta.env.VITE_ADMIN_EMAIL,
      adminPassword: import.meta.env.VITE_ADMIN_PASSWORD,
    };
    const configuredAdminEmail = getConfiguredDevelopmentAdminEmail(adminConfig);
    const isConfiguredAdminEmail = normalizedEmail === configuredAdminEmail && Boolean(configuredAdminEmail);
    let authenticatedUser;
    let isDevelopmentAdminLogin = false;

    if (isConfiguredAdminEmail) {
      if (!matchesDevelopmentAdminCredentials(normalizedEmail, password, adminConfig)) {
        recordAdminLoginAttempt(
          normalizedEmail,
          false,
          "An Admin sign-in attempt failed its credential check. No password or credential value was stored.",
        );
        setError("That password does not match this account.");
        return;
      }

      setLoading(true);
      try {
        const result = await loginAccount(normalizedEmail, password);
        if (result.user.role !== "admin") {
          throw new Error("This account does not have Admin access.");
        }
        authenticatedUser = result.user;
      } catch (loginError) {
        if (!loginError?.backendUnavailable) {
          recordAdminLoginAttempt(
            normalizedEmail,
            false,
            "Configured Admin credentials were rejected by the backend Admin session endpoint.",
          );
          setError(
            loginError?.status === 401
              ? "This Admin account is not configured in MongoDB with the same credentials."
              : loginError instanceof Error
                ? loginError.message
                : "Admin login failed.",
          );
          setLoading(false);
          return;
        }

        const savedAccount = findSavedAccount(normalizedEmail);
        if (savedAccount && savedAccount.role !== "Admin") {
          recordAdminLoginAttempt(
            normalizedEmail,
            false,
            "An Admin sign-in attempt was blocked because the saved account does not have the Admin role.",
          );
          setError("This account does not have Admin access.");
          setLoading(false);
          return;
        }

        authenticatedUser = { email: configuredAdminEmail, role: "admin" };
        isDevelopmentAdminLogin = true;
      }
      setLoading(false);
    } else {
      setLoading(true);
      try {
        const result = await loginAccount(normalizedEmail, password);
        authenticatedUser = result.user;
      } catch (loginError) {
        setError(loginError instanceof Error ? loginError.message : "Login failed.");
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    const dashboardRole =
      authenticatedUser.role === "admin"
        ? "Admin"
        : authenticatedUser.role === "teacher"
          ? "Teacher"
          : "Student";

    if (dashboardRole === "Admin") {
      recordAdminLoginAttempt(
        authenticatedUser.email,
        true,
        isDevelopmentAdminLogin
          ? "Admin signed in using configured development credentials. Credentials were not recorded."
          : "Admin signed in through the backend API. Credentials were not recorded."
      );
    }

    if (rememberMe) {
      window.localStorage.setItem(
        "educonnect.rememberedEmail",
        email.trim().toLowerCase()
      );
    } else {
      window.localStorage.removeItem(
        "educonnect.rememberedEmail"
      );
    }

    // Compatibility with the existing dashboard UI while it is migrated.
    window.sessionStorage.setItem("educonnect.demoEmail", authenticatedUser.email);
    window.sessionStorage.removeItem("educonnect.authToken");
    if (isDevelopmentAdminLogin) {
      window.sessionStorage.setItem(DEV_ADMIN_SESSION_KEY, "true");
    } else {
      clearDevelopmentAdminSession();
    }

    window.sessionStorage.setItem(
      "educonnect.demoRole",
      dashboardRole
    );

    const dashboardPath =
      dashboardRole === "Admin"
        ? "/admin/dashboard"
        : dashboardRole === "Teacher"
          ? "/teacher/dashboard"
          : "/student/dashboard";

    if (
      authenticatedUser.role !== "Admin" &&
      authenticatedUser.profileSetupShown === false
    ) {
      try {
        const users = JSON.parse(
          window.localStorage.getItem("educonnect.registeredUsers") || "[]"
        );
        if (Array.isArray(users)) {
          const accountIndex = users.findIndex(
            (user) =>
              String(user.email || "").trim().toLowerCase() ===
              String(authenticatedUser.email || "").trim().toLowerCase()
          );
          if (accountIndex >= 0) {
            users[accountIndex].profileSetupShown = true;
            window.localStorage.setItem(
              "educonnect.registeredUsers",
              JSON.stringify(users)
            );
          }
        }
      } catch {
        // Login can continue if account metadata cannot be updated.
      }

      if (authenticatedUser.role === "Teacher") {
        navigate("/teacher/dashboard", {
          replace: true,
          state: { teacherTab: "profile" },
        });
      } else {
        navigate("/student/dashboard", {
          replace: true,
          state: { studentTab: "profile" },
        });
      }
      return;
    }

    navigate(dashboardPath, {
      replace: true,
      ...(dashboardRole === "Student" && typeof location.state?.studentTab === "string"
        ? { state: { studentTab: location.state.studentTab } }
        : {}),
    });
  };

  const handleForgotPassword = () => navigate("/forgot-password");

  return (
    <main className="auth-page">
      <header className="auth-topbar">
        <Link
          className="auth-brand"
          to="/"
          aria-label="EduConnect AI home"
        >
          <span className="auth-brand-icon">
            <GraduationCap size={22} />
          </span>

          <span>
            EduConnect <b>AI</b>
          </span>
        </Link>

        <p>
          New to EduConnect?{" "}
          <Link to="/signup">
            Create account
          </Link>
        </p>
      </header>

      <div className="auth-layout">
        <section className="auth-intro">
          <span className="auth-kicker">
            <BookOpen size={15} />
            LEARNING STARTS HERE
          </span>

          <h1>
            Your learning
            <br />
            journey <em>continues.</em>
          </h1>

          <p>
            Sign in to continue exploring classes,
            subjects, and learning resources.
          </p>

          <div className="auth-points">
            <span>
              <i>
                <BookOpen size={17} />
              </i>
              Pick up where you left off
            </span>

            <span>
              <i>
                <GraduationCap size={18} />
              </i>
              Find resources for your role
            </span>
          </div>

          <div
            className="auth-illustration"
            aria-hidden="true"
          >
            <div className="auth-illustration-book">
              <BookOpen size={34} />
            </div>

            <div className="auth-illustration-note">
              <span>YOUR LEARNING SPACE</span>
              <b>Ready when you are</b>
              <i />
            </div>

            <div className="auth-illustration-cap">
              <GraduationCap size={17} />
            </div>
          </div>
        </section>

        <section className="auth-form-side">
          <div className="auth-form-wrap">
            <span className="auth-mobile-icon">
              <GraduationCap size={21} />
            </span>

            <span className="auth-eyebrow">
              WELCOME BACK
            </span>

            <h2>Log in to your account</h2>

            <p className="auth-description">
              Enter your details to continue learning.
            </p>

            <form
              className="auth-form"
              onSubmit={handleSubmit}
              noValidate
            >
              <label htmlFor="login-email">
                Email address
              </label>

              <div className="auth-input-wrap">
                <Mail size={17} />

                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                />
              </div>

              <div className="auth-password-label">
                <label htmlFor="login-password">
                  Password
                </label>

                <button
                  type="button"
                  className="auth-forgot"
                  onClick={handleForgotPassword}
                >
                  Forgot password?
                </button>
              </div>

              <div className="auth-input-wrap">
                <LockKeyhole size={17} />

                <input
                  id="login-password"
                  name="password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                />

                <button
                  className="auth-eye"
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      (visible) => !visible
                    )
                  }
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {showPassword ? (
                    <EyeOff size={17} />
                  ) : (
                    <Eye size={17} />
                  )}
                </button>
              </div>

              <label className="auth-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) =>
                    setRememberMe(
                      event.target.checked
                    )
                  }
                />

                <span>Remember me</span>
              </label>

              {error && (
                <p
                  className="auth-message auth-error"
                  role="alert"
                >
                  {error}
                </p>
              )}

              {notice && (
                <p
                  className="auth-message auth-notice"
                  role="status"
                >
                  {notice}
                </p>
              )}

              <button
                className="auth-submit"
                type="submit"
                disabled={loading}
              >
                {loading ? "Logging in..." : "Log in"}
                <ArrowRight size={17} />
              </button>
            </form>

            <p className="auth-signup-prompt">
              Don't have an account?{" "}
              <Link to="/signup">
                Sign up
              </Link>
            </p>

            <p className="auth-demo-note">
              Sign in using an account registered with EduConnect AI backend.
            </p>
          </div>
        </section>
      </div>

      <footer className="auth-footer">
        Copyright 2026 EduConnect AI
        <span>·</span>
        Learn something new today.
      </footer>
    </main>
  );
}

export default LoginPage;

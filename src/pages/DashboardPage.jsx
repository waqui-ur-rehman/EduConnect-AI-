
import { useCallback, useEffect, useState } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  GraduationCap,
  LogOut,
  Sparkles,
} from "lucide-react";

import {
  ADMIN_PATH_REDIRECTS,
  ADMIN_ROUTES,
} from "../components/admin/adminNavigation";
import { WorkspaceSidebarProvider } from "../components/workspace/SidebarContext";
import { appendAdminActivityRecord } from "../components/admin/adminData";
import StudentDashboard from "./dashboards/StudentDashboard";
import StudentDashboardHeader from "../components/student/StudentDashboardHeader";
import TeacherDashboard from "./dashboards/TeacherDashboard";
import AdminLayout from "../components/admin/AdminLayout";
import "./AuthPages.css";
import { apiFetch } from "../utils/api";
import { clearContentSession, refreshContent } from "../utils/contentApi";
import { clearDevelopmentAdminSession, isDevelopmentAdminSession } from "../utils/devAdminSession";

const DASHBOARDS = {
  Student: "/student/dashboard",
  Teacher: "/teacher/dashboard",
  Admin: "/admin/dashboard",
};

function DashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const role = window.sessionStorage.getItem("educonnect.demoRole");
  const email = window.sessionStorage.getItem("educonnect.demoEmail");
  const isDevAdminSession = isDevelopmentAdminSession({
    isDevelopment: import.meta.env.DEV,
    adminEmail: import.meta.env.VITE_ADMIN_EMAIL,
    adminPassword: import.meta.env.VITE_ADMIN_PASSWORD,
    role,
    email,
    marker: window.sessionStorage.getItem("educonnect.devAdminSession"),
  });
  const [account, setAccount] = useState(null);
  const [authState, setAuthState] = useState("loading");
  const [retryCount, setRetryCount] = useState(0);
  const refreshAccount = useCallback(() => setRetryCount((value) => value + 1), []);

  useEffect(() => {
    window.addEventListener("focus", refreshAccount);
    const timer = account?.cnicVerification?.status === "pending" ? window.setInterval(refreshAccount, 15000) : null;
    return () => {
      window.removeEventListener("focus", refreshAccount);
      if (timer) window.clearInterval(timer);
    };
  }, [account?.cnicVerification?.status, refreshAccount]);
  const isBlockedAdminRoute = Boolean(email && role && role !== "Admin" && location.pathname.startsWith("/admin/"));

  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    if (!isBlockedAdminRoute) return;
    try {
      appendAdminActivityRecord({
        actor: email,
        actorRole: role,
        action: "Unauthorized Admin Route Access Blocked",
        category: "security",
        module: "Security & Access",
        entityType: "Admin Route",
        entityId: location.pathname,
        targetId: location.pathname,
        targetName: location.pathname,
        previousValue: role,
        newValue: "Blocked",
        description: "Unauthorized Admin route access was blocked.",
        result: "Blocked",
        status: "Blocked",
      });
    } catch { /* Local audit logging must not interrupt navigation */ }
  }, [email, isBlockedAdminRoute, location.pathname, role]);

  useEffect(() => {
    if (!email || !role) {
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const response = await apiFetch("/auth/me", {
          signal: controller.signal,
        });
        if (!response.ok) {
          setAuthState((current) => response.status === 401 || response.status === 403 ? "invalid" : current === "valid" ? current : "error");
          return;
        }
        const data = await response.json();
        const user = data.user;
        if (!user || user.email?.toLowerCase() !== email.toLowerCase() || user.role?.toLowerCase() !== role.toLowerCase()) {
          setAuthState("invalid");
          return;
        }
        setAccount(user);
        if (role !== "Admin") refreshContent(true).catch(console.error);
        setAuthState("valid");
      } catch (error) {
        if (error.name !== "AbortError") {
          if (isDevAdminSession) setAuthState("valid");
          else setAuthState((current) => current === "valid" ? current : "error");
        }
      }
    })();
    return () => controller.abort();
  }, [email, isDevAdminSession, role, retryCount]);

  async function signOut() {
    if (!isDevAdminSession) {
      try {
        const response = await apiFetch("/auth/logout", { method: "POST" });
        if (!response.ok && response.status !== 401) throw new Error("Could not log out. Please try again.");
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Could not log out. Please try again.");
        return;
      }
    }
    try {
      clearContentSession();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not log out. Please try again.");
      return;
    }
    window.sessionStorage.removeItem("educonnect.demoEmail");
    window.sessionStorage.removeItem("educonnect.demoRole");
    window.sessionStorage.removeItem("educonnect.authToken");
    clearDevelopmentAdminSession();
    navigate("/login", { replace: true });
  }

  if (!email || !["Student", "Teacher", "Admin"].includes(role)) {
    return <Navigate to="/login" replace />;
  }
  if (role === "Admin" && ADMIN_PATH_REDIRECTS[location.pathname]) {
    return <Navigate to={ADMIN_PATH_REDIRECTS[location.pathname]} replace />;
  }
  const expectedPath = DASHBOARDS[role];
  const isRoleSubpage = ["Student", "Teacher"].includes(role) && location.pathname.startsWith(`${expectedPath}/`);
  const isAdminSubpage = role === "Admin" && ADMIN_ROUTES.includes(location.pathname);
  if (location.pathname !== expectedPath && !isRoleSubpage && !isAdminSubpage) {
    return <Navigate to={expectedPath} replace />;
  }
  if (authState === "loading") {
    return <main className="auth-page dashboard-page" style={{ padding: 32 }}><p>Verifying your account...</p></main>;
  }
  if (authState === "invalid") {
    return <Navigate to="/login" replace />;
  }
  if (authState === "error") {
    return (
      <main className="auth-page dashboard-page" style={{ padding: 32 }}>
        <h2>Cannot verify your account</h2>
        <p>Check that the backend is running, then try again.</p>
        <button type="button" onClick={() => setRetryCount((value) => value + 1)}>Retry</button>
        <button type="button" onClick={signOut}>Log out</button>
      </main>
    );
  }

  if (role === "Admin") {
    return <AdminLayout email={email} onLogout={signOut} />;
  }

  const welcomeTitle =
    role === "Teacher"
      ? "Welcome to your teaching space."
      : "Welcome to your learning space.";

  const welcomeDescription =
    role === "Teacher"
      ? "Create courses and manage your teaching journey."
      : "Explore courses and continue your learning journey.";

  const dashboardContent = (
    <>
      {role === "Student" ? (
        <StudentDashboardHeader
          email={email}
          fullName={account?.fullName}
          identityVerified={account?.cnicVerification?.status === "verified"}
          onLogout={signOut}
        />
      ) : <header className="auth-topbar">
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

        <div className="dashboard-account">
          <span className="dashboard-account-role">
            {role}
          </span>

          <span>{email}</span>

          <button
            type="button"
            onClick={signOut}
            aria-label="Log out"
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>}

      <div className="dashboard-content">
        <section className="dashboard-welcome">
          <div>
            <span className="auth-eyebrow"><Sparkles size={14} /> YOUR {role.toUpperCase()} DASHBOARD</span>
            <h1>{welcomeTitle}</h1>
            <p>{welcomeDescription}</p>
          </div>
          <div className="dashboard-welcome-icon"><GraduationCap size={48} /></div>
        </section>
        {role === "Student" && <StudentDashboard email={email} account={account} onVerificationSubmitted={refreshAccount} />}
        {role === "Teacher" && (
          <TeacherDashboard
            email={email}
            account={account}
            onVerificationSubmitted={refreshAccount}
            onLogout={signOut}
          />
        )}
        <p className="dashboard-demo-note">Some dashboard content is still stored locally in this browser. Real content permissions must also be enforced by backend APIs.</p>
      </div>

      <footer className="auth-footer">
        Copyright 2026 EduConnect AI
        <span>·</span>
        Learn something new today.
      </footer>
    </>
  );

  return (
    <main
      className={`auth-page dashboard-page ${
        role === "Teacher" ? "teacher-fullscreen-page" : ""
      }`}
    >
      {role === "Student" || role === "Teacher" ? (
        <WorkspaceSidebarProvider
          storageKey={`educonnect.sidebarCollapsed.${role.toLowerCase()}`}
        >
          {dashboardContent}
        </WorkspaceSidebarProvider>
      ) : dashboardContent}
    </main>
  );
}

export default DashboardPage;

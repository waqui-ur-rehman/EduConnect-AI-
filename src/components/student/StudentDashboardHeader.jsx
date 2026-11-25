import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Bell, ChevronDown, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { NOTIFICATIONS_EVENT } from "../../utils/demoNotifications";
import { SidebarTrigger } from "../workspace/WorkspaceSidebar";
import "./StudentDashboardTheme.css";

function readAccount(email) {
  const key = `educonnect.student.${email.trim().toLowerCase()}`;
  try {
    const profile = JSON.parse(localStorage.getItem(`${key}.profile`) || "{}") || {};
    const savedNotifications = JSON.parse(localStorage.getItem(`${key}.notifications`) || "[]");
    const notifications = Array.isArray(savedNotifications) ? savedNotifications : [];
    return { profile, notifications, unread: notifications.filter(item => !item.read).length };
  } catch { return { profile: {}, notifications: [], unread: 0 }; }
}

export default function StudentDashboardHeader({ email, onLogout, fullName, identityVerified = false }) {
  const navigate = useNavigate();
  const [account, setAccount] = useState(() => readAccount(email));
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const menu = useRef(null);
  const notificationMenu = useRef(null);
  useEffect(() => {
    const refresh = () => setAccount(readAccount(email));
    const close = event => {
      if (!menu.current?.contains(event.target)) setMenuOpen(false);
      if (!notificationMenu.current?.contains(event.target)) setNotificationsOpen(false);
    };
    const escape = event => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setNotificationsOpen(false);
      }
    };
    const events = ["storage", "focus", "educonnect:student-header-changed", NOTIFICATIONS_EVENT];
    events.forEach(event => window.addEventListener(event, refresh));
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      events.forEach(event => window.removeEventListener(event, refresh));
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [email]);
  const name = account.profile.fullName?.trim() || fullName || "Student";
  const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join("");
  const recentNotifications = account.notifications.slice(0, 5);
  const openTab = (tab, profileSection) => {
    setMenuOpen(false);
    setNotificationsOpen(false);
    navigate("/student/dashboard", { state: { studentTab: tab, profileSection } });
  };

  return <header className="auth-topbar edc-student-topbar">
    <SidebarTrigger label="student" />
    <div className="edc-student-topbar-actions">
      <button
        type="button"
        className={`edc-student-verification${identityVerified ? " is-verified" : ""}`}
        aria-label={`${identityVerified ? "Verified Profile" : "Verification pending"}. Open Verification in My Profile`}
        onClick={() => openTab("profile", "verification")}
      >
        <ShieldCheck size={15} aria-hidden="true" />
        {identityVerified ? "Verified Profile" : "Verification Pending"}
      </button>
      <div className="edc-topbar-notifications" ref={notificationMenu}>
        <button type="button" className="edc-topbar-bell" aria-label={`Notifications, ${account.unread} unread`} aria-haspopup="dialog" aria-expanded={notificationsOpen} aria-controls="edc-topbar-notification-panel" onClick={() => { setMenuOpen(false); setNotificationsOpen(open => !open); }}><Bell size={21}/>{account.unread > 0 && <span/>}</button>
        {notificationsOpen && <section className="edc-topbar-notification-panel" id="edc-topbar-notification-panel" role="dialog" aria-label="Recent notifications">
          <header><div><strong>Notifications</strong><small>{account.unread ? `${account.unread} unread` : "You're all caught up"}</small></div></header>
          {recentNotifications.length ? <ul>
            {recentNotifications.map(item => <li className={item.read ? "" : "is-unread"} key={item.id}>
              <span className="edc-topbar-notification-dot" aria-hidden="true"/>
              <div><strong>{item.title}</strong><p>{item.message}</p>{item.createdAt && <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>}</div>
            </li>)}
          </ul> : <p className="edc-topbar-notification-empty">No notifications yet.</p>}
          <button type="button" className="edc-topbar-notification-all" onClick={() => openTab("notifications")}>See all notifications <ArrowRight size={15}/></button>
        </section>}
      </div>
      <div className="edc-topbar-account" ref={menu}>
        <button type="button" className="edc-topbar-profile" aria-expanded={menuOpen} aria-label="Open student account menu" onClick={() => { setNotificationsOpen(false); setMenuOpen(!menuOpen); }}><span className="edc-topbar-avatar">{account.profile.avatar ? <img src={account.profile.avatar} alt=""/> : initials}</span><span className="edc-topbar-identity"><strong>{name}</strong><small>Student</small></span><ChevronDown size={16}/></button>
        {menuOpen && <div className="edc-topbar-account-menu"><button type="button" onClick={() => openTab("profile")}><UserRound size={16}/> My Profile</button><button type="button" onClick={onLogout}><LogOut size={16}/> Log Out</button></div>}
      </div>
    </div>
  </header>;
}

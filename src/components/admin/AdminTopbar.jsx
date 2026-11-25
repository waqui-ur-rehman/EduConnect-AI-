import { useEffect, useRef, useState } from "react";
import { Bell, LogOut } from "lucide-react";
import { Link } from "react-router-dom";
import { SidebarTrigger } from "../workspace/WorkspaceSidebar";
import { formatAdminNotificationTimestamp } from "./adminNotificationData";
import { ADMIN_USERS_KEY, readAdminArray } from "./adminData";

function AdminTopbar({
  email,
  onLogout,
  notifications,
  notificationErrors,
}) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationMenuRef = useRef(null);
  const notificationButtonRef = useRef(null);
  const notificationPanelRef = useRef(null);
  const recentNotifications = notifications.slice(0, 5);
  const adminAccount = readAdminArray(ADMIN_USERS_KEY).find((user) => user.role === "Admin" && String(user.email || "").toLowerCase() === String(email || "").toLowerCase());
  const adminName = adminAccount?.name?.trim() || "Admin";
  const adminAvatar = adminAccount?.avatar || adminAccount?.profile?.avatar || "";

  useEffect(() => {
    if (!notificationsOpen) return undefined;

    function handlePointerDown(event) {
      if (!notificationMenuRef.current?.contains(event.target)) {
        setNotificationsOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
        notificationButtonRef.current?.focus();
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    notificationPanelRef.current?.querySelector("a")?.focus();

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [notificationsOpen]);

  return (
    <header className="edc-admin-topbar">
      <div className="edc-admin-topbar-heading">
        <SidebarTrigger label="admin" />
      </div>

      <div className="edc-admin-account">
        <div className="edc-admin-notification-menu" ref={notificationMenuRef}>
          <button
            ref={notificationButtonRef}
            className="edc-admin-notification-bell"
            type="button"
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
            aria-controls="edc-admin-notification-dropdown"
            aria-haspopup="true"
            onClick={() => setNotificationsOpen((open) => !open)}
          >
            <Bell size={19} aria-hidden="true" />
            {notifications.length > 0 && (
              <span className="edc-admin-notification-indicator" aria-hidden="true" />
            )}
          </button>
          {notificationsOpen && (
            <section
              className="edc-admin-notification-dropdown"
              id="edc-admin-notification-dropdown"
              aria-label="Recent pending notifications"
              ref={notificationPanelRef}
            >
              <div className="edc-admin-notification-dropdown-heading">
                <strong>Pending notifications</strong>
                <span>Current review items</span>
              </div>
              {notificationErrors.length > 0 && (
                <p className="edc-admin-notification-dropdown-warning" role="status">
                  Some notification sources could not be read.
                </p>
              )}
              {recentNotifications.length > 0 ? (
                <ul className="edc-admin-notification-dropdown-list">
                  {recentNotifications.map((notification) => {
                    const timestamp = formatAdminNotificationTimestamp(
                      notification.timestamp,
                    );
                    return (
                      <li key={notification.id}>
                        <Link
                          to={notification.path}
                          onClick={() => setNotificationsOpen(false)}
                        >
                          <span className="edc-admin-notification-dropdown-category">
                            {notification.categoryLabel}
                          </span>
                          <strong>{notification.title}</strong>
                          <span className="edc-admin-notification-dropdown-description">
                            {notification.description}
                          </span>
                          {timestamp && (
                            <time
                              dateTime={new Date(notification.timestamp).toISOString()}
                            >
                              {timestamp}
                            </time>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="edc-admin-notification-dropdown-empty">
                  {notificationErrors.length > 0
                    ? "No notifications are available from the readable sources."
                    : "No pending notifications."}
                </p>
              )}
              <Link
                className="edc-admin-notification-dropdown-all"
                to="/admin/notifications"
                onClick={() => setNotificationsOpen(false)}
              >
                View All Notifications
              </Link>
            </section>
          )}
        </div>
        <div className="edc-admin-topbar-user">
          <span>{adminAvatar ? <img src={adminAvatar} alt="" /> : adminName.charAt(0).toUpperCase()}</span>
          <span className="edc-admin-topbar-user-details">
            <strong>{adminName}</strong>
            <small>{adminAccount?.email || email || "Admin account"}</small>
          </span>
        </div>
        <button
          className="edc-admin-logout edc-dashboard-logout"
          type="button"
          onClick={onLogout}
        >
          <LogOut size={17} aria-hidden="true" />
          <span>Log out</span>
        </button>
      </div>
    </header>
  );
}

export default AdminTopbar;

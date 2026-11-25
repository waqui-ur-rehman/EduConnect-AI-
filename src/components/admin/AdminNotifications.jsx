import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Search,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  formatAdminNotificationTimestamp,
} from "./adminNotificationData";

const CATEGORY_FILTERS = [
  { id: "all", label: "All pending reviews" },
  { id: "teacher", label: "Teacher applications" },
  { id: "course", label: "Course reviews" },
  { id: "knowledge", label: "AI knowledge" },
];

function AdminNotifications({ notifications, errors }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const filteredNotifications = useMemo(() => {
    const query = search.trim().toLowerCase();
    return notifications.filter((notification) => {
      const matchesCategory =
        categoryFilter === "all" || notification.category === categoryFilter;
      const searchableText = [
        notification.title,
        notification.description,
        notification.categoryLabel,
        notification.related,
      ]
        .join(" ")
        .toLowerCase();
      return matchesCategory && (!query || searchableText.includes(query));
    });
  }, [categoryFilter, notifications, search]);

  return (
    <section className="edc-admin-notifications-page">
      <div className="edc-admin-notifications-toolbar">
        <label className="edc-admin-search edc-admin-notifications-search">
          <Search size={17} aria-hidden="true" />
          <span className="edc-admin-visually-hidden">Search pending notifications</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, category, or related record"
          />
        </label>

        <div className="edc-admin-notifications-filters" aria-label="Filter notifications">
          {CATEGORY_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={`edc-admin-filter-button${categoryFilter === filter.id ? " edc-admin-filter-button-active" : ""}`}
              aria-pressed={categoryFilter === filter.id}
              onClick={() => setCategoryFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="edc-admin-notifications-context">
        <p>
          This queue reflects records currently marked for review. It does not track read/unread state.
        </p>
        <Link to="/admin/activity-log">View recorded Admin activity</Link>
      </div>

      {errors.length > 0 && (
        <p className="edc-admin-feedback edc-admin-feedback-error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          {errors.join(" ")} Some notification sources may be incomplete.
        </p>
      )}

      {notifications.length === 0 && errors.length === 0 && (
        <div className="edc-admin-applications-empty edc-admin-notifications-empty">
          <span className="edc-admin-applications-empty-icon" aria-hidden="true">
            <Bell size={23} />
          </span>
          <h3>No pending review notifications</h3>
          <p>There are no teacher applications, course reviews, or AI knowledge proposals currently marked for review.</p>
        </div>
      )}

      {notifications.length > 0 && filteredNotifications.length === 0 && (
        <div className="edc-admin-applications-empty edc-admin-notifications-empty">
          <span className="edc-admin-applications-empty-icon" aria-hidden="true">
            <Search size={23} />
          </span>
          <h3>No matching notifications</h3>
          <p>Try a different search term or category filter.</p>
        </div>
      )}

      {filteredNotifications.length > 0 && (
        <ul className="edc-admin-notifications-list">
          {filteredNotifications.map((notification) => {
            const Icon = notification.icon;
            const timestamp = formatAdminNotificationTimestamp(notification.timestamp);
            return (
              <li className="edc-admin-notification-card" key={notification.id}>
                <span className="edc-admin-notification-card-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <div className="edc-admin-notification-card-content">
                  <div className="edc-admin-notification-card-meta">
                    <span className="edc-admin-activity-tag">{notification.categoryLabel}</span>
                    <span className="edc-admin-notification-status">Pending review</span>
                  </div>
                  <h3>{notification.title}</h3>
                  <p>{notification.description}</p>
                  <div className="edc-admin-notification-card-footer">
                    <span>{notification.related}</span>
                    {timestamp && <time dateTime={new Date(notification.timestamp).toISOString()}>{timestamp}</time>}
                  </div>
                </div>
                <Link className="edc-admin-notification-open" to={notification.path}>
                  Open review
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {notifications.length > 0 && (
        <p className="edc-admin-applications-count" aria-live="polite">
          Showing {filteredNotifications.length} of {notifications.length} pending review notification{notifications.length === 1 ? "" : "s"}
        </p>
      )}
    </section>
  );
}

export default AdminNotifications;

import React from "react";
import { Bell, CheckCheck, Trash2, ShoppingBag, BookOpen, Award, MessageCircle, ClipboardList, ListChecks, LifeBuoy } from "lucide-react";
import "./NotificationsCenter.css";

const icons = { purchase: ShoppingBag, lesson: BookOpen, certificate: Award, discussion: MessageCircle, assignment: ClipboardList, quiz: ListChecks, support: LifeBuoy };

export default function NotificationsCenter({ notifications = [], onRead, onReadAll, onDelete, onNavigate, audience = "student" }) {
  const unread = notifications.filter(item => !item.read).length;
  return <div className="edc-tab-content edc-notifications-page">
    <div className="edc-notifications-heading">
      <div><span className="edc-eyebrow">{audience === "teacher" ? "TEACHER UPDATES" : "STUDENT UPDATES"}</span><h2>Notification Center</h2>
        <p>{audience === "teacher" ? "Support ticket replies, assignment submissions and quiz attempts from your students." : "Browser-only demo alerts for support tickets, purchases, lessons, assignments and quizzes."}</p></div>
      <button type="button" className="edc-btn edc-btn-light" onClick={onReadAll} disabled={!unread}>
        <CheckCheck size={17}/> Mark all as read ({unread})
      </button>
    </div>
    {!notifications.length ? <div className="edc-notifications-empty"><Bell size={30}/><h3>No notifications yet</h3>
      <p>{audience === "teacher" ? "Support ticket updates, student assignment submissions and quiz attempts will appear here." : "Support updates, demo purchases, teacher lesson updates, assignments and quizzes will appear here."}</p></div> :
      <div className="edc-notifications-list">{notifications.map(item => {
        const Icon = icons[item.type] || Bell;
        return <article key={item.id} className={`edc-notification-item ${item.read ? "is-read" : "is-unread"}`}>
          <div className="edc-notification-icon"><Icon size={20}/></div>
          <div className="edc-notification-body">
            <div className="edc-notification-title"><strong>{item.title}</strong>{!item.read && <span className="edc-notification-dot" aria-label="Unread"/>}</div>
            <p>{item.message}</p>
            <small>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}</small>
            <div className="edc-notification-actions">
              {!item.read && <button type="button" onClick={() => onRead(item.id)}>Mark as read</button>}
              {item.link && <button type="button" onClick={() => {onRead(item.id);onNavigate(item.link);}}>Open {item.link === "help-support" ? "support tickets" : item.link === "appeals" ? "appeals" : item.link === "orders" ? "purchases" : item.link === "portfolio" ? "certificates" : item.link === "discussions" ? "Q&A" : item.link === "course-assignments" ? "assignments" : item.link === "quizzes" ? "quizzes" : "learning"}</button>}
              <button type="button" onClick={() => onDelete(item.id)} aria-label={`Delete ${item.title}`}><Trash2 size={14}/> Delete</button>
            </div>
          </div>
        </article>;
      })}</div>}
  </div>;
}

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import NotificationsCenter from "./NotificationsCenter";

describe("NotificationsCenter", () => {
  it("renders empty state", () => {
    render(<NotificationsCenter notifications={[]} onRead={() => {}} onReadAll={() => {}} onDelete={() => {}} onNavigate={() => {}} />);
    expect(screen.getByText(/No notifications yet/i)).toBeInTheDocument();
  });

  it("shows notifications and handles actions", () => {
    const onRead = vi.fn();
    const onReadAll = vi.fn();
    const onDelete = vi.fn();
    const onNavigate = vi.fn();
    const notifications = [
      { id: "n1", type: "support", title: "Support reply", message: "Admin replied", link: "help-support", read: false, createdAt: new Date().toISOString() },
    ];
    render(<NotificationsCenter notifications={notifications} onRead={onRead} onReadAll={onReadAll} onDelete={onDelete} onNavigate={onNavigate} />);
    expect(screen.getByText("Support reply")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Mark as read/i));
    expect(onRead).toHaveBeenCalledWith("n1");
    fireEvent.click(screen.getByText(/Open support tickets/i));
    expect(onNavigate).toHaveBeenCalledWith("help-support");
    fireEvent.click(screen.getByLabelText(/Delete Support reply/i));
    expect(onDelete).toHaveBeenCalledWith("n1");
    fireEvent.click(screen.getByText(/Mark all as read/i));
    expect(onReadAll).toHaveBeenCalled();
  });
});

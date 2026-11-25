import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("../../utils/studentProgress", () => ({ getEnrollments: () => [], getProgress: () => ({}) }));
vi.mock("../../utils/studentCart", () => ({ ORDERS_EVENT: "orders", readOrders: () => [] }));

import InstructorAnalytics from "./InstructorAnalytics";

describe("InstructorAnalytics", () => {
  it("shows verified real revenue separately from demo/local revenue", () => {
    render(<InstructorAnalytics email="t@test.com" courses={[]} serverAnalytics={{ summary: { enrolledStudents: 5, completionPercent: 60 }, courses: [] }} earnings={{ summary: { grossSales: 1000, netEarnings: 800, commission: 200, hasVerifiedRealPayments: true, refundedGross: 0, pendingEarnings: 0, paidEarnings: 0 }, byCourse: [] }} />);
    expect(screen.getByText(/Verified Gross Revenue/i)).toBeInTheDocument();
    expect(screen.getAllByText(/PKR/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/No verified live payments yet/i)).not.toBeInTheDocument();
  });

  it("shows honest empty state when no verified real payments exist", () => {
    render(<InstructorAnalytics email="t@test.com" courses={[]} serverAnalytics={null} earnings={{ summary: { grossSales: 0, netEarnings: 0, commission: 0, hasVerifiedRealPayments: false }, byCourse: [] }} />);
    expect(screen.getByText(/Verified Revenue \(Real\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/No verified live payments yet/i).length).toBeGreaterThan(0);
  });
});

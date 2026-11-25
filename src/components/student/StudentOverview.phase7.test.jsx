import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("../../utils/courseDiscussions", () => ({ readDiscussions: () => [], subscribeDiscussions: () => () => {} }));
vi.mock("../../utils/studentRecommendations", () => ({ getPublishedCourses: () => [], getRelatedPublishedCourses: (c) => c, isAcademicProfileComplete: () => false, getCourseReviewSummaries: () => new Map() }));
vi.mock("../../utils/courseReviews", () => ({ getReviews: () => [] }));
vi.mock("../../utils/studentAssignments", () => ({ assignmentKey: () => "a", submissionKey: () => "s" }));
vi.mock("../../assets/welcome.png", () => ({ default: "welcome.png" }));
vi.mock("../../utils/api", () => ({ apiBase: "http://localhost:5173/api" }));

import StudentOverview from "./StudentOverview";

const baseProps = {
  email: "s@test.com",
  profile: { fullName: "Student", interests: [] },
  courses: [],
  publishedCourses: [],
  demoCourses: [],
  activity: { totalSeconds: 0 },
  dailyGoals: [],
  goalProgress: 0,
  wishlist: [],
  legacyTasks: [],
  legacyQuizPasses: 0,
  legacySubmissions: 0,
  onNavigate: () => {},
  onResume: () => {},
  onExplore: () => {},
  onCourseAction: () => {},
  onToggleWishlist: () => {},
  onMetric: () => {},
};

describe("StudentOverview recommendations", () => {
  it("renders all server recommendation sections", () => {
    render(<StudentOverview {...baseProps} serverRecommendations={{
      recommendations: [{ id: "c1", title: "Rec Course", teacherName: "T", category: "Dev", price: 0, reason: "Matches interest" }],
      continueLearning: [{ id: "c2", title: "Continue Course", category: "Dev", progress: 40 }],
      similarCourses: [{ id: "c3", title: "Similar Course", reason: "Similar to your completed courses" }],
      learningPaths: [{ id: "p1", category: "development", courses: [{ id: "c1" }], reason: "Follow this path" }],
      recommendedBooks: [{ id: "b1", title: "Rec Book", category: "Dev", price: 100 }],
      relatedInstructors: [{ email: "t@test.com", name: "Teacher One", rating: 4.5, reasons: ["Related"] }],
    }} />);
    expect(screen.getByText(/Recommended for You/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Continue Learning/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Similar Courses/i)).toBeInTheDocument();
    expect(screen.getByText(/Recommended Learning Paths/i)).toBeInTheDocument();
    expect(screen.getByText(/Recommended Books/i)).toBeInTheDocument();
    expect(screen.getByText(/Related Instructors/i)).toBeInTheDocument();
  });

  it("shows empty recommendation state without crashing", () => {
    render(<StudentOverview {...baseProps} serverRecommendations={{ recommendations: [], continueLearning: [], similarCourses: [], learningPaths: [], recommendedBooks: [], relatedInstructors: [] }} />);
    expect(screen.getByText(/Recommended for You/i)).toBeInTheDocument();
  });
});

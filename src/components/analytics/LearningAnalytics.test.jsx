import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import LearningAnalytics from "./LearningAnalytics";

describe("LearningAnalytics", () => {
  it("renders local fallback metrics", () => {
    render(<LearningAnalytics courses={[{ id: "c1", title: "Course 1", lessons: 4, completedLessons: 2, progress: 50 }]} activity={{ totalSeconds: 120, days: {} }} />);
    expect(screen.getByText(/Learning Analytics & Progress/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Course 1/).length).toBeGreaterThan(0);
  });

  it("renders MongoDB-backed server analytics when provided", () => {
    render(<LearningAnalytics courses={[]} activity={{ totalSeconds: 0, days: {} }} serverAnalytics={{
      summary: { enrolledCourses: 2, completedCourses: 1, totalLessons: 10, completedLessons: 7, overallProgress: 70, quizAttempts: 3, passedQuizzes: 2 },
      courses: [{ courseId: "c1", title: "Server Course", totalLessons: 5, completedLessons: 4, progress: 80 }],
      milestones: [{ title: "First Course Enrolled", earned: true, detail: "done" }],
      quizPerformance: [{ courseId: "c1", courseTitle: "Server Course", submittedAt: new Date().toISOString(), percentage: 90, passed: true }],
      revisionTopics: [{ topic: "Algebra", reason: "Low score" }],
    }} />);
    expect(screen.getAllByText(/Server Course/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Quiz Performance/i)).toBeInTheDocument();
    expect(screen.getByText(/Revision Recommendations/i)).toBeInTheDocument();
    expect(screen.getByText(/Algebra/)).toBeInTheDocument();
  });
});

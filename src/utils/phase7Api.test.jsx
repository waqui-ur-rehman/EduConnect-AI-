import { describe, it, expect, vi, beforeEach } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("./api", () => ({ apiFetch, apiBase: "http://localhost:5173/api" }));

import {
  fetchStudentRecommendations, saveInterestProfile,
  fetchResearchRecords, createResearchRecord, updateResearchRecord, deleteResearchRecord,
  fetchNotifications, markServerNotificationRead, markAllServerNotificationsRead, deleteServerNotification,
  fetchStudentAnalytics, fetchTeacherAnalytics, fetchAdminAnalytics,
  subscribeToNotificationStream,
} from "./phase7Api";

function ok(data) { return { ok: true, status: 200, json: async () => data }; }
function bad(message, status = 400) { return { ok: false, status, json: async () => ({ message }) }; }

describe("phase7Api", () => {
  beforeEach(() => { apiFetch.mockReset(); });

  it("fetches recommendations", async () => {
    apiFetch.mockResolvedValue(ok({ success: true, recommendations: [{ id: "c1" }] }));
    const data = await fetchStudentRecommendations();
    expect(apiFetch).toHaveBeenCalledWith("/recommendations");
    expect(data.recommendations[0].id).toBe("c1");
  });

  it("saves interest profile", async () => {
    apiFetch.mockResolvedValue(ok({ success: true, interests: ["AI"], learningGoals: ["Build apps"] }));
    const data = await saveInterestProfile({ interests: ["AI"], learningGoals: ["Build apps"] });
    expect(apiFetch).toHaveBeenCalledWith("/recommendations/profile", expect.objectContaining({ method: "PUT" }));
    expect(data.interests).toEqual(["AI"]);
  });

  it("throws readable errors", async () => {
    apiFetch.mockResolvedValue(bad("Nope", 403));
    await expect(fetchStudentRecommendations()).rejects.toThrow("Nope");
  });

  it("handles research CRUD", async () => {
    apiFetch.mockResolvedValueOnce(ok({ success: true, records: [{ id: "r1", type: "project", title: "P", payload: {} }] }));
    expect((await fetchResearchRecords())[0].id).toBe("r1");

    apiFetch.mockResolvedValueOnce(ok({ success: true, record: { id: "r2" } }));
    expect((await createResearchRecord({ type: "project", title: "T", payload: {} })).id).toBe("r2");

    apiFetch.mockResolvedValueOnce(ok({ success: true, record: { id: "r2", title: "Updated" } }));
    await updateResearchRecord("r2", { type: "project", title: "Updated", payload: {} });
    expect(apiFetch).toHaveBeenLastCalledWith("/research/records/r2", expect.objectContaining({ method: "PATCH" }));

    apiFetch.mockResolvedValueOnce(ok({ success: true }));
    await deleteResearchRecord("r2");
    expect(apiFetch).toHaveBeenLastCalledWith("/research/records/r2", expect.objectContaining({ method: "DELETE" }));
  });

  it("handles notification actions", async () => {
    apiFetch.mockResolvedValueOnce(ok({ success: true, notifications: [], total: 0 }));
    await fetchNotifications();
    apiFetch.mockResolvedValueOnce(ok({ success: true }));
    await markServerNotificationRead("507f1f77bcf86cd799439011");
    apiFetch.mockResolvedValueOnce(ok({ success: true }));
    await markAllServerNotificationsRead();
    apiFetch.mockResolvedValueOnce(ok({ success: true }));
    await deleteServerNotification("507f1f77bcf86cd799439011");
    expect(apiFetch).toHaveBeenCalledWith("/notifications/read-all", expect.objectContaining({ method: "PATCH" }));
  });

  it("fetches role analytics endpoints", async () => {
    apiFetch.mockResolvedValue(ok({ success: true, summary: {} }));
    await fetchStudentAnalytics();
    await fetchTeacherAnalytics();
    await fetchAdminAnalytics();
    expect(apiFetch).toHaveBeenCalledWith("/analytics/student");
    expect(apiFetch).toHaveBeenCalledWith("/analytics/teacher");
    expect(apiFetch).toHaveBeenCalledWith("/analytics/admin");
  });

  it("subscribes to notification SSE and cleans up", () => {
    const listeners = {};
    class FakeEventSource {
      constructor(url, opts) { this.url = url; this.opts = opts; this.closed = false; }
      addEventListener(name, fn) { listeners[name] = fn; }
      close() { this.closed = true; }
    }
    const orig = globalThis.EventSource;
    globalThis.EventSource = FakeEventSource;
    const onNotification = vi.fn();
    const onReady = vi.fn();
    const close = subscribeToNotificationStream({ onNotification, onReady });
    expect(typeof close).toBe("function");
    listeners.ready({ data: JSON.stringify({ unreadCount: 2 }) });
    expect(onReady).toHaveBeenCalledWith({ unreadCount: 2 });
    listeners.notification({ data: JSON.stringify({ id: "n1", title: "Hi" }) });
    expect(onNotification).toHaveBeenCalledWith({ id: "n1", title: "Hi" });
    close();
    globalThis.EventSource = orig;
  });
});

const { test, expect } = require("@playwright/test");
const { login } = require("./helpers.cjs");

test.describe("Security and permissions", () => {
  test("student cannot access admin dashboard", async ({ page }) => {
    await login(page, "student");
    await expect(page).toHaveURL(/\/student\/dashboard/);
    await page.goto("/admin/dashboard");
    await expect(page).not.toHaveURL(/\/admin\/dashboard$/);
  });

  test("teacher cannot access admin dashboard", async ({ page }) => {
    await login(page, "teacher");
    await expect(page).toHaveURL(/\/teacher\/dashboard/);
    await page.goto("/admin/dashboard");
    await expect(page).not.toHaveURL(/\/admin\/dashboard$/);
  });

  test("student cannot access teacher dashboard", async ({ page }) => {
    await login(page, "student");
    await expect(page).toHaveURL(/\/student\/dashboard/);
    await page.goto("/teacher/dashboard");
    await expect(page).not.toHaveURL(/\/teacher\/dashboard$/);
  });

  test("unauthenticated cannot access student dashboard", async ({ page }) => {
    await page.goto("/student/dashboard");
    await expect(page).toHaveURL(/\/login|\/$/);
  });

  test("student cannot access admin API", async ({ page }) => {
    await login(page, "student");
    await expect(page).toHaveURL(/\/student\/dashboard/);
    const res = await page.request.get("/api/admin/reports/summary", { headers: { "X-Requested-With": "XMLHttpRequest" } });
    expect([401, 403]).toContain(res.status());
  });

  test("teacher cannot access another teacher finance endpoint as admin", async ({ page }) => {
    await login(page, "teacher");
    await expect(page).toHaveURL(/\/teacher\/dashboard/);
    const res = await page.request.get("/api/admin/reports/finance", { headers: { "X-Requested-With": "XMLHttpRequest" } });
    expect([401, 403]).toContain(res.status());
  });
});

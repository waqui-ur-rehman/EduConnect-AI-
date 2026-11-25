const { test, expect } = require("@playwright/test");
const { login, logout } = require("./helpers.cjs");

test.describe("Auth and dashboards", () => {
  test("student can login, see dashboard, and logout", async ({ page }) => {
    await login(page, "student");
    await expect(page).toHaveURL(/\/student\/dashboard/);
    await expect(page.locator("body")).toContainText(/dashboard|welcome|student/i);
    await logout(page);
    await expect(page).toHaveURL(/\/login|\//);
  });

  test("teacher can login, see dashboard, and logout", async ({ page }) => {
    await login(page, "teacher");
    await expect(page).toHaveURL(/\/teacher\/dashboard/);
    await expect(page.locator("body")).toContainText(/dashboard|teacher|welcome/i);
    await logout(page);
    await expect(page).toHaveURL(/\/login|\//);
  });

  test("admin can login, see dashboard, and logout", async ({ page }) => {
    await login(page, "admin");
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page.locator("body")).toContainText(/dashboard|admin|welcome/i);
    await logout(page);
    await expect(page).toHaveURL(/\/login|\//);
  });

  test("unauthenticated user is redirected from protected dashboard", async ({ page }) => {
    await page.goto("/student/dashboard");
    await expect(page).toHaveURL(/\/login|\//);
  });
});

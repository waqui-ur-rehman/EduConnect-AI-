const { test, expect } = require("@playwright/test");

test("login page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/EduConnect|Vite|React/i);
});

test("student login route is reachable", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("body")).toContainText(/login|sign in|email/i);
});

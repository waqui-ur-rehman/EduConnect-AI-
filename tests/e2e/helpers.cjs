const USERS = {
  admin: { email: "e2e.admin@educonnect.test", password: "TestPass123!", role: "admin" },
  teacher: { email: "e2e.teacher@educonnect.test", password: "TestPass123!", role: "teacher" },
  teacher2: { email: "e2e.teacher2@educonnect.test", password: "TestPass123!", role: "teacher" },
  student: { email: "e2e.student@educonnect.test", password: "TestPass123!", role: "student" },
};

async function login(page, userKey) {
  const u = USERS[userKey];
  await page.goto("/login");
  await page.locator("#login-email").fill(u.email);
  await page.locator("#login-password").fill(u.password);
  await page.getByRole("button", { name: /log in/i }).click();
}

async function logout(page) {
  const candidates = [
    page.getByRole("button", { name: /log out|logout|sign out/i }),
    page.locator("button", { hasText: /log out/i }),
    page.locator("[aria-label='Log out']"),
  ];
  for (const loc of candidates) {
    const count = await loc.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const el = loc.nth(i);
      if (await el.isVisible().catch(() => false)) {
        await el.click();
        return;
      }
    }
  }
  // Try opening account/profile menu then logout
  const menuBtn = page.getByRole("button", { name: /account menu|profile menu|user menu/i }).first();
  if (await menuBtn.count().catch(() => 0)) {
    await menuBtn.click().catch(() => {});
    const menuLogout = page.getByRole("menuitem", { name: /log out|logout|sign out/i }).first()
      .or(page.getByRole("button", { name: /log out|logout|sign out/i }).first());
    try {
      await menuLogout.waitFor({ state: "visible", timeout: 3000 });
      await menuLogout.click();
      return;
    } catch {}
  }
  // Last resort: JS click
  const fallback = page.locator("button", { hasText: /log out/i }).first();
  if (await fallback.count().catch(() => 0)) await fallback.evaluate((el) => el.click());
}

module.exports = { USERS, login, logout };

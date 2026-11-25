import test from "node:test";
import assert from "node:assert/strict";
import {
  getConfiguredDevelopmentAdminEmail,
  isDevelopmentAdminSession,
  matchesDevelopmentAdminCredentials,
} from "../../src/utils/devAdminSession.js";

const developmentConfig = {
  isDevelopment: true,
  adminEmail: "Admin@example.test",
  adminPassword: "Development-admin-password",
};

test("development Admin credentials require a configured account and are matched exactly", () => {
  assert.equal(getConfiguredDevelopmentAdminEmail(developmentConfig), "admin@example.test");
  assert.equal(matchesDevelopmentAdminCredentials("ADMIN@example.test", "Development-admin-password", developmentConfig), true);
  assert.equal(matchesDevelopmentAdminCredentials("admin@example.test", "incorrect-password", developmentConfig), false);
  assert.equal(matchesDevelopmentAdminCredentials("other@example.test", "Development-admin-password", developmentConfig), false);
  assert.equal(getConfiguredDevelopmentAdminEmail({ ...developmentConfig, isDevelopment: false }), "");
  assert.equal(getConfiguredDevelopmentAdminEmail({ ...developmentConfig, adminPassword: "" }), "");
});

test("development Admin route session requires the configured identity, Admin role and session marker", () => {
  const session = {
    ...developmentConfig,
    role: "Admin",
    email: "ADMIN@example.test",
    marker: "true",
  };
  assert.equal(isDevelopmentAdminSession(session), true);
  assert.equal(isDevelopmentAdminSession({ ...session, role: "Student" }), false);
  assert.equal(isDevelopmentAdminSession({ ...session, marker: null }), false);
  assert.equal(isDevelopmentAdminSession({ ...session, email: "other@example.test" }), false);
  assert.equal(isDevelopmentAdminSession({ ...session, isDevelopment: false }), false);
});

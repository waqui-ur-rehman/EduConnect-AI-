const { execFileSync } = require("child_process");
const path = require("path");

module.exports = async () => {
  const backendDir = path.resolve(__dirname, "../../backend");
  const seed = path.resolve(backendDir, "tests/helpers/e2eSeed.mjs");
  const out = execFileSync(process.execPath, [seed], {
    cwd: backendDir,
    env: { ...process.env, E2E_MONGO_URI: process.env.E2E_MONGO_URI || "mongodb://127.0.0.1:27017/educonnect_e2e_test" },
    encoding: "utf8",
    timeout: 60000,
  });
  console.log("[e2e] seeded:", out.trim());
};

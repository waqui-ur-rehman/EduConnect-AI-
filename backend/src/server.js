
import "dotenv/config";

import connectDB from "./config/db.js";
import { migrateVerificationRecords } from "./services/verificationRecords.js";
import { validateEnvironment } from "./config/security.js";
import RateLimitCounter from "./models/RateLimitCounter.js";
import { initNotificationRealtime, closeNotificationRealtime } from "./services/notificationRealtime.js";

// A missing mode on the deployment entry point must select secure defaults.
process.env.NODE_ENV ||= "production";
validateEnvironment();
const { default: app } = await import("./app.js");

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

const startServer = async () => {
  await connectDB();
  await RateLimitCounter.init();
  await migrateVerificationRecords();
  await initNotificationRealtime();

  const server = app.listen(PORT, HOST, () => {
    console.log("--------------------------------");
    console.log("EduConnect AI Backend Started");
    console.log(`Listening: ${HOST}:${PORT}`);
    console.log(`Server: http://127.0.0.1:${PORT}`);
    console.log(`Health: http://127.0.0.1:${PORT}/api/health`);
    console.log("--------------------------------");
  });

  const shutdown = async () => {
    try { await closeNotificationRealtime(); } catch {}
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

startServer().catch(() => { console.error("Backend startup failed. Check database and security configuration."); process.exitCode = 1; });

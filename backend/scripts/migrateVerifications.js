import "dotenv/config";
import mongoose from "mongoose";
import { migrateVerificationRecords } from "../src/services/verificationRecords.js";

try {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing in .env");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  const counts = await migrateVerificationRecords();
  console.log("Verification collections ready.");
  console.log("Student records migrated:", counts.students);
  console.log("Teacher records migrated:", counts.teachers);
} catch (error) {
  console.error("Verification migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}


import "dotenv/config";
import mongoose from "mongoose";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import Admin from "../src/models/Admin.js";
import Student from "../src/models/Student.js";
import Teacher from "../src/models/Teacher.js";

const rl = readline.createInterface({
  input: stdin,
  output: stdout
});

async function createAdmin() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing in .env");
  }

  await mongoose.connect(process.env.MONGO_URI);

  console.log("\nEduConnect AI - Admin Setup");
  console.log("----------------------------");

  const fullName = (await rl.question("Admin full name: ")).trim();

  const email = (await rl.question("Admin email: "))
    .trim()
    .toLowerCase();

  const password = await rl.question("Admin password: ");

  if (fullName.length < 2) {
    throw new Error("Admin name must be at least 2 characters");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Invalid email address");
  }

  if (password.length < 12) {
    throw new Error("Password must contain at least 12 characters");
  }

  const exists = await Promise.all([
    Admin.exists({ email }),
    Student.exists({ email }),
    Teacher.exists({ email })
  ]);

  if (exists.some(Boolean)) {
    throw new Error("Email already registered");
  }

  const admin = await Admin.create({
    fullName,
    email,
    password,
    role: "admin",
    isActive: true,
    isVerified: false,
    teacherStatus: "not_applicable"
  });

  console.log("\nAdmin account created successfully!");
  console.log("Email:", admin.email);
  console.log("Role:", admin.role);
  console.log("Collection: admins");
}

try {
  await createAdmin();
} catch (error) {
  console.error("\nError:", error.message);
  process.exitCode = 1;
} finally {
  rl.close();
  await mongoose.disconnect();
}


import { sha256 } from "@noble/hashes/sha2.js";
import {
  bytesToHex,
  utf8ToBytes,
} from "@noble/hashes/utils.js";

const USERS_KEY = "educonnect.registeredUsers";

export function setupDemoAdmin(email, password) {
  if (!import.meta.env.DEV) {
    throw new Error("Demo setup is only available in development.");
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("Enter a valid email.");
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const users = JSON.parse(
    localStorage.getItem(USERS_KEY) || "[]"
  );

  if (!Array.isArray(users)) {
    throw new Error("Invalid account data.");
  }

  if (
    users.some(
      (user) =>
        user.email?.toLowerCase() === normalizedEmail
    )
  ) {
    throw new Error("This email is already registered.");
  }

  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);

  const salt = bytesToHex(saltBytes);

  const passwordHash = bytesToHex(
    sha256(utf8ToBytes(`${salt}:${password}`))
  );

  users.push({
    name: "Demo Administrator",
    email: normalizedEmail,
    role: "Admin",
    salt,
    passwordHash,
    status: "active",
    createdAt: new Date().toISOString(),
  });

  localStorage.setItem(USERS_KEY, JSON.stringify(users));

  return true;
}

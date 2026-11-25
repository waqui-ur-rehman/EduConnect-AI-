import { z } from "zod";

// bcrypt consumes at most 72 UTF-8 bytes. Reject truncation at every entry point.
export const fitsBcrypt = (value) => typeof value === "string" && Buffer.byteLength(value, "utf8") <= 72;
export const passwordInput = (minimum) => z.string().min(minimum).max(72)
  .refine(fitsBcrypt, "Password must be at most 72 UTF-8 bytes.");

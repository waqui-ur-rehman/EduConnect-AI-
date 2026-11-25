import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Keep documents outside all Express static directories and source control.
const here = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(here, "../..");
const STORAGE_DIR = path.join(BACKEND_ROOT, "uploads/cnic");
const RELATIVE_ROOT = "uploads/cnic";
const LEGACY_ROOT = "private/uploads/cnic";
const MAX_DOCUMENT_SIZE = 2 * 1024 * 1024;

// Validate file bytes rather than trusting the browser-supplied MIME label.
export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function safeRelativePath(value) {
  // Never trust a path sent by clients. Only accept our generated filenames.
  if (typeof value !== "string") throw new Error("Invalid document path.");
  // Compatibility for records that stored only a generated file ID.
  if (/^[0-9a-f]{32}$/.test(value)) return `${LEGACY_ROOT}/${value}.enc`;
  if (!/^(?:private\/)?uploads\/cnic\/[0-9a-f]{32}\.(?:bin|enc)$/.test(value)) {
    throw new Error("Invalid private document path.");
  }
  return value;
}
function absolutePath(relativePath) {
  const safePath = safeRelativePath(relativePath);
  if (safePath.startsWith(`${LEGACY_ROOT}/`)) {
    return path.resolve(BACKEND_ROOT, "..", safePath);
  }
  return path.resolve(BACKEND_ROOT, safePath);
}

export async function writePrivateCnic(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32 || buffer.length > MAX_DOCUMENT_SIZE) {
    throw new Error("Invalid document size.");
  }
  const fileId = randomBytes(16).toString("hex");
  await mkdir(STORAGE_DIR, { recursive: true, mode: 0o700 });
  await chmod(STORAGE_DIR, 0o700);
  const relativePath = `${RELATIVE_ROOT}/${fileId}.bin`;
  await writeFile(absolutePath(relativePath), buffer, { flag: "wx", mode: 0o600 });
  return relativePath;
}

export async function readPrivateCnic(relativePath) {
  const safePath = safeRelativePath(relativePath);
  const content = await readFile(absolutePath(safePath));
  if (content.length < 32 || content.length > MAX_DOCUMENT_SIZE) {
    throw new Error("Invalid verification document.");
  }
  if (safePath.endsWith(".enc") && !detectImageType(content)) {
    throw new Error("This legacy encrypted verification document cannot be read as an image.");
  }
  return content;
}

export async function removePrivateCnic(relativePath) {
  if (!relativePath) return;
  try {
    await unlink(absolutePath(relativePath));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

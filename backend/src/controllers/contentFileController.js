import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, stat, unlink } from "node:fs/promises";
import mongoose from "mongoose";
import ContentFile from "../models/ContentFile.js";
import { models, hasAccess } from "../services/contentService.js";

const storageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../uploads/content");
const limits = { video: 250 * 1024 * 1024, pdf: 20 * 1024 * 1024, preview: 5 * 1024 * 1024, image: 1024 * 1024, document: 20 * 1024 * 1024 };
const types = { video: ["video/mp4", "video/webm"], pdf: ["application/pdf"], preview: ["application/pdf"], image: ["image/jpeg", "image/png", "image/webp"] };
types.document = ["application/pdf", "text/plain", "text/markdown", "text/csv", "application/zip", "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ...types.image];
const storage = multer.diskStorage({
  destination: (_req, _file, done) => mkdir(storageRoot, { recursive: true, mode: 0o700 }).then(() => done(null, storageRoot), done),
  filename: (_req, _file, done) => done(null, randomUUID()),
});
const uploaders = Object.fromEntries(Object.keys(limits).map((kind) => [kind, multer({
  storage,
  limits: { fileSize: limits[kind], files: 1, fields: 0, parts: 1 },
  fileFilter: (_req, file, done) => {
    const valid = types[kind].includes(file.mimetype);
    done(valid ? null : new Error("Unsupported upload type."), valid);
  },
}).single("file")]));

function detectedType(buffer, file) {
  if (file && types.document.includes(file.mimetype)) {
    if (["text/plain", "text/markdown", "text/csv"].includes(file.mimetype) && !buffer.includes(0) && /\.(txt|md|csv)$/i.test(file.originalname)) return file.mimetype;
    const zipTypes = {
      ".zip": ["application/zip", "application/x-zip-compressed"],
      ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ".pptx": ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
      ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    };
    if (buffer.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4])) && zipTypes[path.extname(file.originalname).toLowerCase()]?.includes(file.mimetype)) return file.mimetype;
  }
  if (buffer.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer.toString("ascii", 4, 8) === "ftyp") return "video/mp4";
  if (buffer.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))) return "video/webm";
  return null;
}

export function uploadContentFile(req, res, next) {
  const upload = uploaders[req.params.kind];
  if (!upload) return res.status(400).json({ success: false, message: "Unsupported upload type." });
  upload(req, res, async (error) => {
    try {
      if (error) return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ success: false, message: error.message });
      if (!req.file) return res.status(400).json({ success: false, message: "Choose a file." });
      const handle = await open(req.file.path, "r");
      const signature = Buffer.alloc(16);
      try { await handle.read(signature, 0, signature.length, 0); }
      finally { await handle.close(); }
      if (!req.file.size || req.file.size > limits[req.params.kind] || detectedType(signature.subarray(0, Math.min(16, req.file.size)), req.file) !== req.file.mimetype) {
        await unlink(req.file.path);
        return res.status(400).json({ success: false, message: "File contents or size are invalid. Video limit 250 MB, PDF 20 MB, preview 5 MB and image 1 MB." });
      }
      const item = await ContentFile.create({ teacherId: req.user._id, storageName: req.file.filename,
        originalName: path.basename(req.file.originalname).slice(0, 200), mimeType: req.file.mimetype,
        kind: req.params.kind, size: req.file.size });
      res.status(201).json({ success: true, file: { id: String(item._id), name: item.originalName, size: item.size, mimeType: item.mimeType } });
    } catch (failure) {
      if (req.file) await unlink(req.file.path).catch(() => {});
      next(failure);
    }
  });
}

async function allowedFile(file, user, publicImage) {
  if (user && (user.role === "admin" || (user.role === "teacher" && String(user._id) === String(file.teacherId)))) return true;
  const id = String(file._id);
  for (const [kind, Model] of Object.entries(models)) {
    const items = await Model.find({ published: true, approvedVersion: { $ne: null }, status: { $ne: "deleted" }, $or: [
      { "approvedVersion.metadata.thumbnail": id }, { "approvedVersion.metadata.coverFileId": id },
      { "approvedVersion.metadata.pdfFileId": id }, { "approvedVersion.metadata.previewFileId": id },
      { "approvedVersion.lessons.videoFileId": id }, { "approvedVersion.lessons.fileId": id },
      { "approvedVersion.metadata.curriculum.resources.fileId": id },
    ] }).lean();
    for (const item of items) {
      const version = item.approvedVersion;
      // Only approved cover/thumbnail references are public images. Image
      // attachments inside a paid lesson still require preview or enrollment.
      if (file.kind === "image" && [version.metadata.thumbnail, version.metadata.coverFileId].includes(id)) return true;
      if (publicImage || !user) continue;
      if (kind === "book" && version.metadata.previewFileId === id) return true;
      if (kind === "course" && version.lessons.some((lesson) => lesson.isFreePreview && [lesson.videoFileId, lesson.fileId].includes(id))) return true;
      if (await hasAccess(user, kind, item._id)) return true;
    }
  }
  return false;
}

export const serveContentFile = (publicImage = false) => async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid file ID." });
    const file = await ContentFile.findById(req.params.id).lean();
    if (!file || (publicImage && file.kind !== "image")) return res.status(404).json({ success: false, message: "File not found." });
    if (!(await allowedFile(file, req.user, publicImage))) return res.status(403).json({ success: false, message: "Enrollment or purchase required for this approved content." });
    if (!/^[a-f0-9-]{36}$/.test(file.storageName)) throw new Error("Invalid stored file path.");
    const absolute = path.join(storageRoot, file.storageName);
    const { size } = await stat(absolute);
    res.set({ "Content-Type": file.mimeType, "Cache-Control": "private, no-store", "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "cross-origin",
      "Content-Disposition": `${file.kind === "document" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.originalName)}` });
    let start = 0;
    let end = size - 1;
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match || (!match[1] && !match[2])) return res.status(416).set("Content-Range", `bytes */${size}`).end();
      start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return res.status(416).set("Content-Range", `bytes */${size}`).end();
      res.status(206).set("Content-Range", `bytes ${start}-${end}/${size}`);
    }
    res.set("Content-Length", String(end - start + 1));
    const stream = createReadStream(absolute, { start, end });
    stream.on("error", (error) => { if (res.headersSent) res.destroy(); else next(error); });
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  } catch (error) {
    if (error.code === "ENOENT") return res.status(404).json({ success: false, message: "Stored file unavailable." });
    next(error);
  }
};

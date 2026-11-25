import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 2,
    fields: 0,
    parts: 2,
  },
  fileFilter(_req, file, cb) {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) return cb(new Error("Only JPEG, PNG or WebP files are allowed."));
    cb(null, true);
  },
}).fields([
  { name: "cnicFront", maxCount: 1 },
  { name: "cnicBack", maxCount: 1 },
]);

export function uploadCnic(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next();
    return res.status(400).json({
      success: false,
      message: error instanceof multer.MulterError ? "Invalid upload or file too large (maximum 2 MB each)." : error.message,
    });
  });
}

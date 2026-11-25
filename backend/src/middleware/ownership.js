/**
 * Use on authenticated routes after `protect`.
 * Admin access is OFF by default: only explicitly enable it when needed.
 */
export const requireOwner = (ownerIdFromRequest, { allowAdmin = false } = {}) =>
  (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }
    if (allowAdmin && req.user.role === "admin") return next();
    let ownerId;
    try {
      ownerId = ownerIdFromRequest(req);
    } catch {
      return res.status(400).json({ success: false, message: "Invalid owner reference." });
    }
    if (!ownerId) {
      return res.status(400).json({ success: false, message: "Invalid owner reference." });
    }
    if (String(ownerId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }
    return next();
  };

/**
 * For routes like PATCH /courses/:courseId, first load the resource from DB
 * on the server and attach it to req.resource; never trust req.body.ownerId.
 * Example:
 *   router.patch('/:id', protect, loadCourse, requireResourceOwner(), editCourse)
 */
export const requireResourceOwner = ({ allowAdmin = false } = {}) =>
  requireOwner((req) => req.resource?.teacherId ?? req.resource?.ownerId, { allowAdmin });

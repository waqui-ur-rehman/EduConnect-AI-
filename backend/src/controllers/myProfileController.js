import { z } from "zod";

// Deliberately whitelist editable fields: no role, teacherStatus, isVerified,
// password, sessionVersion, CNIC verification or account ownership changes.
const updateMyProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(100)
}).strict();

export async function updateMyProfile(req, res, next) {
  try {
    const parsed = updateMyProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Only a valid fullName can be updated here."
      });
    }
    // This DB write is scoped to authenticated user's own role collection and id.
    const updated = await req.user.constructor.findOneAndUpdate(
      { _id: req.user._id, isActive: true },
      { $set: { fullName: parsed.data.fullName } },
      { new: true, runValidators: true }
    ).select("_id fullName email role avatar");
    if (!updated) {
      return res.status(401).json({ success: false, message: "Session expired." });
    }
    return res.status(200).json({
      success: true,
      message: "Profile updated.",
      user: {
        id: updated._id,
        fullName: updated.fullName,
        email: updated.email,
        role: updated.role,
        avatar: updated.avatar
      }
    });
  } catch (error) {
    next(error);
  }
}

import mongoose from "mongoose";
import { models } from "../services/contentService.js";
import { canEditOwnedResource, canReadOwnedResource } from "../utils/contentAuthorization.js";

export const validObjectId = (value) => mongoose.isValidObjectId(value);
export const loadContent = (type, { edit = false } = {}) => async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid resource ID." });
    const resource = await models[type].findById(req.params.id);
    if (!resource || resource.status === "deleted") return res.status(404).json({ success: false, message: "Content not found." });
    if (edit ? !canEditOwnedResource(req.user, resource) : !canReadOwnedResource(req.user, resource)) return res.status(403).json({ success: false, message: "Access denied." });
    req.contentResource = resource;
    req.contentType = type;
    next();
  } catch (error) { next(error); }
};
export const loadCourseForLesson = (options = {}) => async (req, res, next) => {
  req.params.id = req.params.courseId;
  await loadContent("course", options)(req, res, () => {
    req.parentCourse = req.contentResource;
    next();
  });
};

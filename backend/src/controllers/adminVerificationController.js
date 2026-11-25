import Teacher from "../models/Teacher.js";
import { createVerificationHandlers } from "./identityVerificationController.js";

export const { getPendingVerifications, viewVerificationImage, reviewVerification } = createVerificationHandlers(Teacher);

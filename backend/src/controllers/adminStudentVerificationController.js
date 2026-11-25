import Student from "../models/Student.js";
import { createVerificationHandlers } from "./identityVerificationController.js";

export const { getPendingVerifications, viewVerificationImage, reviewVerification } = createVerificationHandlers(Student);

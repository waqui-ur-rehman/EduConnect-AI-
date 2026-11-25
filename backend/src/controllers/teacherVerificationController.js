import Teacher from "../models/Teacher.js";
import { createVerificationHandlers } from "./identityVerificationController.js";

export const { getVerificationStatus, submitVerification } = createVerificationHandlers(Teacher);

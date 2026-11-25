import Student from "../models/Student.js";
import { createVerificationHandlers } from "./identityVerificationController.js";

export const { getVerificationStatus, submitVerification } = createVerificationHandlers(Student);

import { Router } from "express";
import { handleWebhook } from "../controllers/paymentWebhookController.js";

// Mounted with express.raw BEFORE the JSON body parsers and the browser-CSRF
// middleware: provider callbacks carry no Origin/X-Requested-With, and are
// authenticated by HMAC signature instead. Never use this for browser calls.
const router = Router();
router.post("/:provider", handleWebhook);
export default router;

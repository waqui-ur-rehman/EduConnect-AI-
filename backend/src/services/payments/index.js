// Provider registry. Adapters are constructors-by-import; all expose the same surface:
// config(), readiness(), createCheckout(), verifyCallbackSignature()/verifyWebhookSignature(),
// parseCallback()/parseWebhook(), queryTransactionStatus(), refundPayment().
import * as jazzcash from "./jazzcashAdapter.js";
import * as easypaisa from "./easypaisaAdapter.js";
import * as safepay from "./safepayAdapter.js";
import * as testProvider from "./testAdapter.js";

const registry = { jazzcash, easypaisa, safepay };
if (process.env.NODE_ENV === "test") registry["test-provider"] = testProvider;

export const getAdapter = (name) => registry[String(name || "").trim().toLowerCase()] || null;
export const adapterNames = () => Object.keys(registry);
export { providerStatusSummary, paymentMode, liveEnabled, liveModeActive, providerConfig } from "./providerConfig.js";

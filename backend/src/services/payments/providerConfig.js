// Central payment-mode and provider configuration.
// Mode defaults to sandbox. Live mode requires BOTH PAYMENT_MODE=live and
// PAYMENTS_LIVE_ENABLED=true plus complete credentials for the chosen provider.
// Provider endpoints are env-overridable because official merchant docs must be
// confirmed before going live — the defaults are UNVERIFIED sandbox candidates.

export const paymentMode = () => String(process.env.PAYMENT_MODE || "sandbox").trim().toLowerCase() === "live" ? "live" : "sandbox";
export const liveEnabled = () => String(process.env.PAYMENTS_LIVE_ENABLED || "false").trim().toLowerCase() === "true";
export const liveModeActive = () => paymentMode() === "live" && liveEnabled();

const bool = (value) => String(value || "").trim().toLowerCase() === "true";
const clean = (value) => String(value || "").trim();
const cut = (value, max) => clean(value).slice(0, max);

// Each provider declares its required credentials and (unverified) default endpoints.
// "verified" stays false until a merchant completes sandbox testing against official docs;
// live checkout additionally requires PAYMENTS_LIVE_ENABLED=true.
const DEFINITIONS = {
  jazzcash: {
    credentials: ["JAZZCASH_MERCHANT_ID", "JAZZCASH_PASSWORD", "JAZZCASH_INTEGRITY_SALT"],
    endpoints: {
      sandbox: { createCheckout: "JAZZCASH_CHECKOUT_URL", createCheckoutDefault: "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/" },
      live: { createCheckout: "JAZZCASH_CHECKOUT_URL", createCheckoutDefault: "" },
    },
    verifiedEnv: "JAZZCASH_INTEGRATION_VERIFIED",
    notes: "Form-POST hosted page signed with HMAC-SHA256 (pp_SecureHash). Unverified: confirm endpoints, hash order and field set against the JazzCash merchant integration guide.",
  },
  easypaisa: {
    credentials: ["EASYPAISA_STORE_ID", "EASYPAISA_MERCHANT_CREDENTIALS"],
    endpoints: {
      sandbox: { createCheckout: "EASYPAISA_CHECKOUT_URL", createCheckoutDefault: "https://easypaystg.easypaisa.com.pk/easypay/Index.jsf" },
      live: { createCheckout: "EASYPAISA_CHECKOUT_URL", createCheckoutDefault: "" },
    },
    verifiedEnv: "EASYPAISA_INTEGRATION_VERIFIED",
    notes: "Hosted page flow (eServices). Unverified: confirm store hash algorithm, field names and callback format against Easypaisa merchant documentation.",
  },
  safepay: {
    credentials: ["SAFEPAY_API_KEY", "SAFEPAY_API_SECRET", "SAFEPAY_WEBHOOK_SECRET"],
    endpoints: {
      sandbox: { apiBase: "SAFEPAY_API_BASE_URL", apiBaseDefault: "https://sandbox.api.safepay.io", checkoutUrl: "SAFEPAY_CHECKOUT_URL", checkoutUrlDefault: "" },
      live: { apiBase: "SAFEPAY_API_BASE_URL", apiBaseDefault: "", checkoutUrl: "SAFEPAY_CHECKOUT_URL", checkoutUrlDefault: "" },
    },
    verifiedEnv: "SAFEPAY_INTEGRATION_VERIFIED",
    notes: "JSON API + HMAC-signed webhook. Unverified: confirm session-create path, webhook signature header and payload schema against developer.safepay.io.",
  },
};

export const providerNames = () => Object.keys(DEFINITIONS);
export const isKnownProvider = (name) => Boolean(DEFINITIONS[name]);

function endpointsFor(definition, mode) {
  const source = definition.endpoints[mode] || definition.endpoints.sandbox;
  const resolved = {};
  for (const [key, envName] of Object.entries(source)) {
    if (key.endsWith("Default")) continue;
    const defaultKey = `${key}Default`;
    resolved[key] = cut(process.env[envName], 400) || (mode === "sandbox" ? source[defaultKey] || "" : "");
  }
  return resolved;
}

export function providerConfig(name) {
  const definition = DEFINITIONS[name];
  if (!definition) return null;
  const mode = paymentMode();
  const credentials = Object.fromEntries(definition.credentials.map((key) => [key, cut(process.env[key], 400)]));
  const missing = definition.credentials.filter((key) => !credentials[key]);
  const endpoints = endpointsFor(definition, mode);
  const verified = bool(process.env[definition.verifiedEnv]);
  const liveOk = mode === "sandbox" ? true : liveEnabled();
  const endpointsMissing = Object.entries(endpoints).filter(([, value]) => !value).map(([key]) => key);
  const verifiedFlagMissing = mode === "live" && missing.length === 0 && endpointsMissing.length === 0 && !verified;
  const enabled = missing.length === 0 && endpointsMissing.length === 0 && liveOk && !verifiedFlagMissing;
  const reason = enabled ? ""
    : mode === "live" && verifiedFlagMissing
      ? `live integration is blocked until the sandbox run is verified (set ${definition.verifiedEnv}=true)`
      : liveOk ? "credentials or endpoints are missing" : "live mode requires PAYMENTS_LIVE_ENABLED=true";
  return {
    name, mode, credentials, endpoints, missing, endpointsMissing, verified, liveEnabled: liveEnabled(), reason,
    enabled,
    // Live mode additionally demands the integrator explicitly marks the sandbox run as verified.
    liveReady: mode === "live" && enabled && verified,
    notes: definition.notes,
  };
}

// Public, secret-free summary for the checkout UI.
export function providerStatusSummary() {
  const mode = paymentMode();
  const providers = providerNames().map((name) => {
    const config = providerConfig(name);
    return {
      name,
      mode,
      enabled: config.enabled,
      missing: config.missing,
      endpointMissing: config.endpointsMissing,
      verified: config.verified,
      status: config.enabled
        ? (mode === "live" ? "live" : "sandbox-ready")
        : (mode === "live" && config.missing.length === 0 && config.endpointsMissing.length === 0 ? "live-unverified" : "unconfigured"),
    };
  });
  return { mode, liveEnabled: liveEnabled(), providers };
}

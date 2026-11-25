// Shared helpers to hand the browser off to a provider-hosted checkout.
// Card data, wallet PINs and OTPs NEVER touch this codebase — the provider pages collect them.
import { startPaymentCheckout } from "./marketplaceApi";

// Starts the provider flow for an already-created pending order.
// Returns the checkout response; the caller decides how to present it.
export async function beginProviderCheckout(provider, idempotencyKey, { onHandoff } = {}) {
  const result = await startPaymentCheckout(provider, idempotencyKey);
  if (typeof window === "undefined") return result;
  const handoff = (action) => { if (onHandoff) onHandoff(); action(); };
  if (result?.mode === "form" && result.url && result.fields) {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = result.url;
    form.style.display = "none";
    form.setAttribute("accept-charset", "UTF-8");
    for (const [key, value] of Object.entries(result.fields)) {
      if (value === undefined || value === null) continue;
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = String(value);
      form.appendChild(input);
    }
    document.body.appendChild(form);
    handoff(() => form.submit());
    return result;
  }
  if (result?.url) {
    handoff(() => window.location.assign(result.url));
    return result;
  }
  // No redirect URL (e.g. test adapter): nothing to navigate to — caller polls status.
  return result;
}

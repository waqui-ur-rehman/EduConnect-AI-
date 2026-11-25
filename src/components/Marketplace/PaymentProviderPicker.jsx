import { ShieldCheck } from "lucide-react";
import "./PaymentProviderPicker.css";

const PROVIDERS = [
  { name: "jazzcash", label: "JazzCash", hint: "Pay with your JazzCash mobile account" },
  { name: "easypaisa", label: "Easypaisa", hint: "Pay with your Easypaisa account" },
  { name: "safepay", label: "Safepay", hint: "Card or bank via Safepay secure checkout" },
];

const DEMO_OPTION = {
  name: "demo",
  label: "Demo Payment",
  badge: "D",
  hint: "No real money — development only",
};

// Shared provider selection used by the cart and checkout panels.
// Purple theme preserved; never asks for card details — hands off to the provider.
// The Demo Payment option is only offered when the backend enables demo checkout.
export default function PaymentProviderPicker({ providers = [], mode = "sandbox", selected, onSelect, disabled = false, demoEnabled = false }) {
  const byName = new Map(providers.map((entry) => [entry.name, entry]));
  const options = demoEnabled ? [...PROVIDERS, DEMO_OPTION] : PROVIDERS;
  const enabledOf = (option) =>
    option.name === "demo" ? demoEnabled : Boolean(byName.get(option.name)?.enabled);
  const anyEnabled = options.some(enabledOf);
  const statusOf = (option) => option.name === "demo" ? "development" : (byName.get(option.name)?.status || "unconfigured");
  return (
    <div className="edc-providers" aria-label="Payment method">
      <p className="edc-providers-title">
        <ShieldCheck size={15} /> Secure Payment
        <span className="edc-providers-mode">{mode === "live" ? "Live" : "Sandbox"}</span>
      </p>
      <div className="edc-providers-list" role="radiogroup" aria-label="Choose a payment provider">
        {options.map((option) => {
          const enabled = enabledOf(option);
          const status = statusOf(option);
          const isDemo = option.name === "demo";
          const chosen = selected === option.name;
          return (
            <button
              key={option.name}
              type="button"
              role="radio"
              aria-checked={chosen}
              disabled={disabled || !enabled}
              className={`edc-provider-option${chosen ? " selected" : ""}`}
              onClick={() => onSelect(option.name)}
              title={enabled ? (isDemo ? "Development-only demo checkout — no real payment, no card details" : option.hint) : "This provider has not been set up yet."}
            >
              <span className={`edc-provider-badge ${option.name}`} aria-hidden="true">
                {isDemo ? option.badge : (option.name === "jazzcash" ? "JC" : option.name === "easypaisa" ? "EP" : "SP")}
              </span>
              <span className="edc-provider-text">
                <strong>{option.label}</strong>
                <small>{isDemo ? "No real money — development only" : option.hint}</small>
              </span>
              <span className={`edc-provider-status ${status}`}>
                {isDemo ? "Development only" : status === "sandbox-ready" ? "Sandbox ready" : status === "live" ? "Live" : "Unconfigured"}
              </span>
            </button>
          );
        })}
      </div>
      {!anyEnabled && !demoEnabled && (
        <p className="edc-providers-error" role="status">No payment provider is configured on the server, so paid checkout is unavailable. Free items can still be checked out. An admin must set sandbox merchant credentials in the backend environment to enable JazzCash, Easypaisa or Safepay (see .env.example).</p>
      )}
      {demoEnabled && (
        <p className="edc-providers-note">Demo purchases are recorded for development and testing; no real money is charged and no real bank payout is made.</p>
      )}
      {anyEnabled && (
        <p className="edc-providers-note">Payments are processed on the provider's secure page. EduConnect AI never sees or stores your card, wallet PIN or OTP.</p>
      )}
      {!anyEnabled && demoEnabled && (
        <p className="edc-providers-note">All real providers are unconfigured; use the development-only Demo Payment option to complete this purchase. No real money is charged.</p>
      )}
    </div>
  );
}

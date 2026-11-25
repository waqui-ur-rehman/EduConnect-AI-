import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Clock, GraduationCap, ReceiptText, ShieldCheck, LoaderCircle } from "lucide-react";
import { fetchPaymentOrderStatus, ORDERS_EVENT, CART_CHANGED_EVENT } from "../../utils/marketplaceApi";
import { addDemoNotification } from "../../utils/demoNotifications";
import { getStudentEmail } from "../../utils/studentCart";

const TERMINAL = new Set(["paid", "failed", "cancelled", "refunded", "expired"]);
const POLL_MS = 2500;
const MAX_POLLS = 40; // ~100 seconds

function stateFor(status) {
  switch (status) {
    case "paid": return { tone: "ok", Icon: CheckCircle2, title: "Payment verified", text: "Your purchase is confirmed and access has been unlocked in My Learning and eBooks." };
    case "failed": return { tone: "bad", Icon: XCircle, title: "Payment failed", text: "The provider reported a failed payment. You have not been charged for this order and no access was granted." };
    case "cancelled": return { tone: "bad", Icon: XCircle, title: "Payment cancelled", text: "You cancelled the payment. The order was not completed and no access was granted." };
    case "refunded": return { tone: "warn", Icon: ReceiptText, title: "Payment refunded", text: "This order was refunded. Paid access has been revoked according to the refund policy." };
    case "expired": return { tone: "bad", Icon: Clock, title: "Payment expired", text: "The payment window closed before the provider confirmed payment." };
    default: return { tone: "wait", Icon: Clock, title: "Confirming your payment", text: "Waiting for the provider to confirm. This usually takes a few seconds." };
  }
}

// Secure payment return page. NEVER trusts redirect parameters: the only source of truth
// is the authenticated backend order-status endpoint, polled until a terminal state.
export default function PaymentReturnPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderNumber = String(searchParams.get("order") || "").trim().toUpperCase();
  const validOrder = /^ORD-[A-Z0-9]{8,32}$/.test(orderNumber) ? orderNumber : "";
  const [state, setState] = useState({ status: "pending", data: null, error: "", polls: 0 });
  const notifyOnce = useRef(false);

  useEffect(() => {
    if (!validOrder) return undefined;
    let cancelled = false;
    let timer;
    let attempts = 0;
    const poll = async () => {
      try {
        const data = await fetchPaymentOrderStatus(validOrder);
        if (cancelled) return;
        attempts += 1;
        const status = String(data?.status || "pending").toLowerCase();
        setState((current) => ({ ...current, status, data, error: "", polls: attempts }));
        if (!TERMINAL.has(status) && attempts < MAX_POLLS) timer = setTimeout(poll, POLL_MS);
      } catch (error) {
        if (cancelled) return;
        attempts += 1;
        setState((current) => ({ ...current, error: error.message || "Status could not be loaded.", polls: attempts }));
        if (attempts < MAX_POLLS) timer = setTimeout(poll, POLL_MS);
      }
    };
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [validOrder]);

  // On confirmed payment: refresh marketplace surfaces once and record a notification.
  useEffect(() => {
    if (state.status !== "paid" || notifyOnce.current) return;
    notifyOnce.current = true;
    try { window.dispatchEvent(new Event(ORDERS_EVENT)); } catch { /* noop */ }
    try { window.dispatchEvent(new Event(CART_CHANGED_EVENT)); } catch { /* noop */ }
    try { window.dispatchEvent(new Event("educonnect:content-changed")); } catch { /* noop */ }
    const email = getStudentEmail();
    if (email) {
      const items = (state.data?.items || []).length;
      addDemoNotification("student", email, {
        id: `payment-confirmed-${validOrder}`, type: "purchase",
        title: "Purchase complete",
        message: `Order ${validOrder} (${items} item(s)) was verified by the payment provider. Your access is now unlocked.`,
        createdAt: new Date().toISOString(),
      });
    }
  }, [state.status, state.data, validOrder]);

  const view = stateFor(state.status);
  const { Icon } = view;
  const showSpinner = state.status === "pending" || state.status === "initiated";
  const headline = useMemo(() => (validOrder ? validOrder : "Unknown order"), [validOrder]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "linear-gradient(160deg,#f5f3ff 0%,#ede9fe 100%)", padding: 24, fontFamily: "inherit" }}>
      <section style={{ width: "min(560px, 100%)", background: "#fff", borderRadius: 20, border: "1px solid #e4ddf7", boxShadow: "0 18px 50px rgba(76, 29, 149, .14)", padding: "34px 32px", textAlign: "center" }}>
        <p style={{ display: "inline-flex", alignItems: "center", gap: 6, margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: ".08em", color: "#6d28d9", textTransform: "uppercase" }}><ShieldCheck size={14} /> Secure Payment</p>
        {!validOrder ? (
          <>
            <XCircle size={56} color="#dc2626" style={{ margin: "18px auto 8px" }} />
            <h1 style={{ margin: "0 0 6px", fontSize: 24, color: "#2d1b4e" }}>Invalid return link</h1>
            <p style={{ color: "#6b6280", margin: "0 0 20px" }}>This payment return link is missing a valid order reference.</p>
          </>
        ) : (
          <>
            {showSpinner
              ? <LoaderCircle size={54} color="#7c3aed" style={{ margin: "18px auto 8px", animation: "spin 1.1s linear infinite" }} />
              : <Icon size={56} color={view.tone === "ok" ? "#059669" : view.tone === "warn" ? "#d97706" : "#dc2626"} style={{ margin: "18px auto 8px" }} />}
            <h1 style={{ margin: "0 0 4px", fontSize: 24, color: "#2d1b4e" }}>{view.title}</h1>
            <p style={{ color: "#6b6280", margin: "0 0 4px" }}>{view.text}</p>
            <p style={{ fontSize: 13, color: "#8b83a1", margin: "10px 0 0", fontFamily: "monospace" }}>{headline}</p>
            {state.data?.total !== undefined && (
              <p style={{ fontSize: 15, color: "#3b1f6e", fontWeight: 800, margin: "10px 0 0" }}>{state.data.currency} {Number(state.data.total || 0).toLocaleString()} · {state.data.environment === "live" ? "Live" : "Sandbox"}</p>
            )}
            {state.error && <p style={{ color: "#b91c1c", fontSize: 12, margin: "12px 0 0" }}>{state.error}</p>}
            {showSpinner && state.polls >= MAX_POLLS && (
              <p style={{ color: "#92400e", fontSize: 12, margin: "12px 0 0" }}>The provider has not confirmed yet. You can check again from My Purchases — if the payment went through, access unlocks automatically.</p>
            )}
          </>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 22, flexWrap: "wrap" }}>
          <button type="button" onClick={() => navigate("/student/dashboard")} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#7c3aed", color: "#fff", border: 0, borderRadius: 12, padding: "11px 20px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
            <GraduationCap size={17} /> My Learning
          </button>
          <button type="button" onClick={() => navigate("/student/dashboard", { state: { tab: "orders" } })} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#ede9fe", color: "#5b21b6", border: "1px solid #ddd0f7", borderRadius: 12, padding: "11px 20px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
            <ReceiptText size={17} /> My Purchases
          </button>
        </div>
        <style>{"@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}"}</style>
      </section>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { getCartState, removeFromCart, demoCheckout } from "../../utils/studentCart";
import { fetchPaymentsConfig, fetchPaymentProviders } from "../../utils/marketplaceApi";
import { beginProviderCheckout } from "../../utils/paymentFlow";
import PaymentProviderPicker from "./PaymentProviderPicker";
import "./CartPage.css";

export default function CartPage({ email, onBack, onComplete }) {
  const [cart, setCart] = useState([]);
  const [total, setTotal] = useState(0);
  const [unavailable, setUnavailable] = useState(0);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [paymentNote, setPaymentNote] = useState("");
  const [providers, setProviders] = useState([]);
  const [providersMode, setProvidersMode] = useState("sandbox");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [demoEnabled, setDemoEnabled] = useState(false);
  const idempotencyRef = useRef(null);
  // Free carts (total PKR 0) fulfill server-side without a payment provider, so they stay checkoutable.
  const isFreeOrder = total === 0;

  useEffect(() => {
    let cancelled = false;
    getCartState()
      .then((data) => {
        if (cancelled) return;
        setCart((data.items || []).filter((item) => item.available !== false));
        setTotal(Number(data.total) || 0);
        setUnavailable(Number(data.unavailable) || 0);
      })
      .catch((failure) => { if (!cancelled) setError(failure.message || "Your cart could not be loaded."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    fetchPaymentsConfig()
      .then((config) => {
        if (cancelled) return;
        setDemoEnabled(Boolean(config.demoEnabled));
      })
      .catch(() => {});
    fetchPaymentProviders()
      .then((data) => {
        if (cancelled) return;
        setProvidersMode(data.mode || "sandbox");
        setProviders(Array.isArray(data.providers) ? data.providers : []);
        const firstReady = (data.providers || []).find((entry) => entry.enabled)?.name || "";
        setSelectedProvider((current) => current || firstReady);
      })
      .catch((failure) => { if (!cancelled) setPaymentNote(failure.message || "Payment methods could not be loaded."); });
    return () => { cancelled = true; };
  }, []);

  async function removeCourse(item) {
    try {
      await removeFromCart(email, item);
      const data = await getCartState();
      setCart((data.items || []).filter((entry) => entry.available !== false));
      setTotal(Number(data.total) || 0);
      setUnavailable(Number(data.unavailable) || 0);
    } catch (failure) {
      setError(failure.message || "The item could not be removed.");
    }
  }

  // Development-only sandbox affordance; hidden unless the backend enables demo checkout.
  async function demoCheckoutDemo() {
    setCheckingOut(true);
    setError("");
    try {
      if (!idempotencyRef.current) idempotencyRef.current = `demo-${Date.now()}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
      await demoCheckout(email, idempotencyRef.current);
      idempotencyRef.current = null;
      setCart([]);
      setTotal(0);
      setSuccess(true);
    } catch (failure) {
      idempotencyRef.current = null;
      setError(failure.message || "Demo checkout failed.");
    } finally {
      setCheckingOut(false);
    }
  }

  async function checkout() {
    if (checkingOut) return;
    setCheckingOut(true);
    setError("");
    if (!idempotencyRef.current) idempotencyRef.current = globalThis.crypto?.randomUUID?.() || `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // Free orders skip the provider and fulfill server-side.
    if (isFreeOrder) {
      try {
        await demoCheckout(email, idempotencyRef.current);
        idempotencyRef.current = null;
        setCart([]);
        setTotal(0);
        setSuccess(true);
      } catch (failure) {
        idempotencyRef.current = null;
        setError(failure.message || "Something went wrong placing your order.");
      } finally {
        setCheckingOut(false);
      }
      return;
    }
    const provider = selectedProvider;
    if (!provider) {
      setError("Please choose a payment method to continue. If all providers show as unconfigured, the merchant credentials have not been set up yet.");
      setCheckingOut(false);
      return;
    }
    try {
      await beginProviderCheckout(provider, idempotencyRef.current);
      // Browser is navigating to the provider's hosted page now. Keep the key: on return,
      // a re-click would only reuse the same pending order via server-side idempotency.
    } catch (failure) {
      idempotencyRef.current = null; // Allow a fresh attempt; server-side idempotency remains enforced.
      setError(failure.message || "Payment is not available right now.");
      setCheckingOut(false);
    }
  }

  return (
    <main className="edc-cart-page">
      <button className="edc-cart-back" onClick={onBack} type="button">
        <ArrowLeft size={17} /> Back to Courses
      </button>

      <header className="edc-cart-header">
        <span className="edc-cart-icon"><ShoppingCart size={23} /></span>
        <div>
          <p className="edc-cart-eyebrow">YOUR LEARNING LIST</p>
          <h1>Shopping Cart</h1>
          <p>Review your courses and eBooks before completing checkout.</p>
        </div>
      </header>

      {success ? (
        <section className="edc-cart-success" role="status">
          <span className="edc-cart-success-icon"><CheckCircle2 size={34} /></span>
          <h2>Purchase complete!</h2>
          <p>Your items are ready in My Learning and My eBooks.</p>
          <button className="edc-cart-primary" onClick={onComplete} type="button">
            Go to My Learning <GraduationCap size={18} />
          </button>
        </section>
      ) : loading ? (
        <section className="edc-cart-empty">
          <span className="edc-cart-empty-icon"><ShoppingCart size={30} /></span>
          <h2>Loading your cart…</h2>
        </section>
      ) : cart.length === 0 ? (
        <section className="edc-cart-empty">
          <span className="edc-cart-empty-icon"><ShoppingCart size={30} /></span>
          <h2>Your cart is empty</h2>
          <p>Find a course you like and add it here to continue.</p>
          <button className="edc-cart-primary" onClick={onBack} type="button">
            Explore courses <BookOpen size={18} />
          </button>
        </section>
      ) : (
        <div className="edc-cart-layout">
          <section className="edc-cart-items" aria-label="Items in your cart">
            <div className="edc-cart-items-heading">
              <h2>Items</h2>
              <span>{cart.length} {cart.length === 1 ? "item" : "items"}</span>
            </div>

            {unavailable > 0 && <p className="edc-cart-error" role="status">{unavailable} item(s) were removed because they are no longer available.</p>}

            {cart.map((course) => (
              <article className="edc-cart-course" key={`${course.itemType || "course"}:${course.id}`}>
                <div className="edc-cart-course-image">
                  {course.thumbnail ? (
                    <img src={course.thumbnail} alt="" />
                  ) : (
                    <GraduationCap size={29} />
                  )}
                </div>
                <div className="edc-cart-course-info">
                  <span className="edc-cart-course-category">{course.category || "Course"}</span>
                  <h3>{course.title}</h3>
                  <p>By {course.instructor}</p>
                  <span className="edc-cart-course-lessons">
                    <BookOpen size={14} /> {course.itemType === "book" ? "eBook" : "Course"}
                  </span>
                </div>
                <div className="edc-cart-course-actions">
                  <strong>PKR {(Number(course.price) || 0).toLocaleString()}</strong>
                  <button
                    className="edc-cart-remove"
                    onClick={() => removeCourse(course)}
                    type="button"
                    aria-label={`Remove ${course.title} from cart`}
                  >
                    <Trash2 size={15} /> Remove
                  </button>
                </div>
              </article>
            ))}
          </section>

          <aside className="edc-cart-summary">
            <h2>Order Summary</h2>
            <div className="edc-cart-summary-row">
              <span>Items</span><span>{cart.length}</span>
            </div>
            <div className="edc-cart-summary-row">
              <span>Subtotal</span><span>PKR {total.toLocaleString()}</span>
            </div>
            <div className="edc-cart-total">
              <span>Total</span><strong>PKR {total.toLocaleString()}</strong>
            </div>
            {!isFreeOrder && (
              <PaymentProviderPicker
                providers={providers}
                mode={providersMode}
                selected={selectedProvider}
                onSelect={setSelectedProvider}
                disabled={checkingOut}
              />
            )}
            {isFreeOrder && <p className="edc-cart-demo-note">This cart contains only free items — no payment is required.</p>}
            {paymentNote && providers.length === 0 && <p className="edc-cart-demo-note" role="status">{paymentNote}</p>}
            {error && <p className="edc-cart-error" role="alert">{error}</p>}
            <button className="edc-cart-primary edc-cart-checkout" onClick={checkout} type="button" disabled={checkingOut || (!isFreeOrder && !selectedProvider)}>
              {checkingOut ? "Processing…" : isFreeOrder ? "Complete Checkout (Free)" : "Pay Securely"}
            </button>
            {!isFreeOrder && demoEnabled && (
              <button type="button" disabled={checkingOut} onClick={demoCheckoutDemo} style={{ marginTop: 8, background: "none", border: 0, color: "#7c3aed", fontSize: 12, fontWeight: 700, cursor: checkingOut ? "not-allowed" : "pointer", textDecoration: "underline" }}>
                Demo Payment — No Real Money (Test Only)
              </button>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}

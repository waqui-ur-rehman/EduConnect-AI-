import { fetchCart, addToCartApi, removeFromCartApi, clearCartApi, checkoutApi, demoCheckoutApi, fetchOrders, cancelOrderApi, ORDERS_EVENT } from "./marketplaceApi";
import { getContentState } from "./contentApi";

const enrollmentKey = (email) => `educonnect.student.${email}.enrollments`;
export { ORDERS_EVENT };

function readList(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function getStudentEmail() {
  const role = sessionStorage.getItem("educonnect.demoRole");
  const email = sessionStorage.getItem("educonnect.demoEmail");
  return role === "Student" && email ? email.toLowerCase() : null;
}

// MongoDB is the source of truth for cart items. Legacy localStorage cart records
// are intentionally kept untouched as historical data but are no longer read.
export async function getCart() {
  try {
    const data = await fetchCart();
    return (data.items || []).filter((item) => item.available !== false);
  } catch {
    return [];
  }
}

export async function getCartState() {
  try {
    return await fetchCart();
  } catch {
    return { items: [], total: 0, currency: "PKR", unavailable: 0 };
  }
}

const kindOf = (item) => (item?.itemType === "book" ? "book" : "course");
const idOf = (item) => String(item?.contentId || item?.id || "");

// Returns true when the item was added (or was already present), false when unavailable.
export async function addToCart(_email, item) {
  try {
    await addToCartApi([{ kind: kindOf(item), contentId: idOf(item) }]);
    return true;
  } catch (error) {
    if (error.status === 409 && Array.isArray(error.unavailable)) return false;
    throw error;
  }
}

// Accepts an item object or a bare content ID (courses only).
export async function removeFromCart(_email, item) {
  const kind = typeof item === "object" && item !== null ? kindOf(item) : "course";
  const id = typeof item === "object" && item !== null ? idOf(item) : String(item);
  await removeFromCartApi(kind, id);
}

export async function clearCart() {
  await clearCartApi();
}

// Adds cart items to an order. Free carts fulfill immediately; paid carts require payment.
// idempotencyKey makes repeated checkout clicks safe.
export async function checkout(idempotencyKey) {
  const created = await checkoutApi(idempotencyKey);
  return created.order;
}

// Dev/test sandbox only: marks a pending sandbox order paid. In production this
// always fails with 403 until a real payment provider is configured server-side.
export async function demoCheckout(_email, idempotencyKey) {
  const created = await checkoutApi(idempotencyKey);
  const order = created.order;
  if (order.status !== "pending") return order;
  return demoCheckoutApi(order.orderNumber);
}

export const cancelOrder = (_email, orderNumber) => cancelOrderApi(orderNumber);

export async function getEnrollments(email) {
  if (!email) return [];
  const saved = readList(enrollmentKey(email));
  const state = getContentState();
  if (state.role !== "student" || state.email?.toLowerCase() !== email.toLowerCase()) return saved;
  const records = state.courses.filter((course) => state.accesses.some((entry) => entry.kind === "course" && String(entry.contentId) === String(course.id)));
  return [...saved.filter((item) => !records.some((course) => String(course.id) === String(item.id))), ...records.map((record) => {
    const progress = saved.find((item) => String(item.id) === String(record.id));
    return { ...record, completedLessons: progress?.completedLessons || 0, progress: progress?.progress || 0, enrolledAt: progress?.enrolledAt || record.createdAt };
  })];
}

// Real orders from MongoDB (newest first), mapped to the shape the UI expects.
export async function getStudentOrders() {
  try {
    return await fetchOrders();
  } catch {
    return [];
  }
}

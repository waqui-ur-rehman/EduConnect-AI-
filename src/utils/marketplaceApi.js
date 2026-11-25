import { apiFetch } from "./api";
import { contentFileUrl } from "./contentApi";

export const CART_CHANGED_EVENT = "educonnect:cart-changed";
export const ORDERS_EVENT = "educonnect:orders-changed";

async function request(path, options = {}, base = "/marketplace") {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await apiFetch(`${base}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.message || "The request could not be completed."), { status: response.status, unavailable: data.unavailable, code: data.code });
  return data;
}
const notify = () => {
  window.dispatchEvent(new Event(CART_CHANGED_EVENT));
  window.dispatchEvent(new Event(ORDERS_EVENT));
  window.dispatchEvent(new Event("educonnect:content-changed"));
  window.dispatchEvent(new Event("educonnect:teacher-courses-changed"));
  window.dispatchEvent(new Event("educonnect:books-changed"));
};
const normalizeItem = (item) => ({ ...item,
  thumbnail: item.thumbnail ? contentFileUrl(item.thumbnail, true) : item.thumbnail,
});
const normalizeCart = (data) => ({ ...data, items: (data.items || []).map(normalizeItem) });

export async function fetchCart() {
  return normalizeCart(await request("/cart"));
}
export async function addToCartApi(items) {
  const data = normalizeCart(await request("/cart", { method: "POST", body: JSON.stringify({ items }) }));
  notify();
  return data;
}
export async function removeFromCartApi(kind, contentId) {
  const data = normalizeCart(await request(`/cart/${encodeURIComponent(kind)}/${encodeURIComponent(contentId)}`, { method: "DELETE" }));
  notify();
  return data;
}
export async function clearCartApi() {
  const data = normalizeCart(await request("/cart", { method: "DELETE" }));
  notify();
  return data;
}
export async function checkoutApi(idempotencyKey) {
  const body = idempotencyKey ? { idempotencyKey } : {};
  const data = await request("/orders/checkout", { method: "POST", body: JSON.stringify(body) });
  notify();
  return data; // { order, alreadyCreated }
}
export async function fetchOrders() {
  const data = await request("/orders");
  return data.orders || [];
}
export async function cancelOrderApi(orderNumber) {
  const data = await request(`/orders/${encodeURIComponent(orderNumber)}/cancel`, { method: "POST" });
  notify();
  return data.order;
}
export async function demoCheckoutApi(orderNumber) {
  const data = await request(`/payments/demo-checkout/${encodeURIComponent(orderNumber)}`, { method: "POST", body: JSON.stringify({}) });
  notify();
  return data.order;
}
export async function fetchPaymentsConfig() {
  return request("/payments/config");
}
export async function fetchPaymentProviders() {
  return request("/providers", {}, "/payments");
}
// { provider, idempotencyKey } -> starts the hosted/provider-controlled checkout.
// Never collects card data. Caller handles 'form' (auto-submit) or 'redirect' modes.
export async function startPaymentCheckout(provider, idempotencyKey) {
  return request("/checkout", { method: "POST", body: JSON.stringify({ provider, idempotencyKey }) }, "/payments");
}
export async function fetchPaymentOrderStatus(orderNumber) {
  return request(`/orders/${encodeURIComponent(orderNumber)}/status`, {}, "/payments");
}
export async function fetchMyEarnings() {
  return request("/earnings");
}
export async function fetchAdminFinanceOverview() {
  return request("/finance/overview");
}

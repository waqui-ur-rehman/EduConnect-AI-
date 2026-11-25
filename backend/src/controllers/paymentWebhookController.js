import Order from "../models/Order.js";
import PaymentEvent from "../models/PaymentEvent.js";
import { fulfillOrder, refundOrder, providerName, verifyWebhookSignature } from "../services/paymentService.js";

// Signature-verified provider callbacks. No card data, no credentials.
// Replay-safe via PaymentEvent unique (provider, eventId).
export async function handleWebhook(req, res, next) {
  try {
    const provider = String(req.params.provider || "").trim().toLowerCase();
    if (provider !== providerName()) return res.status(400).json({ success: false, message: "Unknown payment provider." });
    if (!process.env.PAYMENT_WEBHOOK_SECRET) {
      return res.status(503).json({ success: false, message: "Payment provider is not configured." });
    }
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === "string" ? req.body : "");
    if (verifyWebhookSignature(raw, req.get("x-educonnect-signature")) !== true) {
      return res.status(401).json({ success: false, message: "Signature verification failed." });
    }
    let event;
    try { event = JSON.parse(raw.toString("utf8")); } catch { return res.status(400).json({ success: false, message: "Malformed webhook payload." }); }
    const { eventId, type, orderNumber, transactionId, amount, currency } = event || {};
    if (typeof eventId !== "string" || !eventId.trim() || eventId.length > 200) {
      return res.status(400).json({ success: false, message: "Missing or invalid event ID." });
    }
    if (typeof type !== "string" || !type.trim() || type.length > 80) {
      return res.status(400).json({ success: false, message: "Missing or invalid event type." });
    }
    try {
      await PaymentEvent.create({ provider, eventId: eventId.trim(), type: type.trim(), orderNumber: typeof orderNumber === "string" ? orderNumber.trim().slice(0, 40) : "", result: "ignored" });
    } catch (error) {
      if (error.code === 11000) return res.json({ received: true, alreadyProcessed: true });
      throw error;
    }
    const mark = (result) => PaymentEvent.updateOne({ provider, eventId: eventId.trim() }, { $set: { result } });
    const order = typeof orderNumber === "string" && orderNumber.trim()
      ? await Order.findOne({ orderNumber: orderNumber.trim() })
      : null;
    if (!order) { await mark("rejected"); return res.status(400).json({ success: false, message: "Unknown order reference." }); }

    if (type === "payment.succeeded") {
      const amountValue = Number(amount);
      const currencyOk = String(currency || "").trim().toUpperCase() === order.currency;
      const amountOk = Number.isFinite(amountValue) && Math.abs(amountValue - order.total) < 0.005;
      const transactionOk = typeof transactionId === "string" && /^[\w.\-]{4,200}$/.test(transactionId);
      if (!amountOk || !currencyOk || !transactionOk) {
        await mark("rejected");
        return res.status(400).json({ success: false, message: "Payment details do not match the order." });
      }
      if (order.status === "paid") { await mark("processed"); return res.json({ received: true, alreadyProcessed: true }); }
      if (order.status !== "pending") { await mark("rejected"); return res.status(409).json({ success: false, message: "Order is not awaiting payment." }); }
      if (order.providerTransactionId && order.providerTransactionId !== transactionId) {
        await mark("rejected");
        return res.status(409).json({ success: false, message: "A different transaction is already recorded for this order." });
      }
      order.provider = provider;
      order.providerTransactionId = transactionId;
      await order.save();
      await fulfillOrder(order);
      await mark("processed");
      return res.json({ received: true, result: "processed" });
    }

    if (type === "payment.failed") {
      const update = { status: "failed", provider };
      if (typeof transactionId === "string" && transactionId.trim()) update.providerTransactionId = transactionId.trim().slice(0, 200);
      await Order.updateOne({ _id: order._id, status: "pending" }, { $set: update });
      await mark("processed");
      return res.json({ received: true, result: "processed" });
    }

    if (type === "payment.refunded") {
      if (order.status !== "paid") { await mark("rejected"); return res.status(409).json({ success: false, message: "Only a paid order can be refunded." }); }
      await refundOrder(order, transactionId);
      await mark("processed");
      return res.json({ received: true, result: "processed" });
    }

    await mark("ignored");
    return res.json({ received: true, result: "ignored" });
  } catch (error) {
    next(error);
  }
}

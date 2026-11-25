import mongoose from "mongoose";
import { z } from "zod";
import CartItem from "../models/CartItem.js";
import Order from "../models/Order.js";
import Teacher from "../models/Teacher.js";
import TeacherEarning from "../models/TeacherEarning.js";
import Course from "../models/Course.js";
import ContentAccess from "../models/ContentAccess.js";
import PaymentEvent from "../models/PaymentEvent.js";
import {
  COMMISSION_RATE,
  MARKETPLACE_CURRENCY,
  buildOrderItems,
  cartFingerprint,
  createPendingOrderForCart,
  demoCheckoutAllowed,
  fulfillOrder,
  paymentStatusSummary,
  priceOf,
  uniqueOrderNumber,
  visible,
} from "../services/paymentService.js";
import { models } from "../services/contentService.js";

const idOk = (value) => mongoose.isValidObjectId(value);
const fail = (res, code, message, extra = {}) => res.status(code).json({ success: false, message, ...extra });
const handle = (action) => async (req, res, next) => {
  try { await action(req, res); }
  catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, message: "Invalid fields or values.", issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })) });
    if (error.status) return res.status(error.status).json({ success: false, message: error.message, ...(error.unavailable ? { unavailable: error.unavailable } : {}) });
    next(error);
  }
};
const itemSchema = z.object({ kind: z.enum(["course", "book"]), contentId: z.string().refine(idOk, "Invalid content ID.") }).strict();

async function teacherNames(teacherIds) {
  const ids = [...new Set(teacherIds.map(String))];
  const teachers = await Teacher.find({ _id: { $in: ids } }).select("fullName").lean();
  return new Map(teachers.map((teacher) => [String(teacher._id), teacher.fullName || "Teacher"]));
}
const presentItem = (item, names) => ({
  kind: item.kind,
  itemType: item.kind,
  id: String(item.contentId),
  contentId: String(item.contentId),
  title: item.title,
  instructor: item.teacherId ? (names.get(String(item.teacherId)) || "Teacher") : "Teacher",
  teacherId: item.teacherId ? String(item.teacherId) : undefined,
  price: item.price,
  currency: item.currency,
});
const presentOrder = (order, names) => ({
  id: order.orderNumber,
  orderNumber: order.orderNumber,
  status: order.status,
  total: order.total,
  currency: order.currency,
  provider: order.provider || "",
  providerTransactionId: order.providerTransactionId || "",
  items: (order.items || []).map((item) => presentItem(item, names)),
  paymentMethod: order.provider ? `${order.provider} (verified)` : (order.status === "paid" ? "Verified payment" : "Awaiting payment"),
  createdAt: order.createdAt,
  purchasedAt: order.paidAt || order.createdAt,
  paidAt: order.paidAt || null,
  cancelledAt: order.cancelledAt || null,
  refundedAt: order.refundedAt || null,
});

async function cartView(studentId) {
  const cartItems = await CartItem.find({ studentId }).sort({ createdAt: 1 }).lean();
  const teacherIdList = [];
  const entries = [];
  for (const item of cartItems) {
    const doc = await models[item.kind].findOne({ _id: item.contentId, ...visible });
    if (!doc) { entries.push({ kind: item.kind, contentId: String(item.contentId), available: false, title: "Unavailable item", instructor: "", price: 0, currency: MARKETPLACE_CURRENCY(), itemType: item.kind, id: String(item.contentId) }); continue; }
    const meta = doc.approvedVersion?.metadata || {};
    const teacherId = doc.teacherId ? String(doc.teacherId) : "";
    if (teacherId) teacherIdList.push(teacherId);
    entries.push({
      kind: item.kind, itemType: item.kind, id: String(doc._id), contentId: String(doc._id),
      title: doc.approvedVersion?.title || doc.title || "Untitled", instructor: "", teacherId,
      category: meta.category || (item.kind === "book" ? "eBook" : "General"),
      thumbnail: meta.thumbnail || meta.coverFileId || "",
      price: priceOf(doc), currency: MARKETPLACE_CURRENCY(), available: true, isFree: priceOf(doc) === 0,
    });
  }
  const names = await teacherNames(teacherIdList);
  const items = entries.map((entry) => (entry.teacherId ? { ...entry, instructor: names.get(entry.teacherId) || "Teacher" } : entry));
  const total = items.filter((item) => item.available).reduce((sum, item) => sum + item.price, 0);
  return { items, total, currency: MARKETPLACE_CURRENCY(), unavailable: items.filter((item) => !item.available).length };
}

export const getCart = handle(async (req, res) => {
  res.json({ success: true, ...(await cartView(req.user._id)) });
});

export const addToCart = handle(async (req, res) => {
  const { items } = z.object({ items: z.array(itemSchema).min(1).max(50) }).strict().parse(req.body);
  const unavailable = [];
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const key = `${item.kind}:${item.contentId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  for (const item of unique) {
    const doc = await models[item.kind].findOne({ _id: item.contentId, ...visible });
    if (!doc) unavailable.push(String(item.contentId));
  }
  if (unavailable.length) return fail(res, 409, "Some items are not approved or published.", { unavailable });
  for (const item of unique) {
    await CartItem.updateOne(
      { studentId: req.user._id, kind: item.kind, contentId: item.contentId },
      { $setOnInsert: { studentId: req.user._id, kind: item.kind, contentId: item.contentId } },
      { upsert: true },
    ).catch((error) => { if (error.code !== 11000) throw error; });
  }
  res.status(201).json({ success: true, ...(await cartView(req.user._id)) });
});

export const removeFromCart = handle(async (req, res) => {
  const kind = String(req.params.kind || "");
  const contentId = String(req.params.contentId || "");
  if (!["course", "book"].includes(kind) || !idOk(contentId)) return fail(res, 400, "Invalid cart item.");
  await CartItem.deleteOne({ studentId: req.user._id, kind, contentId });
  res.json({ success: true, ...(await cartView(req.user._id)) });
});

export const clearCart = handle(async (req, res) => {
  await CartItem.deleteMany({ studentId: req.user._id });
  res.json({ success: true, items: [], total: 0, currency: MARKETPLACE_CURRENCY(), unavailable: 0 });
});

export const checkout = handle(async (req, res) => {
  const { idempotencyKey } = z.object({ idempotencyKey: z.string().trim().min(8).max(128).optional() }).strict().parse(req.body);
  if (idempotencyKey) {
    const existing = await Order.findOne({ studentId: req.user._id, idempotencyKey }).lean();
    if (existing) {
      const names = await teacherNames((existing.items || []).map((item) => item.teacherId));
      return res.json({ success: true, order: presentOrder(existing, names), alreadyCreated: true });
    }
  }
  const cartItems = await CartItem.find({ studentId: req.user._id }).lean();
  if (!cartItems.length) return fail(res, 400, "Your cart is empty.");
  let created;
  try {
    created = await createPendingOrderForCart(req.user._id, idempotencyKey);
  } catch (error) {
    if (error.status) return fail(res, error.status, error.message, error.unavailable ? { unavailable: error.unavailable } : {});
    throw error;
  }
  let order = await Order.findById(created.order._id);
  if (order.total === 0 && order.status === "pending") {
    await fulfillOrder(order, { method: "free-order", detail: "Zero-total cart fulfilled at checkout" });
    order = await Order.findById(order._id);
  }
  const fresh = order.toObject();
  const names = await teacherNames((fresh.items || []).map((item) => item.teacherId));
  res.status(created.alreadyCreated ? 200 : 201).json({ success: true, order: presentOrder(fresh, names), alreadyCreated: created.alreadyCreated });
});

export const listOrders = handle(async (req, res) => {
  const orders = await Order.find({ studentId: req.user._id }).sort({ createdAt: -1 }).limit(50).lean();
  const names = await teacherNames(orders.flatMap((order) => (order.items || []).map((item) => item.teacherId)));
  res.json({ success: true, orders: orders.map((order) => presentOrder(order, names)) });
});

export const getOrder = handle(async (req, res) => {
  const orderNumber = String(req.params.orderNumber || "").trim();
  if (!/^ORD-[A-Z0-9]{8,32}$/i.test(orderNumber)) return fail(res, 400, "Invalid order number.");
  const order = await Order.findOne({ orderNumber, studentId: req.user._id }).lean();
  if (!order) return fail(res, 404, "Order not found.");
  const names = await teacherNames((order.items || []).map((item) => item.teacherId));
  res.json({ success: true, order: presentOrder(order, names) });
});

export const cancelOrder = handle(async (req, res) => {
  const orderNumber = String(req.params.orderNumber || "").trim();
  if (!/^ORD-[A-Z0-9]{8,32}$/i.test(orderNumber)) return fail(res, 400, "Invalid order number.");
  const order = await Order.findOneAndUpdate(
    { orderNumber, studentId: req.user._id, status: "pending" },
    { $set: { status: "cancelled", cancelledAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!order) return fail(res, 409, "Only your own pending order can be cancelled.");
  res.json({ success: true, order: presentOrder(order.toObject ? order.toObject() : order, await teacherNames(order.items.map((item) => item.teacherId))) });
});

// Sandbox payment ONLY for development/test. In production this always refuses:
// a real provider plus PAYMENT_WEBHOOK_SECRET must be configured instead.
// Demo activity is audited in the same audit collection as provider callbacks,
// with provider "demo" and no fabricated provider transaction data.
const recordDemoAuditEvent = async ({ eventId, type, orderNumber, result }) => {
  try {
    await PaymentEvent.create({ provider: "demo", eventId: String(eventId || "").slice(0, 200), type: String(type || "").slice(0, 80) || "unknown", orderNumber: String(orderNumber || "").slice(0, 40), result });
    return { fresh: true };
  } catch (error) {
    if (error.code === 11000) return { fresh: false };
    throw error;
  }
};
export const demoCheckout = handle(async (req, res) => {
  const orderNumber = String(req.params.orderNumber || "").trim();
  const audit = async ({ eventId, type, result }) => recordDemoAuditEvent({ eventId: eventId || `demo_${orderNumber || "refused"}_${Date.now().toString(36)}`, type, orderNumber, result });
  if (!demoCheckoutAllowed()) {
    await audit({ eventId: `demo_disabled_${Date.now().toString(36)}`, type: "demo.demo_checkout_rejected", result: "rejected" });
    return fail(res, 403, "Demo checkout is not available here. It requires a development or test environment with PAYMENT_DEMO_CHECKOUT=true.", { code: "demo_checkout_disabled" });
  }
  const order = await Order.findOne({ orderNumber, studentId: req.user._id });
  if (!order) { await audit({ eventId: `demo_missing_${Date.now().toString(36)}`, type: "demo.demo_checkout_rejected", result: "rejected" }); return fail(res, 404, "Order not found."); }
  if (order.status !== "pending") { await audit({ eventId: `demo_not_pending_${orderNumber}`, type: "demo.demo_checkout_rejected", result: "rejected" }); return fail(res, 409, `This order is not awaiting payment (status: ${order.status}).`); }
  order.provider = "demo";
  order.providerTransactionId = `demo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  await order.save();
  const { order: paid } = await fulfillOrder(order);
  await audit({ eventId: paid.providerTransactionId, type: "demo.demo_checkout", result: "processed" });
  res.json({ success: true, order: presentOrder(paid.toObject ? paid.toObject() : paid, await teacherNames(paid.items.map((item) => item.teacherId))), demo: true });
});

export const paymentsConfig = handle(async (_req, res) => {
  res.json({ success: true, ...paymentStatusSummary() });
});

export const myEarnings = handle(async (req, res) => {
  const rows = await TeacherEarning.find({ teacherId: req.user._id }).sort({ createdAt: -1 }).lean();
  const orderNumbers = [...new Set(rows.map((row) => row.orderNumber))];
  const orders = await Order.find({ orderNumber: { $in: orderNumbers } }).select("orderNumber paidAt createdAt").lean();
  const orderDates = new Map(orders.map((order) => [order.orderNumber, order.paidAt || order.createdAt]));
  const isReal = (row) => (row.source || "payment") !== "demo";
  const realRows = rows.filter(isReal);
  const demoRows = rows.filter((row) => !isReal(row));
  const earned = rows.filter((row) => row.status === "earned"); // all earned, incl. demo (for records)
  const realEarned = realRows.filter((row) => row.status === "earned");
  const realRefunded = realRows.filter((row) => row.status === "refunded");
  const demoEarned = demoRows.filter((row) => row.status === "earned");
  const sum = (list, field) => list.reduce((total, row) => total + (Number(row[field]) || 0), 0);
  const sales = rows.map((row) => ({
    id: String(row._id),
    orderNumber: row.orderNumber,
    courseId: String(row.contentId),
    course: row.title,
    kind: row.kind,
    date: orderDates.get(row.orderNumber) || row.createdAt,
    purchasedAt: orderDates.get(row.orderNumber) || row.createdAt,
    amount: row.grossAmount,
    commission: row.commissionAmount,
    net: row.teacherAmount,
    status: row.status,
    currency: row.currency,
    source: row.source || "payment",
    isDemo: !isReal(row),
  }));
  const myCourses = await Course.find({ teacherId: req.user._id, status: { $ne: "deleted" } }).select("_id title approvedVersion").lean();
  const courseIds = myCourses.map((course) => course._id);
  const accessFilter = { kind: "course", contentId: { $in: courseIds } };
  if (process.env.NODE_ENV === "production") accessFilter.source = { $ne: "demo" };
  const accessRows = courseIds.length ? await ContentAccess.find(accessFilter).select("contentId studentId").lean() : [];
  const enrollmentByCourse = new Map();
  for (const row of accessRows) {
    const key = String(row.contentId);
    enrollmentByCourse.set(key, (enrollmentByCourse.get(key) || 0) + 1);
  }
  const enrolledStudents = new Set(accessRows.map((row) => String(row.studentId))).size;
  const courseTitles = new Map(myCourses.map((course) => [String(course._id), course.approvedVersion?.title || course.title || "Untitled course"]));
  const salesByCourse = new Map();
  for (const row of realEarned) {
    const key = String(row.contentId);
    if (!salesByCourse.has(key)) salesByCourse.set(key, { courseId: key, title: row.title, kind: row.kind, students: 0, sales: 0, revenue: 0, net: 0, commission: 0 });
    const entry = salesByCourse.get(key);
    entry.sales += 1;
    entry.revenue += Number(row.grossAmount || 0);
    entry.net += Number(row.teacherAmount || 0);
    entry.commission += Number(row.commissionAmount || 0);
  }
  const byCourse = [...courseTitles.entries()].map(([id, title]) => ({
    courseId: id,
    title,
    kind: "course",
    students: enrollmentByCourse.get(id) || 0,
    sales: salesByCourse.get(id)?.sales || 0,
    revenue: salesByCourse.get(id)?.revenue || 0,
    net: salesByCourse.get(id)?.net || 0,
    commission: salesByCourse.get(id)?.commission || 0,
  })).sort((left, right) => right.revenue - left.revenue || right.students - left.students);

  // Monthly trends (verified real earnings only)
  const monthly = new Map();
  for (const row of realEarned) {
    const date = orderDates.get(row.orderNumber) || row.createdAt;
    const month = date ? new Date(date).toISOString().slice(0, 7) : "unknown";
    const entry = monthly.get(month) || { month, gross: 0, commission: 0, net: 0, sales: 0 };
    entry.gross += Number(row.grossAmount || 0);
    entry.commission += Number(row.commissionAmount || 0);
    entry.net += Number(row.teacherAmount || 0);
    entry.sales += 1;
    monthly.set(month, entry);
  }
  const monthlyTrend = [...monthly.values()].filter((e) => e.month !== "unknown").sort((a, b) => a.month.localeCompare(b.month)).slice(-12);

  const realGross = sum(realEarned, "grossAmount");
  const realCommission = sum(realEarned, "commissionAmount");
  const realNet = sum(realEarned, "teacherAmount");
  const realRefundGross = sum(realRefunded, "grossAmount");
  res.json({ success: true, currency: MARKETPLACE_CURRENCY(), commissionRate: COMMISSION_RATE(),
    enrolledStudents,
    totalCourseEnrollments: accessRows.length,
    byCourse,
    monthlyTrend,
    summary: {
      // Verified real-money totals only. Demo sandbox sales are excluded.
      grossSales: realGross,
      commission: realCommission,
      netEarnings: realNet,
      salesCount: realEarned.length,
      refundedSales: realRefunded.length,
      refundedGross: realRefundGross,
      pendingEarnings: 0, // no payout settlement model; earnings are recorded on verified paid orders
      paidEarnings: 0,    // payouts not processed by platform
      demoSalesCount: demoEarned.length,
      demoGross: sum(demoEarned, "grossAmount"),
      hasVerifiedRealPayments: realEarned.length > 0,
    },
    sales });
});

export const adminFinanceOverview = handle(async (_req, res) => {
  // Demo sandbox sales are excluded from real-money totals; they stay in the records.
  const [statusGroups, earningTotals, refundedTotals, recentOrders] = await Promise.all([
    Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$total" } } }]),
    TeacherEarning.aggregate([{ $match: { status: "earned", source: { $ne: "demo" } } }, { $group: { _id: null, gross: { $sum: "$grossAmount" }, commission: { $sum: "$commissionAmount" }, teacher: { $sum: "$teacherAmount" }, count: { $sum: 1 } } }]),
    TeacherEarning.aggregate([{ $match: { status: "refunded", source: { $ne: "demo" } } }, { $group: { _id: null, gross: { $sum: "$grossAmount" }, count: { $sum: 1 } } }]),
    Order.find({}).sort({ createdAt: -1 }).limit(100).lean(),
  ]);
  const byStatus = Object.fromEntries(statusGroups.map((group) => [group._id, { count: group.count, total: group.total }]));
  const earned = earningTotals[0] || { gross: 0, commission: 0, teacher: 0, count: 0 };
  const refunded = refundedTotals[0] || { gross: 0, count: 0 };
  const studentIds = [...new Set(recentOrders.map((order) => String(order.studentId)))];
  const students = await mongoose.model("Student").find({ _id: { $in: studentIds } }).select("email fullName").lean();
  const studentEmails = new Map(students.map((student) => [String(student._id), student.email]));
  const teacherIds = [...new Set(recentOrders.flatMap((order) => (order.items || []).map((item) => String(item.teacherId))))];
  const teachers = await Teacher.find({ _id: { $in: teacherIds } }).select("fullName").lean();
  const teacherNamesMap = new Map(teachers.map((teacher) => [String(teacher._id), teacher.fullName]));
  const orderIds = recentOrders.map((order) => order._id);
  const earningRows = await TeacherEarning.find({ order: { $in: orderIds } }).lean();
  const earningByKey = new Map(earningRows.map((row) => [`${row.order}:${String(row.contentId)}`, row]));
  const reconciliationOf = (status) => ({ paid: "matched", refunded: "reversed", pending: "awaiting provider", initiated: "awaiting provider", failed: "no settlement", cancelled: "no settlement", expired: "no settlement" }[String(status)] || "unknown");
  const records = recentOrders.flatMap((order) => (order.items || []).map((item, index) => {
    const earning = earningByKey.get(`${order._id}:${String(item.contentId)}`);
    return {
    id: `${order.orderNumber}:${item.contentId}:${index}`,
    orderId: order.orderNumber,
    date: (order.paidAt || order.createdAt)?.toISOString?.() || "",
    description: item.title || "Untitled",
    amount: Number(item.price),
    status: order.status,
    studentEmail: studentEmails.get(String(order.studentId)) || "",
    instructor: teacherNamesMap.get(String(item.teacherId)) || "Teacher",
    provider: order.provider || "",
    providerTransactionId: order.providerTransactionId || "",
    environment: order.provider === "demo" ? "demo" : (order.environment || "sandbox"),
    commission: earning ? earning.commissionAmount : (order.status === "paid" ? Number((item.price * COMMISSION_RATE()).toFixed(2)) : 0),
    teacherEarnings: earning ? earning.teacherAmount : (order.status === "paid" ? Number((item.price - item.price * COMMISSION_RATE()).toFixed(2)) : 0),
    reconciliation: reconciliationOf(order.status),
    };
  }));
  res.json({ success: true, commissionRate: COMMISSION_RATE(), currency: MARKETPLACE_CURRENCY(),
    summary: { byStatus, grossSales: earned.gross, commission: earned.commission, teacherEarnings: earned.teacher, paidSales: earned.count, refundedSales: refunded.count, refundedGross: refunded.gross },
    records });
});

import mongoose from "mongoose";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import Admin from "../models/Admin.js";
import Course from "../models/Course.js";
import TeacherBook from "../models/TeacherBook.js";
import CourseQuiz from "../models/CourseQuiz.js";
import Lesson from "../models/Lesson.js";
import Order from "../models/Order.js";
import TeacherEarning from "../models/TeacherEarning.js";
import SupportTicket from "../models/SupportTicket.js";

const ACTIVITY_WINDOW_DAYS = 30;

const fail = (res, code, message) => res.status(code).json({ success: false, message });
const handle = (action) => async (req, res, next) => {
  try { await action(req, res); }
  catch (error) {
    if (error instanceof mongoose.CastError) return res.status(400).json({ success: false, message: "Invalid identifier." });
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
};

const aggregateCount = async (Model, pipeline) => {
  const rows = await Model.aggregate(pipeline);
  return rows.length ? Number(rows[0].count || 0) : 0;
};

const lessonsTotal = () => Course.aggregate([
  { $match: { status: { $ne: "deleted" } } },
  { $project: { lessons: { $size: { $ifNull: ["$approvedVersion.lessons", []] } } } },
  { $group: { _id: null, count: { $sum: "$lessons" } } },
]);

const pendingCounts = () => Promise.all([
  Course.countDocuments({ status: "pending" }),
  TeacherBook.countDocuments({ status: "pending" }),
  SupportTicket.aggregate([{ $match: { status: "Open" } }, { $group: { _id: null, count: { $sum: 1 } } }]).then((rows) => Number(rows[0]?.count || 0)),
]);

const financeTotals = () => {
  const earnedMatch = { status: "earned", source: { $ne: "demo" } };
  const refundedMatch = { status: "refunded", source: { $ne: "demo" } };
  return Promise.all([
    TeacherEarning.aggregate([{ $match: earnedMatch }, { $group: { _id: null, gross: { $sum: "$grossAmount" }, commission: { $sum: "$commissionAmount" }, teacher: { $sum: "$teacherAmount" }, count: { $sum: 1 } } }]).then((rows) => rows[0] || { gross: 0, commission: 0, teacher: 0, count: 0 }),
    TeacherEarning.aggregate([{ $match: refundedMatch }, { $group: { _id: null, gross: { $sum: "$grossAmount" }, count: { $sum: 1 } } }]).then((rows) => rows[0] || { gross: 0, count: 0 }),
    Order.aggregate([{ $match: { status: "paid", provider: { $ne: "demo" } } }, { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$total" } } }]).then((rows) => rows[0] || { count: 0, total: 0 }),
  ]);
};

const supportTotals = () => Promise.all([
  SupportTicket.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  SupportTicket.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]),
  SupportTicket.aggregate([{ $group: { _id: "$priority", count: { $sum: 1 } } }]),
  SupportTicket.countDocuments({}),
]);

const toObject = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export const reportsOverview = handle(async (_req, res) => {
  const cutoff = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const activeUsers = async () => (await Promise.all([Student, Teacher, Admin].map((Model) => Model.countDocuments({ lastLogin: { $gte: cutoff } })))).reduce((total, count) => total + count, 0);

  const [students, teachers, admins, activeUserCount, publishedCourses, [pendingCourses, pendingBooks, openTickets], lessons, [earningTotals, refundedTotals, paidTotals], [byStatus, byCategory, byPriority, totalTickets], demoPaid] = await Promise.all([
    Student.countDocuments({}),
    Teacher.countDocuments({}),
    Admin.countDocuments({}),
    activeUsers(),
    Course.countDocuments({ status: "published" }),
    pendingCounts(),
    lessonsTotal(),
    financeTotals(),
    supportTotals(),
    Order.countDocuments({ status: "paid", provider: "demo" }),
  ]);

  const byStatusCounts = Object.fromEntries(byStatus.map((row) => [row._id, row.count]));
  const quizzesTotal = await CourseQuiz.countDocuments({});

  res.json({
    success: true,
    activityWindowDays: ACTIVITY_WINDOW_DAYS,
    users: { students, teachers, admins, activeUsers: activeUserCount },
    courses: {
      publishedCourses,
      pendingApprovals: pendingCourses + pendingBooks,
      lessons: lessons.length ? Number(lessons[0].count || 0) : 0,
      quizzes: toObject(quizzesTotal),
    },
    books: {
      total: await TeacherBook.countDocuments({}),
      published: await TeacherBook.countDocuments({ status: "published" }),
    },
    support: {
      total: totalTickets,
      open: Number(byStatusCounts.Open || 0),
      inProgress: Number(byStatusCounts["In Progress"] || 0),
      resolved: Number(byStatusCounts.Resolved || 0),
      closed: Number(byStatusCounts.Closed || 0),
      byStatus: byStatusCounts,
      byCategory,
      byPriority,
    },
    finance: {
      verifiedOrders: toObject(paidTotals.count),
      verifiedOrderValue: toObject(paidTotals.total),
      teacherEarnings: toObject(earningTotals.teacher),
      platformCommission: toObject(earningTotals.commission),
      refunds: toObject(refundedTotals.gross),
      demoPaidOrders: demoPaid,
    },
  });
});

export const reportsFinance = handle(async (_req, res) => {
  const [financeRows, refundedTotals, paidTotals, demoTotals, byStatus] = await Promise.all([
    financeTotals(),
    Order.aggregate([{ $match: { status: "paid", provider: { $ne: "demo" } } }, { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$total" } } }]).then((rows) => rows[0] || { count: 0, total: 0 }),
    Order.aggregate([{ $match: { status: "paid" } }, { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$total" } } }]).then((rows) => rows[0] || { count: 0, total: 0 }),
    Order.aggregate([{ $match: { status: "paid", provider: "demo" } }, { $group: { _id: null, count: { $sum: 1 } } }]).then((rows) => rows[0]?.count || 0),
    Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$total" } } }]),
  ]);
  const earningTotals = financeRows[0] || {};
  const byStatusCounts = Object.fromEntries(byStatus.map((row) => [row._id, row.count]));
  res.json({
    success: true,
    verifiedOrders: {
      count: toObject(paidTotals.count),
      total: toObject(paidTotals.total),
    },
    demoVerifiedOrders: toObject(demoTotals),
    byStatusCounts,
    teacherEarnings: toObject(earningTotals.teacher),
    platformCommission: toObject(earningTotals.commission),
    refunds: toObject(refundedTotals.gross),
    refundedTransactions: toObject(refundedTotals.count),
    demoExcluded: true,
    note: "Real-money revenue and payout totals exclude demo sandbox sales; demo transactions are counted separately.",
  });
});

export const reportsTickets = handle(async (_req, res) => {
  const [byStatus, byCategory, byPriority, total] = await supportTotals();
  const byStatusCounts = Object.fromEntries(byStatus.map((row) => [row._id, row.count]));
  const totalCount = Number(total);
  res.json({
    success: true,
    total: totalCount,
    counts: {
      open: Number(byStatusCounts.Open || 0),
      inProgress: Number(byStatusCounts["In Progress"] || 0),
      waiting: Number(byStatusCounts["Waiting for User"] || 0),
      resolved: Number(byStatusCounts.Resolved || 0),
      closed: Number(byStatusCounts.Closed || 0),
    },
    byStatus: byStatusCounts,
    byCategory,
    byPriority,
  });
});

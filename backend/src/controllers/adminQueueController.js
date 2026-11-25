import { Buffer } from "node:buffer";
import AdminQueueRecord from "../models/AdminQueueRecord.js";

const QUEUES = new Set([
  "knowledge",
  "moderation-reports",
  "moderation-policies",
  "tutor-profiles",
  "tutor-bookings",
]);

function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function queueName(req, res) {
  const queue = String(req.params.queue || "").trim();
  if (!QUEUES.has(queue)) {
    fail(res, 404, "Admin queue not found.");
    return "";
  }
  return queue;
}

function cleanRecordId(value) {
  return String(value || "").trim().slice(0, 300);
}

function cleanPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw Object.assign(new Error("Queue records must be objects."), { status: 400 });
  }
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > 512 * 1024) {
    throw Object.assign(new Error("Queue records must be smaller than 512 KB."), { status: 413 });
  }
  const payload = JSON.parse(serialized);
  delete payload.__proto__;
  delete payload.constructor;
  return payload;
}

function present(document) {
  return {
    id: document.recordId,
    record: document.payload,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function listAdminQueue(req, res, next) {
  try {
    const queue = queueName(req, res);
    if (!queue) return;
    const records = await AdminQueueRecord.find({ queue })
      .sort({ updatedAt: -1, _id: -1 })
      .lean();
    res.json({ success: true, queue, count: records.length, records: records.map(present) });
  } catch (error) {
    next(error);
  }
}

export async function importAdminQueue(req, res, next) {
  try {
    const queue = queueName(req, res);
    if (!queue) return;
    const input = Array.isArray(req.body?.records) ? req.body.records : [];
    if (input.length > 500) return fail(res, 413, "Import at most 500 queue records at once.");
    const actor = String(req.user?.email || "admin").slice(0, 254);
    const operations = input.map((item) => {
      const recordId = cleanRecordId(item?.id);
      if (!recordId) throw Object.assign(new Error("Each queue record requires an ID."), { status: 400 });
      const payload = cleanPayload(item.record);
      return {
        updateOne: {
          filter: { queue, recordId },
          update: { $setOnInsert: { queue, recordId, payload, createdBy: actor, updatedBy: actor } },
          upsert: true,
        },
      };
    });
    if (operations.length) await AdminQueueRecord.bulkWrite(operations, { ordered: false });
    return listAdminQueue(req, res, next);
  } catch (error) {
    if (error.status) return fail(res, error.status, error.message);
    next(error);
  }
}

export async function saveAdminQueueRecord(req, res, next) {
  try {
    const queue = queueName(req, res);
    if (!queue) return;
    const recordId = cleanRecordId(req.params.recordId);
    if (!recordId) return fail(res, 400, "Queue record ID is required.");
    const payload = cleanPayload(req.body?.record);
    const actor = String(req.user?.email || "admin").slice(0, 254);
    const document = await AdminQueueRecord.findOneAndUpdate(
      { queue, recordId },
      {
        $set: { payload, updatedBy: actor },
        $setOnInsert: { queue, recordId, createdBy: actor },
      },
      { upsert: true, returnDocument: "after", runValidators: true },
    ).lean();
    res.json({ success: true, queue, item: present(document) });
  } catch (error) {
    if (error.status) return fail(res, error.status, error.message);
    next(error);
  }
}

export async function deleteAdminQueueRecord(req, res, next) {
  try {
    const queue = queueName(req, res);
    if (!queue) return;
    const recordId = cleanRecordId(req.params.recordId);
    const deleted = await AdminQueueRecord.findOneAndDelete({ queue, recordId });
    if (!deleted) return fail(res, 404, "Queue record not found.");
    res.json({ success: true, queue, id: recordId });
  } catch (error) {
    next(error);
  }
}

import { createHash } from "node:crypto";
import RateLimitCounter from "../models/RateLimitCounter.js";

// Production counters are shared by workers and survive restarts. Database
// errors fail closed through express-rate-limit's default error handling.
export class MongoRateLimitStore {
  localKeys = false;
  constructor(prefix) { this.prefix = prefix; }
  init(options) { this.windowMs = options.windowMs; }
  identity(key) {
    const window = Math.floor(Date.now() / this.windowMs) * this.windowMs;
    return { id: createHash("sha256").update(`${this.prefix}:${window}:${key}`).digest("hex"), resetTime: new Date(window + this.windowMs) };
  }
  async increment(key) {
    const { id, resetTime } = this.identity(key);
    let record;
    try {
      record = await RateLimitCounter.findOneAndUpdate({ _id: id },
        { $inc: { hits: 1 }, $setOnInsert: { expiresAt: resetTime } }, { upsert: true, returnDocument: "after" });
    } catch (error) {
      if (error.code !== 11000) throw error;
      record = await RateLimitCounter.findOneAndUpdate({ _id: id }, { $inc: { hits: 1 } }, { returnDocument: "after" });
    }
    return { totalHits: record.hits, resetTime };
  }
  async decrement(key) {
    await RateLimitCounter.updateOne({ _id: this.identity(key).id, hits: { $gt: 0 } }, { $inc: { hits: -1 } });
  }
  async resetKey(key) { await RateLimitCounter.deleteOne({ _id: this.identity(key).id }); }
}

export const rateLimitStore = (prefix) => process.env.NODE_ENV === "production" ? { store: new MongoRateLimitStore(prefix) } : {};

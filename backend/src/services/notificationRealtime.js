import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

const localBus = new EventEmitter();
localBus.setMaxListeners(0);

const INSTANCE_ID = randomUUID();
let redisPub = null;
let redisSub = null;
let redisReady = false;
let redisConnecting = null;
const CHANNEL = "educonnect:notifications";

function safeJsonParse(value) {
  try { return JSON.parse(value); } catch { return null; }
}

async function ensureRedis() {
  const url = String(process.env.REDIS_URL || "").trim();
  if (!url) return false;
  if (redisReady) return true;
  if (redisConnecting) return redisConnecting;
  redisConnecting = (async () => {
    try {
      const { createClient } = await import("redis");
      const pub = createClient({ url });
      const sub = pub.duplicate();
      pub.on("error", (err) => console.error("[realtime] redis pub error", err.message));
      sub.on("error", (err) => console.error("[realtime] redis sub error", err.message));
      await pub.connect();
      await sub.connect();
      await sub.subscribe(CHANNEL, (message) => {
        const payload = safeJsonParse(message);
        // Skip messages originated by this instance; we already emitted locally.
        if (payload?.recipientId && payload?.notification && payload.instanceId !== INSTANCE_ID) {
          localBus.emit(`user:${String(payload.recipientId)}`, { ...payload, _fromRedis: true });
        }
      });
      redisPub = pub;
      redisSub = sub;
      redisReady = true;
      console.log("[realtime] Redis pub/sub connected");
      return true;
    } catch (error) {
      console.error("[realtime] Redis unavailable, falling back to in-process bus:", error.message);
      try { await redisPub?.quit(); } catch {}
      try { await redisSub?.quit(); } catch {}
      redisPub = null; redisSub = null; redisReady = false;
      return false;
    } finally {
      redisConnecting = null;
    }
  })();
  return redisConnecting;
}

export async function initNotificationRealtime() {
  await ensureRedis();
}

export function subscribeUserNotifications(userId, handler) {
  const channel = `user:${String(userId)}`;
  localBus.on(channel, handler);
  return () => localBus.off(channel, handler);
}

export async function publishUserNotification(recipientId, notification) {
  const payload = { recipientId: String(recipientId), notification, instanceId: INSTANCE_ID };
  // Always emit locally for the current instance.
  localBus.emit(`user:${String(recipientId)}`, payload);
  // Best-effort cross-instance publish. If Redis is down, single-instance still works.
  try {
    const ok = await ensureRedis();
    if (ok && redisPub) {
      await redisPub.publish(CHANNEL, JSON.stringify(payload));
    }
  } catch (error) {
    console.error("[realtime] Redis publish failed:", error.message);
  }
}

export async function closeNotificationRealtime() {
  try { await redisSub?.unsubscribe(CHANNEL); } catch {}
  try { await redisSub?.quit(); } catch {}
  try { await redisPub?.quit(); } catch {}
  redisSub = null; redisPub = null; redisReady = false;
}

export function notificationRealtimeStatus() {
  return { redisConfigured: Boolean(String(process.env.REDIS_URL || "").trim()), redisReady };
}

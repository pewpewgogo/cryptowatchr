import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

export interface AlertRule {
  id: string;
  userId: number;
  type: "threshold" | "percent";
  coin: string;
  direction?: "above" | "below";
  price?: number;
  percent?: number;
  timeframeMinutes?: number;
  createdAt: string;
}

export interface QuietHours {
  start: string;
  end: string;
}

export interface PersistentStore {
  createAlertRule(rule: AlertRule): Promise<void>;
  getAlertRules(userId: number): Promise<AlertRule[]>;
  deleteAlertRule(userId: number, ruleId: string): Promise<void>;
  getQuietHours(userId: number): Promise<QuietHours | null>;
  setQuietHours(userId: number, start: string, end: string): Promise<void>;
  deleteQuietHours(userId: number): Promise<void>;
}

function createRedisClient(url: string) {
  const require = createRequire(import.meta.url);
  const ioredis = require("ioredis");
  const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
  return new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });
}

const PREFIX = "cryptowatchr:";
const RULES_KEY = (userId: number) => `${PREFIX}alert:rules:${userId}`;

class RedisStore implements PersistentStore {
  #client: ReturnType<typeof createRedisClient>;

  constructor(url: string) {
    this.#client = createRedisClient(url);
  }

  async createAlertRule(rule: AlertRule): Promise<void> {
    const key = `${PREFIX}alert:${rule.userId}:${rule.id}`;
    await this.#client.set(key, JSON.stringify(rule));
    await this.#client.sadd(RULES_KEY(rule.userId), rule.id);
  }

  async getAlertRules(userId: number): Promise<AlertRule[]> {
    const ids = await this.#client.smembers(RULES_KEY(userId));
    if (ids.length === 0) return [];
    const keys = ids.map((id: string) => `${PREFIX}alert:${userId}:${id}`);
    const results = await Promise.all(keys.map((k: string) => this.#client.get(k)));
    return results
      .filter((r): r is string => r !== null)
      .map((r) => JSON.parse(r) as AlertRule);
  }

  async deleteAlertRule(userId: number, ruleId: string): Promise<void> {
    const key = `${PREFIX}alert:${userId}:${ruleId}`;
    await this.#client.del(key);
    await this.#client.srem(RULES_KEY(userId), ruleId);
  }

  async getQuietHours(userId: number): Promise<QuietHours | null> {
    const key = `${PREFIX}quiet_hours:${userId}`;
    const raw = await this.#client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as QuietHours;
  }

  async setQuietHours(userId: number, start: string, end: string): Promise<void> {
    const key = `${PREFIX}quiet_hours:${userId}`;
    await this.#client.set(key, JSON.stringify({ start, end }));
  }

  async deleteQuietHours(userId: number): Promise<void> {
    const key = `${PREFIX}quiet_hours:${userId}`;
    await this.#client.del(key);
  }
}

class MemoryStore implements PersistentStore {
  #rules = new Map<string, AlertRule>();
  #userRules = new Map<number, Set<string>>();
  #quietHours = new Map<number, QuietHours>();

  async createAlertRule(rule: AlertRule): Promise<void> {
    this.#rules.set(rule.id, rule);
    let set = this.#userRules.get(rule.userId);
    if (!set) {
      set = new Set();
      this.#userRules.set(rule.userId, set);
    }
    set.add(rule.id);
  }

  async getAlertRules(userId: number): Promise<AlertRule[]> {
    const ids = this.#userRules.get(userId);
    if (!ids) return [];
    return [...ids].map((id) => this.#rules.get(id)!).filter(Boolean);
  }

  async deleteAlertRule(userId: number, ruleId: string): Promise<void> {
    this.#rules.delete(ruleId);
    this.#userRules.get(userId)?.delete(ruleId);
  }

  async getQuietHours(userId: number): Promise<QuietHours | null> {
    return this.#quietHours.get(userId) ?? null;
  }

  async setQuietHours(userId: number, start: string, end: string): Promise<void> {
    this.#quietHours.set(userId, { start, end });
  }

  async deleteQuietHours(userId: number): Promise<void> {
    this.#quietHours.delete(userId);
  }
}

export function createStore(): PersistentStore {
  if (process.env.REDIS_URL) {
    return new RedisStore(process.env.REDIS_URL);
  }
  return new MemoryStore();
}

export function newAlertRule(
  userId: number,
  coin: string,
  direction: "above" | "below",
  price: number,
): AlertRule {
  return {
    id: randomUUID(),
    userId,
    type: "threshold",
    coin,
    direction,
    price,
    createdAt: new Date().toISOString(),
  };
}

export function newPercentAlertRule(
  userId: number,
  coin: string,
  percent: number,
  timeframeMinutes: number,
): AlertRule {
  return {
    id: randomUUID(),
    userId,
    type: "percent",
    coin,
    percent,
    timeframeMinutes,
    createdAt: new Date().toISOString(),
  };
}

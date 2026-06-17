import type { PersistentStore } from "./store.js";
import { fetchPrices } from "./price.js";
import { evaluateAlertRules, formatAlertMessage, DEFAULT_COOLDOWN_MS } from "./evaluator.js";

const POLL_INTERVAL_MS = 60_000;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 2000;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_POLLS = 60;

async function fetchPricesWithRetry(coinIds: string[]): Promise<Record<string, { usd: number; usd_24h_change: number | null; last_updated_at: number }> | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchPrices(coinIds);
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      console.error("[CryptoWatchr] price feed failure after all retries:", err);
      return null;
    }
  }
  return null;
}

export function startPoller(
  store: PersistentStore,
  sendMessage: (chatId: number, text: string) => Promise<unknown>,
): () => void {
  let running = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pollCount = 0;

  async function poll(): Promise<void> {
    if (!running) return;

    try {
      const coinIds = await store.getAllTrackedCoinIds();
      if (coinIds.length === 0) {
        return;
      }

      const data = await fetchPricesWithRetry(coinIds);
      if (!data) {
        return;
      }

      const triggered = await evaluateAlertRules(store, data);
      for (const alert of triggered) {
        console.info(
          "[CryptoWatchr] alert triggered:",
          `user=${alert.rule.userId}`,
          `coin=${alert.coinId}`,
          `type=${alert.rule.type}`,
          `old=$${alert.oldPrice.toFixed(2)}`,
          `new=$${alert.newPrice.toFixed(2)}`,
          `pct=${alert.pctChange.toFixed(2)}%`,
        );
        const message = formatAlertMessage(alert);
        try {
          await sendMessage(alert.rule.userId, message);
        } catch (err) {
          console.error("[CryptoWatchr] failed to send alert message:", err);
        }
        await store.recordSentAlert(alert.rule.userId, alert.rule.id, DEFAULT_COOLDOWN_MS);
      }

      const now = Date.now();

      for (const coinId of coinIds) {
        const info = data[coinId];
        if (!info) continue;
        await store.savePriceSnapshot({
          coinId,
          usd: info.usd,
          usd24hChange: info.usd_24h_change,
          lastUpdatedAt: info.last_updated_at,
          polledAt: now,
        });
      }

      pollCount++;
      if (pollCount % CLEANUP_INTERVAL_POLLS === 0) {
        try {
          await store.cleanupOldSnapshots(RETENTION_MS);
        } catch (err) {
          console.error("[CryptoWatchr] cleanupOldSnapshots failed:", err);
        }
      }
    } catch (err) {
      console.error("[CryptoWatchr] poller error:", err);
    } finally {
      if (running) {
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }
  }

  timer = setTimeout(poll, 0);

  return () => {
    running = false;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

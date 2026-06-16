import type { PersistentStore } from "./store.js";
import { fetchPrices } from "./price.js";
import { evaluateAlertRules, formatAlertMessage, DEFAULT_COOLDOWN_MS } from "./evaluator.js";

const POLL_INTERVAL_MS = 60_000;

export function startPoller(
  store: PersistentStore,
  sendMessage: (chatId: number, text: string) => Promise<unknown>,
): () => void {
  let running = true;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function poll(): Promise<void> {
    if (!running) return;

    try {
      const coinIds = await store.getAllTrackedCoinIds();
      if (coinIds.length === 0) {
        return;
      }

      const data = await fetchPrices(coinIds);

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

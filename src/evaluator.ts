import type { AlertRule, PriceSnapshot, PersistentStore } from "./store.js";
import { coinIdForTicker } from "./index.js";

export interface TriggeredAlert {
  rule: AlertRule;
  coinId: string;
  oldPrice: number;
  newPrice: number;
  absChange: number;
  pctChange: number;
}

export async function evaluateAlertRules(
  store: PersistentStore,
  priceData: Record<string, { usd: number; usd_24h_change: number | null; last_updated_at: number }>,
): Promise<TriggeredAlert[]> {
  const results: TriggeredAlert[] = [];

  const allRules = await store.getAllAlertRules();
  if (allRules.length === 0) return results;

  const watchlistCache = new Map<number, Map<string, string>>();

  for (const rule of allRules) {
    if (rule.coin === "any") {
      let watchlist = watchlistCache.get(rule.userId);
      if (!watchlist) {
        const entries = await store.getWatchlist(rule.userId);
        watchlist = new Map<string, string>();
        for (const e of entries) {
          watchlist.set(e.ticker, e.coinId);
        }
        watchlistCache.set(rule.userId, watchlist);
      }

      for (const [ticker, coinId] of watchlist) {
        const currentPrice = priceData[coinId]?.usd;
        if (currentPrice == null || currentPrice <= 0) continue;

        const snapshot = await store.getLatestPriceSnapshot(coinId);
        if (!snapshot || snapshot.usd <= 0) continue;

        const oldPrice = snapshot.usd;
        const pctChange = ((currentPrice - oldPrice) / oldPrice) * 100;

        if (rule.type === "percent" && Math.abs(pctChange) >= rule.percent!) {
          results.push({
            rule: { ...rule, coin: ticker },
            coinId,
            oldPrice,
            newPrice: currentPrice,
            absChange: currentPrice - oldPrice,
            pctChange,
          });
        }
      }
      continue;
    }

    const coinId = coinIdForTicker(rule.coin);
    if (!coinId) continue;

    const currentPrice = priceData[coinId]?.usd;
    if (currentPrice == null || currentPrice <= 0) continue;

    const snapshot = await store.getLatestPriceSnapshot(coinId);
    if (!snapshot || snapshot.usd <= 0) continue;

    const oldPrice = snapshot.usd;
    const pctChange = ((currentPrice - oldPrice) / oldPrice) * 100;

    if (rule.type === "threshold") {
      if (rule.direction === "above" && currentPrice > rule.price!) {
        results.push({ rule, coinId, oldPrice, newPrice: currentPrice, absChange: currentPrice - oldPrice, pctChange });
      } else if (rule.direction === "below" && currentPrice < rule.price!) {
        results.push({ rule, coinId, oldPrice, newPrice: currentPrice, absChange: currentPrice - oldPrice, pctChange });
      }
    } else if (rule.type === "percent") {
      if (Math.abs(pctChange) >= rule.percent!) {
        results.push({ rule, coinId, oldPrice, newPrice: currentPrice, absChange: currentPrice - oldPrice, pctChange });
      }
    }
  }

  return results;
}
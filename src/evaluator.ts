import { inlineKeyboard } from "@agntdev/bot-toolkit";
import type { AlertRule, PriceSnapshot, PersistentStore, QuietHours } from "./store.js";
import { coinIdForTicker } from "./bot.js";

export const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000;

export interface TriggeredAlert {
  rule: AlertRule;
  coinId: string;
  oldPrice: number;
  newPrice: number;
  absChange: number;
  pctChange: number;
}

function getLocalTimeForTimezone(now: Date, timezone: string): { hours: number; minutes: number } {
  const utcMatch = timezone.match(/^UTC([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (utcMatch) {
    const sign = utcMatch[1] === "+" ? 1 : -1;
    const h = parseInt(utcMatch[2], 10);
    const m = parseInt(utcMatch[3] || "0", 10);
    const offsetMinutes = sign * (h * 60 + m);
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const localMinutes = (utcMinutes + offsetMinutes + 1440) % 1440;
    return {
      hours: Math.floor(localMinutes / 60),
      minutes: localMinutes % 60,
    };
  }

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const h = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
    const m = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
    return { hours: h, minutes: m };
  } catch {
    return { hours: now.getUTCHours(), minutes: now.getUTCMinutes() };
  }
}

function isInQuietHours(quietHours: QuietHours, timezone: string, now: Date): boolean {
  const local = getLocalTimeForTimezone(now, timezone);
  const currentMinutes = local.hours * 60 + local.minutes;

  const [startH, startM] = quietHours.start.split(":").map(Number);
  const [endH, endM] = quietHours.end.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

function formatPercentTimeframe(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? "1 hour" : `${h} hours`;
  }
  return `${minutes} minutes`;
}

export function formatAlertMessage(alert: TriggeredAlert): string {
  const { rule, oldPrice, newPrice, pctChange } = alert;
  const ticker = rule.coin;
  const sign = pctChange >= 0 ? "+" : "";

  const fmtOld = `$${oldPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtNew = `$${newPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtPct = `${sign}${pctChange.toFixed(2)}%`;

  const headline = `ALERT: ${ticker} moved — old: ${fmtOld} → new: ${fmtNew} (${fmtPct})`;

  let typeLine: string;
  if (rule.type === "threshold") {
    const fmtPrice = rule.price!.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    typeLine = `Type: Threshold · ${ticker} ${rule.direction} $${fmtPrice}`;
  } else {
    const fmtPercent = rule.percent!.toLocaleString("en-US", { maximumFractionDigits: 2 });
    const coinLabel = rule.coin === "any" ? "any coin in your watchlist" : rule.coin;
    typeLine = `Type: Percent move · ${coinLabel} > ${fmtPercent}% in ${formatPercentTimeframe(rule.timeframeMinutes!)}`;
  }

  return [headline, typeLine].join("\n");
}

export function formatAlertKeyboard(ruleId: string) {
  return inlineKeyboard([
    [
      { text: "View Alert", callback_data: `alert:view:${ruleId}` },
      { text: "Pause Alert", callback_data: `alert:pause:${ruleId}` },
    ],
  ]);
}

export function formatAlertDelivery(alert: TriggeredAlert) {
  return {
    text: formatAlertMessage(alert),
    reply_markup: formatAlertKeyboard(alert.rule.id),
  };
}

export async function evaluateAlertRules(
  store: PersistentStore,
  priceData: Record<string, { usd: number; usd_24h_change: number | null; last_updated_at: number }>,
  now: number = Date.now(),
): Promise<TriggeredAlert[]> {
  const candidates: TriggeredAlert[] = [];

  const allRules = await store.getAllAlertRules();
  if (allRules.length === 0) return candidates;

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

        const lookbackMs = (rule.timeframeMinutes ?? 60) * 60 * 1000;
        const snapshot = await store.getPriceSnapshotAtOrBefore(coinId, now - lookbackMs);
        if (!snapshot || snapshot.usd <= 0) continue;

        const oldPrice = snapshot.usd;
        const pctChange = ((currentPrice - oldPrice) / oldPrice) * 100;

        if (rule.type === "percent" && Math.abs(pctChange) >= rule.percent!) {
          candidates.push({
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

    let snapshot: PriceSnapshot | null;
    if (rule.type === "percent") {
      const lookbackMs = (rule.timeframeMinutes ?? 60) * 60 * 1000;
      snapshot = await store.getPriceSnapshotAtOrBefore(coinId, now - lookbackMs);
    } else {
      snapshot = await store.getLatestPriceSnapshot(coinId);
    }
    if (!snapshot || snapshot.usd <= 0) continue;

    const oldPrice = snapshot.usd;
    const pctChange = ((currentPrice - oldPrice) / oldPrice) * 100;

    if (rule.type === "threshold") {
      if (rule.direction === "above" && currentPrice > rule.price!) {
        candidates.push({ rule, coinId, oldPrice, newPrice: currentPrice, absChange: currentPrice - oldPrice, pctChange });
      } else if (rule.direction === "below" && currentPrice < rule.price!) {
        candidates.push({ rule, coinId, oldPrice, newPrice: currentPrice, absChange: currentPrice - oldPrice, pctChange });
      }
    } else if (rule.type === "percent") {
      if (Math.abs(pctChange) >= rule.percent!) {
        candidates.push({ rule, coinId, oldPrice, newPrice: currentPrice, absChange: currentPrice - oldPrice, pctChange });
      }
    }
  }

  const results: TriggeredAlert[] = [];
  const quietHoursCache = new Map<number, { quietHours: QuietHours | null; timezone: string | null }>();
  const nowDate = new Date(now);

  for (const alert of candidates) {
    const userId = alert.rule.userId;

    const suppressed = await store.isAlertSuppressed(userId, alert.rule.id);
    if (suppressed) continue;

    let qhInfo = quietHoursCache.get(userId);
    if (!qhInfo) {
      const quietHours = await store.getQuietHours(userId);
      const timezone = await store.getTimezone(userId);
      qhInfo = { quietHours, timezone };
      quietHoursCache.set(userId, qhInfo);
    }

    if (qhInfo.quietHours && qhInfo.timezone) {
      if (isInQuietHours(qhInfo.quietHours, qhInfo.timezone, nowDate)) {
        continue;
      }
    }

    results.push(alert);
  }

  return results;
}
## Summary
CryptoWatchr is a personal Telegram bot that lets each user privately maintain a watchlist of coins and receive non-spammy alerts when prices cross thresholds or move by a percentage over a timeframe. It supports inline buttons for common coins, freeform tickers, on-demand /price checks, an optional morning summary, quiet hours, and an owner/admin view of usage and top alerts.

## Audience
- Individual Telegram users who want lightweight price alerts for cryptocurrencies.
- Bot owner (admin) who needs aggregate usage metrics and top-fired alerts.

## Core entities
- User (Telegram user id, timezone, settings)
- Watchlist entry (user_id, normalized_ticker, display_name)
- Alert rule (user_id, type: threshold|percent, coin, direction (above|below) for threshold, threshold_value for price, percentage and timeframe for percent-alerts)
- PriceSnapshot (ticker, timestamp, price_usd)
- SentAlert (user_id, coin, rule_id, sent_at) — used for cooldown suppression
- OwnerStats (derived aggregation for admin view)

## Integrations & notification targets
- Telegram Bot API: send alerts, reply to commands, inline keyboard actions.
- Price provider: primary = CoinGecko public API (fallback configurable to CoinAPI / CryptoCompare if API key provided).
- Persistence: Postgres (container-friendly), optionally SQLite for small-scale testing.
- Hosting: containerized service (Docker). Scheduler/worker inside the service for polling and summary jobs.

## Interaction flows
- Onboarding (/start)
  - Bot explains features and asks user to confirm their timezone (auto-detect fallback). Default quiet hours and cooldown are shown and editable.
- Add coin
  - Inline buttons show: Bitcoin (BTC), Ethereum (ETH), Toncoin (TON), Add custom ticker.
  - If user types a ticker, bot validates; on unknown/typo replies helpfully with suggestions and how to retry.
- Remove coin
  - /list shows watchlist with inline Remove buttons per coin.
- Create alert
  - Two types: threshold and percent.
  - Threshold flow: user picks coin, picks direction (above/below), enters price in USD (bot parses symbols). Example: “tell me when BTC drops below 60000”.
  - Percent flow: user picks coin(s) or “any in my list”, enters percentage and timeframe (default 1 hour). Example: “alert if price moves >5% in 1h”.
- /price [ticker|all]
  - If ticker provided, return current price with timestamp and small 24h change. If omitted, return all coins on user’s watchlist with current prices.
- Morning summary
  - Optional: user sets a time (HH:MM local) for a daily summary of watched coins (changes since previous night). Can opt-out.
- Quiet hours
  - Users set start/end local times during which alerts are suppressed (alerts queued for next allowed window or dropped per user preference). Default is in settings.
- Cooldown/suppression
  - After an alert for a (user, coin, rule) fires, the same rule is suppressed for a cooldown window to prevent repeated notifications while the price wobbles.
- Price-feed failure handling
  - If provider fails or returns stale data, the bot retries silently; it will not send alerts with incomplete/old data and will log the incident. Users see a friendly error if they request /price and data is unavailable.
- Owner/admin view
  - Protected command (/admin_stats) available to configured owner Telegram id. Shows total users, active users (last 30d), and top-fired alert rules (most frequent alerts by coin and type).

## Persistence
- Postgres schema (recommended tables): users, user_settings, watchlist, alert_rules, price_snapshots (ticker, ts, price_usd), sent_alerts, logs.
- Price snapshots kept for at least the longest percent timeframe (default retention 30 days). Snapshots collected by a poller every 60 seconds for all coins currently present in any user watchlist.

## Alert evaluation & scheduling
- Poller job runs once per minute; fetches current prices for all tracked coins in bulk from provider.
- For percent alerts, compute percent change by comparing current price to snapshot at (now - timeframe). If no exact snapshot, use nearest earlier snapshot.
- When a rule matches and it is outside user quiet hours and suppression window, send a single alert message including: coin ticker, old price, new price, percent change, timestamp, and rule reference. Then record sent_alert to apply cooldown suppression.

## Message format for alerts (required)
- Every alert message must include: coin, old price, new price, absolute and percent change, and the rule that triggered (e.g., “BTC dropped below $60,000” or “ETH moved +5.4% in 1h”).

## Payments
- No payments or premium features in v1. Bot is free to use. (Can add billing later.)

## Non-goals
- No trading / order execution / custody.
- Not a portfolio management tool (no P&L, holdings, or tax reports) in v1.
- No multi-fiat conversion UI except default USD in v1.

## Assumptions & defaults
- Default price provider: CoinGecko public API. Rationale: no API key needed and broad coverage for v1.
- Default fiat: USD. Rationale: clear baseline and what the user requested in examples; add more currencies later if requested.
- Polling frequency: every 60 seconds; snapshot retention: 30 days. Rationale: balances freshness for 1h percent alerts and reasonable storage cost.
- Default percent-alert timeframe: 1 hour; default percent threshold example: 5% (user sets per-rule). Rationale: matches owner spec and usual alert granularity.
- Default quiet hours: 22:00–07:00 local time (user can change). Rationale: respects owner request to avoid overnight pings.
- Default cooldown after an alert: 1 hour per (user, coin, rule). Rationale: prevents repeated alerts while price wobbles yet keeps user informed of new moves.
- Owner/admin identity is configured via environment variable (TELEGRAM_OWNER_ID) and bot token via TELEGRAM_BOT_TOKEN. Rationale: security and easy deployment; owner must supply these at deployment time.

If you want different defaults (provider, cooldown length, default quiet hours, currency), tell me which single change to make now and I will update the brief accordingly.
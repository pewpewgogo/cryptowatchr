import { fileURLToPath } from "node:url";
import { createBot, menuKeyboard, inlineKeyboard } from "@agntdev/bot-toolkit";
import { createStore, newAlertRule, newPercentAlertRule, type AlertRule, type WatchlistEntry, type MorningSummary, type PersistentStore } from "./store.js";
import { fetchPrices, formatPriceDisplay } from "./price.js";
import { startPoller } from "./poller.js";

export interface Session {
  initializedAt: string;
  onboardingStep?: "timezone" | "confirm";
  timezone?: string;
  quietHoursStep?: "start" | "end";
  quietHoursStart?: string;
  quietHoursEnd?: string;
  alertStep?: "type" | "coin" | "direction" | "price" | "pctCoin" | "pctPercent" | "pctTimeframe";
  alertCoin?: string;
  alertDirection?: "above" | "below";
  alertPctCoin?: string;
  alertPctPercent?: number;
  alertPctTimeframe?: number;
  watchlistStep?: "coin" | "custom";
  alertManageStep?: "edit_price" | "edit_percent" | "edit_timeframe";
  editingRuleId?: string;
  tempEditPercent?: number;
  summaryStep?: "time";
}

const WELCOME_TEXT = [
  "Welcome to CryptoWatchr!",
  "",
  "Track cryptocurrencies, create price alerts, check the latest prices, and tune your quiet hours \u2014 all from Telegram.",
  "",
  "Let\u2019s get you set up. What\u2019s your timezone?",
  "You can also type a custom timezone like UTC+2 or America/New_York.",
].join("\n");

const DEFAULT_QUIET_START = "22:00";
const DEFAULT_QUIET_END = "07:00";
const DEFAULT_COOLDOWN_HOURS = 1;

const LANGUAGE_TO_TZ: Record<string, string> = {
  ru: "UTC+3",
  uk: "UTC+3",
  be: "UTC+3",
  kk: "UTC+3",
  tr: "UTC+3",
  ar: "UTC+3",
  zh: "UTC+8",
  ja: "UTC+9",
  ko: "UTC+9",
  th: "UTC+7",
  vi: "UTC+7",
  id: "UTC+7",
  hi: "UTC+5:30",
  bn: "UTC+6",
  ur: "UTC+5",
  fa: "UTC+3:30",
  pt: "UTC-3",
  fr: "UTC+1",
  de: "UTC+1",
  es: "UTC+1",
  it: "UTC+1",
  nl: "UTC+1",
  pl: "UTC+1",
  sv: "UTC+1",
  nb: "UTC+1",
  da: "UTC+1",
  fi: "UTC+2",
  el: "UTC+2",
  ro: "UTC+2",
  bg: "UTC+2",
  cs: "UTC+1",
  sk: "UTC+1",
  hu: "UTC+1",
};

const KNOWN_COINS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  TON: "the-open-network",
  USDT: "tether",
  BNB: "binancecoin",
  SOL: "solana",
  XRP: "ripple",
  USDC: "usd-coin",
  ADA: "cardano",
  DOGE: "dogecoin",
  TRX: "tron",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  MATIC: "matic-network",
  LINK: "chainlink",
  SHIB: "shiba-inu",
  LTC: "litecoin",
  UNI: "uniswap",
  ATOM: "cosmos",
  XLM: "stellar",
  NEAR: "near",
  ALGO: "algorand",
  APT: "aptos",
  SUI: "sui",
  ARB: "arbitrum",
  OP: "optimism",
  FIL: "filecoin",
  ICP: "internet-computer",
  VET: "vechain",
  GRT: "the-graph",
  THETA: "theta-token",
  ETC: "ethereum-classic",
  FTM: "fantom",
  FLOW: "flow",
  SAND: "the-sandbox",
  MANA: "decentraland",
  AXS: "axie-infinity",
  GALA: "gala",
  ENJ: "enjincoin",
  CHZ: "chiliz",
  CRO: "crypto-com-chain",
  FTT: "ftx-token",
  BIT: "bitdao",
  OKB: "okb",
  LEO: "leo-token",
  KCS: "kucoin-shares",
  XMR: "monero",
  DASH: "dash",
  ZEC: "zcash",
  XTZ: "tezos",
  EOS: "eos",
  WAVES: "waves",
  NEO: "neo",
  QTUM: "qtum",
  ZIL: "zilliqa",
  ICX: "icon",
  ONT: "ontology",
  BTT: "bittorrent",
  HOT: "holotoken",
  BAT: "basic-attention-token",
  ZRX: "0x",
  REN: "republic-protocol",
  LRC: "loopring",
  SNX: "havven",
  COMP: "compound-governance-token",
  AAVE: "aave",
  MKR: "maker",
  CRV: "curve-dao-token",
  SUSHI: "sushi",
  YFI: "yearn-finance",
  INJ: "injective-protocol",
  RUNE: "thorchain",
  KAVA: "kava",
  DYDX: "dydx",
  GMX: "gmx",
  LDO: "lido-dao",
  RPL: "rocket-pool",
  STX: "blockstack",
  MINA: "mina-protocol",
  EGLD: "elrond-erd-2",
  XEC: "ecash",
  KLAY: "klay-token",
  KDA: "kadena",
  CSPR: "casper-network",
  FLR: "flare-networks",
  CORE: "coredaoorg",
  CFX: "conflux-token",
  AKT: "akash-network",
  ROSE: "oasis-network",
  GLMR: "moonbeam",
  MOVR: "moonriver",
  ASTR: "astar",
  AUDIO: "audius",
  ENS: "ethereum-name-service",
  LPT: "livepeer",
  FET: "fetch-ai",
  AGIX: "singularitynet",
  OCEAN: "ocean-protocol",
  WLD: "worldcoin-wld",
  SEI: "sei-network",
  TIA: "celestia",
  PYTH: "pyth-network",
  JUP: "jupiter-exchange-solana",
  WIF: "dogwifcoin",
  NOT: "notcoin",
  PEPE: "pepe",
  FLOKI: "floki",
  BONK: "bonk",
  ORDI: "ordinals",
  STRK: "starknet",
  ENA: "ethena",
  OM: "mantra-dao",
  TAO: "bittensor",
  RENDER: "render-token",
  HNT: "helium",
  BSV: "bitcoin-sv",
  BCH: "bitcoin-cash",
};

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function suggestTickers(input: string, maxSuggestions = 3): string[] {
  const inputUpper = input.toUpperCase();
  if (KNOWN_COINS[inputUpper]) return [];
  const scored = Object.keys(KNOWN_COINS)
    .map((t) => ({ ticker: t, distance: levenshtein(inputUpper, t) }))
    .sort((a, b) => a.distance - b.distance);
  const suggestions = scored
    .filter((s) => s.distance >= 1 && s.distance <= 2)
    .slice(0, maxSuggestions)
    .map((s) => s.ticker);
  return suggestions;
}

function coinIdForTicker(ticker: string): string | null {
  return KNOWN_COINS[ticker.toUpperCase()] ?? null;
}

export { coinIdForTicker, KNOWN_COINS };

function detectTimezone(languageCode?: string): string {
  if (languageCode) {
    const tz = LANGUAGE_TO_TZ[languageCode] ?? LANGUAGE_TO_TZ[languageCode.split("-")[0]];
    if (tz) return tz;
  }
  return "UTC+0";
}

function parseTime(input: string): string | null {
  const m = input.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours < 0 || hours > 23) return null;
  if (minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function confirmText(tz: string, detected?: boolean, quietStart?: string, quietEnd?: string) {
  const hasCustom = quietStart !== undefined || quietEnd !== undefined;
  const start = quietStart ?? DEFAULT_QUIET_START;
  const end = quietEnd ?? DEFAULT_QUIET_END;
  return [
    `Timezone set to ${tz}.${detected ? " (Auto-detected from your language settings.)" : ""}`,
    "",
    hasCustom ? "Your settings:" : "Your default settings:",
    `\u2022 Quiet hours: ${start}\u2013${end} (alerts suppressed while you sleep)`,
    `\u2022 Alert cooldown: ${DEFAULT_COOLDOWN_HOURS} hour (no repeat alerts for the same rule)`,
    "",
    "You can change these anytime in Settings.",
  ].join("\n");
}

const MAIN_MENU_TEXT = [
  "Welcome to CryptoWatchr.",
  "",
  "Track coins, create price alerts, check the latest prices, and tune your quiet hours from the menu below.",
].join("\n");

const HELP_TEXT = [
  "*CryptoWatchr Help*",
  "",
  "Available commands:",
  "/start — Set up your CryptoWatchr profile and open the main menu",
  "/help — Show this help message",
  "/list — View your watchlist and manage tracked coins",
  "/alerts — View and manage your price alerts",
  "/price — Check current prices for a coin or your full watchlist",
  "/summary — Configure your daily morning summary",
  "",
  "You can also use the menu buttons below to manage your watchlist, create alerts, check prices, and configure settings.",
].join("\n");

const MENU_RESPONSES: Record<string, string> = {
  "menu:help": "Help will list commands and explain how CryptoWatchr alerts work.",
};

const ADD_COIN_TEXT = "Add a coin to your watchlist:\n\nChoose from the common coins below or enter a custom ticker.";

function watchlistCoinKeyboard() {
  return inlineKeyboard([
    [{ text: "Bitcoin (BTC)", callback_data: "watchlist:coin:BTC" }],
    [{ text: "Ethereum (ETH)", callback_data: "watchlist:coin:ETH" }],
    [{ text: "Toncoin (TON)", callback_data: "watchlist:coin:TON" }],
    [{ text: "Custom ticker", callback_data: "watchlist:coin:custom" }],
    [{ text: "Back to menu", callback_data: "watchlist:back" }],
  ]);
}

function watchlistAddedText(ticker: string) {
  return `${ticker} added to your watchlist.\n\nUse the menu to manage your watchlist or create alerts for your coins.`;
}

function watchlistDuplicateText(ticker: string) {
  return `${ticker} is already in your watchlist.\n\nUse the menu to manage your watchlist or add another coin.`;
}

function watchlistCustomPromptText() {
  return "Enter the coin ticker you want to add (e.g. SOL, DOGE, ADA):";
}

function watchlistCustomKeyboard() {
  return inlineKeyboard([
    [{ text: "Back", callback_data: "watchlist:back:coin" }],
  ]);
}

function unknownTickerText(input: string, suggestions: string[]) {
  const lines = [`"${input}" is not a recognized ticker.`];
  if (suggestions.length > 0) {
    lines.push("", `Did you mean: ${suggestions.join(", ")}?`);
  }
  lines.push("", "Please try again with a valid ticker, or pick from the preset coins.");
  return lines.join("\n");
}

const EMPTY_WATCHLIST_TEXT = "Your watchlist is empty.\n\nUse the Add Coin menu or type a ticker to start building your watchlist.";

function myWatchlistText(entries: WatchlistEntry[]) {
  if (entries.length === 0) return EMPTY_WATCHLIST_TEXT;
  const lines = ["Your watchlist:"];
  for (const e of entries) {
    lines.push(`\u2022 ${e.ticker}`);
  }
  lines.push("", "Tap Remove to take a coin off your list.");
  return lines.join("\n");
}

function myWatchlistKeyboard(entries: WatchlistEntry[]) {
  const rows = entries.map((e) => [
    { text: `Remove ${e.ticker}`, callback_data: `watchlist:remove:${e.ticker}` },
  ]);
  rows.push([{ text: "Back to menu", callback_data: "menu:back" }]);
  return inlineKeyboard(rows);
}

function clearWatchlistSession(session: Session) {
  session.watchlistStep = undefined;
}

function mainMenu() {
  return menuKeyboard(
    [
      { text: "Add Coin", data: "menu:add" },
      { text: "My Watchlist", data: "menu:watchlist" },
      { text: "Create Alert", data: "menu:alerts" },
      { text: "My Alerts", data: "menu:myalerts" },
      { text: "Price Check", data: "menu:price" },
      { text: "Settings", data: "menu:settings" },
      { text: "Help", data: "menu:help" },
    ],
    2,
  );
}

function timezoneKeyboard() {
  return inlineKeyboard([
    [
      { text: "UTC-8 (PST)", callback_data: "onboard:tz:UTC-8" },
      { text: "UTC-5 (EST)", callback_data: "onboard:tz:UTC-5" },
    ],
    [
      { text: "UTC+0 (GMT)", callback_data: "onboard:tz:UTC+0" },
      { text: "UTC+3 (MSK)", callback_data: "onboard:tz:UTC+3" },
    ],
    [
      { text: "UTC+8 (CST)", callback_data: "onboard:tz:UTC+8" },
      { text: "Skip for now", callback_data: "onboard:skip" },
    ],
  ]);
}

function confirmKeyboard() {
  return inlineKeyboard([
    [{ text: "Set Quiet Hours", callback_data: "onboard:qhours" }],
    [{ text: "Continue to menu", callback_data: "onboard:done" }],
  ]);
}

const ALERT_TYPE_TEXT = "Choose the type of alert you want to create:";

function alertTypeKeyboard() {
  return inlineKeyboard([
    [{ text: "Threshold Alert", callback_data: "alert:type:threshold" }],
    [{ text: "Percent Alert", callback_data: "alert:type:percent" }],
    [{ text: "Back to menu", callback_data: "menu:back" }],
  ]);
}

const COIN_SELECTION_TEXT = "Select a coin for your threshold alert:";

function coinSelectionKeyboard() {
  return inlineKeyboard([
    [{ text: "Bitcoin (BTC)", callback_data: "alert:coin:BTC" }],
    [{ text: "Ethereum (ETH)", callback_data: "alert:coin:ETH" }],
    [{ text: "Toncoin (TON)", callback_data: "alert:coin:TON" }],
    [{ text: "Custom ticker", callback_data: "alert:coin:custom" }],
    [{ text: "Back", callback_data: "alert:back:type" }],
  ]);
}

function directionKeyboard(coin: string) {
  return inlineKeyboard([
    [{ text: "Above", callback_data: "alert:dir:above" }],
    [{ text: "Below", callback_data: "alert:dir:below" }],
    [{ text: "Back", callback_data: "alert:back:coin" }],
  ]);
}

function directionText(coin: string) {
  return `${coin}: When should this threshold alert fire?`;
}

function priceKeyboard() {
  return inlineKeyboard([
    [{ text: "Cancel", callback_data: "alert:cancel" }],
  ]);
}

function pricePromptText(coin: string, direction: string) {
  return `Enter the price threshold in USD for:\n\n${coin} ${direction}\n\nExample: if you enter 60000, you will be alerted when ${coin} goes ${direction} $60,000.`;
}

function alertCreatedText(coin: string, direction: string, price: number) {
  const formattedPrice = price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `Alert created: ${coin} ${direction} $${formattedPrice}`;
}

const PCT_COIN_SELECTION_TEXT = "Select a coin for your percent alert:";

function pctCoinSelectionKeyboard() {
  return inlineKeyboard([
    [{ text: "Bitcoin (BTC)", callback_data: "alert:pcoin:BTC" }],
    [{ text: "Ethereum (ETH)", callback_data: "alert:pcoin:ETH" }],
    [{ text: "Toncoin (TON)", callback_data: "alert:pcoin:TON" }],
    [{ text: "Custom ticker", callback_data: "alert:pcoin:custom" }],
    [{ text: "Any in my list", callback_data: "alert:pcoin:any" }],
    [{ text: "Back", callback_data: "alert:back:type" }],
  ]);
}

function pctPercentKeyboard() {
  return inlineKeyboard([
    [{ text: "Back", callback_data: "alert:pct:back:coin" }],
    [{ text: "Cancel", callback_data: "alert:cancel" }],
  ]);
}

function pctPercentPromptText(coin: string) {
  const label = coin === "any" ? "any coin in your watchlist" : coin;
  return `Enter the percentage change you want to track for ${label}.\n\nExample: if you enter 5, you will be alerted when ${label} moves more than 5% in your chosen timeframe.`;
}

function pctTimeframeKeyboard() {
  return inlineKeyboard([
    [{ text: "Back", callback_data: "alert:pct:back:pct" }],
    [{ text: "Cancel", callback_data: "alert:cancel" }],
  ]);
}

const PCT_TIMEFRAME_PROMPT_TEXT = [
  "Enter the timeframe for your percent alert.",
  "",
  "Examples:",
  "1h — 1 hour",
  "4h — 4 hours",
  "30m — 30 minutes",
  "60 — 60 minutes (plain number = minutes)",
  "2.5h — 2 hours 30 minutes",
  "",
  "Default: 1 hour.",
].join("\n");

function pctAlertCreatedText(coin: string, percent: number, timeframeMinutes: number) {
  const formattedPercent = percent.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const coinLabel = coin === "any" ? "any coin in your watchlist" : coin;
  let timeframeLabel: string;
  if (timeframeMinutes >= 60 && timeframeMinutes % 60 === 0) {
    const h = timeframeMinutes / 60;
    timeframeLabel = h === 1 ? "1 hour" : `${h} hours`;
  } else {
    timeframeLabel = `${timeframeMinutes} minutes`;
  }
  return `Percent alert created: ${coinLabel} moves more than ${formattedPercent}% in ${timeframeLabel}`;
}

const EMPTY_ALERTS_TEXT = "You don't have any alerts yet.\n\nUse Create Alert to set up price alerts for your coins.";

function formatAlertDescription(rule: AlertRule): string {
  if (rule.type === "threshold") {
    const formattedPrice = rule.price!.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${rule.coin} ${rule.direction} $${formattedPrice}`;
  }
  const formattedPercent = rule.percent!.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const coinLabel = rule.coin === "any" ? "any coin in your watchlist" : rule.coin;
  let timeframeLabel: string;
  const mins = rule.timeframeMinutes!;
  if (mins >= 60 && mins % 60 === 0) {
    const h = mins / 60;
    timeframeLabel = h === 1 ? "1 hour" : `${h} hours`;
  } else {
    timeframeLabel = `${mins} minutes`;
  }
  return `${coinLabel} moves more than ${formattedPercent}% in ${timeframeLabel}`;
}

function myAlertsText(rules: AlertRule[]): string {
  if (rules.length === 0) return EMPTY_ALERTS_TEXT;
  const lines = ["Your alerts:"];
  for (let i = 0; i < rules.length; i++) {
    lines.push(`${i + 1}. ${formatAlertDescription(rules[i])}`);
  }
  lines.push("", "Tap Edit to modify or Delete to remove an alert.");
  return lines.join("\n");
}

function myAlertsKeyboard(rules: AlertRule[]) {
  const rows = rules.map((r) => [
    { text: "Edit", callback_data: `alerts:edit:${r.id}` },
    { text: "Delete", callback_data: `alerts:delete:${r.id}` },
  ]);
  rows.push([{ text: "Back to menu", callback_data: "menu:back" }]);
  return inlineKeyboard(rows);
}

function deleteConfirmText(rule: AlertRule): string {
  return `Are you sure you want to delete this alert?\n\n${formatAlertDescription(rule)}`;
}

function deleteConfirmKeyboard(ruleId: string) {
  return inlineKeyboard([
    [{ text: "Yes, delete", callback_data: `alerts:delete:confirm:${ruleId}` }],
    [{ text: "Cancel", callback_data: "alerts:delete:cancel" }],
  ]);
}

function editPricePromptText(rule: AlertRule): string {
  return `Edit threshold for:\n\n${rule.coin} ${rule.direction}\n\nCurrent: $${rule.price!.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\nEnter the new price threshold:`;
}

function editPriceKeyboard() {
  return inlineKeyboard([
    [{ text: "Cancel", callback_data: "alerts:edit:cancel" }],
  ]);
}

function editPercentPromptText(rule: AlertRule): string {
  return `Edit percent for:\n\n${rule.coin}\n\nCurrent: ${rule.percent!.toLocaleString("en-US", { maximumFractionDigits: 2 })}%\n\nEnter the new percentage:`;
}

function editPercentKeyboard() {
  return inlineKeyboard([
    [{ text: "Cancel", callback_data: "alerts:edit:cancel" }],
  ]);
}

function editTimeframePromptText(rule: AlertRule): string {
  let label: string;
  const mins = rule.timeframeMinutes!;
  if (mins >= 60 && mins % 60 === 0) {
    const h = mins / 60;
    label = h === 1 ? "1 hour" : `${h} hours`;
  } else {
    label = `${mins} minutes`;
  }
  return `Edit timeframe for:\n\n${rule.coin}\n\nCurrent: ${label}\n\nEnter the new timeframe (e.g. 1h, 4h, 30m, or 60 for minutes):`;
}

function editTimeframeKeyboard() {
  return inlineKeyboard([
    [{ text: "Back", callback_data: "alerts:edit:back:timeframe" }],
    [{ text: "Cancel", callback_data: "alerts:edit:cancel" }],
  ]);
}

function clearAlertManageSession(session: Session) {
  session.alertManageStep = undefined;
  session.editingRuleId = undefined;
  session.tempEditPercent = undefined;
}

function clearAlertSession(session: Session) {
  session.alertStep = undefined;
  session.alertCoin = undefined;
  session.alertDirection = undefined;
  session.alertPctCoin = undefined;
  session.alertPctPercent = undefined;
  session.alertPctTimeframe = undefined;
}

function clearSummarySession(session: Session) {
  session.summaryStep = undefined;
}

function settingsText(summary: MorningSummary | null) {
  const lines = ["*Settings*"];
  lines.push("");
  if (summary) {
    lines.push(`\u2022 Morning Summary: On at ${summary.time}`);
  } else {
    lines.push("\u2022 Morning Summary: Off");
  }
  lines.push("");
  lines.push("Morning summary sends you a daily report of your watched coins at your chosen time.");
  return lines.join("\n");
}

function settingsKeyboard(summary: MorningSummary | null) {
  if (summary) {
    return inlineKeyboard([
      [{ text: "Change Summary Time", callback_data: "settings:summary:time" }],
      [{ text: "Turn Off Summary", callback_data: "settings:summary:disable" }],
      [{ text: "Back to menu", callback_data: "menu:back" }],
    ]);
  }
  return inlineKeyboard([
    [{ text: "Turn On Summary", callback_data: "settings:summary:enable" }],
    [{ text: "Back to menu", callback_data: "menu:back" }],
  ]);
}

function summaryStatusText(summary: MorningSummary | null) {
  const lines = ["*Morning Summary*"];
  lines.push("");
  if (summary) {
    lines.push(`Status: On at ${summary.time}`);
    lines.push("");
    lines.push("You will receive a daily summary of your watched coins at this time.");
    lines.push("Use the buttons below to change the time or turn it off.");
  } else {
    lines.push("Status: Off");
    lines.push("");
    lines.push("Turn on morning summary to receive a daily report of your watched coins.");
  }
  return lines.join("\n");
}

function summaryStatusKeyboard(summary: MorningSummary | null) {
  if (summary) {
    return inlineKeyboard([
      [{ text: "Change Summary Time", callback_data: "settings:summary:time" }],
      [{ text: "Turn Off Summary", callback_data: "settings:summary:disable" }],
      [{ text: "Back to menu", callback_data: "menu:back" }],
    ]);
  }
  return inlineKeyboard([
    [{ text: "Turn On Summary", callback_data: "settings:summary:enable" }],
    [{ text: "Back to menu", callback_data: "menu:back" }],
  ]);
}

export function makeBot(store?: PersistentStore, token = process.env.BOT_TOKEN ?? "test:cryptowatchr") {
  const effectiveStore = store ?? createStore();
  const bot = createBot<Session>(token, {
    initial: () => ({ initializedAt: new Date(0).toISOString() }),
    onError: async (err) => {
      console.error("[CryptoWatchr] unhandled error:", err);
      const botErr = err as { error: unknown; ctx?: { reply?: (text: string) => Promise<unknown>; chat?: { id: number } } };
      if (botErr.ctx?.chat?.id && typeof botErr.ctx.reply === "function") {
        try {
          await botErr.ctx.reply("Something went wrong. Please try again or use /help for assistance.");
        } catch {
          // best-effort reply; ignore if it also fails
        }
      }
    },
  });

  bot.command("start", async (ctx) => {
    clearAlertSession(ctx.session);
    clearAlertManageSession(ctx.session);
    clearWatchlistSession(ctx.session);
    clearSummarySession(ctx.session);
    ctx.session.onboardingStep = "timezone";
    await ctx.reply(WELCOME_TEXT, { reply_markup: timezoneKeyboard() });
  });

  bot.command("help", async (ctx) => {
    clearAlertSession(ctx.session);
    clearAlertManageSession(ctx.session);
    clearWatchlistSession(ctx.session);
    clearSummarySession(ctx.session);
    await ctx.reply(HELP_TEXT, { parse_mode: "Markdown", reply_markup: mainMenu() });
  });

  bot.command("list", async (ctx) => {
    clearAlertSession(ctx.session);
    clearWatchlistSession(ctx.session);
    let entries: WatchlistEntry[];
    try {
      entries = await effectiveStore.getWatchlist(ctx.chat!.id);
    } catch {
      await ctx.reply("Something went wrong. Please try again or use /help for assistance.");
      return;
    }
    await ctx.reply(myWatchlistText(entries), { reply_markup: entries.length > 0 ? myWatchlistKeyboard(entries) : mainMenu() });
  });

  bot.command("alerts", async (ctx) => {
    clearAlertSession(ctx.session);
    clearAlertManageSession(ctx.session);
    clearWatchlistSession(ctx.session);
    let rules: AlertRule[];
    try {
      rules = await effectiveStore.getAlertRules(ctx.chat!.id);
    } catch {
      await ctx.reply("Something went wrong. Please try again or use /help for assistance.");
      return;
    }
    await ctx.reply(myAlertsText(rules), { reply_markup: rules.length > 0 ? myAlertsKeyboard(rules) : mainMenu() });
  });

  bot.command("price", async (ctx) => {
    clearAlertSession(ctx.session);
    clearAlertManageSession(ctx.session);
    clearWatchlistSession(ctx.session);

    const raw = ctx.match?.trim();
    if (raw) {
      const ticker = raw.toUpperCase();
      const coinId = coinIdForTicker(ticker);
      if (!coinId) {
        await ctx.reply(`"${ticker}" is not a recognized ticker. Try a known ticker like BTC, ETH, or SOL.`, { reply_markup: mainMenu() });
        return;
      }
      try {
        const data = await fetchPrices([coinId]);
        const text = formatPriceDisplay(data, [{ ticker, coinId }]);
        await ctx.reply(text, { reply_markup: mainMenu() });
      } catch {
        await ctx.reply("Unable to fetch price data right now. Please try again later.", { reply_markup: mainMenu() });
      }
      return;
    }

    let entries: WatchlistEntry[];
    try {
      entries = await effectiveStore.getWatchlist(ctx.chat!.id);
    } catch {
      await ctx.reply("Something went wrong. Please try again or use /help for assistance.");
      return;
    }

    if (entries.length === 0) {
      await ctx.reply(EMPTY_WATCHLIST_TEXT, { reply_markup: mainMenu() });
      return;
    }

    try {
      const coinIds = [...new Set(entries.map((e) => e.coinId))];
      const data = await fetchPrices(coinIds);
      const text = formatPriceDisplay(data, entries.map((e) => ({ ticker: e.ticker, coinId: e.coinId })));
      await ctx.reply(text, { reply_markup: mainMenu() });
    } catch {
      await ctx.reply("Unable to fetch price data right now. Please try again later.", { reply_markup: mainMenu() });
    }
  });

  bot.command("summary", async (ctx) => {
    clearAlertSession(ctx.session);
    clearAlertManageSession(ctx.session);
    clearWatchlistSession(ctx.session);
    clearSummarySession(ctx.session);
    let summary: MorningSummary | null;
    try {
      summary = await effectiveStore.getMorningSummary(ctx.chat!.id);
    } catch {
      await ctx.reply("Something went wrong. Please try again or use /help for assistance.");
      return;
    }
    await ctx.reply(summaryStatusText(summary), { parse_mode: "Markdown", reply_markup: summaryStatusKeyboard(summary) });
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data.startsWith("onboard:tz:")) {
      const tz = data.slice("onboard:tz:".length);
      ctx.session.timezone = tz;
      ctx.session.onboardingStep = "confirm";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(confirmText(tz, undefined, ctx.session.quietHoursStart, ctx.session.quietHoursEnd), { reply_markup: confirmKeyboard() });
      return;
    }

    if (data === "onboard:qhours") {
      ctx.session.quietHoursStep = "start";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        "Set your quiet hours.\n\nWhat time should your quiet hours start? (HH:MM, 24-hour format)\n\nExample: 22:00",
        { reply_markup: inlineKeyboard([[{ text: "Keep defaults", callback_data: "onboard:qhours:skip" }]]) },
      );
      return;
    }

    if (data === "onboard:qhours:skip") {
      ctx.session.quietHoursStep = undefined;
      ctx.session.quietHoursStart = undefined;
      ctx.session.quietHoursEnd = undefined;
      try {
        await effectiveStore.deleteQuietHours(ctx.chat!.id);
      } catch {
        // best-effort; if deletion fails, defaults still show correctly
      }
      const tz = ctx.session.timezone ?? detectTimezone(ctx.from?.language_code);
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(confirmText(tz), { reply_markup: confirmKeyboard() });
      return;
    }

    if (data === "onboard:skip") {
      ctx.session.onboardingStep = undefined;
      ctx.session.timezone = detectTimezone(ctx.from?.language_code);
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(MAIN_MENU_TEXT, { reply_markup: mainMenu() });
      return;
    }

    if (data === "onboard:done") {
      ctx.session.onboardingStep = undefined;
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(MAIN_MENU_TEXT, { reply_markup: mainMenu() });
      return;
    }

    // --- Watchlist flow callbacks ---

    if (data === "menu:add") {
      clearAlertSession(ctx.session);
      clearWatchlistSession(ctx.session);
      ctx.session.watchlistStep = "coin";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(ADD_COIN_TEXT, { reply_markup: watchlistCoinKeyboard() });
      return;
    }

    if (data === "menu:watchlist") {
      clearAlertSession(ctx.session);
      clearWatchlistSession(ctx.session);
      let entries: WatchlistEntry[];
      try {
        entries = await effectiveStore.getWatchlist(ctx.chat!.id);
      } catch {
        await ctx.answerCallbackQuery({ text: "Failed to load watchlist." });
        return;
      }
      await ctx.answerCallbackQuery();
      if (entries.length === 0) {
        await ctx.editMessageText(EMPTY_WATCHLIST_TEXT, { reply_markup: mainMenu() });
      } else {
        await ctx.editMessageText(myWatchlistText(entries), { reply_markup: myWatchlistKeyboard(entries) });
      }
      return;
    }

    if (data.startsWith("watchlist:coin:")) {
      const coin = data.slice("watchlist:coin:".length);

      if (coin === "custom") {
        ctx.session.watchlistStep = "custom";
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(watchlistCustomPromptText(), { reply_markup: watchlistCustomKeyboard() });
        return;
      }

      const coinId = coinIdForTicker(coin);
      if (!coinId) {
        await ctx.answerCallbackQuery({ text: "Coin not recognized." });
        return;
      }

      try {
        const already = await effectiveStore.isInWatchlist(ctx.chat!.id, coin);
        if (already) {
          await ctx.answerCallbackQuery();
          await ctx.editMessageText(watchlistDuplicateText(coin), { reply_markup: mainMenu() });
          clearWatchlistSession(ctx.session);
          return;
        }
        await effectiveStore.addToWatchlist(ctx.chat!.id, coin, coinId);
      } catch {
        await ctx.answerCallbackQuery({ text: "Failed to add coin. Please try again." });
        return;
      }

      await ctx.answerCallbackQuery();
      await ctx.editMessageText(watchlistAddedText(coin), { reply_markup: mainMenu() });
      clearWatchlistSession(ctx.session);
      return;
    }

    if (data === "watchlist:back") {
      clearWatchlistSession(ctx.session);
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(MAIN_MENU_TEXT, { reply_markup: mainMenu() });
      return;
    }

    if (data === "watchlist:back:coin") {
      ctx.session.watchlistStep = "coin";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(ADD_COIN_TEXT, { reply_markup: watchlistCoinKeyboard() });
      return;
    }

    if (data.startsWith("watchlist:remove:")) {
      const ticker = data.slice("watchlist:remove:".length);
      try {
        await effectiveStore.removeFromWatchlist(ctx.chat!.id, ticker);
      } catch {
        await ctx.answerCallbackQuery({ text: "Failed to remove coin. Please try again." });
        return;
      }
      await ctx.answerCallbackQuery({ text: `${ticker} removed from watchlist.` });
      let entries: WatchlistEntry[];
      try {
        entries = await effectiveStore.getWatchlist(ctx.chat!.id);
      } catch {
        await ctx.editMessageText("Something went wrong. Please try again.", { reply_markup: mainMenu() });
        return;
      }
      if (entries.length === 0) {
        await ctx.editMessageText(EMPTY_WATCHLIST_TEXT, { reply_markup: mainMenu() });
      } else {
        await ctx.editMessageText(myWatchlistText(entries), { reply_markup: myWatchlistKeyboard(entries) });
      }
      return;
    }

    // --- Alert flow callbacks ---

    if (data === "menu:alerts") {
      clearAlertSession(ctx.session);
      ctx.session.alertStep = "type";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(ALERT_TYPE_TEXT, { reply_markup: alertTypeKeyboard() });
      return;
    }

    if (data === "menu:myalerts") {
      clearAlertSession(ctx.session);
      clearAlertManageSession(ctx.session);
      clearWatchlistSession(ctx.session);
      let rules: AlertRule[];
      try {
        rules = await effectiveStore.getAlertRules(ctx.chat!.id);
      } catch {
        await ctx.answerCallbackQuery({ text: "Failed to load alerts." });
        return;
      }
      await ctx.answerCallbackQuery();
      if (rules.length === 0) {
        await ctx.editMessageText(EMPTY_ALERTS_TEXT, { reply_markup: mainMenu() });
      } else {
        await ctx.editMessageText(myAlertsText(rules), { reply_markup: myAlertsKeyboard(rules) });
      }
      return;
    }

    if (data === "menu:back") {
      clearAlertSession(ctx.session);
      clearAlertManageSession(ctx.session);
      clearWatchlistSession(ctx.session);
      clearSummarySession(ctx.session);
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(MAIN_MENU_TEXT, { reply_markup: mainMenu() });
      return;
    }

    if (data === "alert:type:threshold") {
      ctx.session.alertStep = "coin";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(COIN_SELECTION_TEXT, { reply_markup: coinSelectionKeyboard() });
      return;
    }

    if (data === "alert:type:percent") {
      ctx.session.alertStep = "pctCoin";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(PCT_COIN_SELECTION_TEXT, { reply_markup: pctCoinSelectionKeyboard() });
      return;
    }

    if (data.startsWith("alert:coin:")) {
      const coin = data.slice("alert:coin:".length);

      if (coin === "custom") {
        ctx.session.alertStep = "coin";
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(
          "Enter the coin ticker (e.g. SOL, DOGE, ADA):",
          { reply_markup: inlineKeyboard([[{ text: "Back", callback_data: "alert:back:type" }]]) },
        );
        return;
      }

      ctx.session.alertCoin = coin;
      ctx.session.alertStep = "direction";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(directionText(coin), { reply_markup: directionKeyboard(coin) });
      return;
    }

    if (data === "alert:back:type") {
      ctx.session.alertStep = "type";
      ctx.session.alertCoin = undefined;
      ctx.session.alertDirection = undefined;
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(ALERT_TYPE_TEXT, { reply_markup: alertTypeKeyboard() });
      return;
    }

    if (data === "alert:back:coin") {
      ctx.session.alertStep = "coin";
      ctx.session.alertDirection = undefined;
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(COIN_SELECTION_TEXT, { reply_markup: coinSelectionKeyboard() });
      return;
    }

    if (data === "alert:cancel") {
      clearAlertSession(ctx.session);
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(MAIN_MENU_TEXT, { reply_markup: mainMenu() });
      return;
    }

    if (data.startsWith("alert:dir:")) {
      const dir = data.slice("alert:dir:".length) as "above" | "below";
      const coin = ctx.session.alertCoin;
      if (!coin) {
        clearAlertSession(ctx.session);
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(MAIN_MENU_TEXT, { reply_markup: mainMenu() });
        return;
      }
      ctx.session.alertDirection = dir;
      ctx.session.alertStep = "price";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(pricePromptText(coin, dir), { reply_markup: priceKeyboard() });
      return;
    }

    // --- Percent alert callbacks ---

    if (data.startsWith("alert:pcoin:")) {
      const coin = data.slice("alert:pcoin:".length);

      if (coin === "custom") {
        ctx.session.alertStep = "pctCoin";
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(
          "Enter the coin ticker (e.g. SOL, DOGE, ADA):",
          { reply_markup: inlineKeyboard([[{ text: "Back", callback_data: "alert:back:type" }]]) },
        );
        return;
      }

      ctx.session.alertPctCoin = coin;
      ctx.session.alertStep = "pctPercent";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(pctPercentPromptText(coin), { reply_markup: pctPercentKeyboard() });
      return;
    }

    if (data === "alert:pct:back:coin") {
      ctx.session.alertStep = "pctCoin";
      ctx.session.alertPctPercent = undefined;
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(PCT_COIN_SELECTION_TEXT, { reply_markup: pctCoinSelectionKeyboard() });
      return;
    }

    if (data === "alert:pct:back:pct") {
      ctx.session.alertStep = "pctPercent";
      ctx.session.alertPctTimeframe = undefined;
      await ctx.answerCallbackQuery();
      const coin = ctx.session.alertPctCoin ?? "BTC";
      await ctx.editMessageText(pctPercentPromptText(coin), { reply_markup: pctPercentKeyboard() });
      return;
    }

    // --- End alert flow callbacks ---

    // --- Alert management callbacks ---

    if (data === "alerts:delete:cancel") {
      clearAlertManageSession(ctx.session);
      let rules: AlertRule[];
      try {
        rules = await effectiveStore.getAlertRules(ctx.chat!.id);
      } catch {
        await ctx.answerCallbackQuery({ text: "Failed to load alerts." });
        await ctx.editMessageText(MAIN_MENU_TEXT, { reply_markup: mainMenu() });
        return;
      }
      await ctx.answerCallbackQuery();
      if (rules.length === 0) {
        await ctx.editMessageText(EMPTY_ALERTS_TEXT, { reply_markup: mainMenu() });
      } else {
        await ctx.editMessageText(myAlertsText(rules), { reply_markup: myAlertsKeyboard(rules) });
      }
      return;
    }

    if (data.startsWith("alerts:delete:confirm:")) {
      const ruleId = data.slice("alerts:delete:confirm:".length);
      try {
        await effectiveStore.deleteAlertRule(ctx.chat!.id, ruleId);
      } catch {
        await ctx.answerCallbackQuery({ text: "Failed to delete alert." });
        return;
      }
      await ctx.answerCallbackQuery({ text: "Alert deleted." });
      let rules: AlertRule[];
      try {
        rules = await effectiveStore.getAlertRules(ctx.chat!.id);
      } catch {
        await ctx.editMessageText("Something went wrong.", { reply_markup: mainMenu() });
        return;
      }
      if (rules.length === 0) {
        await ctx.editMessageText(EMPTY_ALERTS_TEXT, { reply_markup: mainMenu() });
      } else {
        await ctx.editMessageText(myAlertsText(rules), { reply_markup: myAlertsKeyboard(rules) });
      }
      return;
    }

    if (data.startsWith("alerts:delete:")) {
      const ruleId = data.slice("alerts:delete:".length);
      let rules: AlertRule[];
      try {
        rules = await effectiveStore.getAlertRules(ctx.chat!.id);
      } catch {
        await ctx.answerCallbackQuery({ text: "Failed to load alert." });
        return;
      }
      const rule = rules.find((r) => r.id === ruleId);
      if (!rule) {
        await ctx.answerCallbackQuery({ text: "Alert not found." });
        return;
      }
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(deleteConfirmText(rule), { reply_markup: deleteConfirmKeyboard(ruleId) });
      return;
    }

    if (data === "alerts:edit:cancel") {
      clearAlertManageSession(ctx.session);
      let rules: AlertRule[];
      try {
        rules = await effectiveStore.getAlertRules(ctx.chat!.id);
      } catch {
        await ctx.answerCallbackQuery({ text: "Failed to load alerts." });
        await ctx.editMessageText(MAIN_MENU_TEXT, { reply_markup: mainMenu() });
        return;
      }
      await ctx.answerCallbackQuery();
      if (rules.length === 0) {
        await ctx.editMessageText(EMPTY_ALERTS_TEXT, { reply_markup: mainMenu() });
      } else {
        await ctx.editMessageText(myAlertsText(rules), { reply_markup: myAlertsKeyboard(rules) });
      }
      return;
    }

    if (data === "alerts:edit:back:timeframe") {
      ctx.session.alertManageStep = "edit_percent";
      if (!ctx.session.editingRuleId) {
        clearAlertManageSession(ctx.session);
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(MAIN_MENU_TEXT, { reply_markup: mainMenu() });
        return;
      }
      let rules: AlertRule[];
      try {
        rules = await effectiveStore.getAlertRules(ctx.chat!.id);
      } catch {
        clearAlertManageSession(ctx.session);
        await ctx.answerCallbackQuery({ text: "Failed to load alert." });
        await ctx.editMessageText(MAIN_MENU_TEXT, { reply_markup: mainMenu() });
        return;
      }
      const rule = rules.find((r) => r.id === ctx.session.editingRuleId);
      if (!rule) {
        clearAlertManageSession(ctx.session);
        await ctx.answerCallbackQuery({ text: "Alert not found." });
        await ctx.editMessageText(MAIN_MENU_TEXT, { reply_markup: mainMenu() });
        return;
      }
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(editPercentPromptText(rule), { reply_markup: editPercentKeyboard() });
      return;
    }

    if (data.startsWith("alerts:edit:")) {
      const ruleId = data.slice("alerts:edit:".length);
      clearAlertSession(ctx.session);
      clearAlertManageSession(ctx.session);
      let rules: AlertRule[];
      try {
        rules = await effectiveStore.getAlertRules(ctx.chat!.id);
      } catch {
        await ctx.answerCallbackQuery({ text: "Failed to load alert." });
        return;
      }
      const rule = rules.find((r) => r.id === ruleId);
      if (!rule) {
        await ctx.answerCallbackQuery({ text: "Alert not found." });
        return;
      }
      ctx.session.editingRuleId = ruleId;
      if (rule.type === "threshold") {
        ctx.session.alertManageStep = "edit_price";
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(editPricePromptText(rule), { reply_markup: editPriceKeyboard() });
      } else {
        ctx.session.alertManageStep = "edit_percent";
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(editPercentPromptText(rule), { reply_markup: editPercentKeyboard() });
      }
      return;
    }

    // --- End alert management callbacks ---

    if (data === "menu:price") {
      clearAlertSession(ctx.session);
      clearAlertManageSession(ctx.session);
      clearWatchlistSession(ctx.session);
      let entries: WatchlistEntry[];
      try {
        entries = await effectiveStore.getWatchlist(ctx.chat!.id);
      } catch {
        await ctx.answerCallbackQuery({ text: "Failed to load watchlist." });
        return;
      }
      if (entries.length === 0) {
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(EMPTY_WATCHLIST_TEXT, { reply_markup: mainMenu() });
        return;
      }
      try {
        const coinIds = [...new Set(entries.map((e) => e.coinId))];
        const data = await fetchPrices(coinIds);
        const text = formatPriceDisplay(data, entries.map((e) => ({ ticker: e.ticker, coinId: e.coinId })));
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(text, { reply_markup: mainMenu() });
      } catch {
        await ctx.answerCallbackQuery({ text: "Unable to fetch prices." });
        await ctx.editMessageText("Unable to fetch price data right now. Please try again later.", { reply_markup: mainMenu() });
      }
      return;
    }

    // --- Settings callbacks ---

    if (data === "menu:settings") {
      clearAlertSession(ctx.session);
      clearAlertManageSession(ctx.session);
      clearWatchlistSession(ctx.session);
      clearSummarySession(ctx.session);
      let summary: MorningSummary | null;
      try {
        summary = await effectiveStore.getMorningSummary(ctx.chat!.id);
      } catch {
        await ctx.answerCallbackQuery({ text: "Failed to load settings." });
        return;
      }
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(settingsText(summary), { parse_mode: "Markdown", reply_markup: settingsKeyboard(summary) });
      return;
    }

    if (data === "settings:summary:enable") {
      ctx.session.summaryStep = "time";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        "Enter the time for your daily morning summary (HH:MM, 24-hour format, in your timezone):\n\nExample: 08:00",
        { reply_markup: inlineKeyboard([[{ text: "Back", callback_data: "settings:summary:back" }]]) },
      );
      return;
    }

    if (data === "settings:summary:time") {
      ctx.session.summaryStep = "time";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        "Enter the new time for your daily morning summary (HH:MM, 24-hour format, in your timezone):\n\nExample: 08:00",
        { reply_markup: inlineKeyboard([[{ text: "Back", callback_data: "settings:summary:back" }]]) },
      );
      return;
    }

    if (data === "settings:summary:back") {
      clearSummarySession(ctx.session);
      let summary: MorningSummary | null;
      try {
        summary = await effectiveStore.getMorningSummary(ctx.chat!.id);
      } catch {
        await ctx.answerCallbackQuery({ text: "Failed to load settings." });
        return;
      }
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(settingsText(summary), { parse_mode: "Markdown", reply_markup: settingsKeyboard(summary) });
      return;
    }

    if (data === "settings:summary:disable") {
      try {
        await effectiveStore.deleteMorningSummary(ctx.chat!.id);
      } catch {
        await ctx.answerCallbackQuery({ text: "Failed to update settings." });
        return;
      }
      let summary: MorningSummary | null;
      try {
        summary = await effectiveStore.getMorningSummary(ctx.chat!.id);
      } catch {
        await ctx.answerCallbackQuery({ text: "Failed to load settings." });
        return;
      }
      await ctx.answerCallbackQuery({ text: "Morning summary turned off." });
      await ctx.editMessageText(settingsText(summary), { parse_mode: "Markdown", reply_markup: settingsKeyboard(summary) });
      return;
    }

    // --- End settings callbacks ---

    const response = MENU_RESPONSES[data];

    if (!response) {
      await ctx.answerCallbackQuery({ text: "Choose an option from the menu." });
      return;
    }

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(response, { reply_markup: mainMenu() });
  });

  bot.on("message", async (ctx) => {
    if (ctx.message?.text?.startsWith("/")) {
      await ctx.reply("Unknown command. Type /help to see available commands.");
      return;
    }

    if (ctx.session.onboardingStep === "timezone") {
      const tz = ctx.message?.text?.trim();
      if (tz) {
        ctx.session.timezone = tz;
        ctx.session.onboardingStep = "confirm";
        await ctx.reply(confirmText(tz, undefined, ctx.session.quietHoursStart, ctx.session.quietHoursEnd), { reply_markup: confirmKeyboard() });
      }
      return;
    }

    if (ctx.session.quietHoursStep === "start") {
      const raw = ctx.message?.text?.trim();
      const parsed = parseTime(raw ?? "");
      if (!parsed) {
        await ctx.reply(
          "Please enter a valid time in HH:MM format (e.g. 22:00).",
          { reply_markup: inlineKeyboard([[{ text: "Keep defaults", callback_data: "onboard:qhours:skip" }]]) },
        );
        return;
      }
      ctx.session.quietHoursStart = parsed;
      ctx.session.quietHoursStep = "end";
      await ctx.reply(
        "What time should your quiet hours end? (HH:MM, 24-hour format)\n\nExample: 07:00",
        { reply_markup: inlineKeyboard([[{ text: "Keep defaults", callback_data: "onboard:qhours:skip" }]]) },
      );
      return;
    }

    if (ctx.session.quietHoursStep === "end") {
      const raw = ctx.message?.text?.trim();
      const parsed = parseTime(raw ?? "");
      if (!parsed) {
        await ctx.reply(
          "Please enter a valid time in HH:MM format (e.g. 07:00).",
          { reply_markup: inlineKeyboard([[{ text: "Keep defaults", callback_data: "onboard:qhours:skip" }]]) },
        );
        return;
      }
      ctx.session.quietHoursEnd = parsed;
      ctx.session.quietHoursStep = undefined;

      try {
        await effectiveStore.setQuietHours(ctx.chat!.id, ctx.session.quietHoursStart!, parsed);
      } catch {
        ctx.session.quietHoursStart = undefined;
        ctx.session.quietHoursEnd = undefined;
      }

      const tz = ctx.session.timezone ?? detectTimezone(ctx.from?.language_code);
      await ctx.reply(
        confirmText(tz, undefined, ctx.session.quietHoursStart, ctx.session.quietHoursEnd),
        { reply_markup: confirmKeyboard() },
      );
      return;
    }

    // --- Watchlist flow message handlers ---

    if (ctx.session.watchlistStep === "custom") {
      const raw = ctx.message?.text?.trim().toUpperCase();
      if (!raw || raw.length < 2) {
        await ctx.reply(
          "Please enter a valid ticker (at least 2 characters, e.g. BTC, ETH).",
          { reply_markup: watchlistCustomKeyboard() },
        );
        return;
      }

      const coinId = coinIdForTicker(raw);
      if (!coinId) {
        const suggestions = suggestTickers(raw);
        await ctx.reply(unknownTickerText(raw, suggestions), { reply_markup: watchlistCoinKeyboard() });
        ctx.session.watchlistStep = "coin";
        return;
      }

      try {
        const already = await effectiveStore.isInWatchlist(ctx.chat!.id, raw);
        if (already) {
          await ctx.reply(watchlistDuplicateText(raw), { reply_markup: mainMenu() });
          clearWatchlistSession(ctx.session);
          return;
        }
        await effectiveStore.addToWatchlist(ctx.chat!.id, raw, coinId);
      } catch {
        await ctx.reply("Failed to add coin. Please try again later.", { reply_markup: mainMenu() });
        clearWatchlistSession(ctx.session);
        return;
      }

      await ctx.reply(watchlistAddedText(raw), { reply_markup: mainMenu() });
      clearWatchlistSession(ctx.session);
      return;
    }

    // --- Alert flow message handlers ---

    if (ctx.session.alertStep === "coin") {
      const ticker = ctx.message?.text?.trim().toUpperCase();
      if (ticker && ticker.length >= 2) {
        ctx.session.alertCoin = ticker;
        ctx.session.alertStep = "direction";
        await ctx.reply(directionText(ticker), { reply_markup: directionKeyboard(ticker) });
      } else {
        await ctx.reply(
          "Please enter a valid ticker (e.g. BTC, ETH).",
          { reply_markup: inlineKeyboard([[{ text: "Back", callback_data: "alert:back:type" }]]) },
        );
      }
      return;
    }

    if (ctx.session.alertStep === "price") {
      const raw = ctx.message?.text?.trim().replace(/[,\s$]/g, "");
      const price = Number(raw);
      const coin = ctx.session.alertCoin;
      const direction = ctx.session.alertDirection;

      if (isNaN(price) || price <= 0) {
        if (coin && direction) {
          await ctx.reply(
            "Please enter a valid positive number for the price in USD.",
            { reply_markup: priceKeyboard() },
          );
        } else {
          clearAlertSession(ctx.session);
          await ctx.reply("Something went wrong. Please try again from the Create Alert menu.", { reply_markup: mainMenu() });
        }
        return;
      }

      if (!coin || !direction) {
        clearAlertSession(ctx.session);
        await ctx.reply(MAIN_MENU_TEXT, { reply_markup: mainMenu() });
        return;
      }

      const rule = newAlertRule(ctx.chat!.id, coin, direction, price);
      try {
        await effectiveStore.createAlertRule(rule);
      } catch {
        await ctx.reply("Failed to save your alert. Please try again later.", { reply_markup: mainMenu() });
        clearAlertSession(ctx.session);
        return;
      }

      clearAlertSession(ctx.session);
      await ctx.reply(alertCreatedText(coin, direction, price), { reply_markup: mainMenu() });
      return;
    }

    if (ctx.session.alertStep === "pctCoin") {
      const ticker = ctx.message?.text?.trim().toUpperCase();
      if (ticker && ticker.length >= 2) {
        ctx.session.alertPctCoin = ticker;
        ctx.session.alertStep = "pctPercent";
        await ctx.reply(pctPercentPromptText(ticker), { reply_markup: pctPercentKeyboard() });
      } else {
        await ctx.reply(
          "Please enter a valid ticker (e.g. BTC, ETH).",
          { reply_markup: inlineKeyboard([[{ text: "Back", callback_data: "alert:back:type" }]]) },
        );
      }
      return;
    }

    if (ctx.session.alertStep === "pctPercent") {
      const raw = ctx.message?.text?.trim().replace(/[,\s%]/g, "");
      const percent = Number(raw);
      const coin = ctx.session.alertPctCoin;

      if (isNaN(percent) || percent <= 0) {
        if (coin) {
          await ctx.reply(
            "Please enter a valid positive percentage (e.g. 5 for 5%).",
            { reply_markup: pctPercentKeyboard() },
          );
        } else {
          clearAlertSession(ctx.session);
          await ctx.reply("Something went wrong. Please try again from the Create Alert menu.", { reply_markup: mainMenu() });
        }
        return;
      }

      if (!coin) {
        clearAlertSession(ctx.session);
        await ctx.reply(MAIN_MENU_TEXT, { reply_markup: mainMenu() });
        return;
      }

      ctx.session.alertPctPercent = percent;
      ctx.session.alertStep = "pctTimeframe";
      await ctx.reply(PCT_TIMEFRAME_PROMPT_TEXT, { reply_markup: pctTimeframeKeyboard() });
      return;
    }

    if (ctx.session.alertStep === "pctTimeframe") {
      const raw = ctx.message?.text?.trim().toLowerCase();

      if (!raw) {
        await ctx.reply(
          "Please enter a valid timeframe (e.g. 1h, 4h, 30m, or 60 for minutes).",
          { reply_markup: pctTimeframeKeyboard() },
        );
        return;
      }

      let minutes: number;

      const hMatch = raw.match(/^([\d.]+)\s*h$/);
      const mMatch = raw.match(/^([\d.]+)\s*m$/);
      const numMatch = raw.match(/^([\d.]+)$/);

      if (hMatch) {
        minutes = Math.round(Number(hMatch[1]) * 60);
      } else if (mMatch) {
        minutes = Math.round(Number(mMatch[1]));
      } else if (numMatch) {
        minutes = Math.round(Number(numMatch[1]));
      } else {
        minutes = NaN;
      }

      const coin = ctx.session.alertPctCoin;
      const percent = ctx.session.alertPctPercent;

      if (isNaN(minutes) || minutes <= 0) {
        await ctx.reply(
          "Please enter a valid timeframe (e.g. 1h, 4h, 30m, or 60 for minutes).",
          { reply_markup: pctTimeframeKeyboard() },
        );
        return;
      }

      if (!coin || percent == null || isNaN(percent)) {
        clearAlertSession(ctx.session);
        await ctx.reply(MAIN_MENU_TEXT, { reply_markup: mainMenu() });
        return;
      }

      const rule = newPercentAlertRule(ctx.chat!.id, coin, percent, minutes);
      try {
        await effectiveStore.createAlertRule(rule);
      } catch {
        await ctx.reply("Failed to save your alert. Please try again later.", { reply_markup: mainMenu() });
        clearAlertSession(ctx.session);
        return;
      }

      clearAlertSession(ctx.session);
      await ctx.reply(pctAlertCreatedText(coin, percent, minutes), { reply_markup: mainMenu() });
      return;
    }

    // --- End alert flow message handlers ---

    // --- Alert management message handlers ---

    if (ctx.session.alertManageStep === "edit_price") {
      const raw = ctx.message?.text?.trim().replace(/[,\s$]/g, "");
      const price = Number(raw);
      if (isNaN(price) || price <= 0) {
        await ctx.reply("Please enter a valid positive number for the price in USD.", { reply_markup: editPriceKeyboard() });
        return;
      }
      let rules: AlertRule[];
      try {
        rules = await effectiveStore.getAlertRules(ctx.chat!.id);
      } catch {
        clearAlertManageSession(ctx.session);
        await ctx.reply("Failed to load your alerts.", { reply_markup: mainMenu() });
        return;
      }
      const rule = rules.find((r) => r.id === ctx.session.editingRuleId);
      if (!rule) {
        clearAlertManageSession(ctx.session);
        await ctx.reply("Alert not found.", { reply_markup: mainMenu() });
        return;
      }
      const updated: AlertRule = { ...rule, price };
      try {
        await effectiveStore.createAlertRule(updated);
      } catch {
        await ctx.reply("Failed to update alert.", { reply_markup: mainMenu() });
        clearAlertManageSession(ctx.session);
        return;
      }
      clearAlertManageSession(ctx.session);
      await ctx.reply(`Alert updated: ${formatAlertDescription(updated)}`, { reply_markup: mainMenu() });
      return;
    }

    if (ctx.session.alertManageStep === "edit_percent") {
      const raw = ctx.message?.text?.trim().replace(/[,\s%]/g, "");
      const percent = Number(raw);
      if (isNaN(percent) || percent <= 0) {
        await ctx.reply("Please enter a valid positive percentage (e.g. 5 for 5%).", { reply_markup: editPercentKeyboard() });
        return;
      }
      let rules: AlertRule[];
      try {
        rules = await effectiveStore.getAlertRules(ctx.chat!.id);
      } catch {
        clearAlertManageSession(ctx.session);
        await ctx.reply("Failed to load your alerts.", { reply_markup: mainMenu() });
        return;
      }
      const rule = rules.find((r) => r.id === ctx.session.editingRuleId);
      if (!rule) {
        clearAlertManageSession(ctx.session);
        await ctx.reply("Alert not found.", { reply_markup: mainMenu() });
        return;
      }
      ctx.session.alertManageStep = "edit_timeframe";
      ctx.session.tempEditPercent = percent;
      await ctx.reply(editTimeframePromptText(rule), { reply_markup: editTimeframeKeyboard() });
      return;
    }

    if (ctx.session.alertManageStep === "edit_timeframe") {
      const raw = ctx.message?.text?.trim().toLowerCase();

      if (!raw) {
        await ctx.reply("Please enter a valid timeframe (e.g. 1h, 4h, 30m, or 60 for minutes).", { reply_markup: editTimeframeKeyboard() });
        return;
      }

      let minutes: number;

      const hMatch = raw.match(/^([\d.]+)\s*h$/);
      const mMatch = raw.match(/^([\d.]+)\s*m$/);
      const numMatch = raw.match(/^([\d.]+)$/);

      if (hMatch) {
        minutes = Math.round(Number(hMatch[1]) * 60);
      } else if (mMatch) {
        minutes = Math.round(Number(mMatch[1]));
      } else if (numMatch) {
        minutes = Math.round(Number(numMatch[1]));
      } else {
        minutes = NaN;
      }

      if (isNaN(minutes) || minutes <= 0) {
        await ctx.reply("Please enter a valid timeframe (e.g. 1h, 4h, 30m, or 60 for minutes).", { reply_markup: editTimeframeKeyboard() });
        return;
      }

      let rules: AlertRule[];
      try {
        rules = await effectiveStore.getAlertRules(ctx.chat!.id);
      } catch {
        clearAlertManageSession(ctx.session);
        await ctx.reply("Failed to load your alerts.", { reply_markup: mainMenu() });
        return;
      }
      const rule = rules.find((r) => r.id === ctx.session.editingRuleId);
      if (!rule) {
        clearAlertManageSession(ctx.session);
        await ctx.reply("Alert not found.", { reply_markup: mainMenu() });
        return;
      }
      const updated: AlertRule = { ...rule, percent: ctx.session.tempEditPercent, timeframeMinutes: minutes };
      try {
        await effectiveStore.createAlertRule(updated);
      } catch {
        await ctx.reply("Failed to update alert.", { reply_markup: mainMenu() });
        clearAlertManageSession(ctx.session);
        return;
      }
      clearAlertManageSession(ctx.session);
      await ctx.reply(`Alert updated: ${formatAlertDescription(updated)}`, { reply_markup: mainMenu() });
      return;
    }

    // --- End alert management message handlers ---

    // --- Morning summary message handlers ---

    if (ctx.session.summaryStep === "time") {
      const raw = ctx.message?.text?.trim();
      const parsed = parseTime(raw ?? "");
      if (!parsed) {
        await ctx.reply(
          "Please enter a valid time in HH:MM format (e.g. 08:00).",
          { reply_markup: inlineKeyboard([[{ text: "Back", callback_data: "settings:summary:back" }]]) },
        );
        return;
      }
      try {
        await effectiveStore.setMorningSummary(ctx.chat!.id, parsed);
      } catch {
        await ctx.reply("Failed to save summary time. Please try again later.", { reply_markup: mainMenu() });
        clearSummarySession(ctx.session);
        return;
      }
      clearSummarySession(ctx.session);
      let summary: MorningSummary | null;
      try {
        summary = await effectiveStore.getMorningSummary(ctx.chat!.id);
      } catch {
        await ctx.reply("Morning summary is now on at " + parsed + ".", { reply_markup: mainMenu() });
        return;
      }
      const statusText = summary
        ? `Morning summary is now on at ${summary.time}.`
        : "Morning summary is now on at " + parsed + ".";
      await ctx.reply(statusText, { reply_markup: mainMenu() });
      return;
    }

    // --- End morning summary message handlers ---

    await ctx.reply("CryptoWatchr is online. Send /start to begin setup.");
  });

  return bot;
}

async function main() {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.error("BOT_TOKEN is required");
    process.exit(1);
  }

  const store = createStore();
  const bot = makeBot(store, token);
  startPoller(store);
  await bot.start();
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  void main();
}

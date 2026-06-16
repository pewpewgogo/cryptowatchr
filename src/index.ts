import { fileURLToPath } from "node:url";
import { createBot, menuKeyboard, inlineKeyboard } from "@agntdev/bot-toolkit";
import { createStore, newAlertRule, newPercentAlertRule } from "./store.js";

export interface Session {
  initializedAt: string;
  onboardingStep?: "timezone" | "confirm";
  timezone?: string;
  alertStep?: "type" | "coin" | "direction" | "price" | "pctCoin" | "pctPercent" | "pctTimeframe";
  alertCoin?: string;
  alertDirection?: "above" | "below";
  alertPctCoin?: string;
  alertPctPercent?: number;
  alertPctTimeframe?: number;
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

function detectTimezone(languageCode?: string): string {
  if (languageCode) {
    const tz = LANGUAGE_TO_TZ[languageCode] ?? LANGUAGE_TO_TZ[languageCode.split("-")[0]];
    if (tz) return tz;
  }
  return "UTC+0";
}

function confirmText(tz: string, detected?: boolean) {
  return [
    `Timezone set to ${tz}.${detected ? " (Auto-detected from your language settings.)" : ""}`,
    "",
    "Your default settings:",
    `\u2022 Quiet hours: ${DEFAULT_QUIET_START}\u2013${DEFAULT_QUIET_END} (alerts suppressed while you sleep)`,
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
  "",
  "You can also use the menu buttons below to manage your watchlist, create alerts, check prices, and configure settings.",
].join("\n");

const MENU_RESPONSES: Record<string, string> = {
  "menu:add": "Add Coin will let you add BTC, ETH, TON, or a custom ticker to your watchlist.",
  "menu:watchlist": "My Watchlist will show your tracked coins and remove buttons.",
  "menu:price": "Price Check will show current prices for one coin or your full watchlist.",
  "menu:settings": "Settings will manage timezone, quiet hours, cooldown, and morning summaries.",
  "menu:help": "Help will list commands and explain how CryptoWatchr alerts work.",
};

function mainMenu() {
  return menuKeyboard(
    [
      { text: "Add Coin", data: "menu:add" },
      { text: "My Watchlist", data: "menu:watchlist" },
      { text: "Create Alert", data: "menu:alerts" },
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

function clearAlertSession(session: Session) {
  session.alertStep = undefined;
  session.alertCoin = undefined;
  session.alertDirection = undefined;
  session.alertPctCoin = undefined;
  session.alertPctPercent = undefined;
  session.alertPctTimeframe = undefined;
}

export function makeBot(token = process.env.BOT_TOKEN ?? "test:cryptowatchr") {
  const store = createStore();
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
    ctx.session.onboardingStep = "timezone";
    await ctx.reply(WELCOME_TEXT, { reply_markup: timezoneKeyboard() });
  });

  bot.command("help", async (ctx) => {
    clearAlertSession(ctx.session);
    await ctx.reply(HELP_TEXT, { parse_mode: "Markdown", reply_markup: mainMenu() });
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data.startsWith("onboard:tz:")) {
      const tz = data.slice("onboard:tz:".length);
      ctx.session.timezone = tz;
      ctx.session.onboardingStep = "confirm";
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

    // --- Alert flow callbacks ---

    if (data === "menu:alerts") {
      clearAlertSession(ctx.session);
      ctx.session.alertStep = "type";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(ALERT_TYPE_TEXT, { reply_markup: alertTypeKeyboard() });
      return;
    }

    if (data === "menu:back") {
      clearAlertSession(ctx.session);
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
        await ctx.reply(confirmText(tz), { reply_markup: confirmKeyboard() });
      }
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
        await store.createAlertRule(rule);
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
        await store.createAlertRule(rule);
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

  const bot = makeBot(token);
  await bot.start();
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  void main();
}

import { fileURLToPath } from "node:url";
import { createBot, menuKeyboard } from "@agntdev/bot-toolkit";

export interface Session {
  initializedAt: string;
}

const MAIN_MENU_TEXT = [
  "Welcome to CryptoWatchr.",
  "",
  "Track coins, create price alerts, check the latest prices, and tune your quiet hours from the menu below.",
].join("\n");

const MENU_RESPONSES: Record<string, string> = {
  "menu:add": "Add Coin will let you add BTC, ETH, TON, or a custom ticker to your watchlist.",
  "menu:watchlist": "My Watchlist will show your tracked coins and remove buttons.",
  "menu:alerts": "Create Alert will guide you through threshold and percent-move alerts.",
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

export function makeBot(token = process.env.BOT_TOKEN ?? "test:cryptowatchr") {
  const bot = createBot<Session>(token, {
    initial: () => ({ initializedAt: new Date(0).toISOString() }),
  });

  bot.command("start", async (ctx) => {
    await ctx.reply(MAIN_MENU_TEXT, { reply_markup: mainMenu() });
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
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
      return;
    }

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

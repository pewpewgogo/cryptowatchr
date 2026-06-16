import { fileURLToPath } from "node:url";
import { createBot } from "@agntdev/bot-toolkit";

export interface Session {
  initializedAt: string;
}

export function makeBot(token = process.env.BOT_TOKEN ?? "test:cryptowatchr") {
  const bot = createBot<Session>(token, {
    initial: () => ({ initializedAt: new Date(0).toISOString() }),
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

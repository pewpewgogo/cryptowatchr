import { fileURLToPath } from "node:url";
import { buildBot } from "./bot.js";
import { createStore } from "./store.js";
import { startPoller } from "./poller.js";

async function main() {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.error("BOT_TOKEN is required");
    process.exit(1);
  }

  const store = createStore();
  const bot = buildBot(store, token);
  startPoller(store, (chatId, text) => bot.api.sendMessage(chatId, text));
  await bot.start();
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  void main();
}
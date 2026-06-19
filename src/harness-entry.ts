import { buildBot } from "./bot.js";

export function makeBot() {
  return buildBot(undefined, process.env.BOT_TOKEN ?? "harness-test-token");
}
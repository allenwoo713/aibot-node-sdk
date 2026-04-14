import { loadConfig } from '../config';
import { BotOrchestrator } from '.';

const config = loadConfig();
const bot = new BotOrchestrator(config);

bot.start();

function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down bot...`);
  bot.stop();
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

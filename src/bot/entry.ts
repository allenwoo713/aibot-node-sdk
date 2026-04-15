import { loadConfig } from '../config';
import { BotOrchestrator } from '.';
import { WsTransport, HttpTransport, FallbackTransport } from '../transport';

const config = loadConfig();

const wsTransport = new WsTransport({
  botId: config.botId,
  secret: config.secret,
  ...(config.wsUrl && { wsUrl: config.wsUrl }),
});

const httpTransport = new HttpTransport({
  botId: config.botId,
  secret: config.secret,
  corpId: config.corpId,
  agentId: config.agentId,
  logger: config.logger,
});

const transport = new FallbackTransport(wsTransport, httpTransport, config.logger);
const bot = new BotOrchestrator(config, transport);

bot.start();

function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down bot...`);
  bot.stop();
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

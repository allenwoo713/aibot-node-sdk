import 'dotenv/config';
import { loadConfig } from '../config';
import { BotOrchestrator } from '.';
import { WsTransport, HttpTransport, FallbackTransport } from '../transport';
import { HealthServer } from '../health';

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
export const bot = new BotOrchestrator(config, transport);

bot.start();

const healthServer = new HealthServer(() => bot.isHealthy());
healthServer.start(3000);

async function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down bot...`);
  await bot.stop();
  await healthServer.stop();
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

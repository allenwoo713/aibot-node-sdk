import { WsTransport } from '../../src/transport/ws-transport';
import { loadConfig } from '../../src/config';

async function main() {
  const config = loadConfig();
  console.log('BOT_ID:', config.botId);
  console.log('SECRET:', config.secret.slice(0, 4) + '****');

  const transport = new WsTransport({
    botId: config.botId,
    secret: config.secret,
  });

  let connected = false;
  let authenticated = false;
  let errorMsg = '';

  transport.on('connected', () => {
    connected = true;
    console.log('Event: connected (WebSocket open)');
  });

  const wsClient = (transport as any).wsClient;
  const wsManager = (wsClient as any).wsManager;

  const originalOnAuthenticated = wsManager.onAuthenticated;
  wsManager.onAuthenticated = () => {
    authenticated = true;
    console.log('Event: authenticated (aibot_subscribe success)');
    if (originalOnAuthenticated) originalOnAuthenticated();
  };

  const originalOnError = wsManager.onError;
  wsManager.onError = (err: Error) => {
    errorMsg = err.message;
    console.error('Event: error', err.message);
    if (originalOnError) originalOnError(err);
  };

  const originalOnDisconnected = wsManager.onDisconnected;
  wsManager.onDisconnected = (reason: string) => {
    console.log('Event: disconnected', reason);
    if (originalOnDisconnected) originalOnDisconnected(reason);
  };

  transport.connect();

  await new Promise(r => setTimeout(r, 10000));

  console.log('Result: connected=', connected, 'authenticated=', authenticated, 'error=', errorMsg);
  transport.stop();
  process.exit(authenticated ? 0 : 1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

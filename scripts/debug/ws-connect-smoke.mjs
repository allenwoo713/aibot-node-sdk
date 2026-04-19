import { WsTransport } from '../../dist/index.esm.js';

async function main() {
  const botId = process.env.BOT_ID || '';
  const secret = process.env.SECRET || '';
  console.log('BOT_ID:', botId);
  console.log('SECRET:', secret.slice(0, 4) + '****');

  if (!botId || !secret) {
    console.error('Missing BOT_ID or SECRET in env');
    process.exit(1);
  }

  const transport = new WsTransport({ botId, secret });

  let connected = false;
  let authenticated = false;
  let errorMsg = '';

  transport.on('connected', () => {
    connected = true;
    console.log('Event: connected (WebSocket open)');
  });

  const wsClient = transport.wsClient || transport['wsClient'];
  const wsManager = wsClient.wsManager || wsClient['wsManager'];

  const originalOnAuthenticated = wsManager.onAuthenticated;
  wsManager.onAuthenticated = () => {
    authenticated = true;
    console.log('Event: authenticated (aibot_subscribe success)');
    if (originalOnAuthenticated) originalOnAuthenticated();
  };

  const originalOnError = wsManager.onError;
  wsManager.onError = (err) => {
    errorMsg = err.message;
    console.error('Event: error', err.message);
    if (originalOnError) originalOnError(err);
  };

  const originalOnDisconnected = wsManager.onDisconnected;
  wsManager.onDisconnected = (reason) => {
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

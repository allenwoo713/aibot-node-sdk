import { WsTransport } from '../../dist/index.esm.js';

const botId = process.env.BOT_ID || '';
const secret = process.env.SECRET || '';

if (!botId || !secret) {
  console.error('Missing BOT_ID or SECRET');
  process.exit(1);
}

const transport = new WsTransport({ botId, secret });

transport.on('connected', () => console.log('[ECHO] WebSocket connected'));
transport.on('authenticated', () => console.log('[ECHO] Authenticated'));
transport.on('disconnected', (r) => console.log('[ECHO] Disconnected:', r));
transport.on('error', (e) => console.error('[ECHO] Error:', e.message));

transport.on('message.text', async (frame) => {
  const body = frame.body;
  const content = body?.text?.content?.trim();
  const sender = body?.from?.userid;
  const chattype = body?.chattype;
  console.log('[ECHO] Received text from', sender, '| chattype:', chattype, '| content:', content);
  if (content) {
    try {
      await transport.sendText(frame, `收到你的消息：${content}`);
      console.log('[ECHO] Reply sent');
    } catch (err) {
      console.error('[ECHO] Failed to send reply:', err.message);
    }
  }
});

transport.on('event', (frame) => {
  console.log('[ECHO] Event received:', JSON.stringify(frame.body));
});

transport.connect();
console.log('[ECHO] Starting echo bot...');

process.on('SIGINT', () => {
  console.log('\n[ECHO] Shutting down...');
  transport.stop();
  process.exit(0);
});

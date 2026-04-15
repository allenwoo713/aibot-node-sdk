import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { BotOrchestrator } from '../src/bot';
import { WecomCrypto } from '../src/wecom-crypto';
import { handleCallback, HttpTransport } from '../src/transport';
import type { WsFrame, TextMessage } from '../src/types';
import type { CallbackPayload } from '../src/types/transport';
import { EventEmitter } from 'eventemitter3';

const TEST_PERSISTENCE_PATH = path.resolve(__dirname, '../.test-bot-state-http.json');

const chatMock = vi.fn();
vi.mock('../src/ai/api-adapter', () => ({
  AnthropicApiAdapter: vi.fn(function () { this.chat = chatMock; }),
}));

vi.mock('../src/api', () => ({
  WeComApiClient: vi.fn().mockImplementation(function () {
    this.getAccessToken = vi.fn().mockResolvedValue({ access_token: 'tok-http', expires_in: 7200 });
    this.sendTextMessage = vi.fn().mockResolvedValue(undefined);
    this.downloadFileRaw = vi.fn();
  }),
}));

function createValidAesKey(): string {
  return 'UB5vEstbVk2v0GFe05JYsbEAAEqkMTuoy4tSbdCc564=';
}

const crypto = new WecomCrypto('token-http', createValidAesKey(), 'receive-http');

function createMockLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function createEncryptedPayload(content: string, msgid: string): CallbackPayload {
  const inner = JSON.stringify({
    msgid,
    msgtype: 'text',
    chattype: 'single',
    aibotid: 'bot-http',
    from: { userid: 'user-http' },
    text: { content },
  });
  const now = String(Math.floor(Date.now() / 1000));
  const encrypted = crypto.encrypt(inner, now, 'nonce');
  return {
    signature: encrypted.signature,
    timestamp: now,
    nonce: 'nonce',
    body: JSON.stringify({ Encrypt: encrypted.encrypt }),
  };
}

function createServer(transport: any) {
  return http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const payload: CallbackPayload = {
        signature: url.searchParams.get('msg_signature') || '',
        timestamp: url.searchParams.get('timestamp') || '',
        nonce: url.searchParams.get('nonce') || '',
        body,
      };
      const response = await handleCallback(payload, crypto, transport, createMockLogger());
      res.writeHead(response.status).end(response.body);
    });
  });
}

describe('Bot HTTP E2E', () => {
  beforeEach(() => {
    chatMock.mockReset();
    if (fs.existsSync(TEST_PERSISTENCE_PATH)) {
      fs.unlinkSync(TEST_PERSISTENCE_PATH);
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_PERSISTENCE_PATH)) {
      fs.unlinkSync(TEST_PERSISTENCE_PATH);
    }
  });

  it('end-to-end: HTTP callback receives message and bot replies via HTTP transport', async () => {
    chatMock.mockResolvedValueOnce({ content: 'HTTP reply' });

    const httpTransport = new HttpTransport({
      botId: 'bot-http',
      secret: 'secret',
      corpId: 'corp-http',
      agentId: 'agent-http',
      logger: createMockLogger(),
    });

    const bot = new BotOrchestrator({
      botId: 'bot-http',
      secret: 'secret',
      anthropicApiKey: 'key',
      anthropicModel: 'claude-test',
      conversationTtlMs: 60000,
      maxConversations: 100,
      maxHistoryMessages: 10,
      rateLimitRequests: 10,
      rateLimitWindowMs: 60000,
      apiTimeoutMs: 5000,
      maxOutputTokens: 100,
      persistencePath: TEST_PERSISTENCE_PATH,
      internalSystemPrompt: 'You are helpful.',
      externalSystemPrompt: 'You are a guest helper.',
      corpId: 'corp-http',
      agentId: 'agent-http',
    }, httpTransport);

    const server = createServer((bot as any).transport);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const port = address.port;

    const sendTextSpy = vi.spyOn((bot as any).transport, 'sendText');

    const payload = createEncryptedPayload('Hello via HTTP', 'm-http-1');

    const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.request(
        `http://127.0.0.1:${port}/callback?msg_signature=${encodeURIComponent(payload.signature)}&timestamp=${encodeURIComponent(payload.timestamp)}&nonce=${encodeURIComponent(payload.nonce)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
        (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
        },
      );
      req.on('error', reject);
      req.write(payload.body);
      req.end();
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(response.status).toBe(200);
    expect(response.body).toBe('success');
    expect(chatMock).toHaveBeenCalledTimes(1);
    // Wait a bit more for the bot's async reply to complete after chatMock resolved
    await new Promise((r) => setTimeout(r, 50));
    expect(sendTextSpy).toHaveBeenCalledWith(expect.anything(), 'HTTP reply');

    await new Promise<void>((resolve) => server.close(() => resolve()));
    bot.stop();
  });
});

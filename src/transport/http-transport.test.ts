import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpTransport, TokenCache } from './http-transport';
import { WeComApiClient } from '../api';
import type { WsFrame } from '../types';

function createMockFrame(userid = 'user-1', chatid?: string): WsFrame {
  return {
    headers: { req_id: 'req-1' },
    body: { from: { userid }, chatid, msgid: 'm1' },
  } as WsFrame;
}

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('TokenCache', () => {
  it('prevents concurrent token fetches', async () => {
    const mockApi = {
      getAccessToken: vi.fn().mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({ access_token: 'tok-1', expires_in: 7200 }), 50);
      })),
    } as unknown as WeComApiClient;

    const cache = new TokenCache(mockApi, 'corp-id', 'secret', createMockLogger());

    const [t1, t2] = await Promise.all([cache.getToken(), cache.getToken()]);

    expect(mockApi.getAccessToken).toHaveBeenCalledTimes(1);
    expect(t1).toBe('tok-1');
    expect(t2).toBe('tok-1');
  });
});

describe('HttpTransport', () => {
  let mockApi: WeComApiClient;
  let transport: HttpTransport;

  beforeEach(() => {
    mockApi = {
      getAccessToken: vi.fn(),
      sendTextMessage: vi.fn().mockResolvedValue(undefined),
      downloadFileRaw: vi.fn(),
    } as unknown as WeComApiClient;

    transport = new HttpTransport({
      botId: 'bot-1',
      secret: 'secret-1',
      corpId: 'corp-1',
      agentId: 'agent-1',
      logger: createMockLogger(),
    });

    // Replace internal apiClient with mock
    (transport as any).apiClient = mockApi;
    (transport as any).tokenCache = new TokenCache(mockApi, 'corp-1', 'secret-1', createMockLogger());
  });

  afterEach(() => {
    transport.stop();
    vi.restoreAllMocks();
  });

  it('sendText delegates to sendTextMessage without token', async () => {
    const frame = createMockFrame();
    await transport.sendText(frame, 'hello');
    await transport.sendText(frame, 'hello again');

    expect(mockApi.sendTextMessage).toHaveBeenCalledTimes(2);
    expect(mockApi.sendTextMessage).toHaveBeenNthCalledWith(1, 'agent-1', 'user-1', undefined, 'hello');
    expect(mockApi.sendTextMessage).toHaveBeenNthCalledWith(2, 'agent-1', 'user-1', undefined, 'hello again');
  });

  it('sendText retries once on 42001', async () => {
    vi.mocked(mockApi.sendTextMessage)
      .mockRejectedValueOnce(new Error('WeCom API error: token expired (42001)'))
      .mockResolvedValueOnce(undefined);

    const frame = createMockFrame();
    await expect(transport.sendText(frame, 'hello')).resolves.toBeUndefined();

    expect(mockApi.sendTextMessage).toHaveBeenCalledTimes(2);
    expect(mockApi.sendTextMessage).toHaveBeenNthCalledWith(1, 'agent-1', 'user-1', undefined, 'hello');
    expect(mockApi.sendTextMessage).toHaveBeenNthCalledWith(2, 'agent-1', 'user-1', undefined, 'hello');
  });

  it('sendStream buffers and sends on finish', async () => {
    vi.mocked(mockApi.getAccessToken).mockResolvedValue({ access_token: 'tok-1', expires_in: 7200 });

    const frame = createMockFrame();
    await transport.sendStream(frame, 'sid-1', 'part1', false);
    expect(mockApi.sendTextMessage).not.toHaveBeenCalled();

    await transport.sendStream(frame, 'sid-1', 'part2', true);
    expect(mockApi.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(mockApi.sendTextMessage).toHaveBeenCalledWith('agent-1', 'user-1', undefined, 'part1part2');
  });
});

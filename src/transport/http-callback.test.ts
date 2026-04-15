import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'eventemitter3';
import { handleCallback } from './http-callback';
import { WecomCrypto } from '../wecom-crypto';
import type { Transport, TransportEventMap, CallbackPayload } from '../types/transport';

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createValidAesKey(): string {
  // 43-char base64 string padded to 44 with '=' that decodes to 32 bytes
  return 'UB5vEstbVk2v0GFe05JYsbEAAEqkMTuoy4tSbdCc564=';
}

describe('handleCallback', () => {
  let crypto: WecomCrypto;
  let emitter: Transport;
  let logger: ReturnType<typeof createMockLogger>;
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    crypto = new WecomCrypto('t', createValidAesKey(), 'r');
    emitter = new EventEmitter<TransportEventMap>() as unknown as Transport;
    logger = createMockLogger();
    emitSpy = vi.spyOn(emitter, 'emit');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 403 when signature is invalid', async () => {
    const payload: CallbackPayload = {
      signature: 'bad',
      timestamp: '1234567890',
      nonce: 'nonce',
      body: JSON.stringify({ Encrypt: 'xxx' }),
    };

    const response = await handleCallback(payload, crypto, emitter, logger);
    expect(response).toEqual({ status: 403, body: 'Forbidden' });
  });

  it('returns 403 when timestamp is stale', async () => {
    const staleTs = String(Math.floor(Date.now() / 1000) - 400);
    const inner = JSON.stringify({ msgid: 'm123', msgtype: 'text', text: { content: 'hi' } });
    const encrypted = crypto.encrypt(inner, staleTs, 'nonce');

    const payload: CallbackPayload = {
      signature: encrypted.signature,
      timestamp: staleTs,
      nonce: 'nonce',
      body: JSON.stringify({ Encrypt: encrypted.encrypt }),
    };

    const response = await handleCallback(payload, crypto, emitter, logger);
    expect(response.status).toBe(403);
    expect(response.body).toBe('Forbidden');
  });

  it('decrypts payload and emits normalized frame on success', async () => {
    const inner = JSON.stringify({ msgid: 'm-success', msgtype: 'text', text: { content: 'hi' } });
    const now = String(Math.floor(Date.now() / 1000));
    const encrypted = crypto.encrypt(inner, now, 'nonce');

    const payload: CallbackPayload = {
      signature: encrypted.signature,
      timestamp: now,
      nonce: 'nonce',
      body: JSON.stringify({ Encrypt: encrypted.encrypt }),
    };

    const response = await handleCallback(payload, crypto, emitter, logger);
    expect(response).toEqual({ status: 200, body: 'success' });

    expect(emitSpy).toHaveBeenCalledTimes(2);
    const textCall = emitSpy.mock.calls.find((call) => call[0] === 'message.text');
    expect(textCall).toBeTruthy();
    expect(textCall![1].body.msgid).toBe('m-success');
    expect(textCall![1].cmd).toBe('aibot_msg_callback');
  });

  it('drops duplicate msgid and returns 200', async () => {
    const inner = JSON.stringify({ msgid: 'm-dup', msgtype: 'text', text: { content: 'hi' } });
    const now = String(Math.floor(Date.now() / 1000));
    const encrypted = crypto.encrypt(inner, now, 'nonce');

    const payload: CallbackPayload = {
      signature: encrypted.signature,
      timestamp: now,
      nonce: 'nonce',
      body: JSON.stringify({ Encrypt: encrypted.encrypt }),
    };

    const r1 = await handleCallback(payload, crypto, emitter, logger);
    const r2 = await handleCallback(payload, crypto, emitter, logger);

    expect(r1).toEqual({ status: 200, body: 'success' });
    expect(r2).toEqual({ status: 200, body: 'success' });
    expect(emitSpy).toHaveBeenCalledTimes(2);
  });

  it('handles XML envelope body', async () => {
    const inner = JSON.stringify({ msgid: 'm-xml', msgtype: 'text', text: { content: 'hi' } });
    const now = String(Math.floor(Date.now() / 1000));
    const encrypted = crypto.encrypt(inner, now, 'nonce');

    const payload: CallbackPayload = {
      signature: encrypted.signature,
      timestamp: now,
      nonce: 'nonce',
      body: `<xml><Encrypt>${encrypted.encrypt}</Encrypt></xml>`,
    };

    const response = await handleCallback(payload, crypto, emitter, logger);
    expect(response.status).toBe(200);
    expect(response.body).toBe('success');
    expect(emitSpy).toHaveBeenCalledTimes(2);
  });
});

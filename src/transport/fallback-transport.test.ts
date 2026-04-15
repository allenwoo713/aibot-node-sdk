import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'eventemitter3';
import { FallbackTransport } from './fallback-transport';
import type { Transport, TransportEventMap } from '../types/transport';
import type { WsFrame } from '../types';

function createMockFrame(msgid = 'm1'): WsFrame {
  return {
    headers: { req_id: 'req-1' },
    body: { msgid, from: { userid: 'u1' } },
  } as WsFrame;
}

function createMockTransport(): Transport {
  const emitter = new EventEmitter<TransportEventMap>() as unknown as Transport;
  return Object.assign(emitter, {
    connect: vi.fn(),
    stop: vi.fn(),
    sendText: vi.fn().mockResolvedValue(undefined),
    sendStream: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn(),
  });
}

describe('FallbackTransport', () => {
  let primary: Transport;
  let fallback: Transport;

  beforeEach(() => {
    primary = createMockTransport();
    fallback = createMockTransport();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes sendText to primary when primary is connected', async () => {
    vi.mocked(primary.isConnected).mockReturnValue(true);
    vi.mocked(fallback.isConnected).mockReturnValue(true);

    const transport = new FallbackTransport(primary as any, fallback as any);
    (primary as any).emit('connected');

    const frame = createMockFrame();
    await transport.sendText(frame, 'hello');

    expect(primary.sendText).toHaveBeenCalledTimes(1);
    expect(fallback.sendText).not.toHaveBeenCalled();
  });

  it('routes sendText to fallback when primary disconnects', async () => {
    vi.mocked(primary.isConnected).mockReturnValue(true);
    vi.mocked(fallback.isConnected).mockReturnValue(true);

    const transport = new FallbackTransport(primary as any, fallback as any);
    (primary as any).emit('connected');
    (primary as any).emit('disconnected', 'network error');

    const frame = createMockFrame();
    await transport.sendText(frame, 'hello');

    expect(fallback.sendText).toHaveBeenCalledTimes(1);
    expect(primary.sendText).toHaveBeenCalledTimes(0);
  });

  it('deduplicates messages across primary and fallback', () => {
    const transport = new FallbackTransport(primary as any, fallback as any);
    const emitSpy = vi.spyOn(transport, 'emit');

    const frame = createMockFrame('m-dup');
    (primary as any).emit('message.text', frame);
    (fallback as any).emit('message.text', frame);

    expect(emitSpy).toHaveBeenCalledTimes(1);
  });

  it('forwards non-message events from both transports', () => {
    const transport = new FallbackTransport(primary as any, fallback as any);
    const emitSpy = vi.spyOn(transport, 'emit');

    (primary as any).emit('event.enter_chat', { headers: { req_id: 'r1' }, body: {} });
    (fallback as any).emit('event.template_card_event', { headers: { req_id: 'r2' }, body: {} });

    expect(emitSpy).toHaveBeenCalledTimes(2);
    expect(emitSpy).toHaveBeenCalledWith('event.enter_chat', expect.anything());
    expect(emitSpy).toHaveBeenCalledWith('event.template_card_event', expect.anything());
  });

  it('routes sendStream to primary when connected', async () => {
    vi.mocked(primary.isConnected).mockReturnValue(true);

    const transport = new FallbackTransport(primary as any, fallback as any);
    (primary as any).emit('connected');

    const frame = createMockFrame();
    await transport.sendStream(frame, 'sid-1', 'chunk', true);

    expect(primary.sendStream).toHaveBeenCalledWith(frame, 'sid-1', 'chunk', true);
    expect(fallback.sendStream).not.toHaveBeenCalled();
  });
});

import { EventEmitter } from 'eventemitter3';
import type { Transport, TransportEventMap } from '../types/transport';
import type { WsFrame } from '../types';
import type { WsTransport } from './ws-transport';
import type { HttpTransport } from './http-transport';
import { DefaultLogger } from '../logger';
import type { Logger } from '../types';

export class FallbackTransport extends EventEmitter<TransportEventMap> implements Transport {
  private primaryActive = false;
  private seenMsgIds = new Map<string, number>();
  private logger: Logger;

  constructor(private primary: WsTransport, private fallback: HttpTransport, logger?: Logger) {
    super();
    this.logger = logger ?? new DefaultLogger('FallbackTransport');
    this.setupForwarding();
  }

  private isDuplicate(msgid: string): boolean {
    const now = Date.now();
    if (this.seenMsgIds.has(msgid)) {
      return true;
    }
    this.seenMsgIds.set(msgid, now);
    for (const [id, ts] of this.seenMsgIds) {
      if (now - ts > 5 * 60 * 1000) {
        this.seenMsgIds.delete(id);
      }
    }
    return false;
  }

  private setupForwarding(): void {
    const messageEvents: (keyof TransportEventMap)[] = [
      'message', 'message.text', 'message.image', 'message.mixed',
      'message.voice', 'message.file', 'message.video',
    ];
    const eventEvents: (keyof TransportEventMap)[] = [
      'event', 'event.enter_chat', 'event.template_card_event',
      'event.feedback_event', 'event.disconnected_event',
    ];
    const lifecycleEvents: (keyof TransportEventMap)[] = [
      'connected', 'disconnected', 'error',
    ];

    for (const event of messageEvents) {
      this.primary.on(event as any, (frame: WsFrame) => {
        const msgid = (frame.body as any)?.msgid as string | undefined;
        if (msgid && this.isDuplicate(msgid)) {
          this.logger.debug(`Duplicate cross-transport message dropped: ${msgid}`);
          return;
        }
        this.emit(event as any, frame);
      });
      this.fallback.on(event as any, (frame: WsFrame) => {
        const msgid = (frame.body as any)?.msgid as string | undefined;
        if (msgid && this.isDuplicate(msgid)) {
          this.logger.debug(`Duplicate cross-transport message dropped: ${msgid}`);
          return;
        }
        this.emit(event as any, frame);
      });
    }

    for (const event of eventEvents) {
      this.primary.on(event as any, (...args: any[]) => this.emit(event as any, ...args));
      this.fallback.on(event as any, (...args: any[]) => this.emit(event as any, ...args));
    }

    this.primary.on('connected', () => { this.primaryActive = true; });
    this.primary.on('disconnected', () => { this.primaryActive = false; });

    for (const event of lifecycleEvents) {
      this.primary.on(event as any, (...args: any[]) => this.emit(event as any, ...args));
      this.fallback.on(event as any, (...args: any[]) => this.emit(event as any, ...args));
    }
  }

  connect(): void {
    this.primary.connect();
  }

  stop(): void {
    this.primary.stop();
    this.fallback.stop();
  }

  async sendText(replyTo: WsFrame, text: string): Promise<void> {
    if (this.primaryActive) {
      return this.primary.sendText(replyTo, text);
    }
    return this.fallback.sendText(replyTo, text);
  }

  async sendStream(replyTo: WsFrame, streamId: string, text: string, finish: boolean): Promise<void> {
    if (this.primaryActive) {
      return this.primary.sendStream(replyTo, streamId, text, finish);
    }
    return this.fallback.sendStream(replyTo, streamId, text, finish);
  }

  isConnected(): boolean {
    return this.primary.isConnected() || this.fallback.isConnected();
  }
}

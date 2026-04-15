import { EventEmitter } from 'eventemitter3';
import type { Transport, TransportEventMap } from '../types/transport';
import type { WsFrame, WSClientOptions } from '../types';
import { WSClient } from '../client';
import { DefaultLogger } from '../logger';
import type { Logger } from '../types';
import { generateReqId } from '../utils';

export class WsTransport extends EventEmitter<TransportEventMap> implements Transport {
  private wsClient: WSClient;
  private logger: Logger;

  constructor(options: WSClientOptions) {
    super();
    this.logger = options.logger ?? new DefaultLogger('WsTransport');
    this.wsClient = new WSClient(options);

    const events: (keyof TransportEventMap)[] = [
      'message', 'message.text', 'message.image', 'message.mixed', 'message.voice',
      'message.file', 'message.video', 'event', 'event.enter_chat',
      'event.template_card_event', 'event.feedback_event', 'event.disconnected_event',
      'connected', 'disconnected', 'error',
    ];
    for (const event of events) {
      this.wsClient.on(event as any, (...args: any[]) => this.emit(event as any, ...args));
    }
  }

  connect(): void {
    this.wsClient.connect();
  }

  stop(): void {
    this.wsClient.disconnect();
  }

  async sendText(replyTo: WsFrame, text: string): Promise<void> {
    await this.wsClient.replyStream(replyTo, generateReqId('stream'), text, true);
  }

  async sendStream(replyTo: WsFrame, streamId: string, text: string, finish: boolean): Promise<void> {
    await this.wsClient.replyStream(replyTo, streamId, text, finish);
  }

  isConnected(): boolean {
    return this.wsClient.isConnected;
  }
}

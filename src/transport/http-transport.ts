import { EventEmitter } from 'eventemitter3';
import type { Transport, TransportEventMap } from '../types/transport';
import type { WsFrame, Logger } from '../types';
import { WeComApiClient } from '../api';
import { DefaultLogger } from '../logger';

export interface HttpTransportOptions {
  botId: string;
  secret: string;
  corpId?: string;
  agentId?: string;
  logger?: Logger;
}

export class TokenCache {
  private token: string | null = null;
  private expiresAt = 0;
  private refreshPromise: Promise<string> | null = null;

  constructor(
    private api: WeComApiClient,
    private corpId: string,
    private corpSecret: string,
    private logger: Logger,
  ) {}

  async getToken(): Promise<string> {
    if (this.token && Date.now() < this.expiresAt - 60_000) {
      return this.token;
    }
    if (!this.refreshPromise) {
      this.refreshPromise = this.fetchToken().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  private async fetchToken(): Promise<string> {
    const result = await this.api.getAccessToken(this.corpId, this.corpSecret);
    this.token = result.access_token;
    this.expiresAt = Date.now() + result.expires_in * 1000;
    this.logger.info('Access token refreshed');
    return this.token;
  }

  clear(): void {
    this.token = null;
    this.expiresAt = 0;
  }
}

export class HttpTransport extends EventEmitter<TransportEventMap> implements Transport {
  private apiClient: WeComApiClient;
  private tokenCache: TokenCache;
  private logger: Logger;
  private agentId: string;
  private streamBuffers = new Map<string, string[]>();

  constructor(options: HttpTransportOptions) {
    super();
    this.logger = options.logger ?? new DefaultLogger('HttpTransport');
    this.agentId = options.agentId ?? options.botId;
    const corpId = options.corpId ?? options.botId;
    this.apiClient = new WeComApiClient(this.logger);
    this.tokenCache = new TokenCache(this.apiClient, corpId, options.secret, this.logger);
  }

  connect(): void {
    this.emit('connected');
  }

  stop(): void {
    this.streamBuffers.clear();
  }

  async sendText(replyTo: WsFrame, text: string): Promise<void> {
    const body = replyTo.body as any;
    const touser = body?.from?.userid || '';
    const chatid = body?.chatid;
    const doSend = async () => {
      const token = await this.tokenCache.getToken();
      await this.apiClient.sendTextMessage(token, this.agentId, touser, chatid, text);
    };
    try {
      await doSend();
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('42001')) {
        this.tokenCache.clear();
        await doSend();
        return;
      }
      this.logger.error('HTTP send failed:', msg);
      throw err;
    }
  }

  async sendStream(replyTo: WsFrame, streamId: string, text: string, finish: boolean): Promise<void> {
    const chunks = this.streamBuffers.get(streamId) || [];
    chunks.push(text);
    if (!finish) {
      this.streamBuffers.set(streamId, chunks);
      return;
    }
    this.streamBuffers.delete(streamId);
    const fullText = chunks.join('');
    return this.sendText(replyTo, fullText);
  }

  isConnected(): boolean {
    return true;
  }
}

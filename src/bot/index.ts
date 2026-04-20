import { generateReqId } from '..';
import type { Transport } from '../transport';
import { WsTransport } from '../transport';
import type { WsFrame, TextMessage } from '../types';
import type { BotConfig } from '../config';
import { ConversationStore } from '../memory';
import { AnthropicApiAdapter } from '../ai/api-adapter';
import { chunkMessage } from '../chunker';
import { DefaultLogger } from '../logger';
import type { Logger } from '../types';

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

export class BotOrchestrator {
  private transport: Transport;
  private store: ConversationStore;
  private adapter: AnthropicApiAdapter;
  private config: BotConfig;
  private logger: Logger;
  private rateLimits = new Map<string, RateLimitEntry>();

  constructor(config: BotConfig, transport?: Transport) {
    this.config = config;
    this.logger = config.logger ?? new DefaultLogger('BotOrchestrator');
    this.transport = transport ?? new WsTransport({
      botId: config.botId,
      secret: config.secret,
      ...(config.wsUrl && { wsUrl: config.wsUrl }),
    });
    this.store = new ConversationStore({ ...config, logger: this.logger });
    this.adapter = new AnthropicApiAdapter(config);

    this.setupEventHandlers();
  }

  start(): void {
    this.transport.connect();
  }

  async stop(): Promise<void> {
    await this.store.close();
    this.transport.stop();
  }

  private setupEventHandlers(): void {
    this.transport.on('message.text', async (frame: WsFrame<TextMessage>) => {
      try {
        await this.handleTextMessage(frame);
      } catch (err: any) {
        console.error('Bot handler error:', err?.message || String(err));
      }
    });

    this.transport.on('error', (err) => {
      console.error('Transport error:', err.message);
    });
  }

  private async handleTextMessage(frame: WsFrame<TextMessage>): Promise<void> {
    console.log('[BOT] handleTextMessage called, msgid=', (frame.body as any)?.msgid);
    if (!frame.body || !this.shouldReply(frame)) {
      console.log('[BOT] shouldReply returned false');
      return;
    }

    const body = frame.body;
    const conversationId = body.chatid || body.from.userid;
    const content = body.text?.content?.trim();

    if (!content) {
      return;
    }

    // Rate limiting
    if (this.isRateLimited(conversationId)) {
      await this.sendText(frame, '请求太多了，请稍后再试。');
      return;
    }

    const contactType = this.detectContactType(frame);
    const systemPrompt = contactType === 'external' ? this.config.externalSystemPrompt : this.config.internalSystemPrompt;

    await this.store.append(conversationId, { role: 'user', content });
    const history = this.store.buildMessages(conversationId, systemPrompt);

    const result = await this.adapter.chat({
      conversationId,
      message: content,
      contactType,
      history,
    });

    if (result.error) {
      this.logger.warn(
        'AI adapter returned error',
        { conversationId, errorCode: result.errorCode || 'unknown' },
      );
      await this.sendText(frame, result.content);
      return;
    }

    if (result.usage) {
      this.logger.debug('AI token usage', { conversationId, usage: result.usage });
    }

    // Append assistant reply to memory
    await this.store.append(conversationId, { role: 'assistant', content: result.content });

    const chunks = chunkMessage(result.content);
    if (chunks.length === 0) {
      return;
    }

    const streamId = generateReqId('stream');
    for (let i = 0; i < chunks.length; i++) {
      const finish = i === chunks.length - 1;
      await this.transport.sendStream(frame, streamId, chunks[i], finish);
    }
  }

  private shouldReply(frame: WsFrame<TextMessage>): boolean {
    if (!frame.body) return false;
    const chattype = frame.body.chattype;
    if (chattype === 'single') {
      return true;
    }

    if (chattype === 'group') {
      // Group chat: reply only when the bot is explicitly @mentioned.
      // The SDK types do not currently expose mention metadata, so we inspect
      // the raw payload as a best-effort fallback.
      const raw = frame.body as any;
      const mentionList: any[] = raw?.mention || raw?.mention_list || [];
      const botId = frame.body.aibotid;
      if (mentionList.length > 0 && botId) {
        return mentionList.some((m: any) => m.userid === botId || m.id === botId);
      }
      // If mention metadata is absent, conservatively ignore the message.
      return false;
    }

    return false;
  }

  private detectContactType(frame: WsFrame<TextMessage>): 'internal' | 'external' {
    const raw = frame.body as any;
    // If WeCom explicitly flags the contact as external, trust it.
    if (raw?.external === true || raw?.from?.type === 'external') {
      return 'external';
    }
    // If the sender carries a corpid different from our own, treat as external.
    const ownCorpId = process.env.OWN_CORP_ID;
    const senderCorpId = raw?.from?.corpid;
    if (ownCorpId && senderCorpId && senderCorpId !== ownCorpId) {
      return 'external';
    }
    // Default to internal for safety.
    return 'internal';
  }

  private isRateLimited(conversationId: string): boolean {
    const now = Date.now();
    const entry = this.rateLimits.get(conversationId);

    if (!entry) {
      this.rateLimits.set(conversationId, { count: 1, windowStart: now });
      return false;
    }

    if (now - entry.windowStart >= this.config.rateLimitWindowMs) {
      this.rateLimits.set(conversationId, { count: 1, windowStart: now });
      return false;
    }

    if (entry.count >= this.config.rateLimitRequests) {
      return true;
    }

    entry.count += 1;
    return false;
  }

  private async sendText(frame: WsFrame<TextMessage>, text: string): Promise<void> {
    await this.transport.sendText(frame, text);
  }
}

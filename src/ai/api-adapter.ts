import Anthropic from '@anthropic-ai/sdk';
import type { AiBackend, ChatOptions, ChatResult } from './adapter';
import type { BotConfig } from '../config';

export class AnthropicApiAdapter implements AiBackend {
  private client: Anthropic;
  private model: string;
  private maxOutputTokens: number;
  private timeoutMs: number;
  private internalPrompt: string;
  private externalPrompt: string;

  constructor(config: Pick<BotConfig, 'anthropicApiKey' | 'anthropicBaseUrl' | 'anthropicModel' | 'maxOutputTokens' | 'apiTimeoutMs' | 'internalSystemPrompt' | 'externalSystemPrompt'>) {
    this.client = new Anthropic({ apiKey: config.anthropicApiKey, baseURL: config.anthropicBaseUrl });
    this.model = config.anthropicModel;
    this.maxOutputTokens = config.maxOutputTokens;
    this.timeoutMs = config.apiTimeoutMs;
    this.internalPrompt = config.internalSystemPrompt;
    this.externalPrompt = config.externalSystemPrompt;
  }

  async chat(options: ChatOptions): Promise<ChatResult> {
    const systemPrompt = options.contactType === 'external' ? this.externalPrompt : this.internalPrompt;
    const messages: Anthropic.Messages.MessageParam[] = (options.history ?? [])
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    // Ensure the latest user message is present if history omitted it.
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      messages.push({ role: 'user', content: options.message });
    }

    try {
      const response = await this.callWithRetry(systemPrompt, messages);
      const content = response.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('');

      return {
        content,
        usage: response.usage
          ? {
              input_tokens: response.usage.input_tokens,
              output_tokens: response.usage.output_tokens,
            }
          : undefined,
      };
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      return {
        content: '服务暂时繁忙，请稍后再试。',
        error: true,
      };
    }
  }

  private async callWithRetry(
    systemPrompt: string,
    messages: Anthropic.Messages.MessageParam[],
    attempt = 0,
  ): Promise<Anthropic.Messages.Message> {
    try {
      return await this.client.messages.create(
        {
          model: this.model,
          max_tokens: this.maxOutputTokens,
          system: systemPrompt,
          messages,
        },
        { timeout: this.timeoutMs },
      );
    } catch (err: any) {
      const status = err?.status;
      if (status >= 500 && attempt < 1) {
        await delay(2000);
        return this.callWithRetry(systemPrompt, messages, attempt + 1);
      }
      if (status === 429 && attempt < 1) {
        await delay(10000);
        return this.callWithRetry(systemPrompt, messages, attempt + 1);
      }
      throw err;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

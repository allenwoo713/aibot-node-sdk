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
  private maxInputTokens: number;
  private maxRetries: number;
  private retryBaseDelayMs: number;
  private retryBackoffMultiplier: number;
  private retryJitter: boolean;
  private fallbackRateLimit: string;
  private fallbackAuthInvalid: string;
  private fallbackValidationFailed: string;
  private fallbackRetryable: string;

  constructor(config: Pick<BotConfig, 'anthropicApiKey' | 'anthropicBaseUrl' | 'anthropicModel' | 'maxOutputTokens' | 'apiTimeoutMs' | 'internalSystemPrompt' | 'externalSystemPrompt' | 'maxInputTokens' | 'maxRetries' | 'retryBaseDelayMs' | 'retryBackoffMultiplier' | 'retryJitter' | 'fallbackRateLimit' | 'fallbackAuthInvalid' | 'fallbackValidationFailed' | 'fallbackRetryable'>) {
    this.client = new Anthropic({ apiKey: config.anthropicApiKey, baseURL: config.anthropicBaseUrl, maxRetries: 0 });
    this.model = config.anthropicModel;
    this.maxOutputTokens = config.maxOutputTokens;
    this.timeoutMs = config.apiTimeoutMs;
    this.internalPrompt = config.internalSystemPrompt;
    this.externalPrompt = config.externalSystemPrompt;
    this.maxInputTokens = config.maxInputTokens;
    this.maxRetries = config.maxRetries;
    this.retryBaseDelayMs = config.retryBaseDelayMs;
    this.retryBackoffMultiplier = config.retryBackoffMultiplier;
    this.retryJitter = config.retryJitter;
    this.fallbackRateLimit = config.fallbackRateLimit;
    this.fallbackAuthInvalid = config.fallbackAuthInvalid;
    this.fallbackValidationFailed = config.fallbackValidationFailed;
    this.fallbackRetryable = config.fallbackRetryable;
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

    const truncatedMessages = this.truncateMessages(messages);

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client.messages.create(
          {
            model: this.model,
            max_tokens: this.maxOutputTokens,
            system: systemPrompt,
            messages: truncatedMessages,
          },
          { timeout: this.timeoutMs },
        );

        const validation = this.validateResponse(response);
        if (validation.valid) {
          return {
            content: validation.content,
            usage: response.usage
              ? {
                  input_tokens: response.usage.input_tokens,
                  output_tokens: response.usage.output_tokens,
                }
              : undefined,
          };
        }

        return {
          content: this.fallbackValidationFailed,
          error: true,
          errorCode: 'validation_failed',
        };
      } catch (err: any) {
        const classification = this.classifyError(err);
        if (classification.retryable && attempt < this.maxRetries) {
          await delay(this.calculateDelay(attempt));
          continue;
        }
        return {
          content: classification.fallbackMessage,
          error: true,
          errorCode: classification.errorCode,
        };
      }
    }

    // Should never reach here, but satisfy TypeScript
    return {
      content: this.fallbackRetryable,
      error: true,
      errorCode: 'unknown',
    };
  }

  private classifyError(err: any): { errorCode: ChatResult['errorCode']; retryable: boolean; fallbackMessage: string } {
    const status = err?.status;

    if (status === 429) {
      return { errorCode: 'rate_limited', retryable: true, fallbackMessage: this.fallbackRateLimit };
    }
    if (status >= 500) {
      return { errorCode: 'retryable', retryable: true, fallbackMessage: this.fallbackRetryable };
    }
    if (
      err?.code === 'ETIMEDOUT' ||
      err?.code === 'ECONNRESET' ||
      err?.code === 'ENOTFOUND' ||
      err?.code === 'ECONNREFUSED' ||
      err?.name === 'AbortError' ||
      (typeof err?.message === 'string' && err.message.toLowerCase().includes('timeout'))
    ) {
      return { errorCode: 'retryable', retryable: true, fallbackMessage: this.fallbackRetryable };
    }
    if (status === 401) {
      return { errorCode: 'auth_invalid', retryable: false, fallbackMessage: this.fallbackAuthInvalid };
    }
    if (status === 400 || status === 403 || status === 404 || status === 422) {
      return { errorCode: 'unknown', retryable: false, fallbackMessage: this.fallbackRetryable };
    }

    return { errorCode: 'unknown', retryable: false, fallbackMessage: this.fallbackRetryable };
  }

  private validateResponse(response: Anthropic.Messages.Message): { valid: boolean; content: string } {
    if (!response.content || response.content.length === 0) {
      return { valid: false, content: '' };
    }

    const text = response.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as Anthropic.TextBlock).text)
      .join('');

    if (!text || /^\s*$/.test(text)) {
      return { valid: false, content: '' };
    }

    return { valid: true, content: text };
  }

  private calculateDelay(attempt: number): number {
    const base = this.retryBaseDelayMs * (this.retryBackoffMultiplier ** attempt);
    const jittered = this.retryJitter ? base * (0.5 + Math.random() * 0.5) : base;
    return Math.round(jittered);
  }

  private truncateMessages(messages: Anthropic.Messages.MessageParam[]): Anthropic.Messages.MessageParam[] {
    let totalTokens = 0;
    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : '';
      totalTokens += Math.ceil(content.length / 4);
    }

    if (totalTokens <= this.maxInputTokens) {
      return messages;
    }

    // Drop oldest messages until we're under budget, but never drop the last message
    let dropCount = 0;
    while (dropCount < messages.length - 1) {
      const content = typeof messages[dropCount].content === 'string' ? messages[dropCount].content : '';
      totalTokens -= Math.ceil(content.length / 4);
      dropCount++;
      if (totalTokens <= this.maxInputTokens) {
        break;
      }
    }

    return messages.slice(dropCount);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './index';

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      BOT_ID: 'test-bot-id',
      SECRET: 'test-secret',
      ANTHROPIC_API_KEY: 'test-api-key',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('loads required values', () => {
    const config = loadConfig();
    expect(config.botId).toBe('test-bot-id');
    expect(config.secret).toBe('test-secret');
    expect(config.anthropicApiKey).toBe('test-api-key');
  });

  it('applies defaults for optional values', () => {
    const config = loadConfig();
    expect(config.anthropicModel).toBe('claude-3-5-sonnet-20241022');
    expect(config.conversationTtlMs).toBe(30 * 60 * 1000);
    expect(config.maxConversations).toBe(1000);
    expect(config.maxHistoryMessages).toBe(20);
    expect(config.rateLimitRequests).toBe(10);
    expect(config.rateLimitWindowMs).toBe(60 * 1000);
    expect(config.apiTimeoutMs).toBe(30 * 1000);
    expect(config.maxOutputTokens).toBe(2048);
  });

  it('allows overrides via environment variables', () => {
    process.env.CONVERSATION_TTL_MS = '12345';
    process.env.MAX_CONVERSATIONS = '500';
    process.env.ANTHROPIC_MODEL = 'claude-3-opus';

    const config = loadConfig();
    expect(config.conversationTtlMs).toBe(12345);
    expect(config.maxConversations).toBe(500);
    expect(config.anthropicModel).toBe('claude-3-opus');
  });

  it('throws for missing required variable', () => {
    delete process.env.BOT_ID;
    expect(() => loadConfig()).toThrow('Missing required environment variable: BOT_ID');
  });

  it('throws for invalid integer value', () => {
    process.env.CONVERSATION_TTL_MS = 'not-a-number';
    expect(() => loadConfig()).toThrow('Invalid integer value for environment variable: CONVERSATION_TTL_MS=not-a-number');
  });

  it('applies defaults for new AI retry and fallback config', () => {
    const config = loadConfig();
    expect(config.maxInputTokens).toBe(8192);
    expect(config.maxRetries).toBe(1);
    expect(config.retryBaseDelayMs).toBe(2000);
    expect(config.retryBackoffMultiplier).toBe(2);
    expect(config.retryJitter).toBe(true);
    expect(config.fallbackRateLimit).toBe('请求过于频繁，请稍后再试。');
    expect(config.fallbackAuthInvalid).toBe('AI 服务认证失败，请联系管理员。');
    expect(config.fallbackValidationFailed).toBe('AI 返回了无效响应，请重试。');
    expect(config.fallbackRetryable).toBe('服务暂时繁忙，请稍后再试。');
  });

  it('allows overrides for new AI config via environment variables', () => {
    process.env.MAX_INPUT_TOKENS = '4096';
    process.env.MAX_RETRIES = '3';
    process.env.RETRY_BASE_DELAY_MS = '1000';
    process.env.RETRY_BACKOFF_MULTIPLIER = '3';
    process.env.RETRY_JITTER = 'false';
    process.env.FALLBACK_RATE_LIMIT = 'Custom rate limit';

    const config = loadConfig();
    expect(config.maxInputTokens).toBe(4096);
    expect(config.maxRetries).toBe(3);
    expect(config.retryBaseDelayMs).toBe(1000);
    expect(config.retryBackoffMultiplier).toBe(3);
    expect(config.retryJitter).toBe(false);
    expect(config.fallbackRateLimit).toBe('Custom rate limit');
  });
});

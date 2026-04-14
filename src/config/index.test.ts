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
});

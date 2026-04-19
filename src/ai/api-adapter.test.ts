import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicApiAdapter } from './api-adapter';

// Mock the Anthropic SDK
const createMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn(function () {
      this.messages = { create: createMock };
    }),
  };
});

function createAdapter(overrides: Partial<ConstructorParameters<typeof AnthropicApiAdapter>[0]> = {}) {
  return new AnthropicApiAdapter({
    anthropicApiKey: 'test-key',
    anthropicModel: 'claude-test',
    maxOutputTokens: 100,
    apiTimeoutMs: 5000,
    internalSystemPrompt: 'Internal prompt',
    externalSystemPrompt: 'External prompt',
    maxInputTokens: 100,
    maxRetries: 2,
    retryBaseDelayMs: 100,
    retryBackoffMultiplier: 2,
    retryJitter: false,
    fallbackRateLimit: 'Rate limit fallback',
    fallbackAuthInvalid: 'Auth invalid fallback',
    fallbackValidationFailed: 'Validation failed fallback',
    fallbackRetryable: 'Retryable fallback',
    ...overrides,
  });
}

describe('AnthropicApiAdapter', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('returns AI content on success', async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Hello back' }],
    });

    const adapter = createAdapter();
    const result = await adapter.chat({
      conversationId: 'c1',
      message: 'Hello',
      contactType: 'internal',
    });

    expect(result.content).toBe('Hello back');
    expect(result.error).toBeUndefined();
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('returns usage metadata when available', async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Hello back' }],
      usage: { input_tokens: 12, output_tokens: 34 },
    });

    const adapter = createAdapter();
    const result = await adapter.chat({
      conversationId: 'c1',
      message: 'Hello',
      contactType: 'internal',
    });

    expect(result.usage).toEqual({ input_tokens: 12, output_tokens: 34 });
  });

  it('uses external system prompt for external contacts', async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'OK' }],
    });

    const adapter = createAdapter();
    await adapter.chat({
      conversationId: 'c1',
      message: 'Hello',
      contactType: 'external',
    });

    const callArgs = createMock.mock.calls[0];
    expect(callArgs[0].system).toBe('External prompt');
  });

  it('filters out system messages from history', async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'OK' }],
    });

    const adapter = createAdapter();
    await adapter.chat({
      conversationId: 'c1',
      message: 'Hello',
      contactType: 'internal',
      history: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'prev' },
        { role: 'assistant', content: 'ans' },
        { role: 'user', content: 'Hello' },
      ],
    });

    const callArgs = createMock.mock.calls[0];
    expect(callArgs[0].messages).toEqual([
      { role: 'user', content: 'prev' },
      { role: 'assistant', content: 'ans' },
      { role: 'user', content: 'Hello' },
    ]);
  });

  it('retries once on 5xx error then returns fallback', async () => {
    const serverError = { status: 500, message: 'Server error' };
    createMock
      .mockRejectedValueOnce(serverError)
      .mockRejectedValueOnce(serverError)
      .mockRejectedValueOnce(serverError);

    const adapter = createAdapter();
    const result = await adapter.chat({
      conversationId: 'c1',
      message: 'Hello',
      contactType: 'internal',
    });

    expect(createMock).toHaveBeenCalledTimes(3);
    expect(result.error).toBe(true);
    expect(result.content).toBe('Retryable fallback');
    expect(result.errorCode).toBe('retryable');
  });

  it('retries once on 429 error then returns fallback', async () => {
    const rateLimitError = { status: 429, message: 'Rate limited' };
    createMock
      .mockRejectedValueOnce(rateLimitError)
      .mockRejectedValueOnce(rateLimitError)
      .mockRejectedValueOnce(rateLimitError);

    const adapter = createAdapter();
    const result = await adapter.chat({
      conversationId: 'c1',
      message: 'Hello',
      contactType: 'internal',
    });

    expect(createMock).toHaveBeenCalledTimes(3);
    expect(result.error).toBe(true);
    expect(result.errorCode).toBe('rate_limited');
    expect(result.content).toBe('Rate limit fallback');
  }, 15000);

  it('returns fallback on unexpected error', async () => {
    createMock.mockRejectedValueOnce(new Error('Boom'));

    const adapter = createAdapter();
    const result = await adapter.chat({
      conversationId: 'c1',
      message: 'Hello',
      contactType: 'internal',
    });

    expect(result.error).toBe(true);
    expect(result.content).toBe('Retryable fallback');
  });

  it('returns validation_failed fallback on empty content array', async () => {
    createMock.mockResolvedValueOnce({ content: [] });

    const adapter = createAdapter();
    const result = await adapter.chat({
      conversationId: 'c1',
      message: 'Hello',
      contactType: 'internal',
    });

    expect(result.error).toBe(true);
    expect(result.errorCode).toBe('validation_failed');
    expect(result.content).toBe('Validation failed fallback');
  });

  it('returns validation_failed fallback when no text blocks present', async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } }],
    });

    const adapter = createAdapter();
    const result = await adapter.chat({
      conversationId: 'c1',
      message: 'Hello',
      contactType: 'internal',
    });

    expect(result.errorCode).toBe('validation_failed');
    expect(result.content).toBe('Validation failed fallback');
  });

  it('returns validation_failed fallback on whitespace-only text', async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: '   \n\t  ' }],
    });

    const adapter = createAdapter();
    const result = await adapter.chat({
      conversationId: 'c1',
      message: 'Hello',
      contactType: 'internal',
    });

    expect(result.errorCode).toBe('validation_failed');
    expect(result.content).toBe('Validation failed fallback');
  });

  it('retries up to maxRetries on 5xx errors then returns retryable fallback', async () => {
    createMock
      .mockRejectedValueOnce({ status: 500 })
      .mockRejectedValueOnce({ status: 503 })
      .mockRejectedValueOnce({ status: 500 });

    const adapter = createAdapter();
    const result = await adapter.chat({
      conversationId: 'c1',
      message: 'Hello',
      contactType: 'internal',
    });

    expect(createMock).toHaveBeenCalledTimes(3);
    expect(result.error).toBe(true);
    expect(result.errorCode).toBe('retryable');
    expect(result.content).toBe('Retryable fallback');
  });

  it('retries up to maxRetries on 429 errors then returns rate_limited fallback', async () => {
    createMock
      .mockRejectedValueOnce({ status: 429 })
      .mockRejectedValueOnce({ status: 429 })
      .mockRejectedValueOnce({ status: 429 });

    const adapter = createAdapter();
    const result = await adapter.chat({
      conversationId: 'c1',
      message: 'Hello',
      contactType: 'internal',
    });

    expect(createMock).toHaveBeenCalledTimes(3);
    expect(result.errorCode).toBe('rate_limited');
    expect(result.content).toBe('Rate limit fallback');
  });

  it('fails fast on 401 without retry and returns auth_invalid fallback', async () => {
    createMock.mockRejectedValueOnce({ status: 401 });

    const adapter = createAdapter();
    const result = await adapter.chat({
      conversationId: 'c1',
      message: 'Hello',
      contactType: 'internal',
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(result.errorCode).toBe('auth_invalid');
    expect(result.content).toBe('Auth invalid fallback');
  });

  it('fails fast on 400 without retry', async () => {
    createMock.mockRejectedValueOnce({ status: 400 });

    const adapter = createAdapter();
    const result = await adapter.chat({
      conversationId: 'c1',
      message: 'Hello',
      contactType: 'internal',
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(result.error).toBe(true);
  });

  it('fails fast on 403 without retry', async () => {
    createMock.mockRejectedValueOnce({ status: 403 });

    const adapter = createAdapter();
    const result = await adapter.chat({
      conversationId: 'c1',
      message: 'Hello',
      contactType: 'internal',
    });

    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('fails fast on 404 without retry', async () => {
    createMock.mockRejectedValueOnce({ status: 404 });

    const adapter = createAdapter();
    const result = await adapter.chat({
      conversationId: 'c1',
      message: 'Hello',
      contactType: 'internal',
    });

    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('fails fast on 422 without retry', async () => {
    createMock.mockRejectedValueOnce({ status: 422 });

    const adapter = createAdapter();
    const result = await adapter.chat({
      conversationId: 'c1',
      message: 'Hello',
      contactType: 'internal',
    });

    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('retries on timeout errors (ETIMEDOUT)', async () => {
    createMock
      .mockRejectedValueOnce({ code: 'ETIMEDOUT', message: 'timeout' })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'OK' }] });

    const adapter = createAdapter();
    const result = await adapter.chat({
      conversationId: 'c1',
      message: 'Hello',
      contactType: 'internal',
    });

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(result.error).toBeUndefined();
    expect(result.content).toBe('OK');
  });

  it('forwards usage metadata in ChatResult', async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Hello' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const adapter = createAdapter();
    const result = await adapter.chat({
      conversationId: 'c1',
      message: 'Hello',
      contactType: 'internal',
    });

    expect(result.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
  });

  it('truncates oldest messages when exceeding maxInputTokens', async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'OK' }],
    });

    const adapter = createAdapter({ maxInputTokens: 10 });
    await adapter.chat({
      conversationId: 'c1',
      message: 'c'.repeat(40),
      contactType: 'internal',
      history: [
        { role: 'user', content: 'a'.repeat(40) },
        { role: 'assistant', content: 'b'.repeat(40) },
      ],
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    const sentMessages = createMock.mock.calls[0][0].messages;
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].role).toBe('user');
    expect(sentMessages[0].content).toBe('c'.repeat(40));
  });

  it('preserves current user message during truncation', async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'OK' }],
    });

    const adapter = createAdapter({ maxInputTokens: 10 });
    await adapter.chat({
      conversationId: 'c1',
      message: 'Hello world',
      contactType: 'internal',
      history: [
        { role: 'user', content: 'a'.repeat(40) },
        { role: 'assistant', content: 'b'.repeat(40) },
      ],
    });

    const sentMessages = createMock.mock.calls[0][0].messages;
    expect(sentMessages[sentMessages.length - 1].role).toBe('user');
    expect(sentMessages[sentMessages.length - 1].content).toBe('Hello world');
  });

  it('uses configurable fallback messages per error type', async () => {
    createMock.mockRejectedValueOnce({ status: 429 });

    const adapter = createAdapter({
      maxRetries: 0,
      fallbackRateLimit: 'Custom rate limit message',
    });
    const result = await adapter.chat({
      conversationId: 'c1',
      message: 'Hello',
      contactType: 'internal',
    });

    expect(result.content).toBe('Custom rate limit message');
    expect(result.errorCode).toBe('rate_limited');
  });
});

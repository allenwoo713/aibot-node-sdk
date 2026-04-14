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

function createAdapter() {
  return new AnthropicApiAdapter({
    anthropicApiKey: 'test-key',
    anthropicModel: 'claude-test',
    maxOutputTokens: 100,
    apiTimeoutMs: 5000,
    internalSystemPrompt: 'Internal prompt',
    externalSystemPrompt: 'External prompt',
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
      .mockRejectedValueOnce(serverError);

    const adapter = createAdapter();
    const result = await adapter.chat({
      conversationId: 'c1',
      message: 'Hello',
      contactType: 'internal',
    });

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(result.error).toBe(true);
    expect(result.content).toBe('服务暂时繁忙，请稍后再试。');
  });

  it('retries once on 429 error then returns fallback', async () => {
    const rateLimitError = { status: 429, message: 'Rate limited' };
    createMock
      .mockRejectedValueOnce(rateLimitError)
      .mockRejectedValueOnce(rateLimitError);

    const adapter = createAdapter();
    const result = await adapter.chat({
      conversationId: 'c1',
      message: 'Hello',
      contactType: 'internal',
    });

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(result.error).toBe(true);
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
    expect(result.content).toBe('服务暂时繁忙，请稍后再试。');
  });
});

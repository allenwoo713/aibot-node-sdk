import { describe, it, expect, vi } from 'vitest';
import { parseCommand, handleDocumentCommand } from './index';

describe('parseCommand', () => {
  it('parses /文档 with docid argument', () => {
    const result = parseCommand('/文档 doc_123456');
    expect(result).toEqual({ type: 'document', arg: 'doc_123456' });
  });

  it('parses /文档 with URL argument', () => {
    const result = parseCommand('/文档 https://doc.weixin.qq.com/d/xxx');
    expect(result).toEqual({ type: 'document', arg: 'https://doc.weixin.qq.com/d/xxx' });
  });

  it('parses /文档 with extra whitespace', () => {
    const result = parseCommand('  /文档   doc_123  ');
    expect(result).toEqual({ type: 'document', arg: 'doc_123' });
  });

  it('returns document command with empty arg for missing argument', () => {
    const result = parseCommand('/文档');
    expect(result).toEqual({ type: 'document', arg: '' });
  });

  it('returns null for non-command text', () => {
    expect(parseCommand('Hello bot')).toBeNull();
    expect(parseCommand('/文档列表')).toBeNull();
    expect(parseCommand('/日程 创建 meeting')).toBeNull();
  });
});

describe('handleDocumentCommand', () => {
  function createMockApiClient(content: string | Error = 'mock doc content') {
    return {
      getDocContent: vi.fn().mockImplementation(() => {
        if (content instanceof Error) throw content;
        return Promise.resolve(content);
      }),
    } as any;
  }

  function createMockAdapter(result: { content: string; error?: boolean } = { content: 'summary' }) {
    return {
      chat: vi.fn().mockResolvedValue(result),
    } as any;
  }

  function createMockLogger() {
    return { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() } as any;
  }

  it('returns usage instruction when arg is empty', async () => {
    const reply = await handleDocumentCommand('', createMockApiClient(), createMockAdapter(), 'internal', { maxInputTokens: 100 }, createMockLogger());
    expect(reply).toContain('请提供文档 ID 或链接');
  });

  it('returns format error for invalid URL', async () => {
    const reply = await handleDocumentCommand('not-a-url', createMockApiClient(), createMockAdapter(), 'internal', { maxInputTokens: 100 }, createMockLogger());
    // non-http args are treated as docid, so this goes to API call
    // Let's test an invalid URL explicitly:
    const reply2 = await handleDocumentCommand('https://bad.example.com/doc', createMockApiClient(), createMockAdapter(), 'internal', { maxInputTokens: 100 }, createMockLogger());
    expect(reply2).toContain('文档链接格式不正确');
  });

  it('returns summary on success', async () => {
    const apiClient = createMockApiClient('# Title\nContent');
    const adapter = createMockAdapter({ content: '文档总结：要点1、要点2。' });
    const reply = await handleDocumentCommand('doc_123', apiClient, adapter, 'internal', { maxInputTokens: 1000 }, createMockLogger());
    expect(reply).toBe('文档总结：要点1、要点2。');
    expect(apiClient.getDocContent).toHaveBeenCalledWith('doc_123');
    expect(adapter.chat).toHaveBeenCalledTimes(1);
    const chatCall = adapter.chat.mock.calls[0][0];
    expect(chatCall.history).toEqual([]);
    expect(chatCall.contactType).toBe('internal');
    expect(chatCall.message).toContain('请用中文总结以下文档的主要内容');
    expect(chatCall.message).toContain('# Title');
  });

  it('returns timeout error when polling times out', async () => {
    const apiClient = createMockApiClient(new Error('Document content polling timed out'));
    const reply = await handleDocumentCommand('doc_123', apiClient, createMockAdapter(), 'internal', { maxInputTokens: 1000 }, createMockLogger());
    expect(reply).toBe('文档处理超时，请稍后重试。');
  });

  it('returns API error message on generic API failure', async () => {
    const apiClient = createMockApiClient(new Error('WeCom API error'));
    const reply = await handleDocumentCommand('doc_123', apiClient, createMockAdapter(), 'internal', { maxInputTokens: 1000 }, createMockLogger());
    expect(reply).toBe('无法获取文档内容，请检查文档 ID 或链接是否正确。');
  });

  it('returns empty content error when document has no content', async () => {
    const apiClient = createMockApiClient('   ');
    const reply = await handleDocumentCommand('doc_123', apiClient, createMockAdapter(), 'internal', { maxInputTokens: 1000 }, createMockLogger());
    expect(reply).toBe('文档内容为空，无法分析。');
  });

  it('returns AI error when adapter returns error flag', async () => {
    const apiClient = createMockApiClient('content');
    const adapter = createMockAdapter({ content: 'fail', error: true });
    const reply = await handleDocumentCommand('doc_123', apiClient, adapter, 'internal', { maxInputTokens: 1000 }, createMockLogger());
    expect(reply).toBe('文档分析失败，请稍后重试。');
  });

  it('truncates document when it exceeds token limit', async () => {
    const longContent = 'a'.repeat(10000);
    const apiClient = createMockApiClient(longContent);
    const adapter = createMockAdapter({ content: 'truncated summary' });
    const reply = await handleDocumentCommand('doc_123', apiClient, adapter, 'internal', { maxInputTokens: 100 }, createMockLogger());
    expect(reply).toBe('truncated summary');
    const chatCall = adapter.chat.mock.calls[0][0];
    expect(chatCall.message).toContain('[文档过长，已截断。仅总结以上部分。]');
  });
});

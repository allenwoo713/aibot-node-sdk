import type { WeComApiClient } from '../../api';
import type { AiBackend } from '../../ai/adapter';
import type { BotConfig } from '../../config';
import type { Logger } from '../../types';

const COMMAND_PREFIX = '/文档';
const SUMMARIZATION_PROMPT = '请用中文总结以下文档的主要内容，列出关键要点：';

export interface ParsedDocumentCommand {
  type: 'document';
  arg: string;
}

/**
 * Parse incoming message content for the /文档 command.
 * Returns null if the message is not a document command.
 */
export function parseDocumentCommand(content: string): ParsedDocumentCommand | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith(COMMAND_PREFIX)) {
    return null;
  }
  const afterPrefix = trimmed.slice(COMMAND_PREFIX.length);
  // Exact match "/文档" with no suffix -> missing argument
  if (afterPrefix === '') {
    return { type: 'document', arg: '' };
  }
  // Must have a space after the prefix (prevents matching "/文档列表")
  if (!afterPrefix.startsWith(' ')) {
    return null;
  }
  const arg = afterPrefix.slice(1).trim();
  if (!arg) {
    return { type: 'document', arg: '' };
  }
  return { type: 'document', arg };
}

/**
 * Handle a document command: download content, summarize via AI, return reply text.
 * All user-facing errors are returned as Chinese strings (never thrown to user).
 */
export async function handleDocumentCommand(
  arg: string,
  apiClient: WeComApiClient,
  adapter: AiBackend,
  contactType: 'internal' | 'external',
  config: Pick<BotConfig, 'maxInputTokens'>,
  logger: Logger,
): Promise<string> {
  // 1. Validate argument
  if (!arg) {
    return '请提供文档 ID 或链接，例如：/文档 doc_xxxxxxxx 或 /文档 https://doc.weixin.qq.com/...';
  }

  const isUrl = arg.startsWith('http://') || arg.startsWith('https://');
  if (isUrl) {
    try {
      const parsed = new URL(arg);
      if (!parsed.hostname.includes('doc.weixin.qq.com')) {
        return '文档链接格式不正确，请使用企业微信文档分享链接。';
      }
    } catch {
      return '文档链接格式不正确，请检查后重试。';
    }
  }

  // 2. Download document content with polling
  let docContent: string;
  try {
    docContent = await apiClient.getDocContent(arg);
  } catch (err: any) {
    logger.warn('Failed to get document content', { arg, error: err?.message });
    if (err?.message?.includes('timed out')) {
      return '文档处理超时，请稍后重试。';
    }
    return '无法获取文档内容，请检查文档 ID 或链接是否正确。';
  }

  if (!docContent || /^\s*$/.test(docContent)) {
    return '文档内容为空，无法分析。';
  }

  // 3. Pre-flight token estimation and truncation
  const promptTokenEstimate = Math.ceil(SUMMARIZATION_PROMPT.length / 4);
  const maxDocTokens = config.maxInputTokens - promptTokenEstimate - 50; // 50 token buffer
  const maxDocChars = maxDocTokens * 4;

  let truncated = false;
  if (docContent.length > maxDocChars) {
    docContent = docContent.slice(0, maxDocChars);
    truncated = true;
  }

  const message = truncated
    ? `${SUMMARIZATION_PROMPT}\n\n${docContent}\n\n[文档过长，已截断。仅总结以上部分。]`
    : `${SUMMARIZATION_PROMPT}\n\n${docContent}`;

  // 4. One-shot summarization via AI adapter
  try {
    const result = await adapter.chat({
      conversationId: `doc-${arg}`,
      message,
      contactType,
      history: [],
    });

    if (result.error) {
      logger.warn('AI summarization returned error', { errorCode: result.errorCode });
      return '文档分析失败，请稍后重试。';
    }

    return result.content;
  } catch (err: any) {
    logger.warn('AI summarization threw', { error: err?.message });
    return '文档分析失败，请稍后重试。';
  }
}

import fs from 'fs';
import path from 'path';
import type { Logger } from '../types';

export interface BotConfig {
  /** WeCom bot ID */
  botId: string;
  /** WeCom bot secret */
  secret: string;
  /** Anthropic API key */
  anthropicApiKey: string;
  /** Anthropic-compatible base URL (optional) */
  anthropicBaseUrl?: string;
  /** Anthropic model name */
  anthropicModel: string;
  /** WebSocket URL (optional) */
  wsUrl?: string;
  /** WeCom corp ID (optional, defaults to botId) */
  corpId?: string;
  /** WeCom agent ID (optional, defaults to botId) */
  agentId?: string;
  /** Conversation TTL in milliseconds */
  conversationTtlMs: number;
  /** Max conversations in memory */
  maxConversations: number;
  /** Max messages per conversation history */
  maxHistoryMessages: number;
  /** Per-conversation rate limit (requests per window) */
  rateLimitRequests: number;
  /** Per-conversation rate limit window in milliseconds */
  rateLimitWindowMs: number;
  /** Anthropic API timeout in milliseconds */
  apiTimeoutMs: number;
  /** Max output tokens for Anthropic API */
  maxOutputTokens: number;
  /** Path to persist conversation state */
  persistencePath: string;
  /** Persistence backend: 'json' or 'sqlite' (default: 'json') */
  persistenceBackend: 'json' | 'sqlite';
  /** System prompt for internal contacts */
  internalSystemPrompt: string;
  /** System prompt for external contacts */
  externalSystemPrompt: string;
  /** Max input tokens before truncating conversation history (default: 8192) */
  maxInputTokens: number;
  /** Max retries for retryable AI API errors (default: 1) */
  maxRetries: number;
  /** Base delay in ms before first retry (default: 2000) */
  retryBaseDelayMs: number;
  /** Backoff multiplier between retries (default: 2) */
  retryBackoffMultiplier: number;
  /** Whether to add random jitter to retry delays (default: true) */
  retryJitter: boolean;
  /** Fallback message for rate limit errors */
  fallbackRateLimit: string;
  /** Fallback message for auth invalid errors */
  fallbackAuthInvalid: string;
  /** Fallback message for validation failures (empty/malformed response) */
  fallbackValidationFailed: string;
  /** Fallback message for generic retryable errors */
  fallbackRetryable: string;
  /** Optional logger for observability */
  logger?: Logger;
}

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined || value === '') return defaultValue;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer value for environment variable: ${key}=${value}`);
  }
  return parsed;
}

export function loadConfig(): BotConfig {
  const config: BotConfig = {
    botId: getEnv('BOT_ID'),
    secret: getEnv('SECRET'),
    anthropicApiKey: getEnv('ANTHROPIC_API_KEY'),
    anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL || undefined,
    anthropicModel: getEnv('ANTHROPIC_MODEL', 'claude-3-5-sonnet-20241022'),
    wsUrl: process.env.WS_URL || undefined,
    corpId: process.env.CORP_ID || getEnv('BOT_ID'),
    agentId: process.env.AGENT_ID || getEnv('BOT_ID'),
    conversationTtlMs: getEnvInt('CONVERSATION_TTL_MS', 30 * 60 * 1000),
    maxConversations: getEnvInt('MAX_CONVERSATIONS', 1000),
    maxHistoryMessages: getEnvInt('MAX_HISTORY_MESSAGES', 20),
    rateLimitRequests: getEnvInt('RATE_LIMIT_REQUESTS', 10),
    rateLimitWindowMs: getEnvInt('RATE_LIMIT_WINDOW_MS', 60 * 1000),
    apiTimeoutMs: getEnvInt('API_TIMEOUT_MS', 30 * 1000),
    maxOutputTokens: getEnvInt('MAX_OUTPUT_TOKENS', 2048),
    persistencePath: getEnv('PERSISTENCE_PATH', path.resolve(process.cwd(), '.bot-state.json')),
    persistenceBackend: getEnv('PERSISTENCE_BACKEND', 'json') as 'json' | 'sqlite',
    internalSystemPrompt: getEnv(
      'INTERNAL_SYSTEM_PROMPT',
      'You are a helpful AI assistant for our company employees. You can answer questions about internal processes, draft emails, and help with code.',
    ),
    externalSystemPrompt: getEnv(
      'EXTERNAL_SYSTEM_PROMPT',
      'You are a helpful AI assistant for external visitors. Do not discuss internal company data, pricing, or confidential information. Keep replies concise and professional.',
    ),
    maxInputTokens: getEnvInt('MAX_INPUT_TOKENS', 8192),
    maxRetries: getEnvInt('MAX_RETRIES', 1),
    retryBaseDelayMs: getEnvInt('RETRY_BASE_DELAY_MS', 2000),
    retryBackoffMultiplier: getEnvInt('RETRY_BACKOFF_MULTIPLIER', 2),
    retryJitter: process.env.RETRY_JITTER !== 'false',
    fallbackRateLimit: getEnv('FALLBACK_RATE_LIMIT', '请求过于频繁，请稍后再试。'),
    fallbackAuthInvalid: getEnv('FALLBACK_AUTH_INVALID', 'AI 服务认证失败，请联系管理员。'),
    fallbackValidationFailed: getEnv('FALLBACK_VALIDATION_FAILED', 'AI 返回了无效响应，请重试。'),
    fallbackRetryable: getEnv('FALLBACK_RETRYABLE', '服务暂时繁忙，请稍后再试。'),
  };

  if (config.persistenceBackend !== 'json' && config.persistenceBackend !== 'sqlite') {
    throw new Error(`Invalid PERSISTENCE_BACKEND value: ${config.persistenceBackend}. Must be 'json' or 'sqlite'.`);
  }

  // Ensure persistence directory exists
  const dir = path.dirname(config.persistencePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return config;
}

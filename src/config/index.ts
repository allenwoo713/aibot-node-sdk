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
  /** System prompt for internal contacts */
  internalSystemPrompt: string;
  /** System prompt for external contacts */
  externalSystemPrompt: string;
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
    internalSystemPrompt: getEnv(
      'INTERNAL_SYSTEM_PROMPT',
      'You are a helpful AI assistant for our company employees. You can answer questions about internal processes, draft emails, and help with code.',
    ),
    externalSystemPrompt: getEnv(
      'EXTERNAL_SYSTEM_PROMPT',
      'You are a helpful AI assistant for external visitors. Do not discuss internal company data, pricing, or confidential information. Keep replies concise and professional.',
    ),
  };

  // Ensure persistence directory exists
  const dir = path.dirname(config.persistencePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return config;
}

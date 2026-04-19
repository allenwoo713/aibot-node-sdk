export interface ChatOptions {
  /** The conversation ID (e.g., chatid or userid). */
  conversationId: string;
  /** The user's message text. */
  message: string;
  /** 'internal' | 'external' */
  contactType: 'internal' | 'external';
  /** Optional: previous messages for context. */
  history?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}

export interface ChatResult {
  /** The AI's reply text. */
  content: string;
  /** Whether the backend encountered an error. */
  error?: boolean;
  /** Token usage metadata from the backend (input/output tokens). */
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  /** Structured error classification for fallback handling and observability. */
  errorCode?: 'retryable' | 'rate_limited' | 'auth_invalid' | 'validation_failed' | 'unknown';
}

export interface AiBackend {
  /** Send a user message and return the AI's text reply. */
  chat(options: ChatOptions): Promise<ChatResult>;
}

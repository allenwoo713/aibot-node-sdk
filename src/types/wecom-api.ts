/**
 * WeCom Open Platform API type definitions
 */

/** In-memory and file cache structure for access_token */
export interface TokenCache {
  access_token: string;
  expires_at: number; // absolute timestamp in ms
}

/** Response from GET /gettoken endpoint */
export interface GetTokenResponse {
  errcode: number;
  errmsg: string;
  access_token?: string;
  expires_in?: number;
}

/** Generic WeCom API error envelope */
export interface WeComApiError {
  errcode: number;
  errmsg: string;
}

/** Response from POST /doc/get_doc_content endpoint */
export interface GetDocContentResponse {
  errcode: number;
  errmsg: string;
  /** Task ID for polling; present on every response */
  task_id?: string;
  /** true when document content is ready */
  task_done?: boolean;
  /** Document content in Markdown format (only when task_done is true) */
  content?: string;
}

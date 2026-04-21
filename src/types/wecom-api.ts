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

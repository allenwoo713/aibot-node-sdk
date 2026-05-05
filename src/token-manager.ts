import fs from 'fs/promises';
import type { AxiosInstance } from 'axios';
import type { Logger } from './types';
import type { TokenCache, GetTokenResponse } from './types/wecom-api';

/**
 * Manages WeCom Open Platform access_token lifecycle:
 * - In-memory cache with proactive refresh
 * - Atomic file persistence
 * - Concurrent fetch deduplication
 * - Silent fallback on file read errors
 */
export class TokenManager {
  private static readonly GET_TOKEN_URL = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken';
  private static readonly PROACTIVE_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

  private inMemToken: TokenCache | null = null;
  private fetchPromise: Promise<string> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  private corpId: string;
  private secret: string;
  private tokenFilePath: string;
  private logger: Logger;
  private httpClient: AxiosInstance;

  constructor(options: {
    corpId: string;
    secret: string;
    tokenFilePath: string;
    logger: Logger;
    httpClient: AxiosInstance;
  }) {
    this.corpId = options.corpId;
    this.secret = options.secret;
    this.tokenFilePath = options.tokenFilePath;
    this.logger = options.logger;
    this.httpClient = options.httpClient;
  }

  /**
   * Returns a valid access_token, fetching a new one if necessary.
   * Checks in-memory cache, then file cache, then fetches from WeCom.
   */
  async getToken(): Promise<string> {
    // 1. In-memory cache check
    if (this.inMemToken && Date.now() < this.inMemToken.expires_at - TokenManager.PROACTIVE_BUFFER_MS) {
      this.logger.debug('TokenManager: using in-memory token (expires at %d)', this.inMemToken.expires_at);
      return this.inMemToken.access_token;
    }

    // 2. File cache check
    try {
      const raw = await fs.readFile(this.tokenFilePath, 'utf-8');
      const parsed = JSON.parse(raw) as TokenCache;
      if (
        parsed.access_token &&
        typeof parsed.expires_at === 'number' &&
        Date.now() < parsed.expires_at - TokenManager.PROACTIVE_BUFFER_MS
      ) {
        this.inMemToken = parsed;
        this.logger.debug('TokenManager: loaded valid token from file (expires at %d)', parsed.expires_at);
        this.scheduleRefresh(parsed.expires_at);
        return parsed.access_token;
      }
    } catch (err) {
      this.logger.warn('TokenManager: failed to read token file, will fetch new token');
    }

    // 3. Deduplicate concurrent fetches
    if (this.fetchPromise) {
      this.logger.debug('TokenManager: awaiting existing fetch promise');
      return await this.fetchPromise;
    }

    this.fetchPromise = this.doFetch().finally(() => {
      this.fetchPromise = null;
    });
    return await this.fetchPromise;
  }

  /**
   * Forces a fresh token fetch, invalidating any cached token.
   */
  async forceRefresh(): Promise<string> {
    this.logger.info('TokenManager: forcing token refresh');
    this.inMemToken = null;
    return await this.getToken();
  }

  /**
   * Stops the proactive refresh timer to prevent leaks on destruction.
   */
  stop(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
      this.logger.debug('TokenManager: stopped refresh timer');
    }
  }

  private async doFetch(): Promise<string> {
    this.logger.info('TokenManager: fetching new token from WeCom');

    const response = await this.httpClient.get<GetTokenResponse>(TokenManager.GET_TOKEN_URL, {
      params: { corpid: this.corpId, corpsecret: this.secret },
    });

    const data = response.data;
    if (data.errcode !== 0) {
      throw new Error(`Token fetch failed: ${data.errmsg} (${data.errcode})`);
    }
    if (!data.access_token || typeof data.expires_in !== 'number') {
      throw new Error('Token fetch failed: missing access_token or expires_in in response');
    }

    const expires_at = Date.now() + data.expires_in * 1000;
    this.inMemToken = { access_token: data.access_token, expires_at };

    // Persist atomically
    const tokenData = JSON.stringify(this.inMemToken);
    if (process.platform !== 'win32') {
      const tmpPath = `${this.tokenFilePath}.tmp`;
      await fs.writeFile(tmpPath, tokenData, { encoding: 'utf-8', mode: 0o600 });
      try {
        await fs.rename(tmpPath, this.tokenFilePath);
      } catch {
        await fs.writeFile(this.tokenFilePath, tokenData, 'utf-8');
      }
    } else {
      await fs.writeFile(this.tokenFilePath, tokenData, 'utf-8');
    }

    this.logger.info('TokenManager: token fetched and persisted (expires at %d)', expires_at);
    this.scheduleRefresh(expires_at);

    return data.access_token;
  }

  private scheduleRefresh(expiresAt: number): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    const delay = Math.max(0, expiresAt - Date.now() - TokenManager.PROACTIVE_BUFFER_MS);
    this.refreshTimer = setTimeout(() => this.refreshToken(), delay);
    this.logger.debug('TokenManager: scheduled proactive refresh in %d ms', delay);
  }

  private async refreshToken(): Promise<void> {
    this.logger.info('TokenManager: proactive refresh starting');
    try {
      await this.doFetch();
    } catch (err) {
      this.logger.warn('TokenManager: proactive refresh failed, will retry on next API call');
    }
  }
}

import axios, { AxiosInstance } from 'axios';
import type { Logger } from './types';
import { TokenManager } from './token-manager';
import type { WeComApiError } from './types/wecom-api';

/**
 * 企业微信 API 客户端
 * 支持 WeCom Open Platform API 的通用请求封装，自动处理 access_token 注入与刷新
 */
export class WeComApiClient {
  private static readonly GET_TOKEN_URL = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken';
  private static readonly BASE_URL = 'https://qyapi.weixin.qq.com/cgi-bin';

  private httpClient: AxiosInstance;
  private logger: Logger;
  private tokenManager: TokenManager;

  constructor(
    logger: Logger,
    options: {
      corpId: string;
      secret: string;
      tokenFilePath: string;
      timeout?: number;
    },
  ) {
    this.logger = logger;
    this.httpClient = axios.create({
      timeout: options.timeout ?? 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    this.tokenManager = new TokenManager({
      corpId: options.corpId,
      secret: options.secret,
      tokenFilePath: options.tokenFilePath,
      logger: this.logger,
      httpClient: this.httpClient,
    });
  }

  /**
   * Generic WeCom Open Platform API request with automatic token injection.
   * Retries once on token expiry errors (40001, 40014).
   */
  async request<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
    data?: unknown,
  ): Promise<T> {
    return this.doRequest<T>(method, endpoint, params, data, true);
  }

  private async doRequest<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    params: Record<string, string | number | boolean | undefined> | undefined,
    data: unknown | undefined,
    allowRetry: boolean,
  ): Promise<T> {
    // SSRF mitigation: validate endpoint
    if (!endpoint.startsWith('/') || endpoint.includes('..')) {
      throw new Error('Invalid endpoint: must start with / and not contain ..');
    }

    const token = await this.tokenManager.getToken();
    const url = `${WeComApiClient.BASE_URL}${endpoint}`;

    const response = await this.httpClient.request({
      method,
      url,
      params: { ...params, access_token: token },
      data,
    });

    const body = response.data as T & WeComApiError;
    if (body.errcode !== 0) {
      if ((body.errcode === 40014 || body.errcode === 40001) && allowRetry) {
        this.logger.info('Token error %d, refreshing and retrying once', body.errcode);
        await this.tokenManager.forceRefresh();
        return this.doRequest<T>(method, endpoint, params, data, false);
      }
      throw new Error(`WeCom API error: ${body.errmsg} (${body.errcode})`);
    }

    return body as T;
  }

  /**
   * 获取 access_token（用于 WebSocket 认证等独立场景）。
   * 此方法直接调用 gettoken 接口，不共享 Open Platform TokenManager 缓存。
   */
  async getAccessToken(corpid: string, corpsecret: string): Promise<{ access_token: string; expires_in: number }> {
    const { data } = await this.httpClient.get(WeComApiClient.GET_TOKEN_URL, {
      params: { corpid, corpsecret },
    });
    if (data.errcode !== 0) {
      throw new Error(`gettoken failed: ${data.errmsg} (${data.errcode})`);
    }
    return { access_token: data.access_token, expires_in: data.expires_in };
  }

  /**
   * 发送文本消息
   */
  async sendTextMessage(agentid: string, touser: string, chatid: string | undefined, content: string): Promise<void> {
    const payload: Record<string, unknown> = {
      msgtype: 'text',
      agentid,
      text: { content },
      safe: 0,
    };
    if (touser) payload.touser = touser;
    if (chatid) payload.chatid = chatid;
    await this.request<void>('POST', '/message/send', undefined, payload);
  }

  /**
   * 下载文件（返回原始 Buffer 及文件名）
   */
  async downloadFileRaw(url: string): Promise<{ buffer: Buffer; filename?: string }> {
    this.logger.info('Downloading file...');

    try {
      const response = await this.httpClient.get(url, {
        responseType: 'arraybuffer',
      });

      // 从 Content-Disposition 头中解析文件名
      const contentDisposition = response.headers['content-disposition'] as string | undefined;
      let filename: string | undefined;
      if (contentDisposition) {
        // 优先匹配 filename*=UTF-8''xxx 格式（RFC 5987）
        const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;\s]+)/i);
        if (utf8Match) {
          filename = decodeURIComponent(utf8Match[1]);
        } else {
          // 匹配 filename="xxx" 或 filename=xxx 格式
          const match = contentDisposition.match(/filename="?([^";\s]+)"?/i);
          if (match) {
            filename = decodeURIComponent(match[1]);
          }
        }
      }

      this.logger.info('File downloaded successfully');
      return { buffer: Buffer.from(response.data), filename };
    } catch (error: any) {
      this.logger.error('File download failed:', error.message);
      throw error;
    }
  }

  /**
   * Stops the token refresh timer to prevent leaks on destruction.
   */
  stop(): void {
    this.tokenManager.stop();
    this.logger.debug('WeComApiClient: stopped');
  }
}

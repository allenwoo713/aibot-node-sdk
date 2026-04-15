import axios, { AxiosInstance } from 'axios';
import type { Logger } from './types';

/**
 * 企业微信 API 客户端
 * 仅负责文件下载等 HTTP 辅助功能，消息收发均走 WebSocket 通道
 */
export class WeComApiClient {
  private static readonly GET_TOKEN_URL = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken';
  private static readonly SEND_MSG_URL = 'https://qyapi.weixin.qq.com/cgi-bin/message/send';

  private httpClient: AxiosInstance;
  private logger: Logger;

  constructor(logger: Logger, timeout: number = 10000) {
    this.logger = logger;

    this.httpClient = axios.create({
      timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async getAccessToken(corpid: string, corpsecret: string): Promise<{ access_token: string; expires_in: number }> {
    const { data } = await this.httpClient.get(WeComApiClient.GET_TOKEN_URL, {
      params: { corpid, corpsecret },
    });
    if (data.errcode !== 0) {
      throw new Error(`gettoken failed: ${data.errmsg} (${data.errcode})`);
    }
    return { access_token: data.access_token, expires_in: data.expires_in };
  }

  async sendTextMessage(token: string, agentid: string, touser: string, chatid: string | undefined, content: string): Promise<void> {
    const payload: any = {
      msgtype: 'text',
      agentid,
      text: { content },
      safe: 0,
    };
    if (touser) payload.touser = touser;
    if (chatid) payload.chatid = chatid;
    const { data } = await this.httpClient.post(WeComApiClient.SEND_MSG_URL, payload, {
      params: { access_token: token },
    });
    if (data.errcode !== 0) {
      throw new Error(`send failed: ${data.errmsg} (${data.errcode})`);
    }
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
}

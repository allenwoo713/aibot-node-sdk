import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { WeComApiClient } from './api';
import { TokenManager } from './token-manager';
import fs from 'fs';
import path from 'path';

const TEST_TOKEN_PATH = path.resolve(__dirname, '../.test-api-token.json');

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

function createMockLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function cleanupTokenFile() {
  for (const p of [TEST_TOKEN_PATH, `${TEST_TOKEN_PATH}.tmp`]) {
    try { fs.rmSync(p, { force: true }); } catch { /* ignore */ }
  }
}

describe('TokenManager', () => {
  let mockHttpClient: any;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    cleanupTokenFile();
    vi.clearAllMocks();
    logger = createMockLogger();
    mockHttpClient = {
      get: vi.fn(),
      request: vi.fn(),
      post: vi.fn(),
    };
    mockedAxios.create.mockReturnValue(mockHttpClient as any);
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanupTokenFile();
    vi.restoreAllMocks();
  });

  it('returns cached token when not expired', async () => {
    const tm = new TokenManager({
      corpId: 'corp1',
      secret: 'sec1',
      tokenFilePath: TEST_TOKEN_PATH,
      logger,
      httpClient: mockHttpClient,
    });

    mockHttpClient.get.mockResolvedValueOnce({
      data: { errcode: 0, access_token: 'tok1', expires_in: 7200 },
    });

    const t1 = await tm.getToken();
    expect(t1).toBe('tok1');

    const t2 = await tm.getToken();
    expect(t2).toBe('tok1');

    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
  });

  it('fetches new token when cache is empty', async () => {
    const tm = new TokenManager({
      corpId: 'corp1',
      secret: 'sec1',
      tokenFilePath: TEST_TOKEN_PATH,
      logger,
      httpClient: mockHttpClient,
    });

    mockHttpClient.get.mockResolvedValueOnce({
      data: { errcode: 0, access_token: 'tok1', expires_in: 7200 },
    });

    const token = await tm.getToken();
    expect(token).toBe('tok1');

    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
    const callUrl = mockHttpClient.get.mock.calls[0][0];
    expect(callUrl).toContain('gettoken');
    expect(mockHttpClient.get.mock.calls[0][1]).toEqual({
      params: { corpid: 'corp1', corpsecret: 'sec1' },
    });
  });

  it('deduplicates concurrent getToken calls to a single HTTP request', async () => {
    const tm = new TokenManager({
      corpId: 'corp1',
      secret: 'sec1',
      tokenFilePath: TEST_TOKEN_PATH,
      logger,
      httpClient: mockHttpClient,
    });

    mockHttpClient.get.mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { data: { errcode: 0, access_token: 'tok1', expires_in: 7200 } };
    });

    const [a, b, c] = await Promise.all([tm.getToken(), tm.getToken(), tm.getToken()]);
    expect(a).toBe('tok1');
    expect(b).toBe('tok1');
    expect(c).toBe('tok1');
    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
  });

  it('persists fetched token to file with correct format', async () => {
    const tm = new TokenManager({
      corpId: 'corp1',
      secret: 'sec1',
      tokenFilePath: TEST_TOKEN_PATH,
      logger,
      httpClient: mockHttpClient,
    });

    mockHttpClient.get.mockResolvedValueOnce({
      data: { errcode: 0, access_token: 'tok1', expires_in: 7200 },
    });

    await tm.getToken();

    const raw = fs.readFileSync(TEST_TOKEN_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.access_token).toBe('tok1');
    expect(typeof parsed.expires_at).toBe('number');
    const expectedExpires = Date.now() + 7200 * 1000;
    expect(parsed.expires_at).toBeGreaterThan(expectedExpires - 5000);
    expect(parsed.expires_at).toBeLessThan(expectedExpires + 5000);
  });

  it('loads valid token from file on startup without HTTP call', async () => {
    const futureExpires = Date.now() + 7200 * 1000;
    fs.writeFileSync(
      TEST_TOKEN_PATH,
      JSON.stringify({ access_token: 'filetok', expires_at: futureExpires }),
      'utf-8',
    );

    const tm = new TokenManager({
      corpId: 'corp1',
      secret: 'sec1',
      tokenFilePath: TEST_TOKEN_PATH,
      logger,
      httpClient: mockHttpClient,
    });

    const token = await tm.getToken();
    expect(token).toBe('filetok');
    expect(mockHttpClient.get).not.toHaveBeenCalled();
  });

  it('falls back to fetch when token file is corrupt', async () => {
    fs.writeFileSync(TEST_TOKEN_PATH, 'not-json', 'utf-8');

    const tm = new TokenManager({
      corpId: 'corp1',
      secret: 'sec1',
      tokenFilePath: TEST_TOKEN_PATH,
      logger,
      httpClient: mockHttpClient,
    });

    mockHttpClient.get.mockResolvedValueOnce({
      data: { errcode: 0, access_token: 'newtok', expires_in: 7200 },
    });

    const token = await tm.getToken();
    expect(token).toBe('newtok');
    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
  });

  it('schedules proactive refresh after token fetch', async () => {
    vi.useFakeTimers();

    const tm = new TokenManager({
      corpId: 'corp1',
      secret: 'sec1',
      tokenFilePath: TEST_TOKEN_PATH,
      logger,
      httpClient: mockHttpClient,
    });

    mockHttpClient.get.mockResolvedValue({
      data: { errcode: 0, access_token: 'tok1', expires_in: 7200 },
    });

    await tm.getToken();
    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);

    // Advance to just before proactive refresh (7200s - 5min buffer - 1s)
    vi.advanceTimersByTime(7200 * 1000 - 5 * 60 * 1000 - 1000);
    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);

    // Advance past the buffer
    vi.advanceTimersByTime(2000);
    expect(mockHttpClient.get).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('stop() clears the refresh timer', async () => {
    vi.useFakeTimers();

    const tm = new TokenManager({
      corpId: 'corp1',
      secret: 'sec1',
      tokenFilePath: TEST_TOKEN_PATH,
      logger,
      httpClient: mockHttpClient,
    });

    mockHttpClient.get.mockResolvedValue({
      data: { errcode: 0, access_token: 'tok1', expires_in: 7200 },
    });

    await tm.getToken();
    tm.stop();

    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});

describe('WeComApiClient', () => {
  let mockHttpClient: any;
  let logger: ReturnType<typeof createMockLogger>;
  let client: WeComApiClient;

  beforeEach(() => {
    cleanupTokenFile();
    vi.clearAllMocks();
    logger = createMockLogger();
    mockHttpClient = {
      get: vi.fn(),
      request: vi.fn(),
      post: vi.fn(),
    };
    mockedAxios.create.mockReturnValue(mockHttpClient as any);

    client = new WeComApiClient(logger, {
      corpId: 'corp1',
      secret: 'sec1',
      tokenFilePath: TEST_TOKEN_PATH,
      timeout: 5000,
    });
  });

  afterEach(() => {
    client.stop();
    cleanupTokenFile();
    vi.restoreAllMocks();
  });

  it('request() injects access_token into query params', async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      data: { errcode: 0, access_token: 'tok1', expires_in: 7200 },
    });
    mockHttpClient.request.mockResolvedValueOnce({
      data: { errcode: 0, result: 'ok' },
    });

    const result = await client.request('GET', '/user/list', { department_id: 1 });
    expect(result).toEqual({ errcode: 0, result: 'ok' });

    const reqCall = mockHttpClient.request.mock.calls[0][0];
    expect(reqCall.params.access_token).toBe('tok1');
    expect(reqCall.url).toContain('/user/list');
  });

  it('retries once on 40014 and succeeds', async () => {
    mockHttpClient.get
      .mockResolvedValueOnce({
        data: { errcode: 0, access_token: 'tok1', expires_in: 7200 },
      })
      .mockResolvedValueOnce({
        data: { errcode: 0, access_token: 'tok2', expires_in: 7200 },
      });

    mockHttpClient.request
      .mockResolvedValueOnce({
        data: { errcode: 40014, errmsg: 'token expired' },
      })
      .mockResolvedValueOnce({
        data: { errcode: 0, result: 'ok' },
      });

    const result = await client.request('GET', '/user/list');
    expect(result).toEqual({ errcode: 0, result: 'ok' });
    expect(mockHttpClient.request).toHaveBeenCalledTimes(2);
  });

  it('retries once on 40001 and succeeds', async () => {
    mockHttpClient.get
      .mockResolvedValueOnce({
        data: { errcode: 0, access_token: 'tok1', expires_in: 7200 },
      })
      .mockResolvedValueOnce({
        data: { errcode: 0, access_token: 'tok2', expires_in: 7200 },
      });

    mockHttpClient.request
      .mockResolvedValueOnce({
        data: { errcode: 40001, errmsg: 'token invalid' },
      })
      .mockResolvedValueOnce({
        data: { errcode: 0, result: 'ok' },
      });

    const result = await client.request('GET', '/user/list');
    expect(result).toEqual({ errcode: 0, result: 'ok' });
    expect(mockHttpClient.request).toHaveBeenCalledTimes(2);
  });

  it('throws after single retry fails with 40014 again', async () => {
    mockHttpClient.get.mockResolvedValue({
      data: { errcode: 0, access_token: 'tok1', expires_in: 7200 },
    });

    mockHttpClient.request.mockResolvedValue({
      data: { errcode: 40014, errmsg: 'token expired' },
    });

    await expect(client.request('GET', '/user/list')).rejects.toThrow('40014');
    expect(mockHttpClient.request).toHaveBeenCalledTimes(2);
  });

  it('throws on non-token errors without retry', async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      data: { errcode: 0, access_token: 'tok1', expires_in: 7200 },
    });

    mockHttpClient.request.mockResolvedValueOnce({
      data: { errcode: 40004, errmsg: 'invalid media_id' },
    });

    await expect(client.request('GET', '/media/get')).rejects.toThrow('40004');
    expect(mockHttpClient.request).toHaveBeenCalledTimes(1);
  });

  it('validates endpoint and rejects SSRF attempts', async () => {
    await expect(client.request('GET', 'https://evil.com')).rejects.toThrow('Invalid endpoint');
    await expect(client.request('GET', '/../../etc/passwd')).rejects.toThrow('Invalid endpoint');
  });

  it('sendTextMessage delegates to request() without manual token', async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      data: { errcode: 0, access_token: 'tok1', expires_in: 7200 },
    });

    const requestSpy = vi.spyOn(client, 'request').mockResolvedValueOnce(undefined as any);

    await client.sendTextMessage('agent1', 'user1', undefined, 'hello');

    expect(requestSpy).toHaveBeenCalledWith('POST', '/message/send', undefined, expect.objectContaining({
      msgtype: 'text',
      text: { content: 'hello' },
    }));
  });

  it('createSchedule sends correct payload and returns schedule_id', async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      data: { errcode: 0, access_token: 'tok1', expires_in: 7200 },
    });
    mockHttpClient.request.mockResolvedValueOnce({
      data: { errcode: 0, schedule_id: 'sched-123' },
    });

    const scheduleData = {
      organizer: 'user-1',
      start_time: 1714020000,
      end_time: 1714023600,
      summary: '团队周会',
      attendees: [{ userid: 'user-1' }],
    };

    const result = await client.createSchedule(scheduleData);
    expect(result.errcode).toBe(0);
    expect(result.schedule_id).toBe('sched-123');

    const reqCall = mockHttpClient.request.mock.calls[0][0];
    expect(reqCall.method).toBe('POST');
    expect(reqCall.url).toContain('/oa/schedule/add');
    expect(reqCall.data).toEqual({ schedule: scheduleData });
  });

  it('getSchedule returns schedule data', async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      data: { errcode: 0, access_token: 'tok1', expires_in: 7200 },
    });
    mockHttpClient.request.mockResolvedValueOnce({
      data: {
        errcode: 0,
        schedule: {
          schedule_id: 'sched-123',
          organizer: 'user-1',
          summary: '团队周会',
          start_time: 1714020000,
          end_time: 1714023600,
        },
      },
    });

    const result = await client.getSchedule('sched-123');
    expect(result.errcode).toBe(0);
    expect(result.schedule?.summary).toBe('团队周会');

    const reqCall = mockHttpClient.request.mock.calls[0][0];
    expect(reqCall.method).toBe('POST');
    expect(reqCall.url).toContain('/oa/schedule/get');
    expect(reqCall.data).toEqual({ schedule_id: 'sched-123' });
  });

  it('getDocContent polls until task_done', async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      data: { errcode: 0, access_token: 'tok1', expires_in: 7200 },
    });
    mockHttpClient.request
      .mockResolvedValueOnce({
        data: { errcode: 0, task_done: false, task_id: 'task-1' },
      })
      .mockResolvedValueOnce({
        data: { errcode: 0, task_done: true, content: '# Test Doc\nContent' },
      });

    const result = await client.getDocContent('doc-123', { pollIntervalMs: 10 });
    expect(result).toBe('# Test Doc\nContent');
    expect(mockHttpClient.request).toHaveBeenCalledTimes(2);

    const firstCall = mockHttpClient.request.mock.calls[0][0];
    expect(firstCall.data).toEqual(expect.objectContaining({ docid: 'doc-123', type: 2 }));

    const secondCall = mockHttpClient.request.mock.calls[1][0];
    expect(secondCall.data).toEqual(expect.objectContaining({ docid: 'doc-123', type: 2, task_id: 'task-1' }));
  });

  it('getDocContent with URL uses url field', async () => {
    mockHttpClient.get.mockResolvedValueOnce({
      data: { errcode: 0, access_token: 'tok1', expires_in: 7200 },
    });
    mockHttpClient.request.mockResolvedValueOnce({
      data: { errcode: 0, task_done: true, content: 'URL doc' },
    });

    const result = await client.getDocContent('https://doc.weixin.qq.com/d/xxx', { pollIntervalMs: 10 });
    expect(result).toBe('URL doc');

    const reqCall = mockHttpClient.request.mock.calls[0][0];
    expect(reqCall.data).toEqual(expect.objectContaining({ url: 'https://doc.weixin.qq.com/d/xxx', type: 2 }));
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { HealthServer } from './health';

const TEST_PORT = 19998;

function request(port: number, path: string, method = 'GET'): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, path, method }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('HealthServer', () => {
  let server: HealthServer;

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  it('returns 200 when healthy', async () => {
    server = new HealthServer(() => true);
    server.start(TEST_PORT);

    const res = await request(TEST_PORT, '/health');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: 'healthy' });
  });

  it('returns 503 when unhealthy', async () => {
    server = new HealthServer(() => false);
    server.start(TEST_PORT);

    const res = await request(TEST_PORT, '/health');
    expect(res.status).toBe(503);
    expect(JSON.parse(res.body)).toEqual({ status: 'unhealthy' });
  });

  it('returns 404 for POST /health', async () => {
    server = new HealthServer(() => true);
    server.start(TEST_PORT);

    const res = await request(TEST_PORT, '/health', 'POST');
    expect(res.status).toBe(404);
  });

  it('returns 404 for unknown paths', async () => {
    server = new HealthServer(() => true);
    server.start(TEST_PORT);

    const res = await request(TEST_PORT, '/unknown');
    expect(res.status).toBe(404);
  });

  it('stop closes the server', async () => {
    server = new HealthServer(() => true);
    server.start(TEST_PORT);

    // Verify it works before stopping
    const before = await request(TEST_PORT, '/health');
    expect(before.status).toBe(200);

    await server.stop();

    // After stop, connection should be refused
    await expect(request(TEST_PORT, '/health')).rejects.toThrow();
  });
});

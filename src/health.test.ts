import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { HealthServer } from './health';

const BASE_PORT = 19990;
let portCounter = 0;

function getTestPort(): number {
  return BASE_PORT + portCounter++;
}

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
    const port = getTestPort();
    server = new HealthServer(() => true);
    server.start(port);

    const res = await request(port, '/health');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: 'healthy' });
  });

  it('returns 503 when unhealthy', async () => {
    const port = getTestPort();
    server = new HealthServer(() => false);
    server.start(port);

    const res = await request(port, '/health');
    expect(res.status).toBe(503);
    expect(JSON.parse(res.body)).toEqual({ status: 'unhealthy' });
  });

  it('returns 404 for POST /health', async () => {
    const port = getTestPort();
    server = new HealthServer(() => true);
    server.start(port);

    const res = await request(port, '/health', 'POST');
    expect(res.status).toBe(404);
  });

  it('returns 404 for unknown paths', async () => {
    const port = getTestPort();
    server = new HealthServer(() => true);
    server.start(port);

    const res = await request(port, '/unknown');
    expect(res.status).toBe(404);
  });

  it('stop closes the server', async () => {
    const port = getTestPort();
    server = new HealthServer(() => true);
    server.start(port);

    // Verify it works before stopping
    const before = await request(port, '/health');
    expect(before.status).toBe(200);

    await server.stop();

    // After stop, connection should be refused
    await expect(request(port, '/health')).rejects.toThrow();
  });
});

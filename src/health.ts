import http from 'node:http';

export class HealthServer {
  private server: http.Server | null = null;

  constructor(private isHealthy: () => boolean) {}

  start(port = 3000): void {
    this.server = http.createServer((req, res) => {
      if (req.url === '/health' && req.method === 'GET') {
        const healthy = this.isHealthy();
        if (healthy) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'healthy' }));
        } else {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'unhealthy' }));
        }
        return;
      }

      res.writeHead(404).end();
    });

    this.server.listen(port, () => {
      console.log(`Health server listening on port ${port}`);
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
    });
  }
}

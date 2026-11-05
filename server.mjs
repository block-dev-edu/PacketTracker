import express from 'express';
import { existsSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { resolve } from 'node:path';

const app = express();
const isDev = process.argv.includes('--dev');

app.use(express.json());
app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'packet-tracker' });
});

const httpServer = createHttpServer(app);

if (isDev) {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: {
      middlewareMode: true,
      ws: { server: httpServer }
    },
    appType: 'spa'
  });
  app.use(vite.middlewares);
} else {
  const dist = resolve('dist');
  if (!existsSync(dist)) {
    throw new Error('Production bundle missing. Run npm run build first.');
  }
  app.use(express.static(dist));
  app.use((_request, response) => response.sendFile(resolve(dist, 'index.html')));
}

function listen(port) {
  return new Promise((resolveListen, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, '0.0.0.0', () => resolveListen(httpServer));
  });
}

async function startServer() {
  const requestedPort = process.env.PORT ? Number(process.env.PORT) : null;
  const ports = requestedPort ? [requestedPort] : Array.from({ length: 11 }, (_, index) => 3000 + index);

  for (const port of ports) {
    try {
      await listen(port);
      console.log(`PacketTracker running at http://localhost:${port}`);
      console.log(`Network origin available on 0.0.0.0:${port}`);
      return;
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
    }
  }

  throw new Error('No open port found between 3000 and 3010.');
}

await startServer();

import type { IncomingMessage, ServerResponse } from 'node:http';
import config from '../api/config.js';
import decision from '../api/decision.js';

// The local server and Vite use the same handlers Vercel deploys from /api.
export async function apiMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const path = req.url?.split('?')[0];
  const handler = path === '/api/config' ? config : path === '/api/decision' ? decision : null;
  if (!handler) { next(); return; }
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) { res.writeHead(413, { 'Content-Type': 'application/json' }).end('{"error":"Request too large."}'); return; }
    chunks.push(chunk);
  }
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  const scheme = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const request = new Request(`${scheme}://${req.headers.host || 'localhost'}${req.url}`, {
    method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
  });
  const response = await handler.fetch(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

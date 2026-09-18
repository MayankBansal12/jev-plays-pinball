import { createServer } from 'node:http';
import { existsSync, createReadStream, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { apiMiddleware } from './http.js';

const root = resolve('dist');
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  void apiMiddleware(req, res, () => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    let path: string;
    try { path = resolve(root, '.' + new URL(req.url || '/', 'http://local').pathname); } catch { res.writeHead(400).end(); return; }
    if (path !== root && !path.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    if (path === root) path = resolve(root, 'index.html');
    if (!existsSync(path) || !statSync(path).isFile()) { res.writeHead(404).end('Not found'); return; }
    res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
    res.setHeader('Cache-Control', extname(path) === '.html' ? 'no-cache' : 'public, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(path).pipe(res);
  }).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
});
const port = Number(process.env.PORT || 4187);
server.listen(port, '0.0.0.0', () => console.log(`jev & pinball ready on port ${port}`));
process.on('SIGTERM', () => server.close());

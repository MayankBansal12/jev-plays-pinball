import { defineConfig } from 'vite';
import { apiMiddleware } from './server/http.js';
export default defineConfig({
  build: { target: 'es2022' },
  worker: { format: 'es' },
  plugins: [{ name: 'jev-api', configureServer(server) { server.middlewares.use((req, res, next) => { void apiMiddleware(req, res, next).catch(next); }); } }],
});

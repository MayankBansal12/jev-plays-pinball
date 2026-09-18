import { configured, modelName } from '../server/jev.js';

export default {
  fetch(request: Request) {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
    return Response.json({ configured: configured(), model: modelName() }, { headers: { 'Cache-Control': 'no-store' } });
  },
};

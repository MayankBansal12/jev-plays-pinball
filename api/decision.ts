import { ACTIONS, type DecisionState } from '../shared/types.js';
import { configured, decide, safeError } from '../server/jev.js';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const number = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
function validState(value: unknown): value is DecisionState {
  if (!value || typeof value !== 'object') return false;
  const s = value as DecisionState;
  return typeof s.runId === 'string' && /^[\w-]{1,80}$/.test(s.runId)
    && Number.isInteger(s.tick) && number(s.tick, 0, 1_000_000)
    && Number.isInteger(s.ballNumber) && number(s.ballNumber, 1, 3)
    && Number.isInteger(s.score) && number(s.score, 0, 10_000_000)
    && ACTIONS.includes(s.action) && Boolean(s.ball)
    && number(s.ball!.x, -200, 800) && number(s.ball!.y, -200, 1400)
    && number(s.ball!.vx, -3000, 3000) && number(s.ball!.vy, -3000, 3000);
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin && origin !== process.env.PUBLIC_ORIGIN) return json({ error: 'Origin not allowed.' }, 403);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: 'Expected JSON.' }, 415);
    if (Number(request.headers.get('content-length')) > 8192) return json({ error: 'Request too large.' }, 413);
    let body: { snapshot?: unknown; latency?: unknown };
    try {
      const text = await request.text();
      if (text.length > 8192) return json({ error: 'Request too large.' }, 413);
      body = JSON.parse(text);
    } catch { return json({ error: 'Invalid JSON.' }, 400); }
    if (!body || !validState(body.snapshot) || !number(body.latency, 0, 10_000)) return json({ error: 'Invalid game state.' }, 400);
    if (!configured()) return json({ error: 'Set TYPESAFE_API_KEY in the server environment.' }, 503);
    try {
      const result = await decide(body.snapshot, body.latency as number, request.signal);
      return json({ action: result.action, confidence: result.confidence, model: result.model, usage: result.usage });
    } catch (error) { return json({ error: safeError(error) }, 502); }
  },
};

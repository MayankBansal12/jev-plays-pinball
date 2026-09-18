/// <reference lib="webworker" />
import { initPhysics, Pinball } from '../shared/engine.js';
import { canApplyAction } from '../shared/control.js';
import { ACTIONS, STEP, type Action, type DecisionState, type Telemetry } from '../shared/types.js';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const send = (message: unknown) => scope.postMessage(message);
const emptyTelemetry = (configured = false, model = 'jev-1.13.0'): Telemetry => ({ configured, model, state: configured ? 'ready' : 'offline', calls: 0, applied: 0, stale: 0, errors: 0, latency: 0, p95: 0, lastError: null, decisions: [], tokens: 0, estimatedCost: 0 });

async function boot() {
  await initPhysics();
  const game = new Pinball(); game.mode = 'jev';
  let telemetry = emptyTelemetry(), controller: AbortController | null = null;
  let sequence = 0, nextDecision = 0, latencies: number[] = [];
  let previous = performance.now(), accumulator = 0, lastSnapshot = 0;
  const sendTelemetry = () => send({ type: 'telemetry', telemetry });
  send({ type: 'init', snapshot: game.snapshot(), telemetry });

  async function loadConfig() {
    try {
      const response = await fetch('/api/config', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error();
      const config = await response.json();
      telemetry.configured = config.configured === true;
      telemetry.model = config.model;
      telemetry.state = telemetry.configured ? 'ready' : 'offline';
      telemetry.lastError = null;
    } catch {
      telemetry.lastError = 'Could not connect to Jev. Retrying…';
      setTimeout(() => void loadConfig(), 3000);
    }
    sendTelemetry();
  }
  void loadConfig();

  async function askJev() {
    if (controller || !telemetry.configured || game.status !== 'playing' || !game.ballBody || performance.now() < nextDecision) return;
    const { runId, tick, ballNumber, ball, action, score } = game.snapshot();
    const snapshot: DecisionState = { runId, tick, ballNumber, ball, action, score };
    const started = performance.now(), seq = ++sequence;
    const abort = new AbortController(); controller = abort;
    telemetry.state = 'thinking'; telemetry.calls++; sendTelemetry();
    try {
      const response = await fetch('/api/decision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot, latency: telemetry.latency }),
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(4000)]),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Jev request failed.');
      if (abort.signal.aborted || game.runId !== runId) return;
      if (!ACTIONS.includes(result.action)) throw new Error('Jev returned an invalid move.');
      const latency = Math.round(performance.now() - started);
      latencies.push(latency); if (latencies.length > 500) latencies.shift();
      telemetry.latency = latency; telemetry.model = result.model;
      telemetry.p95 = [...latencies].sort((a, b) => a - b)[Math.floor((latencies.length - 1) * .95)] || latency;
      telemetry.tokens += result.usage?.input_tokens ?? result.usage?.inputTokens ?? 0;
      telemetry.estimatedCost = telemetry.tokens * .042 / 1_000_000;
      telemetry.lastError = null; telemetry.state = 'waiting';
      const applied = canApplyAction(game.snapshot(), snapshot);
      if (applied) { game.setAction(result.action as Action); telemetry.applied++; }
      else telemetry.stale++;
      telemetry.decisions = [{ seq, at: tick * STEP, action: result.action, latency, age: Math.round((game.tick - tick) * STEP * 1000), confidence: result.confidence ?? null, applied, reason: applied ? undefined : 'Observation expired or ball changed' }, ...telemetry.decisions].slice(0, 40);
      nextDecision = performance.now() + Math.max(0, 100 - latency);
    } catch (error) {
      if (abort.signal.aborted || game.runId !== runId) return;
      telemetry.errors++; telemetry.state = 'error';
      telemetry.lastError = error instanceof Error && error.name === 'Error' ? error.message : 'Jev request timed out. The ball kept moving.';
      nextDecision = performance.now() + 1000;
    } finally {
      if (controller === abort) { controller = null; sendTelemetry(); }
    }
  }

  scope.onmessage = ({ data: message }) => {
    if (message.type === 'start') {
      if (!telemetry.configured || game.status === 'playing' || game.status === 'between') return;
      if (!Number.isInteger(message.seed) || message.seed < 0 || message.seed > 999999) return;
      controller?.abort(); controller = null;
      telemetry = emptyTelemetry(telemetry.configured, telemetry.model); latencies = []; nextDecision = 0;
      game.start('jev', message.seed, crypto.randomUUID());
      accumulator = 0; previous = performance.now();
      sendTelemetry(); send({ type: 'snapshot', snapshot: game.snapshot() });
    }
    if (message.type === 'stop') {
      game.stop(); controller?.abort(); controller = null;
      telemetry.state = telemetry.configured ? 'ready' : 'offline';
      send({ type: 'snapshot', snapshot: game.snapshot() }); sendTelemetry();
    }
  };

  setInterval(() => {
    const now = performance.now();
    accumulator += (now - previous) / 1000; previous = now;
    if (accumulator > 2) { game.timingFault = true; accumulator = 2; }
    while (accumulator >= STEP) { game.step(); accumulator -= STEP; }
    if (now - lastSnapshot >= 1000 / 60) {
      lastSnapshot = now; send({ type: 'snapshot', snapshot: game.snapshot() });
      if (game.status === 'playing') void askJev();
      else if (game.status === 'finished' && controller) { controller.abort(); controller = null; telemetry.state = 'ready'; sendTelemetry(); }
    }
  }, 4);
}
void boot().catch(() => send({ type: 'error', message: 'The game could not load. Refresh to try again.' }));

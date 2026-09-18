import { choice, TypeSafeClient } from '@typesafe-ai/sdk';
import { config } from 'dotenv';
import { type DecisionState, type Action } from '../shared/types.js';

export function configured() { config({ path: '.env.local', quiet: true }); return Boolean(process.env.TYPESAFE_API_KEY); }
export const modelName = () => process.env.TYPESAFE_DEFAULT_MODEL || 'jev-1.13.0';
let client: TypeSafeClient | undefined;
export function observation(s: DecisionState, latency: number) {
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    game: 'Real-time pinball. Keep the ball alive and score by returning it upward. No pauses; no automatic saves.',
    coordinates: '600 wide x 1000 tall. X grows right, Y grows DOWN. Velocities are pixels per second. Gravity pulls down at 550 px/s².',
    ball: s.ball ? Object.fromEntries(Object.entries(s.ball).map(([k, v]) => [k, round(v)])) : null,
    flippers: {
      left: { pivot: [185, 820], reaches_x: [185, 288], pressed: s.action === 'left' || s.action === 'both' },
      right: { pivot: [415, 820], reaches_x: [312, 415], pressed: s.action === 'right' || s.action === 'both' },
      motion: 'At rest tips slope down to y=862; pressing sweeps tips upward to y=772 in about 65 ms. Releasing returns them downward. A fresh upward sweep strikes harder than holding. The gap at x=288..312 drains the ball.',
    },
    table: { bumpers: [[223,290],[377,290],[300,425]], scoringTargets: [[208,158],[300,140],[392,158]], drainY: 975 },
    previousAction: s.action, score: s.score, ballNumber: s.ballNumber,
    recentResponseDelayMs: latency || 200,
    actionTiming: 'Your choice applies on arrival, then holds until the next choice (maximum 650 ms). Account for ball motion during response delay. You alone choose when to press and release.',
  };
}
export async function decide(s: DecisionState, latency: number, signal: AbortSignal) {
  if (!configured()) throw new Error('not-configured');
  client ??= new TypeSafeClient({ timeout: 1800, retry: { maxRetries: 0 }, logLevel: 'off' });
  const state = observation(s, latency);
  const response = await client.systemOne({
    model: modelName(), state,
    questions: { flippers: choice('Choose the flipper buttons to hold NOW to keep this moving ball in play and score. Release between strikes. Anticipate motion during API delay. Choose based on current position AND velocity; raising a flipper long before contact can reduce the shot.', {
      left: 'Press left flipper; release right.',
      right: 'Press right flipper; release left.',
      both: 'Press both flippers.',
      neither: 'Release both flippers, letting them return to rest.'
    }) }
  }, { signal });
  return { action: response.answers.flippers.choice as Action, confidence: response.answers.flippers.confidence,
    model: response.model, usage: response.usage, state };
}
export function safeError(error: unknown) {
  const e = error as { status?: number; name?: string };
  if (e.status === 401 || e.status === 403) return 'Jev rejected the API key. Check TypeSafe access.';
  if (e.status === 429) return 'Jev rate limit reached. Retrying with a fresh observation shortly.';
  if (e.status === 402) return 'TypeSafe account needs credits.';
  if (e.name?.includes('Timeout')) return 'Jev timed out. The ball kept moving.';
  if (e.name?.includes('Connection')) return 'Could not reach Jev. The ball kept moving.';
  return 'Jev request failed. The ball kept moving; no bot took over.';
}

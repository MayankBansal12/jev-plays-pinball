import type { SystemOneResult } from '@typesafe-ai/sdk';
import type { DecisionState } from './types.js';

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

export function buildJevInput(s: DecisionState, latency: number, model: string) {
  return {
    model, state: observation(s, latency),
    questions: { flippers: {
      type: 'choice' as const,
      instructions: 'Choose the flipper buttons to hold NOW to keep this moving ball in play and score. Release between strikes. Anticipate motion during API delay. Choose based on current position AND velocity; raising a flipper long before contact can reduce the shot.',
      criteria: {
        left: 'Press left flipper; release right.',
        right: 'Press right flipper; release left.',
        both: 'Press both flippers.',
        neither: 'Release both flippers, letting them return to rest.'
      }
    } }
  };
}

export type JevInput = ReturnType<typeof buildJevInput>;
export type JevOutput = SystemOneResult<JevInput['questions']>;
export interface DecisionTrace {
  seq: number;
  runId: string;
  ballNumber: number;
  at: number;
  status: 'pending' | 'applied' | 'discarded' | 'error' | 'canceled';
  latency: number | null;
  age: number | null;
  input: JevInput;
  output: JevOutput | null;
  message?: string;
}

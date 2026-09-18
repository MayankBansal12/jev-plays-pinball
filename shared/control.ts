import { STEP, type Snapshot } from './types.js';
export function canApplyAction(s: Snapshot, input: { runId: string; ballNumber: number; tick: number }) {
  const age = (s.tick - input.tick) * STEP * 1000;
  return s.runId === input.runId && s.ballNumber === input.ballNumber && s.status === 'playing' && age >= 0 && age <= 650;
}

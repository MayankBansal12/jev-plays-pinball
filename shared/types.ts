export type Mode = 'jev' | 'human' | 'reflex' | 'spam' | 'none';
export type Action = 'left' | 'right' | 'both' | 'neither';
export type Status = 'ready' | 'playing' | 'between' | 'finished' | 'stopped';
export interface Vec { x: number; y: number }
export interface GameEvent { id: number; t: number; kind: 'hit' | 'target' | 'flip' | 'drain' | 'launch' | 'end'; label: string; points: number; x: number; y: number }
export interface Snapshot {
  runId: string; mode: Mode; seed: number; tick: number; elapsed: number; status: Status;
  score: number; ballNumber: number; balls: number; ball: (Vec & { vx: number; vy: number }) | null;
  leftAngle: number; rightAngle: number; action: Action; hits: number; saves: number;
  events: GameEvent[]; targets: boolean[]; multiplier: number; timingFault: boolean;
}
export type DecisionState = Pick<Snapshot, 'runId' | 'tick' | 'ballNumber' | 'ball' | 'action' | 'score'>;
export interface Decision {
  seq: number; at: number; action: Action; latency: number; age: number;
  confidence: number | null; applied: boolean; reason?: string;
}
export interface Telemetry {
  configured: boolean; model: string; state: 'ready' | 'thinking' | 'waiting' | 'error' | 'offline';
  calls: number; applied: number; stale: number; errors: number; latency: number; p95: number;
  lastError: string | null; decisions: Decision[]; tokens: number; estimatedCost: number;
}
export interface RunResult {
  runId: string; mode: Mode; seed: number; score: number; duration: number; saves: number;
  hits: number; completed: boolean; date: string; calls: number; errors: number; latency: number;
  model: string | null; timingFault: boolean;
}
export const MODE_LABELS: Record<Mode, string> = { jev: 'Jev', human: 'You', reflex: 'Timing bot', spam: 'Both-flipper spam', none: 'No input' };
export const ACTIONS: Action[] = ['left', 'right', 'both', 'neither'];
export const STEP = 1 / 120;
export const TABLE = { width: 600, height: 1000, left: { x: 185, y: 820 }, right: { x: 415, y: 820 }, flipperLength: 103, ballRadius: 9 };
export const BUMPERS = [{ x: 223, y: 290 }, { x: 377, y: 290 }, { x: 300, y: 425 }];
export const TARGETS = [{ x: 208, y: 158 }, { x: 300, y: 140 }, { x: 392, y: 158 }];
export const RAILS = [
  [64, 720, 64, 210], [64, 210, 94, 135], [94, 135, 160, 85], [160, 85, 300, 65],
  [300, 65, 440, 85], [440, 85, 506, 135], [506, 135, 536, 210], [536, 210, 536, 720],
  [64, 720, 175, 820], [536, 720, 425, 820],
  [175, 860, 250, 975], [425, 860, 350, 975],
  [108, 605, 134, 734], [134, 734, 184, 814],
  [492, 605, 466, 734], [466, 734, 416, 814],
] as const;
export const SLINGS = [ [[129, 578], [197, 694], [154, 721]], [[471, 578], [403, 694], [446, 721]] ] as const;

import RAPIER from '@dimforge/rapier2d-compat';
import { ACTIONS, BUMPERS, RAILS, SLINGS, STEP, TABLE, TARGETS, type Action, type GameEvent, type Mode, type Snapshot, type Status } from './types.js';

let ready: Promise<void> | undefined;
export function initPhysics() { return ready ??= RAPIER.init(); }
const SCALE = 100;
const rad = (degrees: number) => degrees * Math.PI / 180;
export function seededRandom(seed: number) {
  let n = seed >>> 0;
  return () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export class Pinball {
  world: RAPIER.World;
  queue: RAPIER.EventQueue;
  ballBody: RAPIER.RigidBody | null = null;
  ballCollider: RAPIER.Collider | null = null;
  left: RAPIER.RigidBody; right: RAPIER.RigidBody;
  runId = ''; mode: Mode = 'reflex'; seed = 42; tick = 0; score = 0; ballNumber = 1;
  status: Status = 'ready'; action: Action = 'neither'; hits = 0; saves = 0; multiplier = 1;
  targets = [false, false, false]; events: GameEvent[] = []; timingFault = false;
  private rng = seededRandom(42); private eventId = 0; private nextLaunch = 0;
  private colliders = new Map<number, { kind: string; index: number }>();
  private cooldown = new Map<number, number>(); private lastSave = -1000;
  private actionUntil = 0; private stillFor = 0; private ballStartedAt = 0;
  constructor() {
    this.world = new RAPIER.World({ x: 0, y: 5.5 });
    this.world.timestep = STEP;
    this.world.integrationParameters.maxCcdSubsteps = 4;
    this.queue = new RAPIER.EventQueue(true);
    for (const [x1, y1, x2, y2] of RAILS) this.segment(x1, y1, x2, y2);
    BUMPERS.forEach((p, i) => {
      const c = this.world.createCollider(RAPIER.ColliderDesc.ball(.31).setTranslation(p.x / SCALE, p.y / SCALE).setRestitution(.95).setFriction(.02).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS));
      this.colliders.set(c.handle, { kind: 'bumper', index: i });
    });
    TARGETS.forEach((p, i) => {
      const c = this.world.createCollider(RAPIER.ColliderDesc.ball(.15).setTranslation(p.x / SCALE, p.y / SCALE).setRestitution(1).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS));
      this.colliders.set(c.handle, { kind: 'target', index: i });
    });
    SLINGS.forEach((points, i) => {
      const vertices = new Float32Array(points.flatMap(([x, y]) => [x / SCALE, y / SCALE]));
      const desc = RAPIER.ColliderDesc.convexHull(vertices)!;
      const c = this.world.createCollider(desc.setRestitution(.8).setFriction(.02).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS));
      this.colliders.set(c.handle, { kind: 'sling', index: i });
    });
    this.left = this.makeFlipper(TABLE.left.x, TABLE.left.y, rad(24), 0);
    this.right = this.makeFlipper(TABLE.right.x, TABLE.right.y, Math.PI - rad(24), 1);
  }
  private segment(x1: number, y1: number, x2: number, y2: number) {
    const length = Math.hypot(x2 - x1, y2 - y1);
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(length / SCALE / 2, .055)
      .setTranslation((x1 + x2) / SCALE / 2, (y1 + y2) / SCALE / 2)
      .setRotation(Math.atan2(y2 - y1, x2 - x1)).setRestitution(.65).setFriction(.05));
  }
  private makeFlipper(x: number, y: number, angle: number, index: number) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x / SCALE, y / SCALE).setRotation(angle).setCcdEnabled(true));
    const c = this.world.createCollider(RAPIER.ColliderDesc.capsule(.44, .095).setTranslation(.44, 0).setRotation(Math.PI / 2).setRestitution(.7).setFriction(.15).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
    this.colliders.set(c.handle, { kind: 'flipper', index });
    return body;
  }
  start(mode: Mode, seed: number, runId: string) {
    this.removeBall(); this.mode = mode; this.seed = seed; this.rng = seededRandom(seed); this.runId = runId;
    this.tick = 0; this.score = 0; this.ballNumber = 1; this.hits = 0; this.saves = 0;
    this.multiplier = 1; this.targets = [false, false, false]; this.events = []; this.cooldown.clear();
    this.status = 'playing'; this.action = 'neither'; this.actionUntil = 0; this.lastSave = -1000;
    this.timingFault = false; this.left.setRotation(rad(24), true); this.right.setRotation(Math.PI - rad(24), true);
    this.launch();
  }
  stop() { this.status = 'stopped'; this.action = 'neither'; }
  setAction(action: Action, durationMs = 650) {
    if (!ACTIONS.includes(action)) return;
    this.action = action; this.actionUntil = this.tick + Math.ceil(durationMs / (STEP * 1000));
  }
  private removeBall() {
    if (this.ballBody) this.world.removeRigidBody(this.ballBody);
    this.ballBody = null; this.ballCollider = null;
  }
  private launch() {
    // Identical launch distribution for every controller; no aiming assistance.
    const x = 480 + this.rng() * 15;
    this.ballBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x / SCALE, 5.3).setLinvel(-1.4 - this.rng() * .5, -8.4 - this.rng() * .7)
      .setCcdEnabled(true).setCanSleep(false).setLinearDamping(.04));
    this.ballCollider = this.world.createCollider(RAPIER.ColliderDesc.ball(TABLE.ballRadius / SCALE).setDensity(1).setRestitution(.6).setFriction(.05).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), this.ballBody);
    this.stillFor = 0; this.ballStartedAt = this.tick; this.status = 'playing';
    this.emit('launch', `Ball ${this.ballNumber} launched`, 0, x, 530);
  }
  private emit(kind: GameEvent['kind'], label: string, points: number, x: number, y: number) {
    this.events.push({ id: ++this.eventId, t: this.tick * STEP, kind, label, points, x, y });
    if (this.events.length > 24) this.events.shift();
  }
  private drain(label = 'Ball drained') {
    this.removeBall(); this.emit('drain', label, 0, 300, 940); this.action = 'neither';
    if (this.ballNumber >= 3) { this.status = 'finished'; this.emit('end', 'Run complete', 0, 300, 500); }
    else { this.status = 'between'; this.nextLaunch = this.tick + 120; }
  }
  step() {
    if (this.status === 'ready' || this.status === 'finished' || this.status === 'stopped') return;
    this.tick++;
    if (this.status === 'between' && this.tick >= this.nextLaunch) { this.ballNumber++; this.launch(); }
    if (this.mode === 'spam') this.setAction(this.tick % 32 < 16 ? 'both' : 'neither');
    if (this.mode === 'none') this.setAction('neither');
    if (this.mode === 'reflex' && this.ballBody) {
      const p = this.ballBody.translation(), v = this.ballBody.linvel();
      const near = p.y > 7.35 && p.y < 8.65 && v.y > -.5;
      this.setAction(near ? (p.x < 3 ? 'left' : 'right') : 'neither');
    }
    if (this.tick > this.actionUntil) this.action = 'neither';
    const leftUp = this.action === 'left' || this.action === 'both';
    const rightUp = this.action === 'right' || this.action === 'both';
    const update = (b: RAPIER.RigidBody, target: number, pressed: boolean) => {
      let current = b.rotation();
      // Rapier normalizes angles to [-pi, pi]. Keep the right flipper continuous around pi.
      if (b === this.right && current < 0) current += 2 * Math.PI;
      const change = Math.max(-(pressed ? 14 : 9) * STEP, Math.min((pressed ? 14 : 9) * STEP, target - current));
      b.setNextKinematicRotation(current + change);
    };
    update(this.left, rad(leftUp ? -28 : 24), leftUp);
    update(this.right, Math.PI - rad(rightUp ? -28 : 24), rightUp);
    const beforeVy = this.ballBody?.linvel().y ?? 0;
    this.world.step(this.queue);
    this.queue.drainCollisionEvents((a, b, started) => {
      if (!started || !this.ballCollider || !this.ballBody) return;
      const other = a === this.ballCollider.handle ? b : b === this.ballCollider.handle ? a : -1;
      const object = this.colliders.get(other); if (!object) return;
      if (this.tick - (this.cooldown.get(other) ?? -100) < 12) return;
      this.cooldown.set(other, this.tick);
      const p = this.ballBody.translation();
      if (object.kind === 'bumper') {
        const center = BUMPERS[object.index];
        let dx = p.x - center.x / SCALE, dy = p.y - center.y / SCALE;
        const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
        const v = this.ballBody.linvel();
        this.ballBody.setLinvel({ x: v.x + dx * 3.3, y: v.y + dy * 3.3 }, true);
        const points = 100 * this.multiplier; this.score += points; this.hits++;
        this.emit('hit', `Pop bumper +${points}`, points, center.x, center.y);
      } else if (object.kind === 'target') {
        const target = TARGETS[object.index]; this.targets[object.index] = true;
        let points = 250 * this.multiplier;
        if (this.targets.every(Boolean)) { points += 1000; this.multiplier = Math.min(5, this.multiplier + 1); this.targets.fill(false); }
        this.score += points; this.hits++;
        this.emit('target', `Orbit target +${points}`, points, target.x, target.y);
      } else if (object.kind === 'sling') {
        const v = this.ballBody.linvel();
        this.ballBody.setLinvel({ x: v.x + (object.index === 0 ? 1.6 : -1.6), y: Math.min(v.y, -2.1) }, true);
        this.score += 25; this.emit('hit', 'Slingshot +25', 25, p.x * SCALE, p.y * SCALE);
      } else if (object.kind === 'flipper' && beforeVy > .2 && this.tick - this.lastSave > 35) {
        // Count actual upward contacts with a raised/moving flipper, never issue a rescue impulse.
        if ((object.index === 0 ? leftUp : rightUp) && this.ballBody.linvel().y < -.5) {
          this.saves++; this.lastSave = this.tick;
          this.emit('flip', object.index === 0 ? 'Left flipper return' : 'Right flipper return', 0, p.x * SCALE, p.y * SCALE);
        }
      }
    });
    if (this.ballBody) {
      const p = this.ballBody.translation(), v = this.ballBody.linvel();
      const speed = Math.hypot(v.x, v.y);
      if (speed > 12) this.ballBody.setLinvel({ x: v.x * 12 / speed, y: v.y * 12 / speed }, true);
      this.stillFor = speed < .075 ? this.stillFor + 1 : 0;
      if (!Number.isFinite(p.x + p.y) || p.y > 10.15 || p.x < -.2 || p.x > 6.2 || p.y < -.2) this.drain();
      else if (this.stillFor > 600) this.drain('Stuck ball · counted as drain');
      else if (this.tick - this.ballStartedAt > 120 * 90) this.drain('90-second ball limit');
    }
  }
  snapshot(): Snapshot {
    const p = this.ballBody?.translation(), v = this.ballBody?.linvel();
    return { runId: this.runId, mode: this.mode, seed: this.seed, tick: this.tick, elapsed: this.tick * STEP,
      status: this.status, score: this.score, ballNumber: this.ballNumber, balls: 3,
      ball: p && v ? { x: p.x * SCALE, y: p.y * SCALE, vx: v.x * SCALE, vy: v.y * SCALE } : null,
      leftAngle: this.left.rotation(), rightAngle: this.right.rotation(), action: this.action,
      hits: this.hits, saves: this.saves, events: [...this.events], targets: [...this.targets], multiplier: this.multiplier, timingFault: this.timingFault };
  }
  free() { this.queue.free(); this.world.free(); }
}

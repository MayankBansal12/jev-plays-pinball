import './style.css';
import { createTable } from './table.js';
import type { Action, Snapshot, Telemetry } from '../shared/types.js';

const playIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 3 8 5-8 5Z"/></svg>';
const stopIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1"/></svg>';
// Same silhouette, pivot, and brass colors as the flippers drawn on the table.
const flipperImage = `<rect x="-10" y="-6" width="110" height="23" rx="11" fill="#020c0c" opacity=".7"/>
  <rect x="-9" y="-9.5" width="107" height="19" rx="9.5" fill="#e9b879" stroke="#fbd9a6" stroke-width="1.5"/>
  <path d="M9 -4H81" stroke="#ffedcb" stroke-opacity=".65" stroke-width="2" stroke-linecap="round"/>
  <circle r="4" fill="#6f6d55"/><circle r="1.5" fill="#ddcc96"/>`;
const moveFlippers = `<svg class="move-flippers" viewBox="0 0 270 132" aria-hidden="true" focusable="false">
  <g transform="translate(20 66)"><g class="move-flipper move-flipper-left">${flipperImage}</g></g>
  <g transform="translate(250 66)"><g class="move-flipper move-flipper-right">${flipperImage}</g></g>
</svg>`;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="game-bar">
    <h1><img class="brand-logo" src="/typesafe-logo.png" alt="TypeSafe AI" width="32" height="32"/><span class="brand-name"><span>jev <span class="brand-amp">&amp;</span></span> <span>pinball</span></span><i id="connection" title="Connecting"></i></h1>
    <div class="score"><span>SCORE</span><strong id="score">000000</strong></div>
    <div class="balls"><span id="ball-label">BALLS</span><div id="ball-lights" aria-label="3 balls remaining"><i></i><i></i><i></i></div></div>
    <button id="start" disabled>${playIcon}<span>Start</span></button>
  </header>
  <main class="table-stage" aria-label="Jev playing pinball">
    <div class="table-wrap">
      <div id="table-canvas" role="img" aria-label="Live pinball table controlled by Jev"></div>
      <div id="run-result" class="run-result" role="status" hidden></div>
    </div>
  </main>
  <aside id="move-notice" class="move-notice" role="status" aria-live="polite" aria-atomic="true" hidden><div class="move-copy"><span>Jev played</span><strong id="move-name"></strong></div>${moveFlippers}</aside>
  <div id="status" class="status" role="status" hidden></div>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let snapshot: Snapshot | null = null, telemetry: Telemetry | null = null;
let table: Awaited<ReturnType<typeof createTable>> | null = null;
let worker: Worker, connected = false, rendererReady = false, rendererFailed = false;
let pendingCommand = false, lastUiUpdate = 0, commandTimer: ReturnType<typeof setTimeout>;
let errorMessage = '', lastRun = '', lastStatus = '';
let lastDecisionSeq = 0, lastPlayedAction: Action | null = null;
let moveTimer: ReturnType<typeof setTimeout>;
const moveNames: Record<Action, string> = { left: 'Left flipper', right: 'Right flipper', both: 'Both flippers', neither: 'Release both' };
const active = () => snapshot?.status === 'playing' || snapshot?.status === 'between';
const format = (n: number) => n.toLocaleString('en-US');

function updateControls() {
  const playing = active();
  const button = $<HTMLButtonElement>('start');
  const label = playing ? 'End' : 'Start';
  if (button.textContent !== label) button.innerHTML = `${playing ? stopIcon : playIcon}<span>${label}</span>`;
  button.classList.toggle('playing', playing);
  button.disabled = !connected || pendingCommand || (!playing && (!telemetry?.configured || !rendererReady));
  $('connection').classList.toggle('online', connected && Boolean(telemetry?.configured));
  $('connection').title = !connected ? 'Connecting' : playing ? 'Jev is playing in real time' : 'Jev is ready';
  const message = rendererFailed ? 'The table could not load. Refresh to try again.'
    : errorMessage || (!active() && telemetry?.lastError) ? errorMessage || telemetry!.lastError!
    : !connected ? 'Connecting to the table…'
    : !telemetry?.configured ? 'Jev needs a TypeSafe API key on the server.'
    : errorMessage || (playing ? telemetry.lastError || '' : '');
  $('status').hidden = !message;
  $('status').textContent = message;
}

$('start').addEventListener('click', () => {
  if (!connected || pendingCommand) return;
  errorMessage = ''; pendingCommand = true;
  clearTimeout(commandTimer);
  if (active()) worker.postMessage({ type: 'stop' });
  else {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
    worker.postMessage({ type: 'start', seed });
  }
  commandTimer = setTimeout(() => { pendingCommand = false; updateControls(); }, 2000);
  updateControls();
});

function updateSnapshot(s: Snapshot) {
  const changed = s.runId !== lastRun || s.status !== lastStatus;
  snapshot = s;
  if (s.runId !== lastRun) { lastRun = s.runId; table?.reset(); clearMoveNotice(); }
  table?.update(s);
  if (!changed && performance.now() - lastUiUpdate < 80) return;
  lastUiUpdate = performance.now();
  $('score').textContent = String(s.score).padStart(6, '0');
  const remaining = s.status === 'finished' ? 0 : 4 - s.ballNumber;
  $('ball-label').textContent = active() ? `BALL ${s.ballNumber}/3` : 'BALLS';
  [...$('ball-lights').children].forEach((el, i) => el.classList.toggle('used', i >= remaining));
  $('ball-lights').setAttribute('aria-label', `${remaining} balls remaining`);
  if (changed) {
    lastStatus = s.status; pendingCommand = false; clearTimeout(commandTimer);
    const result = $('run-result');
    result.hidden = s.status !== 'finished' && s.status !== 'stopped';
    result.innerHTML = `<span>${s.status === 'finished' ? 'FINAL SCORE' : 'RUN ENDED'}</span><strong>${format(s.score)}</strong>`;
    updateControls();
  }
}

function clearMoveNotice() {
  clearTimeout(moveTimer);
  $('move-notice').hidden = true;
  lastPlayedAction = null;
}

function showLatestMove(t: Telemetry) {
  // Telemetry repeats while requests are in flight. Only acknowledge new, applied inputs.
  const decision = t.decisions.find(d => d.seq > lastDecisionSeq && d.applied);
  lastDecisionSeq = Math.max(lastDecisionSeq, ...t.decisions.map(d => d.seq));
  if (!decision || !active() || snapshot?.mode !== 'jev' || decision.action === lastPlayedAction) return;
  // Repeated holds don't restart the notice. A changed move replaces it immediately.
  lastPlayedAction = decision.action;
  const notice = $('move-notice');
  $('move-name').textContent = moveNames[decision.action];
  notice.dataset.action = decision.action;
  notice.dataset.seq = String(decision.seq);
  notice.hidden = false;
  clearTimeout(moveTimer);
  moveTimer = setTimeout(() => { notice.hidden = true; }, 2500);
}

function connect() {
  worker = new Worker(new URL('./game.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data: m }) => {
    if (m.type === 'init') {
      connected = true; telemetry = m.telemetry;
      updateSnapshot(m.snapshot);
      clearMoveNotice();
      lastDecisionSeq = Math.max(0, ...telemetry!.decisions.map(d => d.seq));
      updateControls();
    }
    if (m.type === 'snapshot') updateSnapshot(m.snapshot);
    if (m.type === 'telemetry') { telemetry = m.telemetry; showLatestMove(telemetry!); updateControls(); }
    if (m.type === 'error') { errorMessage = m.message; pendingCommand = false; clearTimeout(commandTimer); updateControls(); }
  };
  worker.onerror = () => { clearMoveNotice(); connected = false; errorMessage = 'The game could not load. Refresh to try again.'; updateControls(); };
  window.addEventListener('pagehide', () => worker.terminate(), { once: true });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
}

updateControls();
connect();
void createTable($('table-canvas'), () => {}).then(result => {
  table = result; rendererReady = true;
  if (snapshot) table.update(snapshot);
  updateControls();
}).catch(() => { rendererFailed = true; updateControls(); });

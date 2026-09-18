import type { DecisionTrace } from '../shared/jev-context.js';

const names = { left: 'Left flipper', right: 'Right flipper', both: 'Both flippers', neither: 'Release both' };
const states = { pending: 'Waiting', applied: 'Applied', discarded: 'Discarded', error: 'Error', canceled: 'Canceled' };
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;

export function createDecisionInspector(root: HTMLElement) {
  root.innerHTML = `
    <div class="decisions-heading"><div><h2>jev’s decisions <span id="decision-count">0</span></h2><p>Context in, response out. Select a decision to inspect it while the game keeps running.</p></div><button class="follow-decisions" type="button" aria-pressed="true">Following latest</button></div>
    <p class="decisions-empty">Start a game to see what Jev receives and returns.</p>
    <div class="decisions-body" hidden>
      <nav class="decision-list" aria-label="Decisions in this game"></nav>
      <div class="decision-detail">
        <div class="decision-meta"></div>
        <div class="decision-panels">
          <section class="decision-panel"><h3>input <span>context + instructions</span></h3><pre tabindex="0" aria-label="Jev request JSON"></pre></section>
          <section class="decision-panel"><h3>output <span>Jev’s response</span></h3><pre tabindex="0" aria-label="Jev response JSON"></pre></section>
        </div>
      </div>
    </div>`;
  const records = new Map<number, DecisionTrace>();
  const rows = new Map<number, HTMLButtonElement>();
  const list = root.querySelector<HTMLElement>('.decision-list')!;
  const body = root.querySelector<HTMLElement>('.decisions-body')!;
  const empty = root.querySelector<HTMLElement>('.decisions-empty')!;
  const count = root.querySelector<HTMLElement>('#decision-count')!;
  const followButton = root.querySelector<HTMLButtonElement>('.follow-decisions')!;
  const meta = root.querySelector<HTMLElement>('.decision-meta')!;
  const [input, output] = root.querySelectorAll<HTMLPreElement>('pre');
  let selected: number | null = null, latest: number | null = null, latestSettled: number | null = null, following = true;

  function show(seq: number) {
    const record = records.get(seq); if (!record) return;
    if (selected !== null) rows.get(selected)?.removeAttribute('aria-current');
    selected = seq; rows.get(seq)?.setAttribute('aria-current', 'true');
    const latency = record.latency === null ? 'waiting for response' : `${record.latency} ms`;
    meta.textContent = `Decision #${seq} · Ball ${record.ballNumber} · ${time(record.at)} · ${latency} · ${states[record.status]}${record.message ? ` — ${record.message}` : ''}`;
    const requestJson = JSON.stringify(record.input, null, 2);
    if (input.textContent !== requestJson) { input.textContent = requestJson; input.scrollTop = 0; }
    output.textContent = record.output ? JSON.stringify(record.output, null, 2)
      : record.status === 'pending' ? 'Waiting for Jev…'
      : `No Jev response received.\n\n${record.message || states[record.status]}`;
    output.scrollTop = 0;
  }

  function setFollowing(value: boolean) {
    following = value;
    followButton.setAttribute('aria-pressed', String(value));
    followButton.textContent = value ? 'Following latest' : 'Follow latest';
  }
  followButton.addEventListener('click', () => {
    setFollowing(!following);
    if (following && latest !== null) { show(latestSettled ?? latest); list.scrollTop = 0; }
  });
  const selectRow = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-seq]');
    if (!button) return;
    setFollowing(false); show(Number(button.dataset.seq));
  };
  list.addEventListener('pointerdown', selectRow);
  list.addEventListener('click', selectRow);

  return {
    reset() {
      records.clear(); rows.clear(); list.replaceChildren(); selected = latest = latestSettled = null;
      input.textContent = output.textContent = meta.textContent = ''; count.textContent = '0';
      body.hidden = true; empty.hidden = false; setFollowing(true);
    },
    update(record: DecisionTrace) {
      records.set(record.seq, record); latest = Math.max(latest ?? record.seq, record.seq);
      if (record.status !== 'pending') latestSettled = Math.max(latestSettled ?? record.seq, record.seq);
      let row = rows.get(record.seq);
      if (!row) {
        row = document.createElement('button'); row.type = 'button'; row.className = 'decision-row'; row.dataset.seq = String(record.seq);
        row.innerHTML = '<span class="decision-row-top"><span class="decision-seq"></span><span class="decision-time"></span></span><span class="decision-row-bottom"><strong></strong><span class="decision-state"></span></span>';
        rows.set(record.seq, row);
        // Keep the inspected row still when newer requests arrive above it.
        const scroll = list.scrollTop, height = list.scrollHeight;
        list.prepend(row);
        if (!following) list.scrollTop = scroll + list.scrollHeight - height;
      }
      row.dataset.status = record.status;
      row.querySelector('.decision-seq')!.textContent = `#${record.seq}`;
      row.querySelector('.decision-time')!.textContent = `Ball ${record.ballNumber} · ${time(record.at)}`;
      const choice = record.output?.answers?.flippers?.choice;
      row.querySelector('strong')!.textContent = choice && names[choice] || (record.status === 'pending' ? 'Deciding…' : 'No move');
      row.querySelector('.decision-state')!.textContent = states[record.status];
      body.hidden = false; empty.hidden = true; count.textContent = String(records.size);
      if (following) { show(latestSettled ?? latest); list.scrollTop = 0; }
      else if (selected === record.seq) show(record.seq);
    },
  };
}

import { initPhysics, Pinball } from '../shared/engine.js';
import type { Mode } from '../shared/types.js';
await initPhysics();
const count = Number(process.argv[2] || 12);
for (const mode of ['none', 'spam', 'reflex'] as Mode[]) {
  const runs = [];
  for (let i=0;i<count;i++) {
    const game = new Pinball(); game.start(mode, 42+i, `bench-${mode}-${i}`);
    while (game.status !== 'finished' && game.tick < 40000) game.step();
    const s=game.snapshot(); runs.push({seed:s.seed,score:s.score,seconds:+s.elapsed.toFixed(1),saves:s.saves,finished:s.status==='finished'});game.free();
  }
  console.log(JSON.stringify({mode,runs,meanScore:Math.round(runs.reduce((a,r)=>a+r.score,0)/count),meanSaves:+(runs.reduce((a,r)=>a+r.saves,0)/count).toFixed(1)}));
}

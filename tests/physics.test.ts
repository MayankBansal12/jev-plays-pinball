import test from 'node:test';
import assert from 'node:assert/strict';
import { initPhysics, Pinball } from '../shared/engine.js';
await initPhysics();
test('a no-input game drains exactly three balls and terminates', () => {
  const g=new Pinball();g.start('none',42,'drain');
  while(g.status!=='finished'&&g.tick<40000)g.step();
  assert.equal(g.status,'finished');assert.equal(g.ballNumber,3);assert.equal(g.ballBody,null);assert.equal(g.saves,0);g.free();
});
test('matching seed and controller produce identical physics and scores', () => {
  const a=new Pinball(),b=new Pinball();a.start('reflex',44,'a');b.start('reflex',44,'b');
  for(let i=0;i<4800;i++){a.step();b.step();}
  const aa=a.snapshot(),bb=b.snapshot();assert.equal(aa.score,bb.score);assert.equal(aa.saves,bb.saves);assert.deepEqual(aa.ball,bb.ball);a.free();b.free();
});
test('the ball keeps moving without decisions, and held inputs expire', () => {
  const g=new Pinball();g.start('jev',42,'live');g.setAction('left',100);const initial=g.snapshot().ball!;
  for(let i=0;i<120;i++)g.step();
  assert.equal(g.tick,120);assert.equal(g.action,'neither');assert.notDeepEqual(g.snapshot().ball,initial);g.free();
});
test('flippers produce physical upward returns without a rescue controller', () => {
  const g=new Pinball();g.start('human',42,'strike');
  g.ballBody!.setTranslation({x:2.42,y:7.88},true);g.ballBody!.setLinvel({x:0,y:2},true);
  g.setAction('left');let minVy=2;
  for(let i=0;i<30;i++){g.step();minVy=Math.min(minVy,g.ballBody?.linvel().y??0);}
  assert.ok(minVy < -1,`expected upward bounce, got ${minVy}`);g.free();
});
test('fast ball hits a side rail instead of tunneling through it', () => {
  const g=new Pinball();g.start('human',42,'ccd');g.ballBody!.setTranslation({x:1,y:4.8},true);g.ballBody!.setLinvel({x:-12,y:0},true);
  for(let i=0;i<12;i++)g.step();
  assert.ok(g.ballBody!.translation().x>.65);assert.ok(g.ballBody!.linvel().x>0);g.free();
});

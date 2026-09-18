import test from 'node:test';
import assert from 'node:assert/strict';
import { initPhysics, Pinball } from '../shared/engine.js';
import { canApplyAction } from '../shared/control.js';
await initPhysics();
test('network-delayed actions expire while physics keeps running',()=>{
  const game=new Pinball();game.start('jev',45,'a');
  const request=game.snapshot();for(let i=0;i<90;i++)game.step();
  assert.equal(canApplyAction(game.snapshot(),request),false);
  assert.equal(game.tick,90);assert.notDeepEqual(game.snapshot().ball,request.ball);game.free();
});
test('a late response cannot control another ball or another run',()=>{
  const game=new Pinball();game.start('jev',44,'a');const request=game.snapshot();
  assert.equal(canApplyAction(game.snapshot(),request),true);
  assert.equal(canApplyAction({...game.snapshot(),ballNumber:2},request),false);
  game.start('jev',44,'b');assert.equal(canApplyAction(game.snapshot(),request),false);
  assert.equal(canApplyAction(game.snapshot(),{...game.snapshot(),tick:100}),false);
  game.stop();assert.equal(canApplyAction(game.snapshot(),game.snapshot()),false);game.free();
});

import { Application, Container, Graphics, Text } from 'pixi.js';
import { BUMPERS, TARGETS, RAILS, SLINGS, TABLE, type Snapshot } from '../shared/types.js';

export async function createTable(element: HTMLElement, reportFps: (fps: number) => void) {
  const app = new Application();
  await app.init({ width: 600, height: 1000, backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true, preference: 'webgl' });
  element.appendChild(app.canvas);
  const base = new Graphics(); app.stage.addChild(base);
  const ink = 0x203b3c, teal = 0x8bccc1, brass = 0xe9b979;
  base.roundRect(18, 12, 564, 976, 72).fill(0x142829).stroke({ color: 0x345151, width: 2 });
  base.roundRect(31, 24, 538, 952, 63).stroke({ color: 0x234344, width: 1 });
  base.moveTo(300, 90).lineTo(300, 930).stroke({ color: 0x264143, alpha: .6, width: 1 });
  for (let x = 87; x < 530; x += 22) for (let y = 112; y < 930; y += 22) {
    if (y < 190 && (x < 130 || x > 470)) continue;
    base.circle(x, y, .7).fill({ color: 0x4a7070, alpha: .32 });
  }
  for (const r of [85, 145, 218]) base.ellipse(300, 363, r, r * 1.08).stroke({ color: 0x315454, alpha: .7, width: 1 });
  base.moveTo(92, 460).bezierCurveTo(172, 520, 428, 520, 508, 460).stroke({ color: 0x4a6560, alpha: .65, width: 1 });
  base.moveTo(80, 473).bezierCurveTo(180, 540, 420, 540, 520, 473).stroke({ color: 0x3b5753, alpha: .55, width: 1 });
  // All visible rails follow the exact same coordinates as the collision geometry.
  for (const [x1, y1, x2, y2] of RAILS) {
    base.moveTo(x1, y1+3).lineTo(x2, y2+3).stroke({ color: 0x081516, width: 15, cap: 'round' });
    base.moveTo(x1, y1).lineTo(x2, y2).stroke({ color: 0x557674, width: 11, cap: 'round' });
    base.moveTo(x1, y1-1).lineTo(x2, y2-1).stroke({ color: 0x93aaa2, width: 2, cap: 'round' });
  }
  for (const points of SLINGS) {
    base.poly(points.flatMap(p => [p[0], p[1]])).fill(0x214547).stroke({ color: 0x7bc2b3, width: 3, join: 'round' });
    const x = points[0][0] < 300 ? 155 : 445;
    base.circle(x, 675, 7).fill(0x163133).stroke({ color: 0x80a29a, width: 1.5 });
  }
  for (const x of [92, 508]) {
    for (let y = 288; y <= 520; y += 20) base.moveTo(x-4, y).lineTo(x+4, y-6).stroke({ color: 0x5e7e74, width: 1.5 });
  }
  const label = (text: string, x: number, y: number, size: number, color: number, spacing = 0, weight: 'normal' | 'bold' = 'normal') => {
    const t = new Text({ text, style: { fontFamily: 'Arial, sans-serif', fontSize: size, fill: color, letterSpacing: spacing, fontWeight: weight } });
    t.anchor.set(.5); t.position.set(x, y); app.stage.addChild(t); return t;
  };
  label('O R B I T A L', 300, 565, 33, 0xa5bdb0, 2, 'bold');
  label('P I N B A L L   R E S E A R C H   D I V I S I O N', 300, 594, 8, 0x5a8a7c, 1);
  label('LIGHT ALL THREE TO MULTIPLY', 300, 218, 9, 0x769c8d, 1.6);
  label('KEEP IT IN ORBIT', 300, 712, 10, 0x658c7d, 2);
  const cross = (x: number, y: number) => { base.moveTo(x-5,y).lineTo(x+5,y).moveTo(x,y-5).lineTo(x,y+5).stroke({ color: 0x678e7b, width: 1 }); };
  cross(253, 646); cross(347, 646);
  base.circle(300, 646, 19).stroke({ color: 0x638c7c, width: 1 });
  base.ellipse(300,646,27,8).stroke({color:0x638c7c,width:1});
  base.circle(300,646,5).fill(0x8baf8e);
  label('OUT', 173, 915, 9, 0x7c7360, 2); label('OUT', 427, 915, 9, 0x7c7360, 2);
  base.moveTo(273, 915).lineTo(300, 945).lineTo(327, 915).stroke({ color: 0x4d5a49, width: 1 });
  label('DRAIN', 300, 969, 8, 0x686b55, 2);
  const bumperGfx = new Graphics(); app.stage.addChild(bumperGfx);
  const bumpTexts = BUMPERS.map(p => label('100', p.x, p.y, 17, brass, 1, 'bold'));
  const targetGfx = new Graphics(); app.stage.addChild(targetGfx);
  const flippers: Container[] = [];
  for (const pivot of [TABLE.left, TABLE.right]) {
    const container = new Container(); container.position.set(pivot.x, pivot.y); app.stage.addChild(container);
    const shadow = new Graphics().roundRect(-10, -6, 110, 23, 11).fill({ color: 0x020c0c, alpha: .7 });
    const g = new Graphics().roundRect(-9, -9.5, 107, 19, 9.5).fill(0xe9b879).stroke({ color: 0xfbd9a6, width: 1.5 });
    g.moveTo(9, -4).lineTo(81, -4).stroke({ color: 0xffedcb, alpha: .65, width: 2, cap: 'round' });
    g.circle(0,0,4).fill(0x6f6d55).circle(0,0,1.5).fill(0xddcc96);
    container.addChild(shadow, g); flippers.push(container);
  }
  flippers[0].rotation = 24*Math.PI/180; flippers[1].rotation = Math.PI-24*Math.PI/180;
  const trailGfx = new Graphics(); app.stage.addChild(trailGfx);
  const ball = new Container(); app.stage.addChild(ball);
  ball.addChild(new Graphics().circle(3,6,11).fill({color:0x000a0b,alpha:.5}),new Graphics().circle(0,0,15).fill({color:0xdefbef,alpha:.09}).circle(0,0,9).fill(0x849ca0).circle(-1.2,-1.4,7.3).fill(0xd9e6de).circle(-2.5,-3,4.5).fill(0xf3f6e8).circle(-3,-4,2).fill(0xffffff));
  ball.visible = false;
  const effects = new Graphics(); app.stage.addChild(effects);
  let snapshots: { s: Snapshot; at: number }[] = [];
  let lastEvent = 0, frameCounter = 0, fpsStart = performance.now();
  let trail: {x:number;y:number}[] = [];
  let lastBumperKey = '', lastTargetKey = '';
  const pulses: {x:number;y:number;start:number;points:number}[] = [];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function update(s: Snapshot) {
    const now = performance.now(); snapshots.push({ s, at: now }); snapshots = snapshots.slice(-6);
    for (const event of s.events) {
      if (event.id <= lastEvent) continue; lastEvent = event.id;
      if (event.kind === 'hit' || event.kind === 'target' || event.kind === 'flip') pulses.push({x:event.x,y:event.y,start:now,points:event.points});
      if (event.kind === 'launch' || event.kind === 'drain') trail = [];
    }
  }
  app.ticker.add(() => {
    const now = performance.now(), renderTime = now - 30;
    const last = snapshots.at(-1)?.s;
    let before = snapshots[0], after = snapshots.at(-1);
    for (let i=1;i<snapshots.length;i++) { if (snapshots[i].at >= renderTime) { before=snapshots[i-1]; after=snapshots[i]; break; } }
    const fraction = before && after ? Math.max(0,Math.min(1,(renderTime-before.at)/(after.at-before.at || 1))) : 1;
    if (last && before && after) {
      const angle = (a:number,b:number) => a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*fraction;
      flippers[0].rotation=angle(before.s.leftAngle,after.s.leftAngle);flippers[1].rotation=angle(before.s.rightAngle,after.s.rightAngle);
      ball.visible = Boolean(last.ball);
      if (last.ball) {
        const a = before.s.ball, b = after.s.ball;
        const same = before.s.ballNumber === after.s.ballNumber && a && b;
        const x = same ? a.x+(b.x-a.x)*fraction : last.ball.x, y = same ? a.y+(b.y-a.y)*fraction : last.ball.y;
        ball.position.set(x,y); trail.push({x,y});if(trail.length>10)trail.shift();
      } else trail=[];
    }
    trailGfx.clear();
    if(!reduced)trail.forEach((p,i)=>trailGfx.circle(p.x,p.y,2+i*.45).fill({color:0xcbe9da,alpha:i/trail.length*.13}));
    const bumperKey = BUMPERS.map(p => pulses.some(e=>e.x===p.x&&e.y===p.y&&now-e.start<180)).join(',') + ':' + (last?.multiplier || 1);
    if (bumperKey !== lastBumperKey) {
    lastBumperKey = bumperKey; bumperGfx.clear();
    BUMPERS.forEach((p,i)=>{
      const pulse = pulses.some(e=>e.x===p.x&&e.y===p.y&&now-e.start<180);
      bumperGfx.circle(p.x,p.y+6,43).fill({color:0x09191a,alpha:.8});
      bumperGfx.circle(p.x,p.y,45).stroke({color:brass,alpha:pulse?.9:.18,width:pulse?3:1});
      bumperGfx.circle(p.x,p.y,37).fill(pulse?0xc89b5e:0x3d4c40).stroke({color:0xb28e58,width:2});
      bumperGfx.circle(p.x,p.y,31).fill(pulse?0x937644:0x1e3733).stroke({color:brass,width:2});
      bumperGfx.circle(p.x,p.y,24).stroke({color:brass,alpha:.25,width:1});
      bumpTexts[i].text = String(100*(last?.multiplier||1));
    });
    }
    const targetKey = (last?.targets || [false,false,false]).join(',');
    if (targetKey !== lastTargetKey) {
    lastTargetKey = targetKey; targetGfx.clear();TARGETS.forEach((p,i)=>{
      const lit=last?.targets[i];targetGfx.circle(p.x,p.y,22).fill(ink).stroke({color:teal,alpha:lit?1:.25,width:1});
      targetGfx.circle(p.x,p.y,15).fill(lit?teal:0x375f56).stroke({color:teal,width:2});
      targetGfx.circle(p.x,p.y,5).fill(lit?0xe6f6d3:0x8cb798);
    });
    }
    effects.clear();
    for(let i=pulses.length-1;i>=0;i--){const e=pulses[i],p=(now-e.start)/450;if(p>1){pulses.splice(i,1);continue;}if(!reduced)effects.circle(e.x,e.y,16+p*45).stroke({color:e.points>=100?brass:teal,width:2,alpha:(1-p)*.8});}
    frameCounter++;if(now-fpsStart>1000){reportFps(Math.round(frameCounter*1000/(now-fpsStart)));frameCounter=0;fpsStart=now;}
  });
  return { update, reset: () => { snapshots=[];trail=[];pulses.length=0;lastEvent=0; } };
}

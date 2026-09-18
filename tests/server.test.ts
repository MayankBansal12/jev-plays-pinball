import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import type { AddressInfo } from 'node:net';
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

test('server-only Jev endpoint validates requests and returns safe API failures', { timeout: 15000 }, async () => {
  let calls = 0, succeed = false, received: unknown;
  const answer = { model: 'jev-1.13.0', answers: { flippers: { type: 'choice', choice: 'left', confidence: .91, probabilities: { left: .91, right: .03, both: .04, neither: .02 } } }, usage: { input_tokens: 543, output_tokens: 0 } };
  const fake = createServer(async (req, res) => {
    calls++; const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
    received = JSON.parse(Buffer.concat(chunks).toString());
    res.writeHead(succeed ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(succeed ? answer : { error: 'private-provider-error' }));
  });
  await new Promise<void>(r => fake.listen(0, '127.0.0.1', r));
  const reservation = createServer(); await new Promise<void>(r => reservation.listen(0, '127.0.0.1', r));
  const port = (reservation.address() as AddressInfo).port;
  await new Promise<void>(r => reservation.close(() => r()));
  const dir = await mkdtemp(join(tmpdir(), 'pinball-api-test-'));
  const child = spawn(process.execPath, [resolve('dist-server/index.js')], { cwd: dir, env: { ...process.env, PORT: String(port), TYPESAFE_API_KEY: 'test-placeholder-not-a-real-key', TYPESAFE_BASE_URL: `http://127.0.0.1:${(fake.address() as AddressInfo).port}` }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  const post = (body: string, headers: Record<string, string> = {}) => fetch(`${base}/api/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${base}/api/config`)).ok) break; } catch {} await wait(50); }
    const config = await (await fetch(`${base}/api/config`)).json();
    assert.deepEqual(config, { configured: true, model: 'jev-1.13.0' });
    assert.equal((await fetch(`${base}/api/decision`)).status, 405);
    for (const payload of ['{broken', 'null', '[]', '{}', '{"snapshot":{"ball":null},"latency":0}']) assert.equal((await post(payload)).status, 400);
    assert.equal((await post('{}', { Origin: 'https://unrelated.example' })).status, 403);
    assert.equal((await post('{}', { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await post(JSON.stringify({ padding: 'x'.repeat(9000) }))).status, 413);
    assert.equal(calls, 0, 'invalid requests never call the paid API');
    const snapshot = { runId: 'test-run', tick: 120, ballNumber: 1, score: 500, action: 'neither', ball: { x: 250, y: 730, vx: 80, vy: 200 } };
    assert.equal((await post(JSON.stringify({ snapshot: { ...snapshot, ball: { ...snapshot.ball, vx: 1e100 } }, latency: 100 }))).status, 400);
    const response = await post(JSON.stringify({ snapshot, latency: 100 }));
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const failure = await response.json();
    assert.equal(failure.error, 'Jev request failed. The ball kept moving; no bot took over.');
    assert.deepEqual(failure.input, received, 'failed requests preserve the exact submitted context');
    assert.equal(calls, 1);
    succeed = true;
    const success = await post(JSON.stringify({ snapshot, latency: 100 }));
    assert.equal(success.status, 200);
    const result = await success.json();
    assert.deepEqual(result.input, received, 'inspector input is exactly the payload sent to Jev');
    assert.deepEqual(result.output, answer, 'inspector output preserves the complete structured Jev response');
    assert.equal(result.action, 'left');
    assert.equal(result.input.questions.flippers.type, 'choice');
    assert.deepEqual(result.input.state.ball, snapshot.ball);
    assert.equal(JSON.stringify(result).includes('test-placeholder-not-a-real-key'), false, 'traces never contain authorization headers or credentials');
    assert.equal(calls, 2);
  } finally {
    child.kill('SIGTERM'); await new Promise<void>(r => { if (child.exitCode !== null) r(); else child.once('exit', () => r()); });
    await new Promise<void>(r => fake.close(() => r())); await rm(dir, { recursive: true, force: true });
  }
});

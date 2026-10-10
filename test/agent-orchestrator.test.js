import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentOrchestrator, ABBenchmark, InterruptibleWait } from '../public/js/agent-orchestrator.js';
import { packMicroHands, quantile } from '../public/js/model-adapters.js';

test('15 domain managers and one self-review are present, stable, and deterministic', () => {
  const suite = new AgentOrchestrator();
  const view = suite.observe({ cameraFps: 60, aiP95: 20, ageP95: 30, renderP95: 3, droppedRate: .01, missRate: .05, score: 95, speed: .2, handsFlips: 0, interactionEnabled: true, clicks: 0, perfLevel: 0, samples: 100, backend: 'OK', database: 'ready', jobs: 'ok', fallback: false, model: 'mediapipe' }, 1000);
  assert.equal(view.agents.length, 15);
  assert.equal(view.review.agentsReviewed, 15);
  assert.ok(view.agents.some(a => a.id === 'camera'));
  assert.ok(view.agents.some(a => a.id === 'database'));
  assert.ok(view.agents.some(a => a.id === 'reliability'));
});

test('self-review challenges contradictory bottleneck signals instead of blindly recommending a model', () => {
  const suite = new AgentOrchestrator();
  const view = suite.observe({ cameraFps: 15, aiP95: 65, ageP95: 180, renderP95: 12, droppedRate: .6, missRate: .42, score: 42, speed: 1.8, handsFlips: 3, interactionEnabled: true, clicks: 0, perfLevel: 0, samples: 100, backend: 'DOWN', database: 'error', jobs: 'error', fallback: true, model: 'micro' }, 2000);
  assert.equal(view.review.safeAction, 'REDUCE_EFFECTS');
  assert.ok(view.review.warnings >= 3);
  assert.ok(view.review.issues.some(x => /Inference và tuổi khung/.test(x)));
  assert.ok(view.review.issues.some(x => /Backend\/database lỗi/.test(x)));
});

test('A/B benchmark excludes warmup and provides p50/p95/detection rate per model', () => {
  const b = new ABBenchmark(); b.start(0); b.beginPhase('mediapipe', 1000);
  b.record('mediapipe', { latency: 99, detected: true, age: 100, now: 1500 }); // warm-up ignored
  for (let i = 0; i < 20; i++) b.record('mediapipe', { latency: 10 + i, detected: i < 18, age: 30 + i, now: 3000 + i });
  // Samples that arrive while a model switch is in progress must not leak into A.
  b.phase = 'SWITCHING_B'; b.record('mediapipe', { latency: 1, detected: true, now: 4800 });
  b.beginPhase('micro', 5000);
  for (let i = 0; i < 20; i++) b.record('micro', { latency: 5 + i / 2, detected: i < 19, age: 15 + i, now: 7000 + i });
  const r = b.finish(9000);
  assert.equal(r.mediapipe.samples, 20); assert.equal(r.micro.samples, 20);
  assert.ok(r.micro.aiP95 < r.mediapipe.aiP95);
  assert.equal(r.mediapipe.detectionRate, 90); assert.equal(r.micro.detectionRate, 95);
});

test('micro-handpose adapter returns the MediaPipe 63-float-per-hand contract and ignores malformed items', () => {
  const points = Array.from({ length: 21 }, (_, i) => ({ x: i / 20, y: 1 - i / 20, z: i * .01 }));
  const r = packMicroHands([{ landmarks: points }, { landmarks: [{ x: 1 }] }, { landmarks: points }], 2);
  assert.equal(r.count, 2);
  assert.equal(r.hands.length, 126);
  assert.equal(r.hands[0], 0); assert.equal(r.hands[1], 1); assert.equal(r.hands[2], 0);
  assert.equal(r.hands[60], 1); assert.equal(r.hands[61], 0); assert.ok(Math.abs(r.hands[62] - .2) < 1e-6);
  assert.equal(r.hands[63], 0); assert.equal(r.hands[64], 1);
});

test('quantile handles empty and mixed invalid data without NaN', () => {
  assert.equal(quantile([], .95), null); assert.equal(quantile([3, NaN, 1, 2], .5), 2);
});

test('interruptible A/B wait resolves on cancel and leaves no timer/pending resolver', async () => {
  const gate = new InterruptibleWait();
  let finished = false;
  const pending = gate.sleep(30000).then(() => { finished = true; });
  gate.cancel();
  await pending;
  assert.equal(finished, true);
  assert.equal(gate.timer, null);
  assert.equal(gate.resolvePending, null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { LatencyAgent, TrackingQualityAgent, GestureAgent, AIAgentSuite } from '../public/js/ai-agents.js';

test('LatencyAgent identifies inference, scheduling and render bottlenecks', () => {
  const a = new LatencyAgent();
  assert.equal(a.update({ aiP95: 100, ageP95: 20, renderP95: 2, samples: 10 }).state, 'INFERENCE_BOUND');
  assert.equal(a.update({ aiP95: 10, ageP95: 140, renderP95: 2, samples: 10 }).state, 'SCHEDULING_BOUND');
  assert.equal(a.update({ aiP95: 10, ageP95: 20, renderP95: 10, samples: 10 }).state, 'RENDER_BOUND');
});
test('TrackingQualityAgent reports invalid landmarks and no detection conservatively', () => {
  const a = new TrackingQualityAgent();
  a.observe({ detected: true, landmarks: [{ x: 0.5, y: 0.5 }, { x: 8, y: 8 }] });
  assert.ok(a.snapshot().score < 100);
  a.observe({ detected: false });
  assert.ok(a.snapshot().missRate > 0);
});
test('GestureAgent stays finite and switches mode under fast motion / poor quality', () => {
  const a = new GestureAgent();
  for (let i = 0; i < 20; i++) a.observe(3, 1);
  assert.equal(a.snapshot().mode, 'FAST_MOTION');
  assert.equal(a.observe(0, 0.2).mode, 'CAUTIOUS');
  assert.ok(Number.isFinite(a.snapshot().stability));
});
test('AIAgentSuite exposes three isolated specialist agents', () => {
  const s = new AIAgentSuite().snapshot();
  assert.deepEqual(Object.keys(s), ['latency', 'tracking', 'gesture']);
});

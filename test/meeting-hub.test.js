import test from 'node:test';
import assert from 'node:assert/strict';
import { MeetingHub } from '../lib/meeting-hub.js';

const host = 'host_peer_12345678';
const guest = 'guest_peer_1234567';
const third = 'third_peer_1234567';

function makeHub() {
  let now = 1000;
  const hub = new MeetingHub({ now: () => now, randomRoom: () => '0123456789abcdef' });
  return { hub, advance(ms) { now += ms; }, get now() { return now; } };
}

test('meeting room creates a host, admits one guest, and caps the room at two peers', () => {
  const { hub } = makeHub();
  const created = hub.create(host);
  assert.equal(created.ok, true);
  assert.equal(created.roomId, '0123456789abcdef');
  assert.equal(created.role, 'host');
  assert.equal(hub.join(created.roomId, guest).role, 'guest');
  assert.deepEqual(hub.join(created.roomId, third), { ok: false, status: 409, error: 'meeting room is full (maximum 2 people)' });
  assert.equal(hub.state(created.roomId, host).peers.length, 2);
});

test('only members in the same room can exchange bounded WebRTC signals', () => {
  const { hub } = makeHub();
  const room = hub.create(host).roomId;
  hub.join(room, guest);
  assert.deepEqual(hub.signal(room, host, guest, 'offer', { type: 'offer', sdp: 'v=0\r\n' }), { ok: true });
  const first = hub.state(room, guest);
  assert.equal(first.messages.length, 1);
  assert.equal(first.messages[0].type, 'offer');
  assert.equal(first.messages[0].fromPeerId, host);
  assert.equal(hub.state(room, guest).messages.length, 0, 'inbox messages are consumed once');
  assert.equal(hub.signal(room, host, third, 'offer', { type: 'offer', sdp: 'v=0' }).status, 404);
  assert.equal(hub.signal(room, host, guest, 'arbitrary', {}).status, 400);
  assert.equal(hub.signal(room, host, guest, 'ice', { candidate: 'x'.repeat(5000) }).status, 400);
  assert.equal(hub.signal(room, host, guest, 'offer', { type: 'offer', sdp: 'x'.repeat(19000) }).status, 413);
});

test('leaving a room notifies the remaining peer and removes an empty room', () => {
  const { hub } = makeHub();
  const room = hub.create(host).roomId;
  hub.join(room, guest);
  assert.equal(hub.leave(room, guest).ok, true);
  const state = hub.state(room, host);
  assert.equal(state.peers.length, 1);
  assert.equal(state.messages.some(message => message.type === 'leave' && message.fromPeerId === guest), true);
  hub.leave(room, host);
  assert.equal(hub.state(room, host).status, 404);
});

test('stale peers expire while an active peer can keep waiting for a replacement', () => {
  const t = makeHub();
  const room = t.hub.create(host).roomId;
  t.hub.join(room, guest);
  t.advance(60000);
  t.hub.state(room, host); // host heartbeat
  t.advance(31000);
  const state = t.hub.state(room, host);
  assert.deepEqual(state.peers.map(p => p.peerId), [host]);
  assert.equal(state.messages.some(message => message.type === 'leave' && message.fromPeerId === guest), true);
});

test('invalid room/peer identifiers are rejected without allocating a room', () => {
  const { hub } = makeHub();
  assert.equal(hub.create('x').status, 400);
  assert.equal(hub.join('not-a-room', host).status, 400);
  assert.equal(hub.state('0123456789abcdef', host).status, 404);
});

test('random matchmaking pairs two waiting peers in a private two-person room', () => {
  const { hub } = makeHub();
  const first = hub.matchmake(host);
  assert.equal(first.ok, true);
  assert.equal(first.waiting, true);
  assert.equal(first.matched, false);
  const second = hub.matchmake(guest);
  assert.equal(second.ok, true);
  assert.equal(second.matched, true);
  assert.equal(second.waiting, false);
  assert.equal(second.roomId, first.roomId);
  const state = hub.state(first.roomId, host);
  assert.equal(state.peers.length, 2);
  assert.equal(state.role, 'host');
  assert.equal(hub.matchQueue.length, 0);
});

test('random matchmaking can be cancelled and expired queue entries are discarded', () => {
  const t = makeHub();
  const first = t.hub.matchmake(host);
  assert.equal(t.hub.cancelMatchmaking(host).cancelled, true);
  assert.equal(t.hub.rooms.has(first.roomId), false);
  assert.equal(t.hub.matchQueue.length, 0);
  const next = t.hub.matchmake(guest);
  t.advance(120001);
  t.hub.cleanup();
  assert.equal(t.hub.matchQueue.length, 0);
  assert.equal(t.hub.rooms.has(next.roomId), false, 'stale waiting peer and room are cleaned after the heartbeat timeout');
});

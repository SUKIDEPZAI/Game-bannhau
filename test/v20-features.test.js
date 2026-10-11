import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('v20 includes an in-app 1:1 meeting and WebRTC controls', () => {
  const html = read('public/index.html'); const meeting = read('public/js/meeting.js'); const main = read('public/js/main.js');
  assert.match(html, /id="meetOverlay"/); assert.match(html, /id="createRoomBtn"/); assert.match(html, /id="joinRoomBtn"/);
  assert.match(html, /id="localVideo"/); assert.match(html, /id="remoteVideo"/);
  assert.match(meeting, /getUserMedia\(\{ audio:/); assert.match(meeting, /new RTCPeerConnection/);
  assert.match(meeting, /async hangup\(\)/); assert.match(meeting, /track\.stop\(\)/);
  assert.match(main, /onPauseApp:[\s\S]*stopCamera\(\)/); assert.match(main, /onResumeApp:[\s\S]*requestStart\(\)/);
});

test('v20 meeting signaling is bounded, validates peers and supports optional TURN', () => {
  const server = read('server.js'); const hub = read('lib/meeting-hub.js');
  assert.match(server, /app\.post\("\/api\/meet\/rooms"/); assert.match(server, /limitMeet\("meet-signal", 150\)/);
  assert.match(server, /TURN_SHARED_SECRET/); assert.match(server, /createHmac\("sha1"/);
  assert.match(hub, /MAX_SIGNAL_BYTES/); assert.match(hub, /MAX_INBOX/); assert.match(hub, /maximum 2 people/);
  assert.doesNotMatch(server, /new WebSocketServer/);
});

test('v20.1 guide documents actionable poses and latency lab measures pose classification', () => {
  const html = read('public/index.html'); const main = read('public/js/main.js'); const gesture = read('public/js/gesture.js');
  assert.match(html, /id="gestureGuideBtn"/); assert.match(html, /đẩy bàn tay nhanh về gần camera/);
  assert.match(html, /Chạm đầu ngón cái vào đầu ngón trỏ tạo vòng tròn/);
  assert.match(html, /id="poseLatency"/); assert.match(main, /M\.pose\.push\(poseMs\)/); assert.match(main, /POSE.*hình học \+ ổn định nhãn/);
  assert.match(read("server.js"), /const VERSION = "20\.1\.0"/); assert.match(gesture, /angleDeg/); assert.match(gesture, /fingerAngleEnter/); assert.match(gesture, /label = "OK"/);
});
test('v20 gesture actions are local, rate-limited, and shatter effect lasts 3 seconds', () => {
  const main = read('public/js/main.js'); const effects = read('public/js/effects-layer.js'); const css = read('public/css/style.css');
  assert.match(main, /ratio >= 1\.18/); assert.match(main, /effects\.play\("shatter", 3000/); assert.match(main, /s\.g\.raw === "Súng"/); assert.match(main, /s\.g\.actionable/);
  assert.match(main, /effects\.play\("rainbow", 1800/); assert.match(main, /effects\.play\("confetti", 1200/); assert.match(main, /effects\.play\("burst", 650/);
  assert.match(main, /effects\.play\("hearts", 1400/); assert.match(main, /effects\.play\("shockwave", 1000/); assert.match(main, /effects\.play\("slash", 750/);
  assert.match(effects, /now - \(this\.lastPlay\.get\(name\) \?\? -Infinity\) < cooldown/);
  assert.match(effects, /name === "shatter" \? 3000/); assert.match(effects, /"ok"/); assert.match(effects, /name === "rainbow"/); assert.match(css, /\.effect-shatter/);
  assert.match(htmlText(), /id="gestureEffects"/);
});
function htmlText() { return read('public/index.html'); }

test('MeetingHub creates private ephemeral two-person rooms and bounds signaling', async () => {
  const { MeetingHub } = await import('../lib/meeting-hub.js');
  const hub = new MeetingHub({ now: () => 1000, randomRoom: () => '0123456789abcdef' });
  const hostId = 'host_123456789012345'; const guestId = 'guest_12345678901234'; const thirdId = 'third_12345678901234';
  const created = hub.create(hostId); assert.equal(created.ok, true);
  assert.equal(hub.join(created.roomId, guestId).ok, true);
  assert.equal(hub.join(created.roomId, thirdId).status, 409);
  assert.equal(hub.signal(created.roomId, hostId, guestId, 'offer', { sdp: 'v=0\\r\\n'.repeat(5) }).ok, true);
  const state = hub.state(created.roomId, guestId); assert.equal(state.messages.length, 1); assert.equal(state.messages[0].type, 'offer');
  assert.equal(hub.signal(created.roomId, hostId, guestId, 'offer', { sdp: 'x'.repeat(17000) }).ok, false);
  assert.equal(hub.leave(created.roomId, guestId).ok, true);
});

import { randomBytes } from 'node:crypto';

const ROOM_RE = /^[a-f0-9]{16}$/i;
const PEER_RE = /^[a-zA-Z0-9_-]{16,80}$/;
const SIGNAL_TYPES = new Set(['offer', 'answer', 'ice', 'leave']);
const ROOM_IDLE_MS = 30 * 60 * 1000;
const PEER_STALE_MS = 90 * 1000;
const MAX_ROOMS = 2000;
const MAX_SIGNAL_BYTES = 18 * 1024;
const MAX_INBOX = 128;

function safePeerId(value) {
  return typeof value === 'string' && PEER_RE.test(value) ? value : null;
}

/** In-memory, ephemeral WebRTC signaling. Media never passes through this service. */
export class MeetingHub {
  constructor({ now = () => Date.now(), randomRoom = () => randomBytes(8).toString('hex') } = {}) {
    this.now = now;
    this.randomRoom = randomRoom;
    this.rooms = new Map();
  }

  cleanup() {
    const now = this.now();
    for (const [roomId, room] of this.rooms) {
      for (const [peerId, peer] of room.peers) {
        if (now - peer.lastSeen > PEER_STALE_MS) {
          room.peers.delete(peerId);
          for (const other of room.peers.values()) other.inbox.push({ type: 'leave', fromPeerId: peerId, payload: {}, at: now });
        }
      }
      if (!room.peers.size || now - room.lastActivity > ROOM_IDLE_MS) this.rooms.delete(roomId);
      else if (room.peers.size > 1) {
        for (const peer of room.peers.values()) {
          if (peer.inbox.length > MAX_INBOX) peer.inbox.splice(0, peer.inbox.length - MAX_INBOX);
        }
      }
    }
    while (this.rooms.size >= MAX_ROOMS) {
      const oldest = [...this.rooms.entries()].sort((a, b) => a[1].lastActivity - b[1].lastActivity)[0];
      if (!oldest) break;
      this.rooms.delete(oldest[0]);
    }
  }

  create(peerId) {
    this.cleanup();
    const id = safePeerId(peerId);
    if (!id) return { ok: false, status: 400, error: 'invalid peerId' };
    let roomId;
    for (let attempt = 0; attempt < 8; attempt++) {
      roomId = String(this.randomRoom()).toLowerCase();
      if (ROOM_RE.test(roomId) && !this.rooms.has(roomId)) break;
      roomId = null;
    }
    if (!roomId) return { ok: false, status: 503, error: 'unable to allocate meeting room' };
    const now = this.now();
    const room = { id: roomId, createdAt: now, lastActivity: now, peers: new Map() };
    room.peers.set(id, { id, joinedAt: now, lastSeen: now, inbox: [] });
    this.rooms.set(roomId, room);
    return { ok: true, roomId, peerId: id, role: 'host', expiresInMs: ROOM_IDLE_MS };
  }

  join(roomIdValue, peerIdValue) {
    this.cleanup();
    const roomId = String(roomIdValue || '').toLowerCase();
    const peerId = safePeerId(peerIdValue);
    if (!ROOM_RE.test(roomId) || !peerId) return { ok: false, status: 400, error: 'invalid roomId or peerId' };
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, status: 404, error: 'meeting room not found or expired' };
    if (room.peers.has(peerId)) return { ok: false, status: 409, error: 'peer already joined' };
    if (room.peers.size >= 2) return { ok: false, status: 409, error: 'meeting room is full (maximum 2 people)' };
    const now = this.now();
    room.peers.set(peerId, { id: peerId, joinedAt: now, lastSeen: now, inbox: [] });
    room.lastActivity = now;
    return { ok: true, roomId, peerId, role: 'guest', expiresInMs: ROOM_IDLE_MS };
  }

  state(roomIdValue, peerIdValue) {
    this.cleanup();
    const roomId = String(roomIdValue || '').toLowerCase();
    const peerId = safePeerId(peerIdValue);
    if (!ROOM_RE.test(roomId) || !peerId) return { ok: false, status: 400, error: 'invalid roomId or peerId' };
    const room = this.rooms.get(roomId);
    const me = room?.peers.get(peerId);
    if (!room || !me) return { ok: false, status: 404, error: 'meeting room or peer expired' };
    const now = this.now(); me.lastSeen = now; room.lastActivity = now;
    const peers = [...room.peers.values()].sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
    const messages = me.inbox.splice(0, me.inbox.length);
    return { ok: true, roomId, peerId, role: peers[0]?.id === peerId ? 'host' : 'guest', peers: peers.map(p => ({ peerId: p.id, joinedAt: p.joinedAt })), messages, expiresInMs: ROOM_IDLE_MS };
  }

  signal(roomIdValue, fromPeerValue, toPeerValue, type, payload = {}) {
    this.cleanup();
    const roomId = String(roomIdValue || '').toLowerCase();
    const fromPeer = safePeerId(fromPeerValue), toPeer = safePeerId(toPeerValue);
    if (!ROOM_RE.test(roomId) || !fromPeer || !toPeer || fromPeer === toPeer) return { ok: false, status: 400, error: 'invalid room or peers' };
    if (!SIGNAL_TYPES.has(type) || !payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, status: 400, error: 'invalid signal' };
    let serialized;
    try { serialized = JSON.stringify(payload); } catch { return { ok: false, status: 400, error: 'invalid payload' }; }
    if (Buffer.byteLength(serialized, 'utf8') > MAX_SIGNAL_BYTES) return { ok: false, status: 413, error: 'signal too large' };
    if (type === 'offer' || type === 'answer') {
      if (typeof payload.sdp !== 'string' || payload.sdp.length > 16000) return { ok: false, status: 400, error: 'invalid session description' };
    }
    if (type === 'ice' && (typeof payload.candidate !== 'string' || payload.candidate.length > 4096)) return { ok: false, status: 400, error: 'invalid ICE candidate' };
    const room = this.rooms.get(roomId), from = room?.peers.get(fromPeer), to = room?.peers.get(toPeer);
    if (!room || !from || !to) return { ok: false, status: 404, error: 'peer not in meeting room' };
    if (to.inbox.length >= MAX_INBOX) return { ok: false, status: 429, error: 'signal inbox full' };
    const now = this.now();
    to.inbox.push({ type, fromPeerId: fromPeer, payload, at: now });
    from.lastSeen = now; to.lastSeen = Math.max(to.lastSeen, now); room.lastActivity = now;
    return { ok: true };
  }

  leave(roomIdValue, peerIdValue) {
    const roomId = String(roomIdValue || '').toLowerCase();
    const peerId = safePeerId(peerIdValue);
    if (!ROOM_RE.test(roomId) || !peerId) return { ok: false, status: 400, error: 'invalid room or peer' };
    const room = this.rooms.get(roomId), peer = room?.peers.get(peerId);
    if (!room || !peer) return { ok: true };
    room.peers.delete(peerId);
    for (const other of room.peers.values()) {
      if (other.inbox.length < MAX_INBOX) other.inbox.push({ type: 'leave', fromPeerId: peerId, payload: {}, at: this.now() });
    }
    if (!room.peers.size) this.rooms.delete(roomId); else room.lastActivity = this.now();
    return { ok: true };
  }
}

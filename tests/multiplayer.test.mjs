// The hit-relay routing: guests can't reach each other directly (star topology), so every hit
// goes via the host either way. These test the routing contract directly, without real WebRTC.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Multiplayer } from '../src/multiplayer.js';

function mockConn(peerId) {
  const sent = [];
  return { peer: peerId, open: true, send: (msg) => sent.push(msg), _sent: sent };
}

function noopHandlers(overrides = {}) {
  return { onLobby: () => {}, onStart: () => {}, onState: () => {}, onHit: () => {}, onBoom: () => {}, onPlayerLeft: () => {}, onError: () => {}, ...overrides };
}

test('host relays a hit aimed at itself straight to its own onHit handler', () => {
  let got = null;
  const mp = new Multiplayer(noopHandlers({ onHit: (from, d) => { got = { from, d }; } }));
  mp.isHost = true; mp.selfId = 'host';
  mp._onHostMessage('guestA', { t: 'hit', to: 'host', d: { nx: 1, nz: 0, speed: 5 } });
  assert.deepEqual(got, { from: 'guestA', d: { nx: 1, nz: 0, speed: 5 } });
});

test('host relays a hit aimed at another guest to that guest, not to itself', () => {
  const mp = new Multiplayer(noopHandlers());
  mp.isHost = true; mp.selfId = 'host';
  const connA = mockConn('guestA'), connB = mockConn('guestB');
  mp.conns.set('guestA', connA); mp.conns.set('guestB', connB);
  mp._onHostMessage('guestA', { t: 'hit', to: 'guestB', d: { nx: 0, nz: 1, speed: 3 } });
  assert.equal(connA._sent.length, 0, 'the sender should not get their own hit echoed back');
  assert.equal(connB._sent.length, 1);
  assert.deepEqual(connB._sent[0], { t: 'hit', from: 'guestA', d: { nx: 0, nz: 1, speed: 3 } });
});

test('a guest sending a hit always goes via the host, whoever the actual target is', () => {
  const mp = new Multiplayer(noopHandlers());
  mp.isHost = false; mp.selfId = 'guestA';
  const hostConn = mockConn('host'); mp.hostConn = hostConn;
  mp.sendHit('guestB', { nx: 1, nz: 0, speed: 4 });
  assert.equal(hostConn._sent.length, 1);
  assert.deepEqual(hostConn._sent[0], { t: 'hit', to: 'guestB', d: { nx: 1, nz: 0, speed: 4 } });
});

test('the host sending a hit to a guest goes directly, no relay needed', () => {
  const mp = new Multiplayer(noopHandlers());
  mp.isHost = true; mp.selfId = 'host';
  const connA = mockConn('guestA'); mp.conns.set('guestA', connA);
  mp.sendHit('guestA', { nx: -1, nz: 0, speed: 6 });
  assert.equal(connA._sent.length, 1);
  assert.deepEqual(connA._sent[0], { t: 'hit', from: 'host', d: { nx: -1, nz: 0, speed: 6 } });
});

test('sendHit never sends anything if you somehow target yourself', () => {
  const mp = new Multiplayer(noopHandlers());
  mp.isHost = false; mp.selfId = 'guestA';
  const hostConn = mockConn('host'); mp.hostConn = hostConn;
  mp.sendHit('guestA', { nx: 1, nz: 0, speed: 1 });
  assert.equal(hostConn._sent.length, 0);
});

test('a hit to an unknown or disconnected guest is silently dropped, not thrown', () => {
  const mp = new Multiplayer(noopHandlers());
  mp.isHost = true; mp.selfId = 'host';
  assert.doesNotThrow(() => mp.sendHit('nobody', { nx: 1, nz: 0, speed: 1 }));
  assert.doesNotThrow(() => mp._onHostMessage('guestA', { t: 'hit', to: 'nobody', d: {} }));
});

test('startGame sends the host\'s chosen track to every guest, and fires onStart with it locally', () => {
  let started = null;
  const mp = new Multiplayer(noopHandlers({ onStart: (track) => { started = track; } }));
  mp.isHost = true; mp.selfId = 'host';
  const connA = mockConn('guestA'), connB = mockConn('guestB');
  mp.conns.set('guestA', connA); mp.conns.set('guestB', connB);
  const track = { name: 'Kidney', handles: [{ x: 0, z: 0 }] };
  mp.startGame(track);
  assert.equal(mp.started, true);
  assert.deepEqual(connA._sent[0], { t: 'start', track });
  assert.deepEqual(connB._sent[0], { t: 'start', track });
  assert.deepEqual(started, track, 'the host itself should start on the same track it sent out');
});

test('startGame does nothing if called by a guest - only the host can start the race', () => {
  let called = false;
  const mp = new Multiplayer(noopHandlers({ onStart: () => { called = true; } }));
  mp.isHost = false; mp.selfId = 'guestA';
  const hostConn = mockConn('host'); mp.hostConn = hostConn;
  mp.startGame({ name: 'Kidney' });
  assert.equal(called, false);
  assert.equal(mp.started, false);
  assert.equal(hostConn._sent.length, 0);
});

test('host relays a barrel explosion from one guest to everyone else, and applies it itself', () => {
  const got = [];
  const mp = new Multiplayer(noopHandlers({ onBoom: (from, i) => got.push([from, i]) }));
  mp.isHost = true; mp.selfId = 'host';
  const connA = mockConn('guestA'), connB = mockConn('guestB');
  mp.conns.set('guestA', connA); mp.conns.set('guestB', connB);
  mp._onHostMessage('guestA', { t: 'boom', i: 7 });
  assert.deepEqual(got, [['guestA', 7]]);
  assert.equal(connA._sent.length, 0, 'the sender is not told about their own barrel');
  assert.deepEqual(connB._sent, [{ t: 'boom', from: 'guestA', i: 7 }]);
});

test('a barrel message with a nonsense index is ignored, not applied or relayed', () => {
  let called = 0;
  const mp = new Multiplayer(noopHandlers({ onBoom: () => { called++; } }));
  mp.isHost = true; mp.selfId = 'host';
  const connB = mockConn('guestB'); mp.conns.set('guestB', connB);
  for (const bad of ['3', 1.5, null, undefined, NaN]) mp._onHostMessage('guestA', { t: 'boom', i: bad });
  assert.equal(called, 0);
  assert.equal(connB._sent.length, 0);
});

test('sendBoom: the host tells every guest directly; a guest tells the host, who relays it', () => {
  const host = new Multiplayer(noopHandlers());
  host.isHost = true; host.selfId = 'host';
  const a = mockConn('guestA'), b = mockConn('guestB');
  host.conns.set('guestA', a); host.conns.set('guestB', b);
  host.sendBoom(4);
  assert.deepEqual(a._sent, [{ t: 'boom', from: 'host', i: 4 }]);
  assert.deepEqual(b._sent, [{ t: 'boom', from: 'host', i: 4 }]);

  const guest = new Multiplayer(noopHandlers());
  guest.isHost = false; guest.selfId = 'guestA';
  const hostConn = mockConn('host'); guest.hostConn = hostConn;
  guest.sendBoom(9);
  assert.deepEqual(hostConn._sent, [{ t: 'boom', i: 9 }]);
});

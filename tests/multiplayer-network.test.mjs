// Run with:  npm test
// Multiplayer networking against an in-memory fake of PeerJS (tests/mockpeer.mjs): chat, a host whose tab is paused,
// a host whose tab is killed and comes back under the same room code, and guests who rejoin by themselves.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Broker, makePeerClass } from './mockpeer.mjs';

globalThis.window = globalThis.window || {};
const { Multiplayer } = await import('../src/multiplayer.js');

const ALL = [];                                       // every session a test makes, closed afterwards even if the test failed
afterEach(() => { for (const mp of ALL.splice(0)) { try { mp.leave(); } catch { /* already closed */ } } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 1500, what = 'condition') {
  const t0 = Date.now();
  while (!fn()) { if (Date.now() - t0 > ms) assert.fail('timed out waiting for ' + what); await wait(5); }
}

function world() {
  const broker = new Broker();
  window.Peer = makePeerClass(broker);
  const log = [];
  const make = (name) => {
    const rec = { name, errors: [], status: [], chats: [], lobbies: [], left: [], started: 0 };
    const mp = new Multiplayer({
      onLobby: (p) => rec.lobbies.push(p.map((x) => x.name)),
      onStart: () => { rec.started++; }, onState() {}, onBoom() {}, onHit() {},
      onPlayerLeft: (id) => rec.left.push(id),
      onError: (m) => rec.errors.push(m),
      onStatus: (m) => rec.status.push(m),
      onChat: (id, m) => rec.chats.push({ id, ...m }),
    });
    mp.reconnectDelayMs = 10; mp.rejoinDelayMs = 20; mp.rejoinMs = 600;
    ALL.push(mp);
    return { mp, rec };
  };
  return { broker, make, log };
}
const lastLobby = (r) => r.lobbies[r.lobbies.length - 1] || [];

test('guests join the host\'s lobby and see each other', async () => {
  const w = world(), h = w.make('H'), a = w.make('A'), b = w.make('B');
  const code = await h.mp.createRoom('Tim');
  await a.mp.joinRoom(code, 'Sam'); await b.mp.joinRoom(code, 'Kit');
  await until(() => lastLobby(h.rec).length === 3 && lastLobby(a.rec).length === 3 && lastLobby(b.rec).length === 3, 1500, 'full lobby');
  for (const m of [h, a, b]) m.mp.leave();
});

test('chat: quick and typed messages reach everyone once; the host sets who sent it; junk and floods are dropped', async () => {
  const w = world(), h = w.make('H'), a = w.make('A'), b = w.make('B');
  const code = await h.mp.createRoom('Tim');
  await a.mp.joinRoom(code, 'Sam'); await b.mp.joinRoom(code, 'Kit');
  await until(() => lastLobby(b.rec).length === 3);

  assert.equal(a.mp.sendChat({ q: 3 }), true);
  await until(() => h.rec.chats.length === 1 && b.rec.chats.length === 1 && a.rec.chats.length === 1, 1000, 'quick chat everywhere');
  assert.deepEqual(h.rec.chats[0], { id: a.mp.selfId, q: 3 });
  assert.deepEqual(b.rec.chats[0], { id: a.mp.selfId, q: 3 }, 'receiver sees the real sender id');

  await wait(650);
  assert.equal(h.mp.sendChat({ x: '  <b>hello</b>\u202e   there  ' }), true);
  await until(() => a.rec.chats.length === 2 && b.rec.chats.length === 2, 1000, 'typed chat');
  assert.equal(a.rec.chats[1].x, '<b>hello</b> there');
  assert.equal(a.rec.chats[1].id, h.mp.selfId);

  // a guest that lies about who it is, sends an unknown quick chat, empty text, or floods
  await wait(650);
  const before = b.rec.chats.length;
  a.mp.hostConn.send({ t: 'chat', from: b.mp.selfId, q: 99 });
  a.mp.hostConn.send({ t: 'chat', from: b.mp.selfId, x: '   ' });
  a.mp.hostConn.send({ t: 'chat', from: b.mp.selfId, x: 'spoof?' });
  await wait(60);
  const spoof = b.rec.chats.slice(before);
  assert.equal(spoof.length, 1, 'only the one valid message gets through');
  assert.equal(spoof[0].id, a.mp.selfId, 'from is overwritten by the host with the true sender');
  assert.equal(b.mp.sendChat({ x: 'first' }), true);
  assert.equal(b.mp.sendChat({ x: 'again too fast' }), false, 'sender is limited too');

  await wait(650);
  const n0 = h.rec.chats.length;
  for (let i = 0; i < 20; i++) a.mp.hostConn.send({ t: 'chat', x: 'spam ' + i });
  await wait(80);
  assert.equal(h.rec.chats.length - n0, 1, 'a burst inside the gap is limited');
  for (const m of [h, a, b]) m.mp.leave();
});

test('host switching app: the matchmaking link drops and comes back - no error, room and guests intact', async () => {
  const w = world(), h = w.make('H'), a = w.make('A');
  const code = await h.mp.createRoom('Tim');
  await a.mp.joinRoom(code, 'Sam');
  await until(() => lastLobby(a.rec).length === 2);

  h.mp.peer.emit('error', { type: 'network' });      // what PeerJS reports when the phone suspends the tab
  h.mp.peer.disconnect();
  await until(() => h.mp.peer.open && h.rec.status.at(-1) === null && h.rec.status.some((s) => s && /Reconnecting/.test(s)), 1000, 'reconnected');
  assert.deepEqual(h.rec.errors, [], 'the host is not thrown out');
  assert.deepEqual(a.rec.errors, []);
  assert.equal(h.mp.players.size, 2);

  const c = w.make('C');                              // and the room is joinable again afterwards
  await c.mp.joinRoom(code, 'Kit');
  await until(() => lastLobby(h.rec).length === 3);
  for (const m of [h, a, c]) m.mp.leave();
});

test('host paused with no signal: resume() retries at once when the page is visible again, without waiting for the timer', async () => {
  const w = world(), h = w.make('H');
  const code = await h.mp.createRoom('Tim');
  w.broker.offline = true;
  h.mp.reconnectDelayMs = 100000;                     // a timer that would not fire for ages (a frozen tab)
  h.mp.peer.disconnect();
  await wait(30);
  assert.equal(h.mp.peer.open, false);
  w.broker.offline = false;                           // signal is back, but the retry timer is still far off
  h.mp.resume();
  await until(() => h.mp.peer.open, 500, 'reconnected by resume()');
  assert.ok(w.broker.ids.get('carracer-' + code), 'the room code is registered again');
  assert.equal(h.rec.status.at(-1), null);
  assert.deepEqual(h.rec.errors, []);
  h.mp.leave();
});

test('host tab killed in the lobby, reopened under the same code: guests rejoin by themselves', async () => {
  const w = world(); w.broker.releaseDelay = 120;
  const h1 = w.make('H1'), a = w.make('A'), b = w.make('B');
  const code = await h1.mp.createRoom('Tim');
  await a.mp.joinRoom(code, 'Sam'); await b.mp.joinRoom(code, 'Kit');
  await until(() => lastLobby(b.rec).length === 3);
  const aOldHue = a.mp.players.get(a.mp.selfId).hue;

  h1.mp.peer.kill();                                  // iOS throws the tab away: no goodbye, the code lingers on the broker
  await until(() => a.rec.status.some((s) => s && /away/.test(s)), 1000, 'guest notices');
  assert.deepEqual(a.rec.errors, []);

  const h2 = w.make('H2');                            // Tim reopens the page and taps "Resume room"
  const got = await h2.mp.createRoom('Tim', code, { retryMs: 3000, delayMs: 30 });
  assert.equal(got, code, 'same room code, so the link already sent still works');
  assert.ok(h2.rec.status.some((s) => s && /Re-opening/.test(s)), 'it waited for the old code to be released');

  await until(() => lastLobby(h2.rec).length === 3 && a.rec.status.at(-1) === null && b.rec.status.at(-1) === null, 3000, 'both guests back in the lobby');
  assert.deepEqual(a.rec.errors.concat(b.rec.errors), []);
  assert.equal(typeof aOldHue, 'number');
  for (const m of [h2, a, b]) m.mp.leave();
});

test('a guest whose own link dropped rejoins with the same id and keeps their colour; the old link\'s late close does not remove them', async () => {
  const w = world(), h = w.make('H'), a = w.make('A');
  const code = await h.mp.createRoom('Tim');
  await a.mp.joinRoom(code, 'Sam');
  await until(() => lastLobby(a.rec).length === 2);
  const id = a.mp.selfId, hue = h.mp.players.get(id).hue;

  a.mp.hostConn.close();                              // e.g. the guest's tab was paused and the data channel timed out
  await until(() => a.rec.status.some((s) => s && /away/.test(s)));
  await until(() => a.rec.status.at(-1) === null, 1500, 'rejoined');
  await wait(50);
  assert.ok(h.mp.players.has(id), 'still in the roster');
  assert.equal(h.mp.players.get(id).hue, hue, 'same colour');
  assert.equal(h.mp.conns.size, 1);
  h.mp.leave(); a.mp.leave();
});

test('host leaves on purpose: guests are told straight away and do not wait for a comeback', async () => {
  const w = world(), h = w.make('H'), a = w.make('A');
  const code = await h.mp.createRoom('Tim');
  await a.mp.joinRoom(code, 'Sam');
  await until(() => lastLobby(a.rec).length === 2);
  h.mp.leave();
  await until(() => a.rec.errors.length === 1, 1000, 'host-left error');
  assert.match(a.rec.errors[0], /host left/i);
  assert.ok(!a.rec.status.some((s) => s && /away/.test(s)), 'no reconnect attempt for a deliberate leave');
  a.mp.leave();
});

test('once the race has started, losing the host is final', async () => {
  const w = world(), h = w.make('H'), a = w.make('A');
  const code = await h.mp.createRoom('Tim');
  await a.mp.joinRoom(code, 'Sam');
  await until(() => lastLobby(a.rec).length === 2);
  h.mp.startGame({ name: 't' });
  await until(() => a.rec.started === 1);
  h.mp.peer.kill();
  await until(() => a.rec.errors.length === 1, 1000, 'fatal error');
  assert.match(a.rec.errors[0], /host left/i);
  a.mp.leave();
});

test('a guest gives up after a while if the host never comes back', async () => {
  const w = world(), h = w.make('H'), a = w.make('A');
  const code = await h.mp.createRoom('Tim');
  await a.mp.joinRoom(code, 'Sam');
  await until(() => lastLobby(a.rec).length === 2);
  a.mp.rejoinMs = 150;
  h.mp.peer.kill();
  await until(() => a.rec.errors.length === 1, 2000, 'gave up');
  assert.match(a.rec.errors[0], /host left/i);
  a.mp.leave();
});

test('resuming a room whose code is taken for good eventually reports it instead of hanging', async () => {
  const w = world(), h = w.make('H'), x = w.make('X');
  const code = await h.mp.createRoom('Tim');          // someone else genuinely holds the code
  await assert.rejects(x.mp.createRoom('Sam', code, { retryMs: 120, delayMs: 20 }), /already taken/);
  h.mp.leave();
});

test('after the race starts a guest still loading the track (no state yet) is not dropped after 5 s - but a silent one is, once it has played', async () => {
  const w = world(), h = w.make('H'), a = w.make('A'), b = w.make('B');
  const code = await h.mp.createRoom('Tim');
  await a.mp.joinRoom(code, 'Sam'); await b.mp.joinRoom(code, 'Kit');
  await until(() => lastLobby(b.rec).length === 3);
  h.mp.startGame({ name: 't' });
  const SIX_SECONDS_AGO = performance.now() - 6000;
  for (const id of h.mp.conns.keys()) h.mp._lastSeen.set(id, SIX_SECONDS_AGO);
  b.mp._lastSend = 0; b.mp.sendState({ x: 0, y: 0, z: 0 });          // Kit has started playing, then goes quiet
  await wait(30);
  for (const id of h.mp.conns.keys()) h.mp._lastSeen.set(id, SIX_SECONDS_AGO);
  await wait(1200);                                                  // the watchdog ticks once a second
  assert.ok(h.mp.players.has(a.mp.selfId), 'Sam is still loading: kept');
  assert.ok(!h.mp.players.has(b.mp.selfId), 'Kit played, then 6 s of silence: gone');
});

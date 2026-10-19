import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.addEventListener = () => {};
globalThis.document = { getElementById: () => null, body: { classList: { add() {}, remove() {}, contains: () => false } } };
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; } };
const { Input, describeBinding } = await import('../src/input.js');
const mk = (axes = [0, 0, 0, 0, 0, 0, 0, 0, 0, 3.2857], pressed = []) => ({ connected: true, id: 'USB pad', mapping: '', axes, buttons: Array.from({ length: 12 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })) });
test('a learned button replaces the default, and is remembered', () => {
  let gp = mk(); Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [gp] }, configurable: true });
  const inp = new Input({});
  inp.read();
  let got; assert.ok(inp.startLearn('boost', (b) => { got = b; }));
  gp = mk(undefined, [6]); inp.read();
  assert.deepEqual(got, { t: 'b', i: 6 });
  gp = mk(undefined, [6]); assert.equal(inp.read().boost, true);
  gp = mk(undefined, [0]); assert.equal(inp.read().boost, false, 'the old default button no longer boosts');
  assert.match(localStorage.getItem('cr.padmap'), /USB pad/);
  inp.clearMap(); gp = mk(undefined, [0]); assert.equal(inp.read().boost, true);
});
test('a D-pad that is a hat axis can be learned for steering', () => {
  let gp = mk(); Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [gp] }, configurable: true });
  const inp = new Input({}); inp.read();
  let got; inp.startLearn('left', (b) => { got = b; });
  const ax = mk().axes; ax[9] = 0.714; gp = mk(ax); inp.read();
  assert.deepEqual(got, { t: 'h', i: 9, v: 0.714 });
  assert.equal(describeBinding(got), 'D-pad left');
  gp = mk(ax); assert.equal(inp.read().steer, 1);
  gp = mk(); assert.equal(inp.read().steer, 0);
});

// Run with:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUICK_CHATS, MAX_CHAT_LEN, cleanChatText, normaliseChat, chatWords, ChatLimiter } from '../src/chat.js';

test('quick chats are short, unique plain text', () => {
  assert.ok(QUICK_CHATS.length >= 8);
  assert.equal(new Set(QUICK_CHATS).size, QUICK_CHATS.length);
  for (const q of QUICK_CHATS) { assert.ok(q.length > 0 && q.length <= MAX_CHAT_LEN); assert.equal(cleanChatText(q), q, q); }
});

test('typed text is made safe: no invisible or reversing characters, one line, length capped; hearts and faces survive', () => {
  assert.equal(cleanChatText('  hello   world  '), 'hello world');
  assert.equal(cleanChatText('I <3 this :>'), 'I <3 this :>', 'angle brackets are harmless: text is only ever shown with textContent');
  assert.equal(cleanChatText('a\u202eb\u200bc\u0000d\n e'), 'a b c d e');
  assert.equal(cleanChatText('x'.repeat(500)).length, MAX_CHAT_LEN);
  assert.equal(cleanChatText('   '), '');
  assert.equal(cleanChatText(42), '');
  assert.equal(cleanChatText(null), '');
  assert.equal(cleanChatText("I'm \"fine\" & dandy"), "I'm \"fine\" & dandy");
});

test('normaliseChat accepts a valid quick-chat number or text, and nothing else', () => {
  assert.deepEqual(normaliseChat({ q: 0 }), { q: 0 });
  assert.deepEqual(normaliseChat({ q: QUICK_CHATS.length - 1 }), { q: QUICK_CHATS.length - 1 });
  assert.equal(normaliseChat({ q: QUICK_CHATS.length }), null);
  assert.equal(normaliseChat({ q: -1 }), null);
  assert.equal(normaliseChat({ q: 1.5, x: 'but text' }).x, 'but text');
  assert.deepEqual(normaliseChat({ x: ' hi ' }), { x: 'hi' });
  assert.equal(normaliseChat({ x: '' }), null);
  assert.equal(normaliseChat({ q: '3' }), null);
  assert.equal(normaliseChat(null), null);
  assert.equal(normaliseChat('hello'), null);
  assert.equal(chatWords({ q: 2 }), QUICK_CHATS[2]);
  assert.equal(chatWords({ x: 'yo' }), 'yo');
});

test('the flood limiter keeps a gap, a burst cap, and each sender separately', () => {
  const l = new ChatLimiter({ gapMs: 500, burst: 3, windowMs: 5000 });
  assert.equal(l.allow('a', 0), true);
  assert.equal(l.allow('a', 100), false, 'too soon');
  assert.equal(l.allow('b', 100), true, 'someone else is unaffected');
  assert.equal(l.allow('a', 600), true);
  assert.equal(l.allow('a', 1200), true);
  assert.equal(l.allow('a', 1800), false, 'burst of three within the window');
  assert.equal(l.allow('a', 5700), true, 'window has passed');
  l.forget('a');
  assert.equal(l.allow('a', 5701), true);
});

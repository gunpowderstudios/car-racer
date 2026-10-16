// Multiplayer chat screens: a chat box in the lobby, and while driving a chat button + quick-chat sheet, a short
// message feed and speech bubbles over other players' cars. All text is shown with textContent, never as HTML.
// The words themselves come from chat.js; sending and who-is-who are handed in by main.js.
import { QUICK_CHATS, MAX_CHAT_LEN, chatWords } from './chat.js';

const FEED_MS = 8000, FEED_MAX = 4, LOG_MAX = 40;

export function createChatUI({ send, nameOf, colorOf, isSelf, bubble, getMode, toast }) {
  const root = document.documentElement;      // flags live on <html>: main.js rewrites <body class> on every mode change
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // ---------------------------------------------------------------- shared bits
  function sendMsg(msg) {
    const ok = send(msg);
    if (!ok) toast('Slow down a little - one message at a time.');
    return ok;
  }
  function grid(onPick) {
    const g = el('div', 'chat-grid');
    QUICK_CHATS.forEach((words, i) => {
      const b = el('button', 'chat-q', words); b.type = 'button';
      b.onclick = () => onPick(i);
      g.appendChild(b);
    });
    return g;
  }
  /** A text box + Send button. Typing here must never drive the car, so key events stop at the input. */
  function textRow(onSend) {
    const row = el('div', 'chat-row');
    const input = el('input'); input.type = 'text'; input.maxLength = MAX_CHAT_LEN; input.placeholder = 'Say something\u2026';
    input.autocomplete = 'off'; input.enterKeyHint = 'send'; input.setAttribute('aria-label', 'Chat message');
    const btn = el('button', 'btn ghost chat-send', 'Send'); btn.type = 'button';
    const go = () => { const x = input.value; if (!x.trim()) return; if (sendMsg({ x })) { input.value = ''; onSend(); } };
    btn.onclick = go;
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); go(); } else if (e.key === 'Escape') { input.blur(); closePanel(); } });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    row.append(input, btn);
    return { row, input };
  }
  function line(id, words) {
    const d = el('div', 'chat-line');
    const who = el('b', null, isSelf(id) ? 'You' : nameOf(id)); who.style.color = colorOf(id);
    d.append(who, el('span', null, ' ' + words));
    return d;
  }

  // ---------------------------------------------------------------- lobby
  const lobby = document.getElementById('mp-lobby');
  const lobbyBox = el('div', 'chat-box'); lobbyBox.id = 'mp-chat';
  const log = el('div', 'chat-log'); log.setAttribute('aria-live', 'polite');
  const lobbyText = textRow(() => {});
  const details = el('details', 'chat-quick'); details.appendChild(el('summary', null, 'Quick chat'));
  details.appendChild(grid((i) => sendMsg({ q: i })));
  lobbyBox.append(log, lobbyText.row, details);
  const anchor = document.getElementById('mp-players');
  if (lobby && anchor) anchor.after(lobbyBox);

  // ---------------------------------------------------------------- driving
  const feed = el('div', 'chat-feed'); feed.id = 'chat-feed'; feed.setAttribute('aria-hidden', 'true');
  const openBtn = el('button', null); openBtn.id = 'chat-btn'; openBtn.type = 'button'; openBtn.setAttribute('aria-label', 'Chat');
  openBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H11l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="currentColor"/></svg>';
  const panel = el('div', null); panel.id = 'chat-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Chat');
  const head = el('div', 'chat-head'); head.appendChild(el('span', null, 'Quick chat'));
  const close = el('button', 'chat-close', '\u00d7'); close.type = 'button'; close.setAttribute('aria-label', 'Close chat'); close.onclick = () => closePanel();
  head.appendChild(close);
  const panelText = textRow(() => closePanel());
  panel.append(head, grid((i) => { if (sendMsg({ q: i })) closePanel(); }), panelText.row);
  document.body.append(feed, openBtn, panel);

  function openPanel() { if (getMode() === 'off') return; panel.hidden = false; root.classList.add('chat-open'); }
  function closePanel() { panel.hidden = true; root.classList.remove('chat-open'); if (document.activeElement && document.activeElement.blur && panel.contains(document.activeElement)) document.activeElement.blur(); }
  openBtn.onclick = () => (panel.hidden ? openPanel() : closePanel());
  // Desktop: T opens chat while driving in a multiplayer game (not mapped to anything else).
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyT' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!root.classList.contains('mp-on') || !document.body.classList.contains('mode-drive')) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    e.preventDefault(); openPanel(); if (getMode() === 'all') panelText.input.focus();
  });

  // ---------------------------------------------------------------- public
  function applyMode() {
    const m = getMode();
    root.classList.toggle('chat-off', m === 'off');
    root.classList.toggle('chat-quick-only', m === 'quick');
    if (m === 'off') closePanel();
  }
  return {
    /** Turn the chat screens on while in a room (lobby or race), off when leaving. */
    setActive(on) {
      root.classList.toggle('mp-on', !!on);
      if (!on) { closePanel(); log.textContent = ''; feed.textContent = ''; }
      applyMode();
    },
    applyMode,
    /** A message arrived (or you sent one). `m` has already been checked: {q} or {x}. */
    receive(id, m) {
      const mode = getMode();
      if (mode === 'off' || (m.x != null && mode === 'quick' && !isSelf(id))) return;
      const words = chatWords(m);
      if (!words) return;
      log.appendChild(line(id, words));
      while (log.childNodes.length > LOG_MAX) log.removeChild(log.firstChild);
      log.scrollTop = log.scrollHeight;
      if (document.body.classList.contains('mode-drive')) {
        const d = line(id, words); feed.appendChild(d);
        while (feed.childNodes.length > FEED_MAX) feed.removeChild(feed.firstChild);
        setTimeout(() => d.remove(), FEED_MS);
        if (!isSelf(id)) bubble(id, words);
      }
    },
    openPanel, closePanel,
  };
}

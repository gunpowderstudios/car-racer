// End-of-race celebration shared by solo and multiplayer.
// Every local finish gets one large centred message above the waving checkered flag.
// The crowd cheer remains first-place only.
let audio = null;
let hideTimer = null;

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}TH`;
  return `${n}${n % 10 === 1 ? 'ST' : n % 10 === 2 ? 'ND' : n % 10 === 3 ? 'RD' : 'TH'}`;
}

function ensureCelebration() {
  let wrap = document.getElementById('race-finish-celebration');
  if (wrap) return wrap;

  wrap = document.createElement('div');
  wrap.id = 'race-finish-celebration';
  wrap.hidden = true;
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = `
    <div class="race-finish-title"></div>
    <div class="race-finish-sub"></div>
    <div class="race-finish-flag" aria-hidden="true">
      <svg viewBox="0 0 180 120" role="presentation">
        <defs>
          <pattern id="race-checkers" width="30" height="30" patternUnits="userSpaceOnUse">
            <rect width="15" height="15" fill="#fff"/>
            <rect x="15" y="15" width="15" height="15" fill="#fff"/>
            <rect x="15" width="15" height="15" fill="#111"/>
            <rect y="15" width="15" height="15" fill="#111"/>
          </pattern>
        </defs>
        <path class="race-finish-cloth" d="M28 15 C70 3 108 28 155 13 L155 82 C111 98 71 72 28 86 Z" fill="url(#race-checkers)"/>
        <rect x="18" y="8" width="10" height="104" rx="5" fill="#f6d9b0"/>
      </svg>
    </div>`;
  document.getElementById('hud')?.appendChild(wrap);

  if (!document.getElementById('race-finish-celebration-style')) {
    const style = document.createElement('style');
    style.id = 'race-finish-celebration-style';
    style.textContent = `
#race-finish-celebration{position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);z-index:80;pointer-events:none;width:min(900px,94vw);text-align:center;filter:drop-shadow(0 12px 20px rgba(0,0,0,.5))}
#race-finish-celebration[hidden]{display:none}
.race-finish-title{font-family:"Big Shoulders Display",Impact,Arial,sans-serif;font-weight:900;font-size:clamp(58px,10vw,126px);line-height:.82;letter-spacing:.01em;white-space:nowrap;text-transform:uppercase;color:#ffb31f;text-shadow:5px 5px 0 #e8392c,9px 9px 0 rgba(27,18,51,.92);transform:skewX(-7deg)}
.race-finish-sub{margin:18px 0 4px;font-family:"Barlow Condensed",Arial,sans-serif;font-weight:800;font-size:clamp(18px,2.4vw,28px);letter-spacing:.12em;text-transform:uppercase;color:#f6d9b0;text-shadow:2px 2px 0 rgba(27,18,51,.9)}
.race-finish-flag{width:min(340px,48vw);margin:0 auto;transform-origin:18px 60px;animation:raceFlagPole .7s ease-in-out infinite alternate}
.race-finish-flag svg{display:block;width:100%;height:auto;overflow:visible}
.race-finish-cloth{transform-origin:28px 50%;animation:raceFlagWave .55s ease-in-out infinite alternate}
html.race-finish-active #solo-race-finish,
html.race-finish-active #mp-race-finish,
html.race-finish-active #banner,
html.race-finish-active #derby-score,
html.race-finish-active #dmg-card,
html.race-finish-active #feed{display:none!important}
@keyframes raceFlagPole{from{transform:rotate(-7deg)}to{transform:rotate(7deg)}}
@keyframes raceFlagWave{from{transform:skewY(-4deg) scaleX(.96)}to{transform:skewY(5deg) scaleX(1.03)}}
@media(max-width:600px){#race-finish-celebration{top:47%;width:96vw}.race-finish-title{font-size:clamp(46px,13vw,78px);text-shadow:4px 4px 0 #e8392c,7px 7px 0 rgba(27,18,51,.92)}.race-finish-sub{margin-top:14px;font-size:17px}.race-finish-flag{width:min(260px,60vw)}}
@media(prefers-reduced-motion:reduce){.race-finish-flag,.race-finish-cloth{animation:none}}
`;
    document.head.appendChild(style);
  }
  return wrap;
}

function playCrowd() {
  try {
    if (localStorage.getItem('cr.sfx') === '0') return;
    if (!audio) {
      audio = new Audio('sounds/crowd.mp3');
      audio.preload = 'auto';
      audio.volume = 0.7;
    }
    audio.pause();
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch { /* celebration audio is optional */ }
}

function celebrate(result = {}) {
  const place = Math.max(1, Math.round(Number(result.place) || 1));
  const total = Math.max(place, Math.round(Number(result.total) || place));
  const wrap = ensureCelebration();
  if (!wrap) return;

  const title = wrap.querySelector('.race-finish-title');
  const sub = wrap.querySelector('.race-finish-sub');
  title.textContent = place === 1 ? "YOU'VE WON!" : `YOU CAME ${ordinal(place)}!`;
  sub.textContent = place === 1
    ? `${result.laps || 1}-LAP RACE WINNER`
    : (total > 1 ? `RACE COMPLETE · ${place} OF ${total}` : 'RACE COMPLETE');

  document.documentElement.classList.add('race-finish-active');
  wrap.hidden = false;
  if (place === 1) playCrowd();
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    wrap.hidden = true;
    document.documentElement.classList.remove('race-finish-active');
  }, 4500);
}

window.addEventListener('carracer-player-finish', (e) => celebrate(e.detail));

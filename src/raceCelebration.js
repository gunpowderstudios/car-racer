// Player-win celebration shared by solo and multiplayer.
// Plays the crowd cheer once and shows a big Wreck-'em-all-style win banner above a waving checkered flag.
let audio = null;
let hideTimer = null;

function ensureCelebration() {
  let wrap = document.getElementById('race-win-celebration');
  if (wrap) return wrap;

  wrap = document.createElement('div');
  wrap.id = 'race-win-celebration';
  wrap.hidden = true;
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = `
    <div class="race-win-title">YOU'VE WON!</div>
    <div class="race-win-flag" aria-hidden="true">
      <svg viewBox="0 0 180 120" role="presentation">
        <defs>
          <pattern id="race-checkers" width="30" height="30" patternUnits="userSpaceOnUse">
            <rect width="15" height="15" fill="#fff"/>
            <rect x="15" y="15" width="15" height="15" fill="#fff"/>
            <rect x="15" width="15" height="15" fill="#111"/>
            <rect y="15" width="15" height="15" fill="#111"/>
          </pattern>
        </defs>
        <path class="race-win-cloth" d="M28 15 C70 3 108 28 155 13 L155 82 C111 98 71 72 28 86 Z" fill="url(#race-checkers)"/>
        <rect x="18" y="8" width="10" height="104" rx="5" fill="#f6d9b0"/>
      </svg>
    </div>`;
  document.getElementById('hud')?.appendChild(wrap);

  if (!document.getElementById('race-win-celebration-style')) {
    const style = document.createElement('style');
    style.id = 'race-win-celebration-style';
    style.textContent = `
#race-win-celebration{position:absolute;left:50%;top:20%;transform:translateX(-50%);z-index:50;pointer-events:none;width:min(760px,92vw);text-align:center;filter:drop-shadow(0 10px 18px rgba(0,0,0,.45))}
#race-win-celebration[hidden]{display:none}
.race-win-title{font-family:"Big Shoulders Display",Impact,Arial,sans-serif;font-weight:900;font-size:clamp(64px,11vw,132px);line-height:.82;letter-spacing:.015em;white-space:nowrap;text-transform:uppercase;color:#ffb31f;text-shadow:5px 5px 0 #e8392c,9px 9px 0 rgba(27,18,51,.9);transform:skewX(-7deg);margin-bottom:14px}
.race-win-flag{width:min(360px,52vw);margin:0 auto;transform-origin:18px 60px;animation:raceFlagPole .7s ease-in-out infinite alternate}
.race-win-flag svg{display:block;width:100%;height:auto;overflow:visible}
.race-win-cloth{transform-origin:28px 50%;animation:raceFlagWave .55s ease-in-out infinite alternate}
html.race-win-active #solo-race-finish,html.race-win-active #mp-race-finish{display:none!important}
@keyframes raceFlagPole{from{transform:rotate(-7deg)}to{transform:rotate(7deg)}}
@keyframes raceFlagWave{from{transform:skewY(-4deg) scaleX(.96)}to{transform:skewY(5deg) scaleX(1.03)}}
@media(max-width:600px){#race-win-celebration{top:22%;width:96vw}.race-win-title{font-size:clamp(54px,17vw,88px);text-shadow:4px 4px 0 #e8392c,7px 7px 0 rgba(27,18,51,.9);margin-bottom:10px}.race-win-flag{width:min(270px,62vw)}}
@media(prefers-reduced-motion:reduce){.race-win-flag,.race-win-cloth{animation:none}}
`;
    document.head.appendChild(style);
  }
  return wrap;
}

function playCrowd() {
  if (localStorage.getItem('cr.sfx') === '0') return;
  try {
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

function celebrate() {
  const wrap = ensureCelebration();
  if (!wrap) return;
  document.documentElement.classList.add('race-win-active');
  wrap.hidden = false;
  playCrowd();
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    wrap.hidden = true;
    document.documentElement.classList.remove('race-win-active');
  }, 4500);
}

window.addEventListener('carracer-player-win', celebrate);

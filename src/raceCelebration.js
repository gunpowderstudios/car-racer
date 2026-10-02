// Player-win celebration shared by solo and multiplayer.
// Plays the crowd cheer once and shows a lightweight waving checkered flag overlay.
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
#race-win-celebration{position:absolute;left:50%;top:28%;transform:translateX(-50%);z-index:21;pointer-events:none;width:min(320px,54vw);filter:drop-shadow(0 8px 14px rgba(0,0,0,.35))}
#race-win-celebration[hidden]{display:none}
.race-win-flag{transform-origin:18px 60px;animation:raceFlagPole .7s ease-in-out infinite alternate}
.race-win-flag svg{display:block;width:100%;height:auto;overflow:visible}
.race-win-cloth{transform-origin:28px 50%;animation:raceFlagWave .55s ease-in-out infinite alternate}
@keyframes raceFlagPole{from{transform:rotate(-7deg)}to{transform:rotate(7deg)}}
@keyframes raceFlagWave{from{transform:skewY(-4deg) scaleX(.96)}to{transform:skewY(5deg) scaleX(1.03)}}
@media(max-width:600px){#race-win-celebration{top:30%;width:min(240px,58vw)}}
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
  wrap.hidden = false;
  playCrowd();
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { wrap.hidden = true; }, 4500);
}

window.addEventListener('carracer-player-win', celebrate);

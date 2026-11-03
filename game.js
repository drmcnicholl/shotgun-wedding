// Shotgun Wedding — main game script
// All tunable numbers live in CONFIG below.

'use strict';

// ─────────────────────────────────────────────
// CONFIG — every tunable number lives here
// ─────────────────────────────────────────────
const CONFIG = {
  // Round
  roundDuration: 60,          // seconds
  warningTime: 10,            // last N seconds show pulsing timer

  // Canvas layout (logical pixels, portrait)
  canvasW: 390,
  canvasH: 720,
  windowFrac: 0.62,           // top portion = window / scene

  // Deer
  doePoints: 100,
  buckPoints: 250,
  farBonus: 1.5,              // multiplier for far deer
  farThreshold: 0.35,         // y < windowH * threshold → "far"
  buckChance: 0.25,
  grazeMinSec: 3,
  grazeMaxSec: 5,
  alertDuration: 1.5,         // seconds before alert deer leave
  spookSpeed: 380,            // px/s when spooked
  walkSpeed: 60,              // px/s normal walk
  maxDeerEarly: 2,
  maxDeerLate: 5,
  spawnMinSec: 2.5,
  spawnMaxSec: 4.0,
  spawnMinLate: 0.8,
  spawnMaxLate: 1.6,
  grazeMinLate: 1.2,
  grazeMaxLate: 2.5,
  fussyAlertIntervalLate: 1.0,
  diaperFillSecLate: 12,
  hungerFillSecLate: 12,
  walkSpeedLate: 90,

  // Shooting
  maxAmmo: 3,
  reloadTime: 1.5,            // seconds
  reloadTimeFeed: 3.0,        // seconds while feeding
  shotRadius: 48,             // hit detection radius in logical px
  alertRadius: 220,           // radius for shot-alerting nearby deer
  wobbleOffset: 40,           // max px offset when feeding

  // Streak
  streakBonus: 25,            // pts per consecutive hit
  streakMax: 100,             // max streak bonus

  // Baby
  hungerFillSec: 20,          // seconds to go 0→100%
  diaperFillSec: 30,          // seconds to go 0→100%
  diaperJumpChance: 0.008,    // per frame chance of random +jump
  diaperJumpMax: 12,          // max % of random jump
  fussyThreshold: 0.60,
  cryThreshold: 1.00,
  fussyAlertInterval: 3.0,    // seconds between random alerts from fussy baby
  cryPenaltyPerSec: 10,       // points/sec while crying

  // Feed
  feedDrainSec: 4,            // seconds to drain hunger to 0

  // Change
  changeDuration: 2.0,        // hold seconds to complete change

  // Happy Baby Bonus
  happyBonusPerPct: 5,        // multiplier: (notCryingFraction * 100) * this

  // Score thresholds for results titles
  scoreTitles: [
    { min: 0,    title: 'Fell Asleep in the Blind' },
    { min: 300,  title: 'Diaper Duty Champion' },
    { min: 900,  title: 'Weekend Warrior Mama' },
    { min: 1800, title: 'Locked, Loaded & Burped' },
    { min: 2800, title: 'Legend of the Tree Line' },
  ],
  funnyLines: [
    'Baby rating: ⭐⭐⭐⭐ — would nap here again',
    'The deer have filed a complaint',
    'Somebody get this woman a nap',
    'Certified one-handed sharpshooter',
    'Baby was surprisingly chill about the gunshots',
    'Nature documentary potential: extremely high',
    'The NRA has questions. The PTA has more.',
  ],

  // Visual
  deerFarScale: 0.60,         // scale for far deer
  deerNearScale: 1.0,
  screenShakePx: 6,           // px of screen shake on shot
  screenShakeDecay: 0.85,

  // Colors
  skyDawn:    '#f7c59f',
  skyMorning: '#87ceeb',
  panelColor: '#f5e6c8',
  buttonOrange: '#e8620a',
  buttonShadow: '#a33d00',
  greenDark:  '#2d5a1b',
  greenMid:   '#3d7a25',
  greenLight: '#5aad3a',
  brown:      '#6b3a1f',
  tan:        '#c4924a',
};

// ─────────────────────────────────────────────
// GLOBALS
// ─────────────────────────────────────────────
const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');

let dpr = 1;
let logW = CONFIG.canvasW;
let logH = CONFIG.canvasH;
let windowH; // height of the scene window portion

// Game state machine
const STATE = { TITLE: 'title', HOWTO: 'howto', GAME: 'game', RESULTS: 'results' };
let state = STATE.TITLE;

// How-to screen state
let howtoCard = 0;

// Audio
let audioCtx = null;
let muted = false;

// Input
let pointerDown = false;
let pointerX = 0, pointerY = 0;
let aimX = -999, aimY = -999;   // crosshair position in logical coords
let aimInScene = false;          // true when pointer is over the scene window
let changePressStart = 0;
let changePressing   = false;
let changeProgress   = 0;
let changingPointerId = null;    // pointer ID that started the hold
let feedActive = false;
let reloadProgress = 0;   // 0..1
let reloadActive = false;
let reloadStart = 0;
let emptyFlashTimer = 0;  // seconds — RELOAD button flashes when firing empty

// Game
let score = 0;
let timeLeft = CONFIG.roundDuration;
let lastTimestamp = 0;
let roundStarted = false;
let gameOver = false;

// Ammo
let ammo = CONFIG.maxAmmo;

// Deer
let deer = [];
let nextSpawnIn = 1.5; // seconds until next deer

// Baby
let hunger = 0;
let diaper = 0;
let cryingTime = 0;       // total seconds baby spent crying this round
let roundTotal = CONFIG.roundDuration;
let fussyAlertTimer = 0;
let babyMood = 'content'; // 'content','fussy','crying'

// Streak
let streak = 0;

// Screen shake
let shakeX = 0, shakeY = 0;

// Pop-ups (score +N text)
let popups = [];

// Clouds
let clouds = [];

// Pre-game countdown (3-2-1-GO before deer spawn)
let pregame = false;
let pregameTimer = 0; // counts up; show "3" at <1, "2" at <2, "1" at <3, "GO!" at <3.6

// Score flash (HUD pulses yellow on a hit)
let scoreFlash = 0;

// Result
let finalScore = 0;
let deerBagged = 0;
let happyBonus = 0;
let resultFunnyLine = '';

// ─────────────────────────────────────────────
// CANVAS SETUP & RESIZE
// ─────────────────────────────────────────────
function setupCanvas() {
  dpr = window.devicePixelRatio || 1;

  // Fit portrait canvas into viewport
  const maxW = Math.min(window.innerWidth, CONFIG.canvasW * 2);
  const maxH = window.innerHeight;

  let cssW = CONFIG.canvasW;
  let cssH = CONFIG.canvasH;

  // Scale to fit viewport maintaining aspect ratio
  const scaleW = maxW / cssW;
  const scaleH = maxH / cssH;
  const scale  = Math.min(scaleW, scaleH, 1); // never upscale beyond natural on desktop

  // Actually, for mobile we DO want to upscale to fill screen
  const scaleFill = Math.min(maxW / cssW, maxH / cssH);
  cssW = Math.round(CONFIG.canvasW * scaleFill);
  cssH = Math.round(CONFIG.canvasH * scaleFill);

  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  // We always draw in logical CONFIG coords; apply one transform
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr * scaleFill, dpr * scaleFill);

  logW = CONFIG.canvasW;
  logH = CONFIG.canvasH;
  windowH = Math.round(logH * CONFIG.windowFrac);

  initClouds();
}

window.addEventListener('resize', setupCanvas);

// ─────────────────────────────────────────────
// AUDIO
// ─────────────────────────────────────────────
function ensureAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playSound(type) {
  if (muted || !audioCtx) return;
  const ac = audioCtx;
  const now = ac.currentTime;

  if (type === 'shot') {
    // Noise burst (high freq) + low thump
    const buf = ac.createBuffer(1, ac.sampleRate * 0.15, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.6, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    // low thump
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.8, now);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    src.connect(g); g.connect(ac.destination);
    osc.connect(g2); g2.connect(ac.destination);
    src.start(now); src.stop(now + 0.15);
    osc.start(now); osc.stop(now + 0.15);

  } else if (type === 'click') {
    const osc = ac.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, now);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.15, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(g); g.connect(ac.destination);
    osc.start(now); osc.stop(now + 0.05);

  } else if (type === 'reload') {
    // chk-chk: two short clicks
    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.12;
      const osc = ac.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(300 - i * 80, t);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(g); g.connect(ac.destination);
      osc.start(t); osc.stop(t + 0.09);
    }

  } else if (type === 'snort') {
    const buf = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / ac.sampleRate;
      data[i] = (Math.random() * 2 - 1) * 0.4 * Math.exp(-t * 15) * Math.sin(2 * Math.PI * 180 * t);
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain(); g.gain.value = 0.5;
    src.connect(g); g.connect(ac.destination);
    src.start(now);

  } else if (type === 'waah') {
    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(350, now);
    osc.frequency.linearRampToValueAtTime(220, now + 0.3);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(g); g.connect(ac.destination);
    osc.start(now); osc.stop(now + 0.35);

  } else if (type === 'cry') {
    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.setValueAtTime(260, now + 0.2);
    osc.frequency.setValueAtTime(380, now + 0.4);
    osc.frequency.setValueAtTime(260, now + 0.6);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.4, now);
    g.gain.setValueAtTime(0.4, now + 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc.connect(g); g.connect(ac.destination);
    osc.start(now); osc.stop(now + 0.8);

  } else if (type === 'coo') {
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.linearRampToValueAtTime(600, now + 0.15);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(g); g.connect(ac.destination);
    osc.start(now); osc.stop(now + 0.25);

  } else if (type === 'fanfare') {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const t = now + i * 0.12;
      const osc = ac.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(g); g.connect(ac.destination);
      osc.start(t); osc.stop(t + 0.22);
    });
  }
}

// ─────────────────────────────────────────────
// CLOUDS
// ─────────────────────────────────────────────
function initClouds() {
  clouds = [];
  for (let i = 0; i < 3; i++) {
    clouds.push({
      x: Math.random() * logW,
      y: 18 + Math.random() * (windowH * 0.3),
      w: 60 + Math.random() * 60,
      speed: 8 + Math.random() * 6,
    });
  }
}

function updateClouds(dt) {
  clouds.forEach(c => {
    c.x += c.speed * dt;
    if (c.x - c.w / 2 > logW + 60) c.x = -c.w / 2 - 10;
  });
}

// ─────────────────────────────────────────────
// DEER
// ─────────────────────────────────────────────
function createDeer() {
  const pressure = 1 - (timeLeft / CONFIG.roundDuration);
  const effectiveMaxDeer = Math.round(CONFIG.maxDeerEarly + pressure * (CONFIG.maxDeerLate - CONFIG.maxDeerEarly));
  if (deer.length >= effectiveMaxDeer) return;
  if (babyMood === 'crying') return;

  const isBuck = Math.random() < CONFIG.buckChance;
  const fromLeft = Math.random() < 0.5;
  const isFar = Math.random() < 0.4;
  const minY = isFar ? windowH * 0.22 : windowH * 0.42;
  const maxY = isFar ? windowH * 0.40 : windowH * 0.72;
  const y = minY + Math.random() * (maxY - minY);
  const scale = isFar ? CONFIG.deerFarScale : CONFIG.deerNearScale;
  const startX = fromLeft ? -60 * scale : logW + 60 * scale;
  const targetX = logW * 0.15 + Math.random() * logW * 0.70;

  // Graze duration: lerp between early and late ranges
  const grazeMin = CONFIG.grazeMinSec + pressure * (CONFIG.grazeMinLate - CONFIG.grazeMinSec);
  const grazeMax = CONFIG.grazeMaxSec + pressure * (CONFIG.grazeMaxLate - CONFIG.grazeMaxSec);
  const grazeDuration = grazeMin + Math.random() * (grazeMax - grazeMin);

  // Walk speed: lerp toward walkSpeedLate
  const effectiveWalkSpeed = CONFIG.walkSpeed + pressure * (CONFIG.walkSpeedLate - CONFIG.walkSpeed);

  deer.push({
    id: Date.now() + Math.random(),
    x: startX,
    y,
    scale,
    isBuck,
    isFar,
    fromLeft,
    state: 'walking',
    grazeTimer: 0,
    grazeDuration,
    alertTimer: 0,
    targetX,
    walkDir: fromLeft ? 1 : -1,
    hitTimer: 0,
    flashTimer: 0,
    frame: 0,
    frameTimer: 0,
    opacity: 1,
    alertBubble: false,
    walkSpeed: effectiveWalkSpeed,
  });
}

function updateDeer(dt) {
  const pressure = 1 - (timeLeft / CONFIG.roundDuration);
  const effectiveMaxDeer = Math.round(CONFIG.maxDeerEarly + pressure * (CONFIG.maxDeerLate - CONFIG.maxDeerEarly));

  // Spawn
  nextSpawnIn -= dt;
  if (nextSpawnIn <= 0 && babyMood !== 'crying') {
    createDeer();
    const minI = CONFIG.spawnMinSec + pressure * (CONFIG.spawnMinLate - CONFIG.spawnMinSec);
    const maxI = CONFIG.spawnMaxSec + pressure * (CONFIG.spawnMaxLate - CONFIG.spawnMaxSec);
    nextSpawnIn = minI + Math.random() * (maxI - minI);
  }

  deer = deer.filter(d => {
    // Remove fully faded dead deer
    if (d.state === 'dead' && d.opacity <= 0) return false;
    // Remove deer that walked off screen
    if (d.state === 'spooked') {
      if (d.x < -120 || d.x > logW + 120) return false;
    }
    return true;
  });

  deer.forEach(d => {
    // Flash timer decay
    if (d.flashTimer > 0) {
      d.flashTimer -= dt;
      if (d.flashTimer < 0) d.flashTimer = 0;
    }

    // Walk animation
    d.frameTimer += dt;
    if (d.frameTimer > 0.25) { d.frameTimer = 0; d.frame ^= 1; }

    if (d.state === 'walking') {
      const dx = d.targetX - d.x;
      if (Math.abs(dx) < 4) {
        d.x = d.targetX;
        d.state = 'grazing';
        d.grazeTimer = 0;
      } else {
        d.x += Math.sign(dx) * d.walkSpeed * d.scale * dt;
        d.walkDir = Math.sign(dx);
      }
    } else if (d.state === 'grazing') {
      d.grazeTimer += dt;
      if (d.grazeTimer >= d.grazeDuration) {
        // Walk off
        d.targetX = d.fromLeft ? logW + 80 * d.scale : -80 * d.scale;
        d.walkDir = d.fromLeft ? -1 : 1; // walk back the way it came — actually walk off opposite
        // Deer walk toward nearest edge
        d.targetX = d.x < logW / 2 ? -80 : logW + 80;
        d.walkDir = d.targetX < d.x ? -1 : 1;
        d.state = 'walking';
      }
    } else if (d.state === 'alert') {
      d.alertTimer += dt;
      if (d.alertTimer >= CONFIG.alertDuration) {
        spookDeer(d);
      }
    } else if (d.state === 'spooked') {
      const dir = d.x < logW / 2 ? -1 : 1;
      d.x += dir * CONFIG.spookSpeed * d.scale * dt;
    } else if (d.state === 'hit') {
      d.hitTimer += dt;
      if (d.hitTimer > 0.5) {
        d.state = 'dead';
      }
    } else if (d.state === 'dead') {
      d.opacity -= dt * 1.2;
      if (d.opacity < 0) d.opacity = 0;
    }
  });
}

function alertDeer(d) {
  if (d.state === 'walking' || d.state === 'grazing') {
    d.state = 'alert';
    d.alertTimer = 0;
  }
}

function spookDeer(d) {
  if (d.state !== 'hit' && d.state !== 'dead') {
    d.state = 'spooked';
    playSound('snort');
  }
}

function spookAll() {
  deer.forEach(d => spookDeer(d));
}

function alertNearby(sx, sy) {
  deer.forEach(d => {
    const dx = d.x - sx, dy = d.y - sy;
    if (Math.sqrt(dx*dx + dy*dy) < CONFIG.alertRadius) {
      alertDeer(d);
    }
  });
}

// ─────────────────────────────────────────────
// SHOOTING
// ─────────────────────────────────────────────
function shoot(lx, ly) {
  if (reloadActive) return;
  if (ammo <= 0) {
    playSound('click');
    emptyFlashTimer = 0.45; // flash RELOAD button
    return;
  }

  ammo--;
  playSound('shot');
  shakeX = CONFIG.screenShakePx;
  shakeY = CONFIG.screenShakePx * 0.5;
  ensureAudio();

  // Auto-reload when last bullet was just fired
  if (ammo === 0) startReload();

  // Apply wobble if feeding
  let tx = lx, ty = ly;
  if (feedActive) {
    tx += (Math.random() * 2 - 1) * CONFIG.wobbleOffset;
    ty += (Math.random() * 2 - 1) * CONFIG.wobbleOffset;
  }

  // Check hits (sorted by closest to tap)
  const shootableStates = ['walking', 'grazing', 'alert'];
  let hit = null;
  let bestDist = CONFIG.shotRadius * 2;

  deer.forEach(d => {
    if (!shootableStates.includes(d.state)) return;
    // Hit box centered on deer body
    const bx = d.x;
    const by = d.y - 18 * d.scale;
    const dist = Math.sqrt((tx - bx) ** 2 + (ty - by) ** 2);
    if (dist < CONFIG.shotRadius * d.scale && dist < bestDist) {
      bestDist = dist;
      hit = d;
    }
  });

  if (hit) {
    // Score
    let pts = hit.isBuck ? CONFIG.buckPoints : CONFIG.doePoints;
    if (hit.isFar) pts = Math.round(pts * CONFIG.farBonus);
    streak = Math.min(streak + 1, 4); // max 4 for max +100
    const streakPts = Math.min(streak * CONFIG.streakBonus, CONFIG.streakMax);
    pts += streakPts;
    score = Math.round(score + pts);
    scoreFlash = 0.45;
    deerBagged++;

    hit.state = 'hit';
    hit.hitTimer = 0;
    hit.flashTimer = 0.18;

    // Pop-up
    popups.push({
      x: hit.x, y: hit.y - 30 * hit.scale,
      text: '+' + pts, timer: 1.4, opacity: 1,
    });

    playSound('coo');
  } else {
    // Miss
    streak = 0;
    // Dirt puff popup
    popups.push({ x: tx, y: ty, text: '·', timer: 0.5, opacity: 1, isDirt: true });
    // Alert nearby deer
    alertNearby(tx, ty);
  }
}

// ─────────────────────────────────────────────
// RELOAD
// ─────────────────────────────────────────────
function startReload() {
  if (reloadActive) return;
  if (changePressing) return; // can't reload during diaper change
  if (ammo >= CONFIG.maxAmmo) return;
  reloadActive = true;
  reloadStart = performance.now();
  reloadProgress = 0;
}

function updateReload(dt) {
  if (!reloadActive) return;
  const duration = feedActive ? CONFIG.reloadTimeFeed : CONFIG.reloadTime;
  reloadProgress += dt / duration;
  if (reloadProgress >= 1) {
    reloadProgress = 1;
    ammo = CONFIG.maxAmmo;
    reloadActive = false;
    reloadProgress = 0;
    playSound('reload');
  }
}

// ─────────────────────────────────────────────
// BABY
// ─────────────────────────────────────────────
let lastCryingState = false;
let cryingSoundTimer = 0;
let waahTimer = 0;

function updateBaby(dt) {
  const pressure = 1 - (timeLeft / CONFIG.roundDuration);

  // Effective fill rates with pressure escalation
  const effectiveHungerFillSec = CONFIG.hungerFillSec + pressure * (CONFIG.hungerFillSecLate - CONFIG.hungerFillSec);
  const effectiveDiaperFillSec = CONFIG.diaperFillSec + pressure * (CONFIG.diaperFillSecLate - CONFIG.diaperFillSec);
  const effectiveFussyAlertInterval = CONFIG.fussyAlertInterval + pressure * (CONFIG.fussyAlertIntervalLate - CONFIG.fussyAlertInterval);

  // Hunger
  if (feedActive) {
    hunger -= (100 / CONFIG.feedDrainSec) * dt;
    if (hunger <= 0) {
      hunger = 0;
      feedActive = false;
    }
  } else {
    hunger += (100 / effectiveHungerFillSec) * dt;
    if (hunger > 100) hunger = 100;
  }

  // Diaper
  diaper += (100 / effectiveDiaperFillSec) * dt;
  if (Math.random() < CONFIG.diaperJumpChance) {
    diaper += Math.random() * CONFIG.diaperJumpMax;
  }
  if (diaper > 100) diaper = 100;

  // Mood
  const higher = Math.max(hunger, diaper);
  const prevMood = babyMood;
  if (higher >= 100) {
    babyMood = 'crying';
  } else if (higher >= CONFIG.fussyThreshold * 100) {
    // Can't cry from hunger while feeding
    if (hunger >= 100 && feedActive) {
      babyMood = 'fussy';
    } else {
      babyMood = 'fussy';
    }
  } else {
    babyMood = 'content';
  }

  // Prevent crying from hunger while feeding (unless diaper is full)
  if (feedActive && diaper < 100 && babyMood === 'crying' && hunger >= 100) {
    babyMood = 'fussy';
    hunger = 99.9;
  }

  // Cry consequences
  if (babyMood === 'crying') {
    if (prevMood !== 'crying') {
      // Just started crying
      spookAll();
      nextSpawnIn = Math.max(nextSpawnIn, 3); // pause spawning
      playSound('cry');
    }
    score = Math.max(0, Math.round(score - CONFIG.cryPenaltyPerSec * dt));
    cryingTime += dt;
    // Repeat cry sound periodically
    cryingSoundTimer -= dt;
    if (cryingSoundTimer <= 0) {
      playSound('cry');
      cryingSoundTimer = 1.2;
    }
    // No deer spawn while crying (handled in updateDeer)
  } else {
    cryingSoundTimer = 0;
  }

  // Fussy: random deer alert
  if (babyMood === 'fussy') {
    fussyAlertTimer -= dt;
    if (fussyAlertTimer <= 0) {
      fussyAlertTimer = effectiveFussyAlertInterval;
      // Alert one random grazing/walking deer
      const targets = deer.filter(d => d.state === 'walking' || d.state === 'grazing');
      if (targets.length > 0) {
        alertDeer(targets[Math.floor(Math.random() * targets.length)]);
        playSound('waah');
      }
    }
    // Waah bubbles
    waahTimer -= dt;
    if (waahTimer <= 0) {
      waahTimer = 2.5 + Math.random();
    }
  }
}

// ─────────────────────────────────────────────
// CHANGE DIAPER
// ─────────────────────────────────────────────
function updateChange(dt) {
  if (!changePressing) {
    changeProgress = 0;
    return;
  }
  if (reloadActive) {
    // Can't change during reload — but spec says can't reload during change;
    // if change starts while reload is in progress, cancel reload
    reloadActive = false;
  }
  changeProgress += dt / CONFIG.changeDuration;
  if (changeProgress >= 1) {
    changeProgress = 0;
    changePressing = false;
    diaper = 0;
    playSound('coo');
    popups.push({ x: logW / 2, y: windowH * 0.5, text: '✨ Changed!', timer: 1.5, opacity: 1 });
  }
}

// ─────────────────────────────────────────────
// POP-UPS
// ─────────────────────────────────────────────
function updatePopups(dt) {
  popups = popups.filter(p => p.timer > 0);
  popups.forEach(p => {
    p.timer -= dt;
    p.y -= 30 * dt;
    p.opacity = Math.min(1, p.timer * 2);
  });
}

// ─────────────────────────────────────────────
// DRAW HELPERS
// ─────────────────────────────────────────────
function drawRoundRect(x, y, w, h, r, fill, stroke, lw) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
}

// Draw a cloud at (cx, cy) with width cw
function drawCloud(cx, cy, cw) {
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  const ch = cw * 0.38;
  ctx.beginPath();
  ctx.ellipse(cx, cy, cw * 0.5, ch * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx - cw * 0.22, cy + ch * 0.05, cw * 0.28, ch * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + cw * 0.22, cy + ch * 0.05, cw * 0.28, ch * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Draw treeline silhouette row at y, from x0 to x1, dark=color, treeCount
function drawTreeline(x0, x1, baseY, treeH, color, count) {
  ctx.fillStyle = color;
  const spacing = (x1 - x0) / count;
  for (let i = 0; i < count; i++) {
    const tx = x0 + i * spacing + spacing * 0.5;
    const h = treeH * (0.8 + Math.random() * 0.4); // random heights are seeded by index
    // Use deterministic variation
    const hv = treeH * (0.75 + 0.5 * ((i * 7919) % 100) / 100);
    const wv = hv * 0.45;
    ctx.beginPath();
    ctx.moveTo(tx, baseY - hv);
    ctx.lineTo(tx - wv, baseY);
    ctx.lineTo(tx + wv, baseY);
    ctx.closePath();
    ctx.fill();
    // trunk
    ctx.fillRect(tx - wv * 0.12, baseY, wv * 0.24, hv * 0.3);
  }
}

// ─────────────────────────────────────────────
// DRAW BACKGROUND (scene window)
// ─────────────────────────────────────────────
function drawBackground() {
  const progress = 1 - (timeLeft / CONFIG.roundDuration);

  // Sky gradient: dawn (pink/orange) → morning (blue)
  function lerpColor(a, b, t) {
    const ah = parseInt(a.slice(1), 16);
    const bh = parseInt(b.slice(1), 16);
    const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
    const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const b2 = Math.round(ab + (bb - ab) * t);
    return `rgb(${r},${g},${b2})`;
  }

  const skyColor = lerpColor(CONFIG.skyDawn, CONFIG.skyMorning, progress);
  ctx.fillStyle = skyColor;
  ctx.fillRect(0, 0, logW, windowH);

  // Pressure tint: warm amber overlay when pressure > 0.55
  if (progress > 0.55) {
    const alpha = (progress - 0.55) / 0.45 * 0.25;
    ctx.fillStyle = `rgba(200,100,20,${alpha})`;
    ctx.fillRect(0, 0, logW, windowH);
  }

  // Clouds
  clouds.forEach(c => drawCloud(c.x, c.y, c.w));

  // Far treeline (darkest, smallest)
  drawTreeline(0, logW, windowH * 0.45, 55, CONFIG.greenDark, 18);
  // Mid treeline
  drawTreeline(0, logW, windowH * 0.55, 70, CONFIG.greenMid, 13);
  // Ground / grass strip
  ctx.fillStyle = CONFIG.greenLight;
  ctx.fillRect(0, windowH * 0.60, logW, windowH * 0.40);

  // Grass tufts
  ctx.fillStyle = CONFIG.greenDark;
  for (let i = 0; i < 14; i++) {
    const gx = ((i * 53 + 17) % 100) / 100 * logW;
    const gy = windowH * 0.60 + ((i * 37) % 100) / 100 * windowH * 0.35;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx - 4, gy - 9);
    ctx.lineTo(gx + 2, gy - 6);
    ctx.lineTo(gx + 5, gy - 10);
    ctx.lineTo(gx + 9, gy - 3);
    ctx.closePath();
    ctx.fill();
  }
}

// ─────────────────────────────────────────────
// DRAW DEER
// ─────────────────────────────────────────────
function drawDeer(d) {
  if (d.opacity <= 0) return;

  ctx.save();
  ctx.globalAlpha = d.opacity;
  ctx.translate(d.x, d.y);
  // Positive walkDir = facing right; flip horizontally when facing left
  ctx.scale(d.scale * (d.walkDir >= 0 ? 1 : -1), d.scale);

  const isHit   = d.state === 'hit';
  const grazing = d.state === 'grazing';

  if (isHit) ctx.rotate(Math.min(d.hitTimer * 3, Math.PI / 2));

  const tan      = '#c4924a';
  const tanDark  = '#a0722a';
  const brown    = CONFIG.brown;

  // ── Legs (drawn first so body covers the tops) ──────────────────
  const sw  = 4;   // leg stroke width
  const legY0 = -2, legY1 = 16;
  // walk-cycle swing
  const swing = grazing ? 1 : (d.frame === 0 ? 4 : -4);
  ctx.lineCap = 'round';
  ctx.strokeStyle = tanDark; ctx.lineWidth = sw;

  // back pair (leftmost on body)
  const bl1 = { x0:-13, x1:-13 - swing };
  const bl2 = { x0:-7,  x1:-7  + swing };
  // front pair
  const fl1 = { x0: 6,  x1: 6  + swing };
  const fl2 = { x0:12,  x1:12  - swing };

  [bl1, bl2, fl1, fl2].forEach(l => {
    ctx.beginPath(); ctx.moveTo(l.x0, legY0); ctx.lineTo(l.x1, legY1); ctx.stroke();
  });
  // Small dark hooves
  ctx.fillStyle = brown; ctx.lineWidth = 0;
  [bl1, bl2, fl1, fl2].forEach(l => {
    ctx.beginPath();
    ctx.ellipse(l.x1, legY1 + 1, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // ── White tail ───────────────────────────────────────────────────
  const tailAlpha = d.state === 'spooked' ? 1 : 0.65;
  ctx.fillStyle = `rgba(255,255,255,${tailAlpha})`;
  ctx.beginPath();
  ctx.ellipse(-19, -14, 4.5, 7, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // ── Body ─────────────────────────────────────────────────────────
  // Rump is slightly taller/rounder than the chest end
  ctx.fillStyle = tan;
  ctx.beginPath();
  // Custom body path: wider at rump, tapers toward chest
  ctx.moveTo(-19, -6);
  ctx.bezierCurveTo(-26, -6, -26, -26, -16, -26);   // rump curve
  ctx.bezierCurveTo(-4,  -28, 10,  -26, 17,  -22);  // back line
  ctx.bezierCurveTo(22,  -19, 22,  -10, 17,   -5);  // chest taper
  ctx.bezierCurveTo(10,   -1, -4,   -1, -19,  -6);  // belly
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = brown; ctx.lineWidth = 1.8; ctx.stroke();

  // Hit flash overlay on body
  if (d.flashTimer > 0) {
    ctx.fillStyle = `rgba(255,255,255,${(d.flashTimer / 0.18) * 0.8})`;
    ctx.beginPath();
    ctx.ellipse(-2, -14, 23, 13, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Neck + Head (drawn as one rotated unit from neck base) ───────
  // Neck base is at the chest end of the body
  const neckBaseX = 16, neckBaseY = -18;
  const neckAngle = grazing ? 0.85 : -0.22; // radians; positive = forward/down

  ctx.save();
  ctx.translate(neckBaseX, neckBaseY);
  ctx.rotate(neckAngle);

  // Neck: tapered filled quad
  ctx.fillStyle = tan;
  ctx.beginPath();
  ctx.moveTo(-5, 0);   ctx.lineTo(5, 0);      // base (at body)
  ctx.lineTo(4, -15);  ctx.lineTo(-4, -15);   // top (at head)
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = brown; ctx.lineWidth = 1.8; ctx.stroke();

  // Head oval
  ctx.fillStyle = tan;
  ctx.beginPath();
  ctx.ellipse(0, -21, 8, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = brown; ctx.lineWidth = 1.8; ctx.stroke();

  // Snout — deer have long muzzles; extends forward from head
  ctx.fillStyle = '#d4a86a'; // slightly lighter
  ctx.beginPath();
  ctx.ellipse(9, -19, 7, 4.5, 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = brown; ctx.lineWidth = 1.5; ctx.stroke();

  // Nostril
  ctx.fillStyle = brown;
  ctx.beginPath(); ctx.ellipse(14, -18, 1.4, 1, 0, 0, Math.PI * 2); ctx.fill();

  // Single ear (side profile = one ear visible, large and alert)
  ctx.fillStyle = '#e8a87c';
  ctx.beginPath();
  ctx.ellipse(-3, -28, 4, 9, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = brown; ctx.lineWidth = 1.5; ctx.stroke();
  // Inner ear
  ctx.fillStyle = '#f0c4a0';
  ctx.beginPath();
  ctx.ellipse(-3, -28, 2.2, 6, -0.15, 0, Math.PI * 2);
  ctx.fill();

  // Eye
  if (isHit) {
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1.8;
    const ex = 4, ey = -23;
    ctx.beginPath(); ctx.moveTo(ex-2.5, ey-2.5); ctx.lineTo(ex+2.5, ey+2.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ex+2.5, ey-2.5); ctx.lineTo(ex-2.5, ey+2.5); ctx.stroke();
  } else {
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.arc(4, -23, 2.2, 0, Math.PI * 2); ctx.fill();
    // Eye shine
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(5.2, -24, 0.8, 0, Math.PI * 2); ctx.fill();
  }

  // Antlers (bucks only) — anchored to head top
  if (d.isBuck) {
    ctx.strokeStyle = brown; ctx.lineWidth = 2.2;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Near antler (left beam)
    ctx.beginPath();
    ctx.moveTo(-4, -27);      // base at head top
    ctx.lineTo(-8, -40);      // main beam up
    ctx.lineTo(-14, -36);     // brow tine forks left
    ctx.moveTo(-8, -40);
    ctx.lineTo(-7, -47);      // tip
    ctx.stroke();
    // Far antler (right beam)
    ctx.beginPath();
    ctx.moveTo(2, -27);
    ctx.lineTo(6, -40);
    ctx.lineTo(12, -36);
    ctx.moveTo(6, -40);
    ctx.lineTo(5, -47);
    ctx.stroke();
  }

  // Alert "!" bubble (positioned relative to head)
  if (d.state === 'alert') {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(8, -46, 16, 20, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8620a';
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('!', 16, -30);
  }

  ctx.restore(); // end neck/head transform

  // ── Hit stars ────────────────────────────────────────────────────
  if (d.state === 'hit' || d.state === 'dead') {
    ctx.fillStyle = '#f7e04a';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + d.hitTimer * 4;
      const r = 18 + d.hitTimer * 28;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, -14 + Math.sin(a) * r, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

// ─────────────────────────────────────────────
// DRAW WINDOW FRAME (hunting blind)
// ─────────────────────────────────────────────
function drawWindowFrame() {
  const fw = 14; // frame width
  // Left frame
  ctx.fillStyle = CONFIG.brown;
  ctx.fillRect(0, 0, fw, windowH);
  // Right frame
  ctx.fillRect(logW - fw, 0, fw, windowH);
  // Top frame
  ctx.fillRect(0, 0, logW, fw);
  // Bottom frame of window
  ctx.fillRect(0, windowH - fw, logW, fw);

  // Wood grain lines
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(fw * 0.25 + i * 3, 0); ctx.lineTo(fw * 0.25 + i * 3, windowH); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(logW - fw * 0.25 - i * 3, 0); ctx.lineTo(logW - fw * 0.25 - i * 3, windowH); ctx.stroke();
  }

  // Camo netting hint (top corners)
  ctx.fillStyle = 'rgba(45,90,27,0.35)';
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(60, 0); ctx.lineTo(0, 50); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(logW, 0); ctx.lineTo(logW - 60, 0); ctx.lineTo(logW, 50); ctx.closePath(); ctx.fill();

  // Crying red border — pulsing glow inside the window edge
  if (babyMood === 'crying') {
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(Date.now() / 130));
    ctx.strokeStyle = `rgba(220,30,30,${pulse})`;
    ctx.lineWidth = 8;
    ctx.strokeRect(fw + 2, fw + 2, logW - fw * 2 - 4, windowH - fw * 2 - 4);
  }

  // Rifle barrel in bottom-right of window
  const barrelX = logW - fw - 20;
  const barrelY = windowH - fw - 8;
  const recoil = reloadActive ? 0 : (shakeY > 0 ? shakeY * 0.5 : 0);

  ctx.save();
  ctx.translate(barrelX, barrelY + recoil);
  ctx.rotate(-0.22);
  // Stock
  ctx.fillStyle = '#7a4a1e';
  ctx.fillRect(-8, 0, 18, 80);
  // Barrel
  ctx.fillStyle = '#444';
  ctx.fillRect(-3, -70, 7, 80);
  ctx.restore();
}

// ─────────────────────────────────────────────
// DRAW CONTROL PANEL
// ─────────────────────────────────────────────
const panelY = () => windowH;
const panelH = () => logH - windowH;

function drawPanel() {
  const py = panelY();
  const ph = panelH();

  // Panel background
  ctx.fillStyle = CONFIG.panelColor;
  ctx.fillRect(0, py, logW, ph);
  // Panel top border
  ctx.fillStyle = CONFIG.brown;
  ctx.fillRect(0, py, logW, 4);

  // Layout zones
  const babySect = { x: 0, y: py + 4, w: logW * 0.36, h: ph - 4 };
  const btnSect  = { x: logW * 0.36, y: py + 4, w: logW * 0.64, h: ph - 4 };

  // Baby face
  drawBabyFace(babySect.x + babySect.w / 2, babySect.y + babySect.h * 0.38, 34);

  // Meters
  const mx = babySect.x + 8;
  const mw = babySect.w - 16;
  const m1y = babySect.y + babySect.h * 0.68;
  const m2y = m1y + 26;
  drawMeter(mx, m1y, mw, 14, hunger / 100, '🍼', '#f7c59f', '#e8620a', 'hunger');
  drawMeter(mx, m2y, mw, 14, diaper / 100, '💩', '#d4b896', '#8B4513', 'diaper');

  // Buttons
  drawButtons(btnSect);
}

function drawMeter(x, y, w, h, frac, icon, bgColor, fillColor, meterType) {
  // Icon
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(icon, x, y + h - 1);
  const barX = x + 18;
  const barW = w - 18;
  // Background
  drawRoundRect(barX, y, barW, h, h / 2, bgColor, '#888', 1);
  // Fill
  if (frac > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(barX, y, barW, h, h / 2);
    ctx.clip();
    ctx.fillStyle = frac >= 1 ? '#e82a0a' : fillColor;
    ctx.fillRect(barX, y, barW * frac, h);
    ctx.restore();
  }
  // Danger pulse at high levels
  if (frac >= CONFIG.fussyThreshold) {
    ctx.strokeStyle = frac >= 1 ? '#e82a0a' : '#e8620a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(barX, y, barW, h, h / 2);
    ctx.stroke();
  }

  // Warning badges: HUNGRY! / WET!
  const pulseAlpha = 0.6 + 0.4 * Math.abs(Math.sin(Date.now() / 250));
  if (meterType === 'hunger' && frac > 0.85 && !feedActive) {
    ctx.save();
    ctx.globalAlpha = pulseAlpha;
    ctx.fillStyle = '#cc0000';
    drawRoundRect(barX + barW + 4, y - 1, 40, h + 2, 3, '#cc0000');
    ctx.fillStyle = '#fff';
    ctx.font = `bold 8px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('HUNGRY!', barX + barW + 4 + 20, y + h - 2);
    ctx.restore();
  }
  if (meterType === 'diaper' && frac > 0.85) {
    ctx.save();
    ctx.globalAlpha = pulseAlpha;
    ctx.fillStyle = '#cc0000';
    drawRoundRect(barX + barW + 4, y - 1, 32, h + 2, 3, '#cc0000');
    ctx.fillStyle = '#fff';
    ctx.font = `bold 8px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('WET!', barX + barW + 4 + 16, y + h - 2);
    ctx.restore();
  }
}

function drawBabyFace(cx, cy, r) {
  // Carrier/sling hint
  ctx.fillStyle = '#b8860b';
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.8, r * 1.1, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  // If feeding: nursing cover
  if (feedActive) {
    ctx.fillStyle = '#e8d5b7';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.5, r * 1.0, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Hearts
    const t = Date.now() / 400;
    for (let i = 0; i < 3; i++) {
      const hx = cx + Math.cos(t + i * 2.1) * r * 0.7;
      const hy = cy - r * 0.3 + Math.sin(t * 1.3 + i) * r * 0.4;
      drawHeart(hx, hy, 7 + Math.sin(t + i) * 2, '#e8620a');
    }
    return; // don't draw face under cover
  }

  // Face circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#f9d9b5';
  ctx.fill();
  ctx.strokeStyle = CONFIG.brown; ctx.lineWidth = 2; ctx.stroke();

  // Rosy cheeks
  ctx.fillStyle = 'rgba(255,150,150,0.4)';
  ctx.beginPath(); ctx.arc(cx - r * 0.5, cy + r * 0.2, r * 0.28, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r * 0.5, cy + r * 0.2, r * 0.28, 0, Math.PI * 2); ctx.fill();

  // Hair curl
  ctx.strokeStyle = CONFIG.brown; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx + r * 0.1, cy - r * 0.9, r * 0.2, Math.PI * 0.8, Math.PI * 2.2);
  ctx.stroke();

  // Eyes & mouth by mood
  if (babyMood === 'content') {
    // Happy eyes (arcs)
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.05, r * 0.2, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + r * 0.35, cy - r * 0.05, r * 0.2, Math.PI, Math.PI * 2); ctx.stroke();
    // Smile
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.25, r * 0.35, 0.1, Math.PI - 0.1);
    ctx.stroke();
  } else if (babyMood === 'fussy') {
    // Squinty eyes
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - r * 0.5, cy - r * 0.05); ctx.lineTo(cx - r * 0.2, cy - r * 0.15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + r * 0.5, cy - r * 0.05); ctx.lineTo(cx + r * 0.2, cy - r * 0.15); ctx.stroke();
    // Frown
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.55, r * 0.3, Math.PI + 0.2, Math.PI * 2 - 0.2);
    ctx.stroke();
    // Waah bubble
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(cx + r * 0.7, cy - r * 0.8, 22, 14, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8620a';
    ctx.font = `bold 9px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('waah', cx + r * 0.7 + 11, cy - r * 0.8 + 10);
  } else if (babyMood === 'crying') {
    // Wide eyes with tears
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.1, r * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r * 0.35, cy - r * 0.1, r * 0.18, 0, Math.PI * 2); ctx.fill();
    // Tears
    ctx.fillStyle = '#87ceeb';
    ctx.beginPath(); ctx.ellipse(cx - r * 0.4, cy + r * 0.15, 3, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + r * 0.3, cy + r * 0.15, 3, 6, 0, 0, Math.PI * 2); ctx.fill();
    // Open mouth
    ctx.fillStyle = '#c44';
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.45, r * 0.3, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  }
}

function drawHeart(x, y, size, color) {
  ctx.fillStyle = color;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.3);
  ctx.bezierCurveTo(-size, -size * 0.3, -size, size * 0.6, 0, size);
  ctx.bezierCurveTo(size, size * 0.6, size, -size * 0.3, 0, size * 0.3);
  ctx.fill();
  ctx.restore();
}

// Shared button layout — called identically from draw AND hit-detection so coords always match.
function btnLayout() {
  const py   = panelY();
  const ph   = panelH();
  const sectX = logW * 0.36;
  const sectW = logW * 0.64;
  const sectH = ph - 4;
  const sectY = py + 4;
  const bw = (sectW - 12) / 3;
  const bh = Math.min(sectH * 0.42, 68);
  const by = sectY + (sectH - bh * 2 - 8) / 2;
  const gap = 4;
  return { sectX, sectY, sectW, sectH, bw, bh, by, gap };
}

function drawButtons(sect) {
  const { sectX, bw, bh, by, gap } = btnLayout();

  // Row 1: FEED, CHANGE, RELOAD
  const buttons = [
    { label: 'FEED',   x: sectX + gap,                  active: feedActive },
    { label: 'CHANGE', x: sectX + gap + bw + gap,        active: changePressing },
    { label: 'RELOAD', x: sectX + gap + (bw + gap) * 2,  active: reloadActive || emptyFlashTimer > 0 },
  ];

  buttons.forEach(btn => {
    const pressed = btn.active;
    const isEmptyFlash = btn.label === 'RELOAD' && emptyFlashTimer > 0;
    const fill   = isEmptyFlash ? '#cc1111'
                 : pressed      ? CONFIG.buttonShadow
                 :                CONFIG.buttonOrange;
    const shadow = isEmptyFlash ? '#880000'
                 : pressed      ? CONFIG.buttonOrange
                 :                CONFIG.buttonShadow;
    const yOff = pressed ? 3 : 0;

    // Shadow
    drawRoundRect(btn.x, by + 4 + yOff, bw, bh, 10, shadow);
    // Button
    drawRoundRect(btn.x, by + yOff, bw, bh, 10, fill, '#5a1f00', 2);

    ctx.fillStyle = '#fff';
    ctx.font = `bold ${bh > 55 ? 15 : 13}px sans-serif`;
    ctx.textAlign = 'center';
    // CHANGE button shows "hold 2s" sub-label so players know it needs a hold
    if (btn.label === 'CHANGE') {
      ctx.fillText('CHANGE', btn.x + bw / 2, by + yOff + bh * 0.50);
      ctx.font = `${bh > 55 ? 9 : 8}px sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText('hold 2s', btn.x + bw / 2, by + yOff + bh * 0.72);
    } else {
      ctx.fillText(btn.label, btn.x + bw / 2, by + yOff + bh * 0.60);
    }

    // Progress ring on RELOAD
    if (btn.label === 'RELOAD' && reloadActive) {
      const cx2 = btn.x + bw / 2;
      const cy2 = by + yOff + bh / 2;
      const rad = bh * 0.38;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx2, cy2, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * reloadProgress);
      ctx.stroke();
    }

    // Progress ring on CHANGE
    if (btn.label === 'CHANGE' && changePressing) {
      const cx2 = btn.x + bw / 2;
      const cy2 = by + yOff + bh / 2;
      const rad = bh * 0.38;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx2, cy2, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * changeProgress);
      ctx.stroke();
    }
  });

  // Row 2: Ammo shells
  const ammoY = by + bh + 12;
  drawAmmo(sectX + gap, ammoY, bw * 3 + gap * 2, bh * 0.55);
}

function drawAmmo(x, y, w, h) {
  const shellW = 12, shellH = 22;
  const startX = x + w / 2 - (CONFIG.maxAmmo * (shellW + 6)) / 2;
  for (let i = 0; i < CONFIG.maxAmmo; i++) {
    const sx = startX + i * (shellW + 6);
    const filled = i < ammo;
    ctx.fillStyle = filled ? '#d4a017' : '#888';
    ctx.strokeStyle = filled ? '#8B4513' : '#555';
    ctx.lineWidth = 1.5;
    // Shell body
    drawRoundRect(sx, y, shellW, shellH, 3, filled ? '#d4a017' : '#aaa', filled ? '#8B4513' : '#555', 1.5);
    // Tip
    ctx.fillStyle = filled ? '#c0392b' : '#777';
    ctx.beginPath();
    ctx.arc(sx + shellW / 2, y, shellW / 2, Math.PI, 0);
    ctx.fill();
  }
}

// ─────────────────────────────────────────────
// DRAW CROSSHAIR
// ─────────────────────────────────────────────
function drawCrosshair() {
  if (!aimInScene || reloadActive || changePressing) return;
  // While feeding, wobble the crosshair around the aim point
  const t = Date.now() / 120;
  const wobble = feedActive ? CONFIG.wobbleOffset * 0.55 : 0;
  const cx = aimX + Math.cos(t * 1.7) * wobble;
  const cy = aimY + Math.sin(t * 2.3) * wobble;

  const r = 10, gap = 4, arm = 8;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = feedActive ? 'rgba(255,200,80,0.9)' : 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.5;
  // Circle
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  // Arms
  ctx.beginPath();
  ctx.moveTo(-(r + gap), 0); ctx.lineTo(-(r + gap + arm), 0);
  ctx.moveTo( (r + gap), 0); ctx.lineTo( (r + gap + arm), 0);
  ctx.moveTo(0, -(r + gap)); ctx.lineTo(0, -(r + gap + arm));
  ctx.moveTo(0,  (r + gap)); ctx.lineTo(0,  (r + gap + arm));
  ctx.stroke();
  // Centre dot
  ctx.fillStyle = feedActive ? 'rgba(255,200,80,0.9)' : 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(0, 0, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ─────────────────────────────────────────────
// DRAW HUD (timer + score over window)
// ─────────────────────────────────────────────
function drawHUD() {
  const pulse = timeLeft <= CONFIG.warningTime && Math.sin(Date.now() / 150) > 0;

  // Timer
  const mins = Math.floor(timeLeft / 60);
  const secs = Math.floor(timeLeft % 60);
  const timeStr = `${mins}:${secs.toString().padStart(2, '00')}`;

  ctx.save();
  if (timeLeft <= CONFIG.warningTime) {
    ctx.scale(1 + (pulse ? 0.08 : 0), 1 + (pulse ? 0.08 : 0));
    ctx.translate(pulse ? -logW * 0.04 : 0, 0);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  drawRoundRect(8, 8, 68, 28, 6, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = timeLeft <= CONFIG.warningTime ? '#ff4444' : '#fff';
  ctx.font = `bold 18px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(timeStr, 8 + 34, 8 + 19);
  ctx.restore();

  // Score — flashes yellow on a hit
  const sf = Math.max(0, scoreFlash);
  const scoreBg = sf > 0 ? `rgba(247,224,74,${sf * 0.7 + 0.25})` : 'rgba(0,0,0,0.35)';
  const scoreScale = 1 + sf * 0.18;
  ctx.save();
  ctx.translate(logW - 78 + 35, 8 + 14);
  ctx.scale(scoreScale, scoreScale);
  ctx.translate(-(logW - 78 + 35), -(8 + 14));
  drawRoundRect(logW - 78, 8, 70, 28, 6, scoreBg);
  ctx.fillStyle = sf > 0 ? '#333' : '#fff';
  ctx.font = `bold 18px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(score.toString(), logW - 78 + 35, 8 + 19);
  ctx.restore();

  // Mute button
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.arc(logW / 2, 22, 16, 0, Math.PI * 2); ctx.fill();
  ctx.font = '16px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(muted ? '🔇' : '🔊', logW / 2, 28);
}

// ─────────────────────────────────────────────
// DRAW POP-UPS
// ─────────────────────────────────────────────
function drawPopups() {
  popups.forEach(p => {
    ctx.globalAlpha = p.opacity;
    if (p.isDirt) {
      ctx.fillStyle = '#c4924a';
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.font = `bold 20px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f7e04a';
      ctx.strokeStyle = '#333'; ctx.lineWidth = 3;
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  });
}

// ─────────────────────────────────────────────
// DRAW HOW-TO SCREEN
// ─────────────────────────────────────────────

// Helper: draw one of the orange action buttons at given pos/size (for how-to illustrations)
function drawHowtoButton(label, x, y, w, h, highlight) {
  const fill   = highlight ? '#ff8c2a' : CONFIG.buttonOrange;
  const shadow = highlight ? '#c04800' : CONFIG.buttonShadow;
  drawRoundRect(x, y + 3, w, h, 8, shadow);
  drawRoundRect(x, y,     w, h, 8, fill, '#5a1f00', 2);
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.round(h * 0.34)}px sans-serif`;
  ctx.textAlign = 'center';
  // CHANGE has a sub-label
  if (label === 'CHANGE') {
    ctx.fillText('CHANGE', x + w / 2, y + h * 0.48);
    ctx.font = `${Math.round(h * 0.22)}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('hold 2s', x + w / 2, y + h * 0.72);
  } else {
    ctx.fillText(label, x + w / 2, y + h * 0.62);
  }
}

// Helper: wrap text and return the array of lines (does not draw)
function wrapText(text, maxW) {
  ctx.font = '14px sans-serif'; // set before measuring
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  words.forEach(w => {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = t;
  });
  if (cur) lines.push(cur);
  return lines;
}

function drawHowtoScreen() {
  // Background
  ctx.fillStyle = CONFIG.skyMorning;
  ctx.fillRect(0, 0, logW, logH);
  clouds.forEach(c => drawCloud(c.x, c.y, c.w));
  drawTreeline(0, logW, logH * 0.48, 90, CONFIG.greenDark, 16);
  drawTreeline(0, logW, logH * 0.56, 110, CONFIG.greenMid, 11);
  ctx.fillStyle = CONFIG.greenLight;
  ctx.fillRect(0, logH * 0.56, logW, logH - logH * 0.56);

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, logW, logH);

  // Skip button — top right
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  drawRoundRect(logW - 74, 14, 60, 28, 8, 'rgba(255,255,255,0.18)');
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Skip →', logW - 44, 33);

  // Card bounds
  const cardX = 22, cardY = logH * 0.07;
  const cardW = logW - 44, cardH = logH * 0.78;
  drawRoundRect(cardX, cardY, cardW, cardH, 18, '#fdf8f0', CONFIG.brown, 2.5);

  // ── Card title ──────────────────────────────
  const titles = ['🦌  Tap to Shoot', '👶  Keep Baby Happy', '🤱  One-Handed Aim'];
  ctx.fillStyle = CONFIG.brown;
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(titles[howtoCard], logW / 2, cardY + 44);

  // Thin divider
  ctx.strokeStyle = '#e0c9a0'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cardX + 28, cardY + 56); ctx.lineTo(cardX + cardW - 28, cardY + 56);
  ctx.stroke();

  // ── Illustration zone (middle of card) ──────
  const illusY = cardY + 66;
  const illusH = 195;

  if (howtoCard === 0) {
    // ── Card 0: show mini scene + ammo shells + RELOAD button ──
    // Mini scene rectangle
    const scY = illusY + 4, scH = 110, scW = cardW - 32, scX = cardX + 16;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(scX, scY, scW, scH, 8); ctx.clip();
    // Sky
    ctx.fillStyle = CONFIG.skyMorning;
    ctx.fillRect(scX, scY, scW, scH);
    // Treeline
    drawTreeline(scX, scX + scW, scY + scH * 0.55, 35, CONFIG.greenDark, 12);
    ctx.fillStyle = CONFIG.greenLight;
    ctx.fillRect(scX, scY + scH * 0.6, scW, scH * 0.4);
    ctx.restore();
    // Frame border
    ctx.strokeStyle = CONFIG.brown; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(scX, scY, scW, scH, 8); ctx.stroke();

    // Deer silhouette in scene
    drawDeerStatic(scX + scW * 0.38, scY + scH * 0.62, 0.72, false, 'grazing');
    drawDeerStatic(scX + scW * 0.68, scY + scH * 0.58, 0.55, true,  'walking');

    // Crosshair over doe
    const chx = scX + scW * 0.38, chy = scY + scH * 0.50;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(chx, chy, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(chx - 13, chy); ctx.lineTo(chx - 10, chy);
    ctx.moveTo(chx + 10, chy); ctx.lineTo(chx + 13, chy);
    ctx.moveTo(chx, chy - 13); ctx.lineTo(chx, chy - 10);
    ctx.moveTo(chx, chy + 10); ctx.lineTo(chx, chy + 13);
    ctx.stroke();

    // 3 ammo shells + RELOAD button
    const shellRowY = scY + scH + 10;
    const shellW = 12, shellH = 22, shellGap = 8;
    const shellsStartX = cardX + cardW / 2 - 1.5 * (shellW + shellGap);
    for (let i = 0; i < 3; i++) {
      const sx = shellsStartX + i * (shellW + shellGap);
      drawRoundRect(sx, shellRowY, shellW, shellH, 3, '#d4a017', '#8B4513', 1.5);
      ctx.fillStyle = '#c0392b';
      ctx.beginPath(); ctx.arc(sx + shellW / 2, shellRowY, shellW / 2, Math.PI, 0); ctx.fill();
    }
    // Reload button to the right
    drawHowtoButton('RELOAD', shellsStartX + 3 * (shellW + shellGap) + 10, shellRowY - 3, 68, 30, false);

    // Caption
    ctx.fillStyle = '#555'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Tap window to shoot. 3 shots, then tap RELOAD.', logW / 2, illusY + illusH - 4);
    ctx.fillStyle = CONFIG.brown; ctx.font = 'bold 13px sans-serif';
    ctx.fillText('Doe = 100 pts   🦌   Buck (antlers) = 250 pts', logW / 2, illusY + illusH + 12);

  } else if (howtoCard === 1) {
    // ── Card 1: baby face + FEED & CHANGE buttons ──
    // Baby face (fussy)
    const savedMood = babyMood;
    babyMood = 'fussy'; // temporarily force fussy for the illustration
    drawBabyFace(logW / 2, illusY + 44, 38);
    babyMood = savedMood;

    // Hunger + diaper meter bars
    const meterX = cardX + 20, meterW = cardW - 40;
    drawMeter(meterX, illusY + 95,  meterW, 16, 0.82, '🍼', '#f7c59f', '#e8620a', 'hunger');
    drawMeter(meterX, illusY + 118, meterW, 16, 0.65, '💩', '#d4b896', '#8B4513', 'diaper');

    // FEED and CHANGE buttons side by side
    const btnY2 = illusY + 145;
    const btnW2 = (cardW - 56) / 2;
    drawHowtoButton('FEED',   cardX + 20,              btnY2, btnW2, 40, true);
    drawHowtoButton('CHANGE', cardX + 26 + btnW2,      btnY2, btnW2, 40, false);

    // Caption
    ctx.fillStyle = '#555'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Fussy = deer alert. Crying = all deer bolt + −10 pts/sec.', logW / 2, illusY + illusH + 6);

  } else {
    // ── Card 2: feeding baby + wobbling crosshair + RELOAD ──
    // Baby with nursing cover
    const savedFeed = feedActive, savedMood2 = babyMood;
    feedActive = true; babyMood = 'content';
    drawBabyFace(logW / 2 - 50, illusY + 50, 34);
    feedActive = savedFeed; babyMood = savedMood2;

    // Animated wobbling crosshair
    const t = Date.now() / 180;
    const wobble = 22;
    const wchx = logW / 2 + 30 + Math.cos(t * 1.7) * wobble;
    const wchy = illusY + 50  + Math.sin(t * 2.3) * wobble;
    ctx.strokeStyle = 'rgba(255,200,80,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(wchx, wchy, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(wchx - 16, wchy); ctx.lineTo(wchx - 12, wchy);
    ctx.moveTo(wchx + 12, wchy); ctx.lineTo(wchx + 16, wchy);
    ctx.moveTo(wchx, wchy - 16); ctx.lineTo(wchx, wchy - 12);
    ctx.moveTo(wchx, wchy + 12); ctx.lineTo(wchx, wchy + 16);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,200,80,0.9)';
    ctx.beginPath(); ctx.arc(wchx, wchy, 2, 0, Math.PI * 2); ctx.fill();
    // "Aim wobbles!" label
    ctx.fillStyle = '#e8620a'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('aim wobbles!', logW / 2 + 30, illusY + 96);

    // RELOAD button — with "takes 2× longer" note below
    const rlW = 110, rlH = 42;
    drawHowtoButton('RELOAD', logW / 2 - rlW / 2, illusY + 110, rlW, rlH, false);
    ctx.fillStyle = '#888'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('reload takes 2× longer while feeding', logW / 2, illusY + 163);

    // Caption
    ctx.fillStyle = '#555'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Plan shots & reloads around feeding time.', logW / 2, illusY + illusH + 6);
  }

  // ── Dot indicators ───────────────────────────
  const dotY = cardY + cardH - 58;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(logW / 2 + (i - 1) * 18, dotY, i === howtoCard ? 6 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = i === howtoCard ? CONFIG.buttonOrange : '#ccc';
    ctx.fill();
  }

  // ── NEXT / START! button ─────────────────────
  const btnLabel = howtoCard === 2 ? '🎯  START HUNT!' : 'NEXT →';
  const btnW = howtoCard === 2 ? 186 : 150, btnH = 52;
  const btnX2 = logW / 2 - btnW / 2;
  const btnY3 = cardY + cardH - 36;
  drawRoundRect(btnX2, btnY3 + 4, btnW, btnH, 12, CONFIG.buttonShadow);
  drawRoundRect(btnX2, btnY3,     btnW, btnH, 12, CONFIG.buttonOrange, '#5a1f00', 2);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(btnLabel, logW / 2, btnY3 + 33);
}

// ─────────────────────────────────────────────
// DRAW TITLE SCREEN
// ─────────────────────────────────────────────
function drawTitleScreen() {
  // Background
  ctx.fillStyle = CONFIG.skyMorning;
  ctx.fillRect(0, 0, logW, logH);

  // Trees behind
  drawTreeline(0, logW, logH * 0.48, 90, CONFIG.greenDark, 16);
  drawTreeline(0, logW, logH * 0.56, 110, CONFIG.greenMid, 11);

  // Ground
  ctx.fillStyle = CONFIG.greenLight;
  ctx.fillRect(0, logH * 0.56, logW, logH - logH * 0.56);

  // Title panel
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  drawRoundRect(20, logH * 0.06, logW - 40, logH * 0.82, 18, 'rgba(255,255,255,0.88)', CONFIG.brown, 3);

  // Title
  ctx.fillStyle = CONFIG.brown;
  ctx.font = `bold 28px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('Shotgun Wedding', logW / 2, logH * 0.14);

  // Subtitle
  ctx.fillStyle = CONFIG.greenDark;
  ctx.font = `16px sans-serif`;
  ctx.fillText('A Wedding Easter Egg 🦌', logW / 2, logH * 0.19);

  // Cartoon deer — doe grazing, buck alert
  drawDeerStatic(logW / 2 - 55, logH * 0.36, 1.4, false, 'grazing');
  drawDeerStatic(logW / 2 + 42, logH * 0.34, 1.1, true,  'walking');

  // Baby face next to the buck
  drawBabyFaceStatic(logW / 2 + 52, logH * 0.30, 24);

  // Tagline
  ctx.fillStyle = '#555'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Hunt deer. Keep baby happy. Try not to panic.', logW / 2, logH * 0.53);

  // START button (big, centred)
  const bx = logW / 2 - 90, by = logH * 0.58;
  drawRoundRect(bx, by + 5, 180, 58, 14, CONFIG.buttonShadow);
  drawRoundRect(bx, by,     180, 58, 14, CONFIG.buttonOrange, '#5a1f00', 2);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('START HUNT', logW / 2, by + 37);

  // Mute toggle
  ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(muted ? '🔇' : '🔊', logW / 2, logH * 0.78);
  ctx.fillStyle = '#999'; ctx.font = '11px sans-serif';
  ctx.fillText('tap to toggle sound', logW / 2, logH * 0.83);
}

// Draws a deer on the title/results screen by reusing the full drawDeer logic.
// pose: 'grazing' | 'walking'
function drawDeerStatic(x, y, scale, isBuck, pose) {
  const mockDeer = {
    x, y, scale, isBuck, isFar: false, fromLeft: true,
    state: pose || 'grazing', walkDir: 1,
    hitTimer: 0, flashTimer: 0, frame: 0, opacity: 1, grazeDuration: 4,
    grazeTimer: 2, alertTimer: 0, alertBubble: false,
    walkSpeed: CONFIG.walkSpeed,
  };
  drawDeer(mockDeer);
}

function drawBabyFaceStatic(cx, cy, r) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#f9d9b5'; ctx.fill();
  ctx.strokeStyle = CONFIG.brown; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,150,150,0.4)';
  ctx.beginPath(); ctx.arc(cx - r * 0.5, cy + r * 0.2, r * 0.28, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r * 0.5, cy + r * 0.2, r * 0.28, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.05, r * 0.2, Math.PI, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx + r * 0.35, cy - r * 0.05, r * 0.2, Math.PI, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.25, r * 0.35, 0.1, Math.PI - 0.1); ctx.stroke();
}

// ─────────────────────────────────────────────
// DRAW RESULTS SCREEN
// ─────────────────────────────────────────────
function drawResultsScreen() {
  ctx.fillStyle = CONFIG.skyMorning;
  ctx.fillRect(0, 0, logW, logH);
  drawTreeline(0, logW, logH * 0.5, 90, CONFIG.greenDark, 16);
  ctx.fillStyle = CONFIG.greenLight;
  ctx.fillRect(0, logH * 0.5, logW, logH);

  // Card
  drawRoundRect(16, logH * 0.04, logW - 32, logH * 0.80, 18, 'rgba(255,255,255,0.92)', CONFIG.brown, 3);

  // Game title
  ctx.fillStyle = CONFIG.brown;
  ctx.font = `bold 15px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('Shotgun Wedding', logW / 2, logH * 0.10);

  // Score title
  const titleEntry = [...CONFIG.scoreTitles].reverse().find(t => finalScore >= t.min) || CONFIG.scoreTitles[0];
  ctx.fillStyle = CONFIG.buttonOrange;
  ctx.font = `bold 22px sans-serif`;
  ctx.fillText(titleEntry.title, logW / 2, logH * 0.18);

  // Funny line (chosen once in endGame, not re-rolled each frame)
  ctx.fillStyle = '#555';
  ctx.font = `13px sans-serif`;
  ctx.fillText(resultFunnyLine, logW / 2, logH * 0.24);

  // Stats
  const stats = [
    ['Deer Bagged', deerBagged],
    ['Hunting Score', score - happyBonus > 0 ? score - happyBonus : 0],
    ['Happy Baby Bonus', '+' + happyBonus],
    ['FINAL SCORE', finalScore],
  ];

  let sy = logH * 0.31;
  stats.forEach(([label, val], i) => {
    const isFinal = i === stats.length - 1;
    if (isFinal) {
      ctx.fillStyle = CONFIG.greenDark;
      ctx.fillRect(32, sy - 14, logW - 64, 28);
    }
    ctx.fillStyle = isFinal ? '#fff' : '#333';
    ctx.font = isFinal ? `bold 20px sans-serif` : `14px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(label, 44, sy + (isFinal ? 10 : 8));
    ctx.textAlign = 'right';
    ctx.fillText(val, logW - 44, sy + (isFinal ? 10 : 8));
    sy += isFinal ? 36 : 26;
  });

  // Single centred Play Again button
  const bby = logH * 0.70;
  const bw2 = 200, bh2 = 54;
  const b1x = logW / 2 - bw2 / 2;

  drawRoundRect(b1x, bby + 4, bw2, bh2, 12, CONFIG.buttonShadow);
  drawRoundRect(b1x, bby,     bw2, bh2, 12, CONFIG.buttonOrange, '#5a1f00', 2);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Play Again', logW / 2, bby + 34);
}

// ─────────────────────────────────────────────
// INPUT HANDLING
// ─────────────────────────────────────────────
function getLogicalPos(e) {
  const rect = canvas.getBoundingClientRect();
  const cssX = (e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0) - rect.left;
  const cssY = (e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY) || 0) - rect.top;
  const scaleX = logW / rect.width;
  const scaleY = logH / rect.height;
  return { x: cssX * scaleX, y: cssY * scaleY };
}

function handlePointerDown(e) {
  e.preventDefault();
  ensureAudio();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  const pos = getLogicalPos(e);
  pointerX = pos.x; pointerY = pos.y;

  if (state === STATE.TITLE) {
    // START button
    const bx = logW / 2 - 90, by = logH * 0.58;
    if (pos.x >= bx && pos.x <= bx + 180 && pos.y >= by && pos.y <= by + 58) {
      state = STATE.HOWTO;
      howtoCard = 0;
      return;
    }
    // Mute toggle
    if (Math.abs(pos.x - logW / 2) < 24 && Math.abs(pos.y - logH * 0.78) < 24) {
      muted = !muted;
    }
    return;
  }

  if (state === STATE.HOWTO) {
    // Skip button — top right
    if (pos.x >= logW - 74 && pos.x <= logW - 14 && pos.y >= 14 && pos.y <= 42) {
      startGame(); return;
    }
    // NEXT / START button — or tap anywhere on the card body
    howtoCard++;
    if (howtoCard >= 3) startGame();
    return;
  }

  if (state === STATE.RESULTS) {
    const bby = logH * 0.70, bw2 = 200, bh2 = 54;
    const b1x = logW / 2 - bw2 / 2;
    if (pos.x >= b1x && pos.x <= b1x + bw2 && pos.y >= bby && pos.y <= bby + bh2) {
      startGame();
    }
    return;
  }

  if (state === STATE.GAME) {
    // Mute button
    if (Math.abs(pos.x - logW / 2) < 20 && Math.abs(pos.y - 22) < 20) {
      muted = !muted;
      return;
    }

    // Button area check — use shared btnLayout() so coords are identical to draw
    const { sectX, bw, bh, by, gap } = btnLayout();

    const btnData = [
      { label: 'FEED',   bx: sectX + gap },
      { label: 'CHANGE', bx: sectX + gap + bw + gap },
      { label: 'RELOAD', bx: sectX + gap + (bw + gap) * 2 },
    ];

    let hitButton = null;
    btnData.forEach(b => {
      if (pos.x >= b.bx && pos.x <= b.bx + bw && pos.y >= by && pos.y <= by + bh) {
        hitButton = b.label;
      }
    });

    if (hitButton === 'FEED') {
      if (changePressing) { changePressing = false; changeProgress = 0; }
      feedActive = !feedActive;
      return;
    }
    if (hitButton === 'CHANGE') {
      if (feedActive) feedActive = false;
      if (!changePressing) {
        changePressing = true;
        changeProgress = 0;
        changingPointerId = e.pointerId;
        canvas.setPointerCapture(e.pointerId); // keep receiving events even if finger moves off
      }
      return;
    }
    if (hitButton === 'RELOAD') {
      startReload();
      return;
    }

    // Tap on scene window = shoot
    if (pos.y < windowH) {
      shoot(pos.x, pos.y);
    }
  }
}

function cancelChange() {
  changePressing = false;
  changeProgress = 0;
  changingPointerId = null;
}

function handlePointerUp(e) {
  e.preventDefault();
  // Only cancel the hold if it's the same finger that started it
  if (state === STATE.GAME && changePressing && e.pointerId === changingPointerId) {
    cancelChange();
  }
}

function handlePointerMove(e) {
  if (state !== STATE.GAME) return;
  const pos = getLogicalPos(e);
  aimX = pos.x;
  aimY = pos.y;
  aimInScene = pos.y < windowH;
}

canvas.addEventListener('pointerdown',   handlePointerDown,  { passive: false });
canvas.addEventListener('pointerup',     handlePointerUp,    { passive: false });
canvas.addEventListener('pointercancel', handlePointerUp,    { passive: false }); // iOS long-press cancel
canvas.addEventListener('pointermove',   handlePointerMove,  { passive: true  });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// Prevent default touch behaviors
document.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove',  e => e.preventDefault(), { passive: false });

// Pause when tab hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === STATE.GAME) {
    lastTimestamp = 0; // will restart on resume
  }
});

// ─────────────────────────────────────────────
// GAME STATE MANAGEMENT
// ─────────────────────────────────────────────
function startGame() {
  state = STATE.GAME;
  howtoCard = 0;
  score = 0;
  timeLeft = CONFIG.roundDuration;
  ammo = CONFIG.maxAmmo;
  deer = [];
  popups = [];
  hunger = 0;
  diaper = 0;
  cryingTime = 0;
  babyMood = 'content';
  feedActive = false;
  reloadActive = false;
  reloadProgress = 0;
  changePressing = false;
  changeProgress = 0;
  changingPointerId = null;
  emptyFlashTimer = 0;
  aimX = -999; aimY = -999; aimInScene = false;
  streak = 0;
  shakeX = 0; shakeY = 0;
  nextSpawnIn = 4.5;   // first deer spawns after the countdown
  fussyAlertTimer = CONFIG.fussyAlertInterval;
  deerBagged = 0;
  lastTimestamp = 0;
  gameOver = false;
  pregame = true;
  pregameTimer = 0;
  scoreFlash = 0;
  initClouds();
}

function endGame() {
  gameOver = true;
  state = STATE.RESULTS;
  const notCryingFrac = 1 - (cryingTime / CONFIG.roundDuration);
  happyBonus = Math.round(notCryingFrac * 100 * CONFIG.happyBonusPerPct);
  score += happyBonus;
  if (score < 0) score = 0;
  finalScore = score;
  // Pick funny line once here so it doesn't re-roll every frame on the results screen
  resultFunnyLine = CONFIG.funnyLines[Math.floor(Math.random() * CONFIG.funnyLines.length)];
  playSound('fanfare');
}

// ─────────────────────────────────────────────
// MAIN LOOP
// ─────────────────────────────────────────────
function loop(timestamp) {
  requestAnimationFrame(loop);

  let dt = 0;
  if (lastTimestamp > 0) {
    dt = (timestamp - lastTimestamp) / 1000;
    dt = Math.min(dt, 0.1); // cap delta to prevent spiral of death
  }
  lastTimestamp = timestamp;

  if (state === STATE.TITLE) {
    updateClouds(dt);
    drawTitleScreen();
    return;
  }

  if (state === STATE.HOWTO) {
    updateClouds(dt);
    drawHowtoScreen();
    return;
  }

  if (state === STATE.RESULTS) {
    // Static results
    drawResultsScreen();
    return;
  }

  // STATE.GAME
  if (document.hidden) return;

  // Pregame countdown — clock and deer are paused
  if (pregame) {
    pregameTimer += dt;
    if (pregameTimer >= 3.6) pregame = false;
  } else {
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      endGame();
    }
  }

  updateClouds(dt);
  if (!pregame) updateDeer(dt);
  updateBaby(dt);
  updateReload(dt);
  updateChange(dt);
  updatePopups(dt);
  if (emptyFlashTimer > 0) emptyFlashTimer -= dt;
  if (scoreFlash > 0) scoreFlash -= dt;

  // Screen shake decay
  shakeX *= CONFIG.screenShakeDecay;
  shakeY *= CONFIG.screenShakeDecay;
  if (Math.abs(shakeX) < 0.1) shakeX = 0;
  if (Math.abs(shakeY) < 0.1) shakeY = 0;

  // Draw
  ctx.save();
  if (shakeX !== 0 || shakeY !== 0) {
    ctx.translate(
      (Math.random() * 2 - 1) * shakeX,
      (Math.random() * 2 - 1) * shakeY
    );
  }

  drawBackground();

  // Sort deer by y (far deer drawn first)
  const sortedDeer = [...deer].sort((a, b) => a.y - b.y);
  sortedDeer.forEach(d => drawDeer(d));

  drawWindowFrame();
  drawCrosshair();
  drawPopups();
  drawHUD();
  drawPanel();

  if (pregame) drawPregameOverlay();

  ctx.restore();
}

// ─────────────────────────────────────────────
// PREGAME COUNTDOWN OVERLAY
// ─────────────────────────────────────────────
function drawPregameOverlay() {
  const t = pregameTimer;
  let label, fade;
  if (t < 1.0)      { label = '3'; fade = Math.min(1, t / 0.2); }
  else if (t < 2.0) { label = '2'; fade = Math.min(1, (t - 1.0) / 0.2); }
  else if (t < 3.0) { label = '1'; fade = Math.min(1, (t - 2.0) / 0.2); }
  else              { label = 'GO!'; fade = Math.min(1, (t - 3.0) / 0.15); }

  // Fade out in last 0.35s of each beat
  const beatT = t % 1.0;
  const fadeOut = t < 3.0 ? Math.max(0, 1 - (beatT - 0.55) / 0.35) : Math.max(0, 1 - (t - 3.25) / 0.35);
  const alpha = Math.min(fade, fadeOut);

  // Dim overlay
  ctx.fillStyle = `rgba(0,0,0,${alpha * 0.35})`;
  ctx.fillRect(0, 0, logW, windowH);

  // Big number
  const fontSize = label === 'GO!' ? 72 : 96;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillText(label, logW / 2 + 3, windowH * 0.45 + 3);
  // Main text
  ctx.fillStyle = label === 'GO!' ? '#f7e04a' : '#ffffff';
  ctx.fillText(label, logW / 2, windowH * 0.45);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

// ─────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────
setupCanvas();
requestAnimationFrame(loop);

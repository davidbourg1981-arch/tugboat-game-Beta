/*
==========================================================
Tugboat Towing Co. â€” Refactor Pass 1 (non-breaking)
==========================================================
Goal: improve readability + make future refactors safer WITHOUT
changing gameplay behavior.
 
What changed in this pass:
- Added a table-of-contents + section headers (comments only).
- Added a small window.GameAPI export at the bottom for debugging
  / future modularization (no gameplay changes).
 
Next safe refactor steps (optional):
1) Consolidate globals under a single Game object (keep aliases).
2) Split update() into updateWeather/updateAI/updatePhysics/updateJobs.
3) Move save/load + options into their own module file.
 
----------------------------------------------------------
TABLE OF CONTENTS (JS)
----------------------------------------------------------
00) Polyfills / Canvas setup
01) Constants & enums (WORLD, ZONE, JOB_TYPES, etc.)
02) Core state (game, tugboat, career, licenses, options)
03) Utilities (math, random, helpers)
04) Audio (initAudio, playSound, engine)
05) Map & collision (rivers/harbor/ocean, isInWater, zones)
06) Weather & region features
07) UI (panels, HUD, messages, leaderboard, store)
08) Jobs (spawning, timers, completion/fail)
09) AI competitors (spawn, update, anti-stuck)
10) Player physics & towing
11) Camera & rendering (drawWorld, minimap)
12) Input (keyboard/gamepad/touch)
13) Save/Load (profiles, slots)
14) Game loop (update, render, start/reset)
==========================================================
*/
// Sound Effects System
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
let soundEnabled = true;
let masterVolume = 0.7;

// Game options
const options = {
  sound: true,
  engineSound: true,
  volume: 70,
  waves: true,
  particles: true,
  weatherFx: true,
  minimap: true,
  quality: 'High'
};

// =========================
// Stage 3: Camera Shake
// =========================
const cameraShake = { t: 0, dur: 0.001, s: 0, x: 0, y: 0 };

function addCameraShake(strength = 6, durationSec = 0.18) {
  cameraShake.s = Math.max(cameraShake.s, strength);
  cameraShake.dur = Math.max(0.001, durationSec);
  cameraShake.t = cameraShake.dur;
}

function updateCameraShake(dtSec) {
  if (cameraShake.t <= 0) { cameraShake.x = 0; cameraShake.y = 0; cameraShake.s = 0; return; }
  cameraShake.t -= dtSec;
  const k = Math.max(0, cameraShake.t / cameraShake.dur);
  // random jitter with falloff
  const amp = cameraShake.s * k;
  cameraShake.x = (Math.random() * 2 - 1) * amp;
  cameraShake.y = (Math.random() * 2 - 1) * amp;
  if (cameraShake.t <= 0) { cameraShake.x = 0; cameraShake.y = 0; cameraShake.s = 0; }
}


// Game state
let gameStarted = false;

// Difficulty system
const DIFFICULTY = {
  easy: {
    name: 'Casual',
    payMult: 1.25,
    fuelMult: 0.7,
    aiSpeedMult: 0.8,
    timerMult: 1.3,
    repairCostMult: 0.8
  },
  normal: {
    name: 'Standard',
    payMult: 1.0,
    fuelMult: 1.0,
    aiSpeedMult: 1.0,
    timerMult: 1.0,
    repairCostMult: 1.0
  },
  hard: {
    name: "Captain's Challenge",
    payMult: 0.8,
    fuelMult: 1.15,
    aiSpeedMult: 1.3,
    timerMult: 0.8,
    repairCostMult: 1.3
  },
  endless: {
    name: 'Endless',
    payMult: 1.0,
    fuelMult: 1.0,
    aiSpeedMult: 1.0,
    timerMult: 1.0,
    repairCostMult: 1.0,
    noVictory: true
  }
};
let currentDifficulty = DIFFICULTY.normal;

function showDifficultySelect() {
  if (window.Game && Game.ui && Game.ui.isModalOpen && Game.ui.isModalOpen()) return;
  const panel = document.getElementById('difficultyPanel');
  panel.classList.add('show');
  // Controller focus: jump to first difficulty card
  try {
    const first = panel.querySelector('.difficulty-card');
    if (first) { _gpEnhanceClickable(first); _gpSetFocused(first); }
  } catch (e) { }
}

function closeDifficultySelect() {
  document.getElementById('difficultyPanel').classList.remove('show');
}

function startGameWithDifficulty(diff) {
  currentDifficulty = DIFFICULTY[diff] || DIFFICULTY.normal;
  _selectedDifficultyKey = diff;

  // Reset game state for new game
  game.money = 100; game.jobsDone = 0; game.time = 0; game.paused = false;
  career.currentRegion = 0;
  career.unlockedRegions = [true, false, false, false, false];
  career.totalDeliveries = 0;
  career.totalEarnings = 0;
  career.regionDeliveries = [0, 0, 0, 0, 0];
  licenses.owned = [];
  licenses.rushJobs = 0; licenses.fragileJobs = 0; licenses.rescueJobs = 0; licenses.salvageJobs = 0;
  tugboat.x = 500; tugboat.y = 2000; tugboat.angle = 0;
  tugboat.vx = 0; tugboat.vy = 0; tugboat.angularVel = 0;
  tugboat.fuel = 100; tugboat.health = 100;
  tugboat.currentBoat = 0;
  tugboat.ownedBoats = [true, false, false, false, false, false, false];
  tugboat.attached = null;

  // Reset player tier (new progression system)
  playerTier = 0;

  // Reset win/lose state
  gameWon = false;
  gameLost = false;

  // Clear transient state
  currentJob = null;
  availableJobs = [];
  cargos = [];
  competitors = [];
  competitorJobs = [];
  waterParticles = [];
  ripples = [];

  // Spawn AI and jobs
  const region = getCurrentRegion();
  for (let i = 0; i < region.aiCount; i++) {
    competitors.push(createCompetitor(i));
  }
  spawnNewJob();

  closeDifficultySelect();
  startGame();

  // Save to active profile
  try { saveToSlot(activeSaveSlot); } catch (e) { }
}

function startGame() {
  gameStarted = true;
  document.getElementById('startScreen').classList.add('hidden');
  initAudio();
  startEngine();
  playSound('horn');
  generateRegionFeatures();
}

function showOptions() {
  if (window.Game && Game.ui && Game.ui.isModalOpen && Game.ui.isModalOpen()) return;
  document.getElementById('optionsPanel').classList.add('show');
}

function hideOptions() {
  document.getElementById('optionsPanel').classList.remove('show');
}

function showHowToPlay() {
  if (window.Game && Game.ui && Game.ui.isModalOpen && Game.ui.isModalOpen()) return;
  document.getElementById('howToPlayPanel').classList.add('show');
}

function closeHowToPlay() {
  document.getElementById('howToPlayPanel').classList.remove('show');
}

function toggleSoundOption() {
  options.sound = !options.sound;
  soundEnabled = options.sound;
  const btn = document.getElementById('soundToggle');
  btn.textContent = options.sound ? 'ON' : 'OFF';
  btn.classList.toggle('active', options.sound);
  if (!options.sound && engineRunning) stopEngine();
  if (options.sound && gameStarted && !engineRunning) startEngine();
}

function toggleEngineOption() {
  options.engineSound = !options.engineSound;
  const btn = document.getElementById('engineToggle');
  btn.textContent = options.engineSound ? 'ON' : 'OFF';
  btn.classList.toggle('active', options.engineSound);
  if (!options.engineSound && engineRunning) stopEngine();
  if (options.engineSound && gameStarted && soundEnabled && !engineRunning) startEngine();
}

function updateVolume() {
  options.volume = parseInt(document.getElementById('volumeSlider').value);
  masterVolume = options.volume / 100;
  document.getElementById('volumeValue').textContent = options.volume + '%';
}

function toggleWavesOption() {
  options.waves = !options.waves;
  const btn = document.getElementById('wavesToggle');
  btn.textContent = options.waves ? 'ON' : 'OFF';
  btn.classList.toggle('active', options.waves);
}

function toggleMinimapOption() {
  options.minimap = !options.minimap;
  const btn = document.getElementById('minimapToggle');
  btn.textContent = options.minimap ? 'ON' : 'OFF';
  btn.classList.toggle('active', options.minimap);
  document.getElementById('minimap').style.display = options.minimap ? 'block' : 'none';
}

function toggleParticlesOption() {
  options.particles = !options.particles;
  const btn = document.getElementById('particlesToggle');
  btn.textContent = options.particles ? 'ON' : 'OFF';
  btn.classList.toggle('active', options.particles);
}

function toggleWeatherFxOption() {
  options.weatherFx = !options.weatherFx;
  const btn = document.getElementById('weatherFxToggle');
  btn.textContent = options.weatherFx ? 'ON' : 'OFF';
  btn.classList.toggle('active', options.weatherFx);
}

function cycleQuality() {
  const qualities = ['Low', 'Medium', 'High'];
  const currentIdx = qualities.indexOf(options.quality);
  options.quality = qualities[(currentIdx + 1) % qualities.length];
  document.getElementById('qualityBtn').textContent = options.quality;

  // Apply quality presets
  if (options.quality === 'Low') {
    options.waves = false;
    options.particles = false;
    options.weatherFx = false;
  } else if (options.quality === 'Medium') {
    options.waves = true;
    options.particles = false;
    options.weatherFx = true;
  } else {
    options.waves = true;
    options.particles = true;
    options.weatherFx = true;
  }
  updateOptionsUI();
}

// Display options
const ASPECT_RATIOS = [
  { name: '3:2', width: 900, height: 600 },
  { name: '16:9', width: 960, height: 540 },
  { name: '16:10', width: 900, height: 562 },
  { name: '4:3', width: 800, height: 600 },
  { name: '21:9', width: 1050, height: 450 }
];
let currentAspect = 0;
let isFullscreen = false;

function cycleAspect() {
  currentAspect = (currentAspect + 1) % ASPECT_RATIOS.length;
  applyAspectRatio();
}

function applyAspectRatio() {
  const aspect = ASPECT_RATIOS[currentAspect];
  const container = document.getElementById('gameContainer');
  const canvas = document.getElementById('gameCanvas');

  // Update VIEW constants
  VIEW.width = aspect.width;
  VIEW.height = aspect.height;

  // Update canvas size
  canvas.width = aspect.width;
  canvas.height = aspect.height;

  // Update container size (only if not fullscreen and not on mobile)
  if (!isFullscreen) {
    const isMobile = ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    if (!isMobile) {
      container.style.width = aspect.width + 'px';
      container.style.height = aspect.height + 'px';
    } else {
      container.style.width = '100vw';
      container.style.height = '100vh';
    }
  }

  // Update button text
  document.getElementById('aspectBtn').textContent = aspect.name;
}

function toggleFullscreen() {
  const container = document.getElementById('gameContainer');
  const canvas = document.getElementById('gameCanvas');

  if (!isFullscreen) {
    // Enter fullscreen
    if (container.requestFullscreen) {
      container.requestFullscreen();
    } else if (container.webkitRequestFullscreen) {
      container.webkitRequestFullscreen();
    } else if (container.mozRequestFullScreen) {
      container.mozRequestFullScreen();
    }
  } else {
    // Exit fullscreen
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    }
  }
}

// Handle fullscreen changes
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
document.addEventListener('mozfullscreenchange', handleFullscreenChange);

function handleFullscreenChange() {
  const container = document.getElementById('gameContainer');
  const canvas = document.getElementById('gameCanvas');
  const btn = document.getElementById('fullscreenToggle');

  isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);

  if (isFullscreen) {
    // Scale to fill screen while maintaining aspect ratio
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const aspect = ASPECT_RATIOS[currentAspect];
    const scale = Math.min(screenW / aspect.width, screenH / aspect.height);

    container.style.width = '100vw';
    container.style.height = '100vh';
    canvas.style.width = (aspect.width * scale) + 'px';
    canvas.style.height = (aspect.height * scale) + 'px';

    btn.textContent = 'ON';
    btn.classList.add('active');
  } else {
    // Restore normal size
    const aspect = ASPECT_RATIOS[currentAspect];
    const isMobile = ('ontouchstart' in window || navigator.maxTouchPoints > 0);

    if (!isMobile) {
      container.style.width = aspect.width + 'px';
      container.style.height = aspect.height + 'px';
    } else {
      container.style.width = '100vw';
      container.style.height = '100vh';
    }
    canvas.style.width = '';
    canvas.style.height = '';

    btn.textContent = 'OFF';
    btn.classList.remove('active');
  }
}

function updateOptionsUI() {
  document.getElementById('wavesToggle').textContent = options.waves ? 'ON' : 'OFF';
  document.getElementById('wavesToggle').classList.toggle('active', options.waves);
  document.getElementById('particlesToggle').textContent = options.particles ? 'ON' : 'OFF';
  document.getElementById('particlesToggle').classList.toggle('active', options.particles);
  document.getElementById('weatherFxToggle').textContent = options.weatherFx ? 'ON' : 'OFF';
  document.getElementById('weatherFxToggle').classList.toggle('active', options.weatherFx);
}

// Keybinding system
const defaultKeybinds = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  attach: 'Space',
  refuel: 'KeyF',
  repair: 'KeyR',
  horn: 'KeyH',
  leaderboard: 'KeyL'
};

let keybinds = { ...defaultKeybinds };
let remapTarget = null;

function openRemapPanel() {
  if (window.Game && Game.ui && Game.ui.isModalOpen && Game.ui.isModalOpen()) return;
  document.getElementById('remapPanel').classList.add('show');
  updateRemapUI();
}

function closeRemapPanel() {
  document.getElementById('remapPanel').classList.remove('show');
  remapTarget = null;
  document.querySelectorAll('.remap-btn').forEach(btn => btn.classList.remove('listening'));
}

function startRemap(action) {
  remapTarget = action;
  document.querySelectorAll('.remap-btn').forEach(btn => btn.classList.remove('listening'));
  document.getElementById('remap' + action.charAt(0).toUpperCase() + action.slice(1)).classList.add('listening');
}

function getKeyDisplayName(code) {
  if (code === 'Space') return 'SPACE';
  if (code.startsWith('Key')) return code.substring(3);
  if (code.startsWith('Arrow')) return 'â†‘â†“â†â†’'['UpDownLeftRight'.indexOf(code.substring(5)) / 2] || code.substring(5);
  if (code.startsWith('Digit')) return code.substring(5);
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'SHIFT';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'CTRL';
  if (code === 'AltLeft' || code === 'AltRight') return 'ALT';
  return code;
}

function updateRemapUI() {
  document.getElementById('remapUp').textContent = getKeyDisplayName(keybinds.up);
  document.getElementById('remapDown').textContent = getKeyDisplayName(keybinds.down);
  document.getElementById('remapLeft').textContent = getKeyDisplayName(keybinds.left);
  document.getElementById('remapRight').textContent = getKeyDisplayName(keybinds.right);
  document.getElementById('remapAttach').textContent = getKeyDisplayName(keybinds.attach);
  document.getElementById('remapRefuel').textContent = getKeyDisplayName(keybinds.refuel);
  document.getElementById('remapRepair').textContent = getKeyDisplayName(keybinds.repair);
  document.getElementById('remapHorn').textContent = getKeyDisplayName(keybinds.horn);
  document.getElementById('remapLeaderboard').textContent = getKeyDisplayName(keybinds.leaderboard);

  // Update controls display in options
  document.getElementById('keyUp').textContent = getKeyDisplayName(keybinds.up);
  document.getElementById('keyDown').textContent = getKeyDisplayName(keybinds.down);
  document.getElementById('keyLeft').textContent = getKeyDisplayName(keybinds.left);
  document.getElementById('keyRight').textContent = getKeyDisplayName(keybinds.right);
  document.getElementById('keyAttach').textContent = getKeyDisplayName(keybinds.attach);
  document.getElementById('keyRefuel').textContent = getKeyDisplayName(keybinds.refuel);
  document.getElementById('keyRepair').textContent = getKeyDisplayName(keybinds.repair);
  document.getElementById('keyHorn').textContent = getKeyDisplayName(keybinds.horn);
  document.getElementById('keyLeaderboard').textContent = getKeyDisplayName(keybinds.leaderboard);
}

function resetKeybinds() {
  keybinds = { ...defaultKeybinds };
  updateRemapUI();
}

function isKeyBound(action) {
  return (code) => code === keybinds[action] ||
    (action === 'up' && code === 'ArrowUp') ||
    (action === 'down' && code === 'ArrowDown') ||
    (action === 'left' && code === 'ArrowLeft') ||
    (action === 'right' && code === 'ArrowRight');
}

function quitToMenu() {
  hideOptions();
  gameStarted = false;
  gameWon = false;
  gameLost = false;
  currentDifficulty = DIFFICULTY.normal;
  document.getElementById('startScreen').classList.remove('hidden');
  if (engineRunning) stopEngine();
  // Reset game state
  game.money = 100; game.jobsDone = 0; game.time = 0; game.paused = false;
  // Reset boat
  tugboat.x = 500; tugboat.y = 2000; tugboat.angle = 0;
  tugboat.vx = 0; tugboat.vy = 0; tugboat.angularVel = 0;
  tugboat.attached = null; tugboat.fuel = 100;
  tugboat.health = 100;
  tugboat.currentBoat = 0;
  tugboat.ownedBoats = [true, false, false, false, false, false, false];
  // Reset licenses
  licenses.owned = [];
  licenses.rushJobs = 0;
  licenses.fragileJobs = 0;
  licenses.rescueJobs = 0;
  licenses.salvageJobs = 0;
  waterParticles = []; ripples = [];
  competitors = []; competitorJobs = [];
  lastPlayerRank = 1; lastLeaderName = 'You'; eventCooldown = 0;
  chainCount = 0; lastDeliveryTime = 0;
  cargos = []; currentJob = null; availableJobs = [];
  // Reset career (keep nothing)
  career.currentRegion = 0;
  career.unlockedRegions = [true, false, false, false, false];
  career.totalDeliveries = 0;
  career.totalEarnings = 0;
  career.regionDeliveries = [0, 0, 0, 0, 0];
  // Reset player tier (new progression system)
  playerTier = 0;
  // Reset weather
  initCurrents();
  weather.current = WEATHER_TYPES.CLEAR;
  weather.raindrops = [];
  // Reset tide
  TIDE.phase = 0;
  // Hide job board if showing
  document.getElementById('jobBoardPanel').classList.remove('show');
  document.getElementById('leaderboard').style.display = 'none';
  // DON'T spawn jobs here - wait until game actually starts
  updateUI();
  updateRegionUI();
}

function openBoatShop() {
  if (!window.Game || !Game.ui || !Game.ui.lockModal) { game.paused = true; }
  if (window.Game && Game.ui && Game.ui.lockModal && !Game.ui.lockModal('boatShop')) return;
  document.getElementById('boatShopPanel').classList.add('show');
  updateBoatShopUI();
}

function closeBoatShop() {
  document.getElementById('boatShopPanel').classList.remove('show');
  if (window.Game && Game.ui && Game.ui.unlockModal) Game.ui.unlockModal('boatShop');
  else game.paused = false;
}

function openCareer() {
  if (!window.Game || !Game.ui || !Game.ui.lockModal) { game.paused = true; }
  if (window.Game && Game.ui && Game.ui.lockModal && !Game.ui.lockModal('career')) return;
  document.getElementById('careerPanel').classList.add('show');
  updateCareerUI();
}

function closeCareer() {
  document.getElementById('careerPanel').classList.remove('show');
  if (window.Game && Game.ui && Game.ui.unlockModal) Game.ui.unlockModal('career');
  else game.paused = false;
}

function updateCareerUI() {
  // Update stats
  document.getElementById('careerDeliveries').textContent = career.totalDeliveries;
  document.getElementById('careerEarnings').textContent = '$' + career.totalEarnings;
  document.getElementById('careerRegions').textContent = `${getCurrentTier().name}`;

  // Build tier list
  const list = document.getElementById('regionList');
  list.innerHTML = '';

  JOB_TIERS.forEach((tier, i) => {
    const unlocked = i <= playerTier;
    const current = i === playerTier;
    const isNext = i === playerTier + 1;
    const canUnlock = isNext && canUnlockTier(i);
    const meetsJobs = game.jobsDone >= tier.jobsRequired;
    const canAfford = game.money >= tier.unlockCost;

    const div = document.createElement('div');
    div.className = 'region-item' +
      (unlocked ? ' unlocked' : ' locked') +
      (current ? ' current' : '');

    let buttonHtml = '';
    let reqHtml = '';

    if (current) {
      buttonHtml = '<button class="region-unlock-btn" disabled style="background: #27ae60; color: #fff;">Current Tier</button>';
    } else if (unlocked) {
      buttonHtml = '<button class="region-unlock-btn" disabled style="background: #3498db; color: #fff;"><span class="icon icon-check"></span> Unlocked</button>';
    } else if (canUnlock) {
      buttonHtml = `<button class="region-unlock-btn can-unlock" onclick="unlockTier(${i})">Unlock $${tier.unlockCost}</button>`;
    } else if (isNext) {
      buttonHtml = `<button class="region-unlock-btn cannot-unlock" disabled>$${tier.unlockCost}</button>`;
      let reqs = [];
      if (!meetsJobs) reqs.push(`Need ${tier.jobsRequired} jobs (${game.jobsDone}/${tier.jobsRequired})`);
      if (!canAfford && meetsJobs) reqs.push(`Need $${tier.unlockCost}`);
      reqHtml = `<div class="region-unlock-req">${reqs.join(' &bull; ')}</div>`;
    } else {
      buttonHtml = '<button class="region-unlock-btn cannot-unlock" disabled><span class="icon icon-lock"></span> Locked</button>';
      reqHtml = `<div class="region-unlock-req">Unlock previous tier first</div>`;
    }

    // Spawn zone display names
    const zoneNames = {
      'harbor': 'Harbor Only',
      'harbor_edge': 'Near Harbor',
      'river_mid': 'River Routes',
      'river_mouth': 'River + Coast',
      'ocean': 'Full Ocean'
    };

    div.innerHTML = `
          <div class="region-icon">${tier.icon}</div>
          <div class="region-info">
            <h3>${tier.name} ${current ? '<span class="icon icon-check"></span>' : ''}</h3>
            <div class="region-desc">${tier.description}</div>
            <div class="region-stats">
              <span><span class="icon icon-money"></span> ${Math.round(tier.payMultiplier * 100)}% pay</span>
              <span><span class="icon icon-anchor"></span> ${zoneNames[tier.spawnZone] || tier.spawnZone}</span>
              <span><span class="icon icon-casual"></span> ${tier.aiCount} rivals</span>
            </div>
            ${reqHtml}
          </div>
          ${buttonHtml}
        `;

    list.appendChild(div);
  });
}

function updateRegionUI() {
  const tier = getCurrentTier();
  document.getElementById('currentRegion').innerHTML = `${tier.icon} ${tier.name}`;
}

function updateBoatShopUI() {
  const list = document.getElementById('boatList');
  list.innerHTML = '';

  BOATS.forEach((boat, i) => {
    const owned = tugboat.ownedBoats[i];
    const selected = tugboat.currentBoat === i;
    const canAfford = game.money >= boat.price;

    const div = document.createElement('div');
    div.className = 'boat-item' + (owned ? ' owned' : '') + (selected ? ' selected' : '');

    // Calculate relative stats (compared to max boat)
    const maxBoat = BOATS[BOATS.length - 1];
    const speedPct = Math.round((boat.speed / maxBoat.speed) * 100);
    const towPct = Math.round((boat.towStrength / maxBoat.towStrength) * 100);
    const fuelPct = Math.round((boat.maxFuel / maxBoat.maxFuel) * 100);
    const healthPct = Math.round((boat.maxHealth / maxBoat.maxHealth) * 100);

    div.innerHTML = `
          <canvas class="boat-preview" id="boatPreview${i}" width="50" height="30"></canvas>
          <div class="boat-item-info">
            <h3>${boat.icon} ${boat.name} ${selected ? '<span class="icon icon-star"></span> ' : ''}</h3>
            <p class="boat-desc">${boat.description}</p>
            <div class="stats">
              <span title="Speed"><span class="icon icon-speed"></span>${speedPct}%</span>
              <span title="Towing"><span class="icon icon-strength"></span>${towPct}%</span>
              <span title="Fuel"><span class="icon icon-fuel"></span>${fuelPct}%</span>
              <span title="Health"><span class="icon icon-repair"></span>${healthPct}%</span>
            </div>
            <div class="boat-tier">Cargo Tier: ${'<span class="icon icon-star"></span> '.repeat(boat.cargoTier)}</div>
          </div>
          ${owned
        ? (selected
          ? '<button class="upgrade-buy-btn" disabled>Equipped</button>'
          : `<button class="upgrade-buy-btn select-btn" onclick="selectBoat(${i})">Select</button>`)
        : `<button class="upgrade-buy-btn" onclick="buyBoat(${i})" ${canAfford ? '' : 'disabled'}>$${boat.price}</button>`
      }
        `;
    list.appendChild(div);

    // Draw boat preview
    setTimeout(() => drawBoatPreview(i), 10);
  });
}

function drawBoatPreview(index) {
  const canvas = document.getElementById('boatPreview' + index);
  if (!canvas) return;
  const pctx = canvas.getContext('2d');
  const boat = BOATS[index];

  pctx.clearRect(0, 0, 50, 30);
  pctx.save();
  pctx.translate(25, 15);

  const hg = pctx.createLinearGradient(0, -8, 0, 8);
  hg.addColorStop(0, boat.color1);
  hg.addColorStop(0.5, boat.color2);
  hg.addColorStop(1, boat.color3);
  pctx.fillStyle = hg;
  pctx.beginPath();
  pctx.moveTo(18, 0);
  pctx.quadraticCurveTo(20, -6, 12, -8);
  pctx.lineTo(-14, -8);
  pctx.quadraticCurveTo(-18, -8, -18, 0);
  pctx.quadraticCurveTo(-18, 8, -14, 8);
  pctx.lineTo(12, 8);
  pctx.quadraticCurveTo(20, 6, 18, 0);
  pctx.closePath();
  pctx.fill();

  pctx.fillStyle = '#fafafa';
  pctx.fillRect(-2, -5, 10, 10);
  pctx.restore();
}

function buyBoat(index) {
  const boat = BOATS[index];
  if (game.money >= boat.price && !tugboat.ownedBoats[index]) {
    game.money -= boat.price;
    tugboat.ownedBoats[index] = true;
    playSound('money');
    addCameraShake(5, 0.18); // Big purchase shake!
    updateUI();
    updateBoatShopUI();
  }
}

function selectBoat(index) {
  if (tugboat.ownedBoats[index]) {
    const oldMaxHealth = tugboat.maxHealth;
    const oldMaxFuel = tugboat.maxFuel;
    tugboat.currentBoat = index;
    // Scale health/fuel proportionally to new boat's max, or keep full if switching to better boat
    const healthPercent = tugboat.health / oldMaxHealth;
    const fuelPercent = tugboat.fuel / oldMaxFuel;
    tugboat.health = Math.round(healthPercent * tugboat.maxHealth);
    tugboat.fuel = Math.round(fuelPercent * tugboat.maxFuel);
    playSound('attach');
    document.getElementById('boatName').textContent = BOATS[index].name;
    updateUI();
    updateBoatShopUI();
    updateCompetitorDifficulty(); // AI scales when player gets better boat
  }
}

function initAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// Engine sound (continuous)
let engineOsc = null;
let engineGain = null;
let engineRunning = false;

function startEngine() {
  if (!soundEnabled || !options.engineSound || !audioCtx || engineRunning) return;
  engineOsc = audioCtx.createOscillator();
  engineGain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();

  engineOsc.type = 'sawtooth';
  engineOsc.frequency.setValueAtTime(45, audioCtx.currentTime);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(150, audioCtx.currentTime);
  engineGain.gain.setValueAtTime(0, audioCtx.currentTime);

  engineOsc.connect(filter);
  filter.connect(engineGain);
  engineGain.connect(audioCtx.destination);
  engineOsc.start();
  engineRunning = true;
}

function updateEngineSound(throttle, speed) {
  if (!engineGain || !engineOsc || !soundEnabled || !options.engineSound) return;
  const targetGain = throttle > 0 ? 0.08 * masterVolume : 0;
  const targetFreq = 40 + speed * 8 + throttle * 15;
  engineGain.gain.linearRampToValueAtTime(targetGain, audioCtx.currentTime + 0.1);
  engineOsc.frequency.linearRampToValueAtTime(targetFreq, audioCtx.currentTime + 0.1);
}

function stopEngine() {
  if (engineOsc) {
    engineGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);
    setTimeout(() => {
      if (engineOsc) { engineOsc.stop(); engineOsc = null; engineRunning = false; }
    }, 250);
  }
}

// Play a sound effect
function playSound(type) {
  if (!soundEnabled || !audioCtx) return;

  const vol = masterVolume;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  switch (type) {
    case 'attach':
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);
      gain.gain.setValueAtTime(0.15 * vol, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
      break;

    case 'detach':
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
      gain.gain.setValueAtTime(0.1 * vol, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
      break;

    case 'money':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.setValueAtTime(1000, now + 0.05);
      osc.frequency.setValueAtTime(1200, now + 0.1);
      gain.gain.setValueAtTime(0.12 * vol, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
      break;

    case 'success':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523, now);
      osc.frequency.setValueAtTime(659, now + 0.1);
      osc.frequency.setValueAtTime(784, now + 0.2);
      osc.frequency.setValueAtTime(1047, now + 0.3);
      gain.gain.setValueAtTime(0.12 * vol, now);
      gain.gain.setValueAtTime(0.12 * vol, now + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
      break;

    case 'fail':
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.4);
      gain.gain.setValueAtTime(0.12 * vol, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
      break;

    case 'collision':
      const noise = audioCtx.createBufferSource();
      const bufferSize = audioCtx.sampleRate * 0.1;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
      }
      noise.buffer = buffer;
      const noiseGain = audioCtx.createGain();
      noiseGain.gain.setValueAtTime(0.3 * vol, now);
      noise.connect(noiseGain);
      noiseGain.connect(audioCtx.destination);
      noise.start(now);
      return;

    case 'refuel':
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.08 * vol, now);
      for (let i = 0; i < 8; i++) {
        osc.frequency.setValueAtTime(300 + Math.random() * 200, now + i * 0.05);
      }
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
      break;

    case 'horn':
      osc.type = 'sawtooth';
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, now);
      osc.disconnect();
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.setValueAtTime(170, now + 0.6);
      gain.gain.setValueAtTime(0.15 * vol, now);
      gain.gain.setValueAtTime(0.15 * vol, now + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);
      osc.start(now);
      osc.stop(now + 0.7);
      break;

    case 'warning':
      osc.type = 'square';
      osc.frequency.setValueAtTime(600, now);
      gain.gain.setValueAtTime(0.08 * vol, now);
      gain.gain.setValueAtTime(0, now + 0.1);
      gain.gain.setValueAtTime(0.08 * vol, now + 0.15);
      gain.gain.setValueAtTime(0, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
      break;

    case 'splash':
      const splashNoise = audioCtx.createBufferSource();
      const splashSize = audioCtx.sampleRate * 0.2;
      const splashBuffer = audioCtx.createBuffer(1, splashSize, audioCtx.sampleRate);
      const splashData = splashBuffer.getChannelData(0);
      for (let i = 0; i < splashSize; i++) {
        splashData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (splashSize * 0.15)) * 0.5;
      }
      splashNoise.buffer = splashBuffer;
      const splashFilter = audioCtx.createBiquadFilter();
      splashFilter.type = 'bandpass';
      splashFilter.frequency.setValueAtTime(1000, now);
      const splashGain = audioCtx.createGain();
      splashGain.gain.setValueAtTime(0.15 * vol, now);
      splashNoise.connect(splashFilter);
      splashFilter.connect(splashGain);
      splashGain.connect(audioCtx.destination);
      splashNoise.start(now);
      return;

    case 'click':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000, now);
      gain.gain.setValueAtTime(0.05 * vol, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
      break;

    case 'uiMove':
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.04);
      gain.gain.setValueAtTime(0.035 * vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.06);
      break;

    case 'uiSelect':
      osc.type = 'square';
      osc.frequency.setValueAtTime(700, now);
      osc.frequency.exponentialRampToValueAtTime(980, now + 0.05);
      gain.gain.setValueAtTime(0.05 * vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.start(now);
      osc.stop(now + 0.07);
      break;

    case 'uiBack':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(240, now + 0.06);
      gain.gain.setValueAtTime(0.045 * vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
      break;

    case 'jobAccept':
      // a quick "thunk + chirp" that feels like accepting a contract
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.08);
      gain.gain.setValueAtTime(0.06 * vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      osc.start(now);
      osc.stop(now + 0.11);
      break;
  }
}

// Polyfill for roundRect
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    if (w < 2 * r) r = w / 2; if (h < 2 * r) r = h / 2;
    this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r); this.closePath(); return this;
  };
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');

// NEW MAP: 8000 wide x 4000 tall (Harbor left, Rivers middle, Ocean right)
const WORLD = { width: 8000, height: 4000 };
let VIEW = { width: 900, height: 600 };
const camera = { x: 0, y: 0 };

// ==========================================
// NEW MAP SYSTEM - Rivers, Harbor, Ocean
// ==========================================

// Zone types for collision
const ZONE = {
  WATER: 0,      // Safe navigation (ocean, river)
  SHALLOWS: 1,   // Slow + minor damage over time
  LAND: 2,       // Hard collision - stop + major damage
  DOCK: 3        // Special - can dock if slow, damage if fast
};

// River definitions - each is a series of path segments
const RIVERS = {
  north: {
    name: 'North Channel',
    width: 280,           // Wide and easy (increased)
    currentStrength: 0.15, // Gentle current - easy upstream
    payBonus: 1.0,        // No bonus
    // Path points from harbor (left) to ocean (right)
    // Extended into harbor basin for smooth connection
    path: [
      { x: 200, y: 700 },   // Inside harbor basin
      { x: 500, y: 750 },   // Transition
      { x: 900, y: 780 },
      { x: 1400, y: 750 },
      { x: 2000, y: 700 },
      { x: 2800, y: 720 },
      { x: 3600, y: 680 },
      { x: 4400, y: 700 },
      { x: 5200, y: 750 },
      { x: 6000, y: 850 },
      { x: 6600, y: 1000 }  // Into ocean
    ],
    bridgeAt: 4400  // X position of bridge
  },
  main: {
    name: 'Main River',
    width: 220,           // Medium width (increased)
    currentStrength: 0.25, // Moderate current
    payBonus: 1.15,       // Small bonus
    path: [
      { x: 200, y: 1900 },  // Inside harbor basin
      { x: 500, y: 1850 },
      { x: 900, y: 1800 },
      { x: 1400, y: 1700 },
      { x: 2000, y: 1650 },
      { x: 2600, y: 1750 },
      { x: 3200, y: 1850 },
      { x: 3800, y: 1800 },
      { x: 4400, y: 1650 },
      { x: 5000, y: 1550 },
      { x: 5600, y: 1500 },
      { x: 6200, y: 1550 },
      { x: 6800, y: 1700 }  // Into ocean
    ],
    bridgeAt: 3400
  },
  south: {
    name: 'South Passage',
    width: 170,           // Challenging but playable (increased from 130)
    currentStrength: 0.4,  // Strong but manageable
    payBonus: 1.5,        // Big bonus for difficulty
    path: [
      { x: 200, y: 3100 },  // Inside harbor basin
      { x: 500, y: 3000 },
      { x: 900, y: 2950 },
      { x: 1300, y: 3050 },
      { x: 1700, y: 3200 },
      { x: 2100, y: 3300 },
      { x: 2500, y: 3250 },
      { x: 2900, y: 3100 },
      { x: 3300, y: 2950 },
      { x: 3700, y: 2900 },
      { x: 4100, y: 2950 },
      { x: 4500, y: 3050 },
      { x: 4900, y: 3100 },
      { x: 5300, y: 3000 },
      { x: 5700, y: 2850 },
      { x: 6100, y: 2700 },
      { x: 6500, y: 2650 },
      { x: 6900, y: 2750 }  // Into ocean
    ],
    bridgeAt: 3300
  }
};

// Tide system - affects current strength
const TIDE = {
  cycle: 300,        // 5 minutes full cycle (in seconds)
  phase: 0,          // Current phase (0-1)
  // High tide = 0.5 current mult, Low tide = 1.5 current mult
  getCurrentMultiplier: function () {
    // Sine wave: 0.5 at high tide, 1.5 at low tide
    return 1.0 + 0.5 * Math.sin(this.phase * Math.PI * 2);
  },
  getPayBonus: function () {
    // Low tide gives +20% pay bonus
    const mult = this.getCurrentMultiplier();
    return mult > 1.2 ? 1.2 : 1.0;
  },
  isHighTide: function () { return this.phase < 0.25 || this.phase > 0.75; },
  update: function (dt) {
    this.phase = (this.phase + dt / this.cycle) % 1.0;
  }
};

// Harbor area (left side of map)
const HARBOR = {
  x: 0,
  y: 0,
  width: 1200,
  height: WORLD.height,
  dockZone: { x: 80, y: 350, width: 980, height: 3300 }
};

// Ocean area (right side of map) 
const OCEAN = {
  x: 6200,
  y: 0,
  width: 1800,
  height: WORLD.height
};

// Job tiers (replaces regions)
const JOB_TIERS = [
  {
    name: 'Rookie',
    icon: '<span class="icon icon-casual"></span>',
    description: 'Harbor-only jobs, learn the ropes',
    unlockCost: 0,
    jobsRequired: 0,
    payMultiplier: 1.0,
    cargoSize: 'small',
    spawnZone: 'harbor',        // Stay in harbor
    maxDistance: 800,
    aiCount: 1
  },
  {
    name: 'Deckhand',
    icon: '<span class="icon icon-anchor"></span>',
    description: 'Near-harbor and river entrance',
    unlockCost: 400,
    jobsRequired: 8,
    payMultiplier: 1.2,
    cargoSize: 'small',
    spawnZone: 'harbor_edge',   // Harbor + nearby river
    maxDistance: 1500,
    aiCount: 1
  },
  {
    name: 'Skipper',
    icon: '<span class="icon icon-boat"></span>',
    description: 'River routes, medium cargo',
    unlockCost: 1500,
    jobsRequired: 20,
    payMultiplier: 1.4,
    cargoSize: 'medium',
    spawnZone: 'river_mid',     // Mid-river docks
    maxDistance: 3000,
    aiCount: 2
  },
  {
    name: 'Captain',
    icon: '<span class="icon icon-trophy"></span>',
    description: 'Full river + near ocean',
    unlockCost: 4000,
    jobsRequired: 40,
    payMultiplier: 1.7,
    cargoSize: 'large',
    spawnZone: 'river_mouth',   // River mouth / near ocean
    maxDistance: 5000,
    aiCount: 3
  },
  {
    name: 'Harbor Master',
    icon: '<span class="icon icon-star"></span>',
    description: 'Ocean runs, VIP, Hazmat',
    unlockCost: 10000,
    jobsRequired: 75,
    payMultiplier: 2.0,
    cargoSize: 'huge',
    spawnZone: 'ocean',         // Full ocean access
    maxDistance: 8000,
    aiCount: 4
  }
];

// Player's current tier
let playerTier = 0;

function getCurrentTier() {
  return JOB_TIERS[playerTier];
}

function canUnlockTier(tierIndex) {
  if (tierIndex <= playerTier) return false;
  if (tierIndex > playerTier + 1) return false; // Can only unlock next tier
  const tier = JOB_TIERS[tierIndex];
  return game.jobsDone >= tier.jobsRequired && game.money >= tier.unlockCost;
}

function unlockTier(tierIndex) {
  if (!canUnlockTier(tierIndex)) return false;
  const tier = JOB_TIERS[tierIndex];
  game.money -= tier.unlockCost;
  playerTier = tierIndex;
  playSound('success');
  addCameraShake(5, 0.2);
  showEvent('comeback', `${tier.icon} ${tier.name} Unlocked!`, tier.description);
  updateUI();
  updateRegionUI();
  updateCareerUI();
  return true;
}

// Zoom system
let zoom = {
  level: 0.7,
  min: 0.5,
  max: 2.0,
  target: 0.7,
  speed: 0.1
};

const game = {
  money: 100, jobsDone: 0, time: 0, paused: false
};

// Weather System
const WEATHER_TYPES = {
  CLEAR: {
    name: 'Clear',
    icon: '<span class="icon icon-sun"></span>',
    visibility: 1.0,
    windStrength: 0,
    currentStrength: 0,
    payBonus: 1.0,
    duration: [1800, 3600] // 30-60 seconds at 60fps
  },
  WIND: {
    name: 'Windy',
    icon: '<span class="icon icon-wind"></span>',
    visibility: 1.0,
    windStrength: 0.015,
    currentStrength: 0,
    payBonus: 1.15,
    duration: [1200, 2400]
  },
  FOG: {
    name: 'Foggy',
    icon: '<span class="icon icon-fog"></span>',
    visibility: 0.3,
    windStrength: 0,
    currentStrength: 0,
    payBonus: 1.25,
    duration: [1200, 2400]
  },
  RAIN: {
    name: 'Rain',
    icon: '<span class="icon icon-rain"></span>',
    visibility: 0.7,
    windStrength: 0.008,
    currentStrength: 0.005,
    payBonus: 1.2,
    duration: [1200, 2400]
  },
  STORM: {
    name: 'Storm',
    icon: '<span class="icon icon-storm"></span>',
    visibility: 0.5,
    windStrength: 0.025,
    currentStrength: 0.012,
    payBonus: 1.5,
    duration: [900, 1800]
  }
};

const weather = {
  current: WEATHER_TYPES.CLEAR,
  windAngle: 0,
  windTarget: 0,
  timeRemaining: 3600,
  nextWeather: null,
  raindrops: [],
  lightning: 0,
  // Currents - zones with water flow
  currents: []
};

function initCurrents() {
  // Create current zones across the expanded map
  weather.currents = [
    // Northern currents
    { x: 500, y: 400, radius: 180, angle: Math.PI * 0.25, strength: 0.012 },
    { x: 1500, y: 350, radius: 200, angle: Math.PI * 1.75, strength: 0.015 },
    { x: 2500, y: 400, radius: 170, angle: Math.PI * 0.5, strength: 0.013 },
    { x: 3300, y: 350, radius: 160, angle: Math.PI, strength: 0.011 },

    // Middle currents
    { x: 300, y: 850, radius: 200, angle: Math.PI * 1.5, strength: 0.014 },
    { x: 1100, y: 900, radius: 180, angle: Math.PI * 0.75, strength: 0.012 },
    { x: 1900, y: 850, radius: 190, angle: Math.PI * 1.25, strength: 0.015 },
    { x: 2700, y: 900, radius: 170, angle: Math.PI * 0.25, strength: 0.013 },

    // Southern currents
    { x: 600, y: 1400, radius: 200, angle: Math.PI * 1.8, strength: 0.014 },
    { x: 1400, y: 1450, radius: 180, angle: Math.PI * 0.5, strength: 0.012 },
    { x: 2200, y: 1400, radius: 190, angle: Math.PI * 1.0, strength: 0.015 },
    { x: 3000, y: 1450, radius: 170, angle: Math.PI * 1.5, strength: 0.013 },

    // Far south currents
    { x: 500, y: 2000, radius: 200, angle: Math.PI * 0.3, strength: 0.014 },
    { x: 1700, y: 2050, radius: 220, angle: Math.PI * 1.7, strength: 0.016 },
    { x: 2900, y: 2000, radius: 180, angle: Math.PI * 0.8, strength: 0.013 }
  ];
}

function changeWeather() {
  const weatherTypes = Object.values(WEATHER_TYPES);
  const region = getCurrentRegion();

  // Weight weather by region - later regions have worse weather
  let weights;
  if (career.currentRegion === 0) {
    weights = [0.6, 0.2, 0.15, 0.05, 0]; // Starter: mostly clear
  } else if (career.currentRegion <= 2) {
    weights = [0.35, 0.25, 0.2, 0.15, 0.05]; // Mid: mixed
  } else {
    weights = [0.2, 0.2, 0.2, 0.25, 0.15]; // Late: more storms
  }

  // Pick weather based on weights
  const rand = Math.random();
  let sum = 0;
  let newWeather = WEATHER_TYPES.CLEAR;
  for (let i = 0; i < weatherTypes.length; i++) {
    sum += weights[i];
    if (rand < sum) {
      newWeather = weatherTypes[i];
      break;
    }
  }

  weather.current = newWeather;
  weather.windAngle = Math.random() * Math.PI * 2;
  weather.windTarget = weather.windAngle;

  const [minDur, maxDur] = newWeather.duration;
  weather.timeRemaining = minDur + Math.random() * (maxDur - minDur);

  // Initialize raindrops if raining
  if (newWeather === WEATHER_TYPES.RAIN || newWeather === WEATHER_TYPES.STORM) {
    weather.raindrops = [];
    const count = newWeather === WEATHER_TYPES.STORM ? 150 : 80;
    for (let i = 0; i < count; i++) {
      weather.raindrops.push({
        x: Math.random() * VIEW.width,
        y: Math.random() * VIEW.height,
        speed: 8 + Math.random() * 6,
        length: 10 + Math.random() * 15
      });
    }
  } else {
    weather.raindrops = [];
  }

  // Show weather change notification
  if (gameStarted && newWeather !== WEATHER_TYPES.CLEAR) {
    showEvent('rival', `${newWeather.icon} ${newWeather.name} Weather!`,
      `${Math.round((newWeather.payBonus - 1) * 100)}% bonus pay`);
  }

  updateWeatherUI();
}

function updateWeather(delta = 1) {
  weather.timeRemaining -= delta;

  if (weather.timeRemaining <= 0) {
    changeWeather();
  }

  // Slowly shift wind direction
  if (Math.random() < 0.01 * delta) {
    weather.windTarget = weather.windAngle + (Math.random() - 0.5) * 0.5;
  }
  weather.windAngle += (weather.windTarget - weather.windAngle) * 0.01 * delta;

  // Lightning flashes in storms
  if (weather.current === WEATHER_TYPES.STORM) {
    if (weather.lightning > 0) weather.lightning -= delta;
    if (Math.random() < 0.003 * delta) {
      weather.lightning = 8;
      // Thunder sound could go here
    }
  }

  // Update raindrops
  for (const drop of weather.raindrops) {
    drop.y += drop.speed * delta;
    drop.x += weather.current.windStrength * 100 * delta;
    if (drop.y > VIEW.height) {
      drop.y = -drop.length;
      drop.x = Math.random() * VIEW.width;
    }
    if (drop.x > VIEW.width) drop.x = 0;
    if (drop.x < 0) drop.x = VIEW.width;
  }
}

function applyWeatherPhysics(obj, delta = 1) {
  const w = weather.current;

  // Apply wind
  if (w.windStrength > 0) {
    obj.vx += Math.cos(weather.windAngle) * w.windStrength * delta;
    obj.vy += Math.sin(weather.windAngle) * w.windStrength * delta;
  }

  // Apply currents
  for (const current of weather.currents) {
    const dx = obj.x - current.x;
    const dy = obj.y - current.y;
    const dist = Math.hypot(dx, dy);

    if (dist < current.radius) {
      // Stronger effect toward center
      const strength = current.strength * (1 - dist / current.radius);
      // Weather multiplies current strength
      const weatherMult = 1 + w.currentStrength * 10;
      obj.vx += Math.cos(current.angle) * strength * weatherMult * delta;
      obj.vy += Math.sin(current.angle) * strength * weatherMult * delta;
    }
  }
}

function drawWeatherEffects() {
  if (__safeMode) return;
  if (!options.weatherFx) return;
  const w = weather.current;

  // Fog overlay
  if (w.visibility < 1.0) {
    const fogAlpha = 1 - w.visibility;

    // Create radial gradient centered on player for fog
    const playerScreenX = tugboat.x - camera.x;
    const playerScreenY = tugboat.y - camera.y;

    const gradient = ctx.createRadialGradient(
      playerScreenX, playerScreenY, 50,
      playerScreenX, playerScreenY, 250
    );
    gradient.addColorStop(0, `rgba(180, 200, 220, 0)`);
    gradient.addColorStop(0.5, `rgba(180, 200, 220, ${fogAlpha * 0.5})`);
    gradient.addColorStop(1, `rgba(180, 200, 220, ${fogAlpha * 0.85})`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  // Rain
  if (weather.raindrops.length > 0) {
    ctx.strokeStyle = 'rgba(200, 220, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const drop of weather.raindrops) {
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x - weather.current.windStrength * 30, drop.y + drop.length);
    }
    ctx.stroke();
  }

  // Lightning flash
  if (weather.lightning > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${weather.lightning * 0.08})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  // Darken screen slightly for rain/storm
  if (w === WEATHER_TYPES.RAIN) {
    ctx.fillStyle = 'rgba(0, 20, 40, 0.15)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  } else if (w === WEATHER_TYPES.STORM) {
    ctx.fillStyle = 'rgba(0, 10, 30, 0.25)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
}

function drawCurrents() {
  // Calculate visible area accounting for zoom
  const viewW = VIEW.width / zoom.level;
  const viewH = VIEW.height / zoom.level;

  // Draw current indicators on water (in world space)
  ctx.globalAlpha = 0.3;
  for (const current of weather.currents) {
    // Skip if off screen
    if (current.x < camera.x - current.radius || current.x > camera.x + viewW + current.radius ||
      current.y < camera.y - current.radius || current.y > camera.y + viewH + current.radius) continue;

    // Draw flow arrows in world coordinates
    const arrowCount = 5;
    for (let i = 0; i < arrowCount; i++) {
      const angle = (i / arrowCount) * Math.PI * 2;
      const dist = current.radius * 0.5;
      const ax = current.x + Math.cos(angle) * dist;
      const ay = current.y + Math.sin(angle) * dist;

      // Animated offset based on time
      const offset = (game.time * 0.05) % 30;
      const arrowX = ax + Math.cos(current.angle) * offset;
      const arrowY = ay + Math.sin(current.angle) * offset;

      ctx.save();
      ctx.translate(arrowX, arrowY);
      ctx.rotate(current.angle);

      ctx.strokeStyle = 'rgba(100, 200, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(8, 0);
      ctx.lineTo(4, -4);
      ctx.moveTo(8, 0);
      ctx.lineTo(4, 4);
      ctx.stroke();

      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

function drawWindIndicator() {
  const indicator = document.getElementById('windIndicator');
  const arrow = document.getElementById('windArrow');
  const icon = document.getElementById('windIcon');

  if (weather.current.windStrength <= 0) {
    indicator.style.display = 'none';
    return;
  }

  indicator.style.display = 'flex';
  // Convert radians to degrees for CSS rotation
  const degrees = (weather.windAngle * 180 / Math.PI);
  arrow.style.transform = `rotate(${degrees}deg)`;
  icon.innerHTML = weather.current.icon;
}

function drawZoomIndicator() {
  const indicator = document.getElementById('zoomIndicator');
  const text = document.getElementById('zoomText');

  // Only show if not at default zoom (70%)
  if (Math.abs(zoom.level - 0.7) < 0.05) {
    indicator.style.display = 'none';
    return;
  }

  indicator.style.display = 'block';
  text.textContent = `ðŸ” ${Math.round(zoom.level * 100)}%`;
}

function updateWeatherUI() {
  const el = document.getElementById('weatherDisplay');
  if (el) {
    el.innerHTML = `${weather.current.icon} ${weather.current.name}`;
    el.style.color = weather.current.payBonus > 1 ? '#ffd700' : '#7aa8cc';
  }
}

// ==========================================
// NEW MAP COLLISION SYSTEM
// ==========================================

// Check if a point is in navigable water (river or ocean)
function isInWater(x, y) {
  if (x >= OCEAN.x - 200) return true;
  if (isPointInHarborBasin(x, y)) return true;
  return isInRiver(x, y) !== null;
}


// ================================
// AI WATER SAFETY HELPERS
// ================================
// Find a nearby water point (used to keep AI from "tracking" across land).
function __findNearestWaterPoint(x, y, maxRadius = 700, step = 25) {
  if (isInWater(x, y)) return { x, y };
  // Spiral-ish sampling
  for (let r = step; r <= maxRadius; r += step) {
    // 12 directions per ring (cheap + good enough)
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (isInWater(px, py)) return { x: px, y: py };
    }
  }
  // Absolute fallback: shove toward ocean band
  return { x: Math.max(x, OCEAN.x - 180), y };
}

// Clamp an entity to water; returns true if it was moved.
function __clampToWater(entity, bounce = 0.25) {
  if (isInWater(entity.x, entity.y)) return false;
  const p = __findNearestWaterPoint(entity.x, entity.y);
  const dx = p.x - entity.x;
  const dy = p.y - entity.y;
  entity.x = p.x;
  entity.y = p.y;
  // Damp and nudge velocity away from land so it doesn't re-stick instantly
  if (typeof entity.vx === 'number') entity.vx = (entity.vx || 0) * -bounce;
  if (typeof entity.vy === 'number') entity.vy = (entity.vy || 0) * -bounce;
  // Rotate away from the push direction a bit
  if (typeof entity.angle === 'number') entity.angle = Math.atan2(dy, dx);
  return true;
}

// Find closest point on a river centerline (for "get me back into the channel" logic).
function __nearestRiverCenterPoint(x, y) {
  let best = null;
  for (const key in RIVERS) {
    const r = RIVERS[key];
    const path = r.path;
    for (let i = 0; i < path.length - 1; i++) {
      const x1 = path[i].x, y1 = path[i].y;
      const x2 = path[i + 1].x, y2 = path[i + 1].y;
      // Project point onto segment
      const vx = x2 - x1, vy = y2 - y1;
      const wx = x - x1, wy = y - y1;
      const c1 = vx * wx + vy * wy;
      const c2 = vx * vx + vy * vy;
      let t = c2 > 0 ? c1 / c2 : 0;
      t = Math.max(0, Math.min(1, t));
      const px = x1 + vx * t, py = y1 + vy * t;
      const d2 = (x - px) * (x - px) + (y - py) * (y - py);
      if (!best || d2 < best.d2) best = { x: px, y: py, d2, river: r, segIndex: i };
    }
  }
  return best;
}


// Check which river a point is in (returns river object or null)
function isInRiver(x, y) {
  // Harbor overrides river logic
  if (x < HARBOR.width + 100) return null;

  for (const key in RIVERS) {
    const river = RIVERS[key];
    if (isPointInRiverPath(x, y, river)) {
      return river;
    }
  }
  return null;
}

// Check if point is within a river's path
function isPointInRiverPath(x, y, river) {
  const path = river.path;
  if (!path || path.length < 2 || !path[0] || !path[path.length - 1]) return false;
  const baseHalfWidth = river.width / 2;

  // Widen the river near endpoints so mouths/harbor approaches don't create "phantom land"
  const mouthLen = 800;       // widening distance from endpoints (increased)
  const mouthExtra = 200;     // extra half-width at endpoints (increased)

  const dStart = Math.hypot(x - path[0].x, y - path[0].y);
  const dEnd = Math.hypot(x - path[path.length - 1].x, y - path[path.length - 1].y);
  const startBoost = dStart < mouthLen ? (1 - (dStart / mouthLen)) : 0;
  const endBoost = dEnd < mouthLen ? (1 - (dEnd / mouthLen)) : 0;
  const endpointBoost = Math.max(startBoost, endBoost);

  const halfWidth = baseHalfWidth + mouthExtra * endpointBoost;

  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i];
    const p2 = path[i + 1];
    const dist = distToSegment(x, y, p1.x, p1.y, p2.x, p2.y);
    if (dist < halfWidth) return true;
  }
  return false;
}

// Distance from point to line segment
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;

  if (len2 === 0) return Math.hypot(px - x1, py - y1);

  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  return Math.hypot(px - projX, py - projY);
}

// Point-in-polygon (ray casting)
function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Harbor basin polygon MUST match drawHarbor()
function getHarborPolygon() {
  const w = HARBOR.width;
  return [
    { x: 0, y: 300 },
    { x: w, y: 400 },
    { x: w + 100, y: 600 },
    { x: w + 100, y: 3400 },
    { x: w, y: 3600 },
    { x: 0, y: 3700 }
  ];
}

function isPointInHarborBasin(x, y) {
  // Use the actual polygon to match visual water exactly
  return pointInPolygon(x, y, getHarborPolygon());
}

// Get the zone type at a position
function getZoneAt(x, y) {
  // Check docks first
  // NOTE: dock.x / dock.y are TOP-LEFT (drawDocks + refuel/repair already use top-left)
  // The old center-based bounds caused 'ghost' DOCK collisions in random places.
  for (const dock of docks) {
    const pad = 20;
    if (x >= dock.x - pad && x <= dock.x + dock.width + pad &&
      y >= dock.y - pad && y <= dock.y + dock.height + pad) {
      return ZONE.DOCK;
    }
  }
  // Check if in water - simplified, no shallows
  if (isInWater(x, y)) {
    return ZONE.WATER;
  }

  return ZONE.LAND;
}

// Get distance to the center of a river at a given point
function getDistanceToRiverCenter(x, y, river) {
  const path = river.path;
  let minDist = Infinity;

  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i];
    const p2 = path[i + 1];
    const dist = distToSegment(x, y, p1.x, p1.y, p2.x, p2.y);
    if (dist < minDist) minDist = dist;
  }

  return minDist;
}

// Get river current at a position (returns {x, y} velocity)
function getRiverCurrentAt(x, y) {
  if (x < HARBOR.width) return { x: 0, y: 0 };
  const river = isInRiver(x, y);
  if (!river) return { x: 0, y: 0 };

  // Find which segment we're in
  const path = river.path;
  let closestSegment = 0;
  let minDist = Infinity;

  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i];
    const p2 = path[i + 1];
    const dist = distToSegment(x, y, p1.x, p1.y, p2.x, p2.y);
    if (dist < minDist) {
      minDist = dist;
      closestSegment = i;
    }
  }

  // Current flows toward ocean (increasing X)
  const p1 = path[closestSegment];
  const p2 = path[closestSegment + 1];
  const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

  // Apply tide multiplier - noticeable push that requires effort to fight
  // High tide = weaker current (0.5x), Low tide = stronger current (1.5x)
  const tideMultiplier = TIDE.getCurrentMultiplier();
  const strength = river.currentStrength * tideMultiplier * 0.15;

  return {
    x: Math.cos(angle) * strength,
    y: Math.sin(angle) * strength
  };
}

// Get area details for UI display (name, icon, color)
function getAreaDetails(x, y) {
  if (x >= OCEAN.x) return { name: 'Open Ocean', icon: '<span class="icon icon-salvage"></span>', color: '#0d4a6f' };
  if (x <= HARBOR.width) return { name: 'Harbor', icon: '<span class="icon icon-anchor"></span>', color: '#1a8aaa' };

  const river = isInRiver(x, y);
  if (river) {
    const areaName = river.name;
    if (areaName.includes('Ocean')) {
      return { name: 'Open Ocean', icon: '<span class="icon icon-salvage"></span>', color: '#0d4a6f' };
    } else if (areaName.includes('Harbor')) {
      return { name: 'Harbor', icon: '<span class="icon icon-anchor"></span>', color: '#1a8aaa' };
    } else if (areaName.includes('North')) {
      return { name: 'North Channel', icon: '<span class="icon icon-boat"></span>', color: '#2ecc71' };
    } else if (areaName.includes('Main')) {
      return { name: 'Main River', icon: '<span class="icon icon-boat"></span>', color: '#3498db' };
    } else if (areaName.includes('South')) {
      return { name: 'South Passage', icon: '<span class="icon icon-boat"></span>', color: '#9b59b6' };
    } else {
      return { name: 'Coastline', icon: '<span class="icon icon-casual"></span>', color: '#2d5a27' };
    }
  }

  return { name: 'Coastline', icon: '<span class="icon icon-casual"></span>', color: '#2d5a27' };
}

// Get area name for UI display
function getAreaName(x, y) {
  const details = getAreaDetails(x, y);
  return `${details.icon} ${details.name}`;
}

// Legacy compatibility - maps to new tier system
function getCurrentRegion() {
  return {
    name: getCurrentTier().name,
    icon: getCurrentTier().icon,
    payMultiplier: getCurrentTier().payMultiplier,
    aiCount: getCurrentTier().aiCount
  };
}

// Environmental objects generated per area
let regionFeatures = [];


// --- Feature placement helpers (keeps buoys/objects out of LAND) ---
function __nearestPointOnSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const abLen2 = abx * abx + aby * aby;
  if (abLen2 <= 0.0001) return { x: ax, y: ay, t: 0 };
  let t = (apx * abx + apy * aby) / abLen2;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + abx * t, y: ay + aby * t, t };
}

function __snapPointToRiver(px, py, river) {
  const path = river.path;
  let best = { x: path[0].x, y: path[0].y, d2: Infinity };
  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i], p2 = path[i + 1];
    const n = __nearestPointOnSegment(px, py, p1.x, p1.y, p2.x, p2.y);
    const dx = px - n.x, dy = py - n.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < best.d2) best = { x: n.x, y: n.y, d2 };
  }
  return best;
}

function __placeInWater(preferredX, preferredY, maxTries = 40) {
  // 1) keep preferred if already valid water
  if (isInWater(preferredX, preferredY)) return { x: preferredX, y: preferredY };

  // 2) snap to nearest river centerline (best for "random buoy on land" issues)
  let best = null;
  for (const key in RIVERS) {
    const river = RIVERS[key];
    const snapped = __snapPointToRiver(preferredX, preferredY, river);
    if (!best || snapped.d2 < best.d2) best = { river, snapped };
  }
  if (best) {
    // jitter inside safe river core
    const r = best.river;
    const jitter = (r.width * 0.25);
    for (let i = 0; i < 10; i++) {
      const x = best.snapped.x + (Math.random() - 0.5) * jitter;
      const y = best.snapped.y + (Math.random() - 0.5) * jitter;
      if (isInWater(x, y)) return { x, y };
    }
    // worst-case: exact snapped point
    if (isInWater(best.snapped.x, best.snapped.y)) return { x: best.snapped.x, y: best.snapped.y };
  }

  // 3) random fallback in ocean/harbor until we find water
  for (let i = 0; i < maxTries; i++) {
    const x = (Math.random() < 0.5)
      ? (HARBOR.width * 0.5 + Math.random() * (HARBOR.width * 0.45))
      : (OCEAN.x + 200 + Math.random() * (OCEAN.width - 400));
    const y = 200 + Math.random() * (WORLD.height - 400);
    if (isInWater(x, y)) return { x, y };
  }

  // last resort: put it in middle of harbor water
  return { x: HARBOR.width * 0.5, y: WORLD.height * 0.5 };
}


function generateRegionFeatures() {
  regionFeatures = [];

  // Just a few buoys - spread out for bigger map
  const buoyPositions = [
    { x: 2500, y: 2000 }, { x: 3500, y: 2100 },
    { x: 3700, y: 2900 }, { x: 2400, y: 3000 },
    { x: 1700, y: 2500 }, { x: 4300, y: 2500 }
  ];
  buoyPositions.forEach((pos, i) => {
    const p = __placeInWater(pos.x, pos.y);
    regionFeatures.push({
      type: 'buoy',
      x: p.x,
      y: p.y,
      color: i % 2 === 0 ? '#e74c3c' : '#27ae60'
    });
  });

  // 2 oil platforms in industrial zone
  regionFeatures.push({ type: 'oilPlatform', x: 1500, y: 1200, hasFlame: true });
  regionFeatures.push({ type: 'oilPlatform', x: 4500, y: 3600, hasFlame: true });

  // 2 lighthouses at edges
  regionFeatures.push({ type: 'lighthouse', x: 500, y: 600 });
  regionFeatures.push({ type: 'lighthouse', x: 5500, y: 3400 });
}

const career = {
  currentRegion: 0,
  unlockedRegions: [true, false, false, false, false],
  totalDeliveries: 0,
  totalEarnings: 0,
  regionDeliveries: [0, 0, 0, 0, 0] // Legacy - now tracks tier progress
};

// Legacy compatibility - maps old region system to new tiers
const REGIONS = JOB_TIERS; // Alias for compatibility

// getCurrentRegion is defined earlier with the new map system

function getAvailableDocks() {
  // In new system, all docks are available
  // Job difficulty is controlled by tier, not dock access
  return docks;
}

function checkRegionUnlocks() {
  // Check if player can unlock next tier
  if (playerTier < JOB_TIERS.length - 1) {
    const nextTier = JOB_TIERS[playerTier + 1];
    if (game.jobsDone >= nextTier.jobsRequired && game.money >= nextTier.unlockCost) {
      // Can unlock - handled by UI
    }
  }
}

// unlockRegion is now handled by unlockTier (defined earlier)

function selectRegion(index) {
  if (!career.unlockedRegions[index]) return;
  career.currentRegion = index;

  // Reset competitors for new region
  competitors = [];
  competitorJobs = [];

  // Spawn appropriate number of AI for this region
  const region = getCurrentRegion();
  for (let i = 0; i < region.aiCount; i++) {
    competitors.push(createCompetitor(i));
  }

  playSound('attach');
  spawnNewJob();
  updateUI();
  updateRegionUI();
}

// Job types
const JOB_TYPES = {
  STANDARD: { name: 'Standard Tow', icon: '<span class="icon icon-box"></span>', color: '#ffd700', class: 'job-standard', payMult: 1 },
  RUSH: { name: 'Rush Delivery', icon: '<span class="icon icon-rush"></span>', color: '#e74c3c', class: 'job-rush', payMult: 1.5, hasTimer: true, timePerDist: 0.09 },
  FRAGILE: { name: 'Fragile Cargo', icon: '<span class="icon icon-fragile"></span>', color: '#9b59b6', class: 'job-fragile', payMult: 1.8, noCollision: true },
  RESCUE: { name: 'Rescue Mission', icon: '<span class="icon icon-rescue"></span>', color: '#3498db', class: 'job-rescue', payMult: 3, hasTimer: true, fixedTime: 60, sinking: true },
  SALVAGE: { name: 'Salvage Op', icon: '<span class="icon icon-salvage"></span>', color: '#1abc9c', class: 'job-salvage', payMult: 2.2, floating: true, hasTimer: true, fixedTime: 90 },
  VIP: { name: 'VIP Transport', icon: '<span class="icon icon-vip"></span>', color: '#f39c12', class: 'job-vip', payMult: 3, noCollision: true, hasTimer: true, timePerDist: 0.15, minSpeed: true, requiresLicense: 'vip' },
  TANDEM: { name: 'Tandem Tow', icon: '<span class="icon icon-tandem"></span>', color: '#e67e22', class: 'job-tandem', payMult: 2.5, multiCargo: true, minCargo: 2, maxCargo: 3, requiresLicense: 'tandem' }
};

// Boat types you can buy
const BOATS = [
  {
    name: 'Starter Tug',
    icon: '<span class="icon icon-boat-starter"></span>',
    color1: '#ff7043', color2: '#f4511e', color3: '#d84315',
    price: 0,
    speed: 3.0,
    power: 0.07,
    turnSpeed: 0.016,
    maxFuel: 150,
    maxHealth: 100,
    towStrength: 0.8,
    ropeLength: 70,
    armor: 1.0,
    fuelEfficiency: 1.0,
    cargoTier: 1,
    description: 'Basic tug. Gets the job done.'
  },
  {
    name: 'Harbor Runner',
    icon: '<span class="icon icon-boat-harbor"></span>',
    color1: '#42a5f5', color2: '#1e88e5', color3: '#1565c0',
    price: 800,
    speed: 3.5,
    power: 0.09,
    turnSpeed: 0.020,
    maxFuel: 180,
    maxHealth: 120,
    towStrength: 0.95,
    ropeLength: 75,
    armor: 0.95,
    fuelEfficiency: 0.9,
    cargoTier: 2,
    description: 'Fast & nimble. Better fuel economy.'
  },
  {
    name: 'Coastal Hauler',
    icon: '<span class="icon icon-boat-coastal"></span>',
    color1: '#66bb6a', color2: '#43a047', color3: '#2e7d32',
    price: 2500,
    speed: 3.9,
    power: 0.10,
    turnSpeed: 0.018,
    maxFuel: 220,
    maxHealth: 150,
    towStrength: 1.25,
    ropeLength: 85,
    armor: 0.85,
    fuelEfficiency: 0.85,
    cargoTier: 3,
    description: 'Reliable workhorse. Good balance.'
  },
  {
    name: 'Bay Bruiser',
    icon: '<span class="icon icon-boat-bruiser"></span>',
    color1: '#ab47bc', color2: '#8e24aa', color3: '#6a1b9a',
    price: 5000,
    speed: 3.8,
    power: 0.11,
    turnSpeed: 0.019,
    maxFuel: 280,
    maxHealth: 180,
    towStrength: 1.35,
    ropeLength: 95,
    armor: 0.75,
    fuelEfficiency: 0.8,
    cargoTier: 3,
    description: 'Strong towing power. Built tough.'
  },
  {
    name: 'Sea Master',
    icon: '<span class="icon icon-boat-master"></span>',
    color1: '#78909c', color2: '#546e7a', color3: '#37474f',
    price: 9000,
    speed: 4.2,
    power: 0.12,
    turnSpeed: 0.021,
    maxFuel: 350,
    maxHealth: 220,
    towStrength: 1.5,
    ropeLength: 105,
    armor: 0.7,
    fuelEfficiency: 0.75,
    cargoTier: 4,
    description: 'Professional grade. Long range.'
  },
  {
    name: 'Storm Chaser',
    icon: '<span class="icon icon-boat-storm"></span>',
    color1: '#5c6bc0', color2: '#3f51b5', color3: '#303f9f',
    price: 15000,
    speed: 4.5,
    power: 0.13,
    turnSpeed: 0.023,
    maxFuel: 420,
    maxHealth: 260,
    towStrength: 1.65,
    ropeLength: 115,
    armor: 0.6,
    fuelEfficiency: 0.7,
    cargoTier: 5,
    description: 'Weather resistant. High performance.'
  },
  {
    name: 'Ocean Titan',
    icon: '<span class="icon icon-boat-titan"></span>',
    color1: '#ffd54f', color2: '#ffb300', color3: '#ff8f00',
    price: 25000,
    speed: 5.0,
    power: 0.15,
    turnSpeed: 0.025,
    maxFuel: 500,
    maxHealth: 320,
    towStrength: 1.9,
    ropeLength: 130,
    armor: 0.5,
    fuelEfficiency: 0.65,
    cargoTier: 5,
    description: 'The ultimate tugboat. Haul anything.'
  }
];

// License System - themed around river/harbor/ocean progression
const LICENSES = {
  // TIER 1 - Early game licenses (available from start)
  riverPilot: {
    id: 'riverPilot',
    name: 'River Pilot License',
    icon: '<span class="icon icon-river"></span>',
    description: 'Navigate river currents like a pro',
    cost: 600,
    requirement: { type: 'deliveries', value: 10 },
    effect: '50% less current push when traveling upstream'
  },
  dockMaster: {
    id: 'dockMaster',
    name: 'Dock Master Cert',
    icon: '<span class="icon icon-dock"></span>',
    description: 'Precision docking expertise',
    cost: 800,
    requirement: { type: 'deliveries', value: 15 },
    effect: 'Larger dock detection radius for deliveries'
  },

  // TIER 2 - Job type specialists
  express: {
    id: 'express',
    name: 'Express Courier Cert',
    icon: '<span class="icon icon-rush"></span>',
    description: 'More time on rush deliveries',
    cost: 1000,
    requirement: { type: 'rushJobs', value: 8 },
    effect: '+30 seconds on rush delivery timers'
  },
  fragile: {
    id: 'fragile',
    name: 'Fragile Goods Handler',
    icon: '<span class="icon icon-fragile"></span>',
    description: 'Handle delicate cargo with care',
    cost: 1200,
    requirement: { type: 'fragileJobs', value: 8 },
    effect: 'Survive 1 minor collision on fragile cargo'
  },
  rescue: {
    id: 'rescue',
    name: 'River Rescue License',
    icon: '<span class="icon icon-rescue"></span>',
    description: 'Emergency rescue operations',
    cost: 1500,
    requirement: { type: 'rescueJobs', value: 6 },
    effect: 'Sinking boats sink 40% slower'
  },
  salvageExpert: {
    id: 'salvageExpert',
    name: 'Salvage Diver Cert',
    icon: '<span class="icon icon-salvage"></span>',
    description: 'Master of cargo recovery',
    cost: 1500,
    requirement: { type: 'salvageJobs', value: 6 },
    effect: 'Salvage cargo drifts 50% slower, easier to spot'
  },

  // TIER 3 - Advanced operations
  heavy: {
    id: 'heavy',
    name: 'Heavy Haul License',
    icon: '<span class="icon icon-heavy"></span>',
    description: 'Tow the big stuff',
    cost: 2000,
    requirement: { type: 'deliveries', value: 30 },
    effect: 'Unlocks Container Ships & Oil Tankers'
  },
  hazmat: {
    id: 'hazmat',
    name: 'Hazmat Certification',
    icon: '<span class="icon icon-hazmat"></span>',
    description: 'Transport dangerous chemicals',
    cost: 2500,
    requirement: { type: 'deliveries', value: 35 },
    effect: 'Unlocks Chemical Barge (high pay, no collisions!)'
  },
  storm: {
    id: 'storm',
    name: 'Storm Runner Permit',
    icon: '<span class="icon icon-storm"></span>',
    description: 'Brave the worst weather',
    cost: 2000,
    requirement: { type: 'deliveries', value: 25 },
    effect: '+100% weather bonus (instead of +25%)'
  },

  // TIER 4 - Expert licenses  
  oceanClass: {
    id: 'oceanClass',
    name: 'Ocean Class License',
    icon: '<span class="icon icon-salvage"></span>',
    description: 'Deep water operations certified',
    cost: 3500,
    requirement: { type: 'deliveries', value: 50 },
    effect: '+20% pay on all ocean pickups'
  },
  speedDemon: {
    id: 'speedDemon',
    name: 'Speed Demon Cert',
    icon: '<span class="icon icon-speed"></span>',
    description: 'Need for speed on the water',
    cost: 3000,
    requirement: { type: 'earnings', value: 20000 },
    effect: '+15% boat speed, +10% fuel consumption'
  },
  tandem: {
    id: 'tandem',
    name: 'Tandem Tow License',
    icon: '<span class="icon icon-tandem"></span>',
    description: 'Tow multiple barges at once',
    cost: 4000,
    requirement: { type: 'deliveries', value: 45 },
    effect: 'Unlocks Tandem Tow jobs (2-3 barges)'
  },

  // TIER 5 - Elite licenses
  vip: {
    id: 'vip',
    name: 'VIP Transport License',
    icon: '<span class="icon icon-vip"></span>',
    description: 'Handle high-value clients',
    cost: 5000,
    requirement: { type: 'earnings', value: 30000 },
    effect: 'Unlocks VIP jobs (huge pay, no stops allowed)'
  },
  harborLegend: {
    id: 'harborLegend',
    name: 'Harbor Legend Status',
    icon: '<span class="icon icon-trophy"></span>',
    description: 'The highest honor on 3 Rivers',
    cost: 8000,
    requirement: { type: 'deliveries', value: 80 },
    effect: '+15% pay on ALL jobs, AI gives you priority'
  }
};

const licenses = {
  owned: [],
  rushJobs: 0,
  fragileJobs: 0,
  rescueJobs: 0,
  salvageJobs: 0
};

function hasLicense(id) {
  return licenses.owned.includes(id);
}

function canBuyLicense(id) {
  const lic = LICENSES[id];
  if (hasLicense(id)) return false;
  if (game.money < lic.cost) return false;

  const req = lic.requirement;
  switch (req.type) {
    case 'deliveries': return career.totalDeliveries >= req.value;
    case 'rushJobs': return licenses.rushJobs >= req.value;
    case 'fragileJobs': return licenses.fragileJobs >= req.value;
    case 'rescueJobs': return licenses.rescueJobs >= req.value;
    case 'salvageJobs': return licenses.salvageJobs >= req.value;
    case 'earnings': return career.totalEarnings >= req.value;
    default: return true;
  }
}

function getRequirementProgress(id) {
  const lic = LICENSES[id];
  const req = lic.requirement;
  let current = 0;
  switch (req.type) {
    case 'deliveries': current = career.totalDeliveries; break;
    case 'rushJobs': current = licenses.rushJobs; break;
    case 'fragileJobs': current = licenses.fragileJobs; break;
    case 'rescueJobs': current = licenses.rescueJobs; break;
    case 'earnings': current = career.totalEarnings; break;
  }
  return { current, required: req.value, met: current >= req.value };
}

function buyLicense(id) {
  if (!canBuyLicense(id)) return false;
  const lic = LICENSES[id];
  game.money -= lic.cost;
  licenses.owned.push(id);
  playSound('success');
  addCameraShake(4, 0.15); // License acquired shake
  showEvent('comeback', `${lic.icon} License Acquired!`, lic.name);
  updateUI();
  updateLicenseUI();
  return true;
}

const tugboat = {
  x: 500, y: 2000, angle: 0, vx: 0, vy: 0, angularVel: 0, fuel: 100,
  health: 100,
  currentBoat: 0,
  ownedBoats: [true, false, false, false, false, false, false],
  get boat() { return BOATS[this.currentBoat]; },
  get maxHealth() { return this.boat.maxHealth; },
  get maxFuel() { return this.boat.maxFuel; },
  get power() { return this.boat.power; },
  get maxSpeed() {
    const base = this.boat.speed;
    return hasLicense('speedDemon') ? base * 1.15 : base;
  },
  get turnSpeed() { return this.boat.turnSpeed; },
  get towStrength() { return this.boat.towStrength; },
  get ropeLength() { return this.boat.ropeLength; },
  get armorRating() { return this.boat.armor; },
  get fuelEfficiency() {
    const base = this.boat.fuelEfficiency;
    return hasLicense('speedDemon') ? base * 1.1 : base; // 10% more fuel usage
  },
  get cargoTier() { return this.boat.cargoTier; },
  drag: 0.985, angularDrag: 0.88, attached: null  // Slightly less drag = more responsive
};

const cargoTypes = [
  { name: 'Small Barge', icon: '<span class="icon icon-barge"></span>', color: '#6d4c2a', accent: '#8b5a2b', width: 40, height: 20, basePay: 40, tier: 1, weight: 1, type: 'barge' },
  { name: 'Fishing Boat', icon: '<span class="icon icon-fishing"></span>', color: '#2471a3', accent: '#3498db', width: 38, height: 18, basePay: 50, tier: 1, weight: 1, type: 'fishing' },
  { name: 'Yacht', icon: '<span class="icon icon-yacht"></span>', color: '#ecf0f1', accent: '#bdc3c7', width: 50, height: 22, basePay: 80, tier: 2, weight: 1.5, type: 'yacht' },
  { name: 'Cargo Barge', icon: '<span class="icon icon-cargo-barge"></span>', color: '#5d4037', accent: '#795548', width: 65, height: 32, basePay: 120, tier: 3, weight: 2, type: 'barge' },
  { name: 'Container Ship', icon: '<span class="icon icon-container"></span>', color: '#c0392b', accent: '#e74c3c', width: 80, height: 30, basePay: 180, tier: 4, weight: 2.5, type: 'container' },
  { name: 'Oil Tanker', icon: '<span class="icon icon-tanker"></span>', color: '#1a252f', accent: '#2c3e50', width: 95, height: 36, basePay: 280, tier: 5, weight: 3, type: 'tanker' },
  { name: 'Chemical Barge', icon: '<span class="icon icon-hazmat"></span>', color: '#8e44ad', accent: '#9b59b6', width: 70, height: 28, basePay: 350, tier: 3, weight: 2, type: 'hazmat', requiresLicense: 'hazmat' }
];

let cargos = [], currentJob = null;
let waterParticles = [], waveOffset = 0, ripples = [];
const keys = {};

// --- Gamepad (controller) support ---
const gamepadState = {
  connected: false,
  steer: 0,         // -1..1
  throttle: 0,      // -1..1 (forward positive)
  lt: 0,            // 0..1
  rt: 0,            // 0..1
  buttons: [],
  buttonsPrev: [],
  justPressed: new Set(),
  deadzoneStick: 0.15,
  deadzoneTrigger: 0.05
};
// Auto-focus first focusable element when a panel opens (helps controller nav)
const _gpPanelObserver = new MutationObserver(() => {
  // if current focused element is hidden, refresh focus
  if (gpFocusedEl && !_gpIsVisible(gpFocusedEl)) gpFocusedEl = null;
  // if a modal just opened, focus first element
  const scopeEls = _gpGetFocusableEls();
  if (!gpFocusedEl && scopeEls.length) _gpSetFocused(scopeEls[0]);
});
try { _gpPanelObserver.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'style'] }); } catch (e) { }


// Simple UI focus for controller navigation
let gpFocusIndex = 0;
let gpFocusedEl = null;

function _gpIsVisible(el) {
  if (!el) return false;
  if (el.disabled) return false;
  // offsetParent is null when display:none or not in DOM flow
  return el.offsetParent !== null;
}

function _gpGetFocusableEls() {
  // Prefer buttons/inputs that are currently visible
  const rootPanels = [
    document.getElementById('startScreen'),
    document.getElementById('optionsPanel'),
    document.getElementById('licensePanel'),
    document.getElementById('boatShopPanel'),
    document.getElementById('careerPanel'),
    document.getElementById('jobBoardPanel'),
    document.getElementById('difficultyPanel'),
    document.getElementById('profilePanel'),
    document.getElementById('leaderboardPanel'),
    document.body
  ].filter(Boolean);

  // Choose the top-most active panel if possible
  let scope = document.body;
  const top = (typeof UI_NAV !== 'undefined') ? UI_NAV.getTopPanel() : null;
  if (top) {
    const el = document.getElementById(top.id);
    if (el) scope = el;
  } else {
    scope = rootPanels.find(p => p.classList && (p.classList.contains('show') || (!p.classList.contains('hidden') && p.id === 'startScreen'))) || document.body;
  }

  const els = Array.from(scope.querySelectorAll('button, [role="button"], input, select, textarea, a[href], .difficulty-card, .license-item, .boat-item, .region-item, [data-gp], [onclick]'))
    .filter(_gpIsVisible);
  els.forEach(_gpEnhanceClickable);

  return els;
}


// =========================
// Stage 1: Unified UI Navigation Layer (Panels + Focus + A/B)
// =========================
const UI_NAV = {
  // Highest priority first (top-most modal wins)
  panelOrder: [
    { id: 'remapPanel', close: () => (typeof closeRemapPanel === 'function' ? closeRemapPanel() : _hidePanel('remapPanel')) },
    { id: 'profilePanel', close: () => (typeof hideProfiles === 'function' ? hideProfiles() : _hidePanel('profilePanel')) },
    { id: 'difficultyPanel', close: () => (typeof closeDifficultySelect === 'function' ? closeDifficultySelect() : _hidePanel('difficultyPanel')) },
    { id: 'jobBoardPanel', close: () => _hidePanel('jobBoardPanel') },
    { id: 'questPanel', close: () => _hidePanel('questPanel') },
    { id: 'careerPanel', close: () => (typeof closeCareer === 'function' ? closeCareer() : _hidePanel('careerPanel')) },
    { id: 'boatShopPanel', close: () => (typeof closeBoatShop === 'function' ? closeBoatShop() : _hidePanel('boatShopPanel')) },
    { id: 'licensePanel', close: () => (typeof closeLicenses === 'function' ? closeLicenses() : _hidePanel('licensePanel')) },
    { id: 'howToPlayPanel', close: () => (typeof closeHowToPlay === 'function' ? closeHowToPlay() : _hidePanel('howToPlayPanel')) },
    { id: 'optionsPanel', close: () => (typeof hideOptions === 'function' ? hideOptions() : _hidePanel('optionsPanel')) },
    // Start screen is special: no "close" if game not started.
    { id: 'startScreen', close: null },
  ],
  getTopPanel() {
    for (const p of this.panelOrder) {
      const el = document.getElementById(p.id);
      if (el && _gpIsPanelOpen(el)) return p;
    }
    return null;
  },
  anyOpen() { return !!this.getTopPanel(); },
  back() {
    const top = this.getTopPanel();
    if (!top) return;
    if (top.id === 'startScreen') return; // don't close start screen from B
    if (top.close) top.close();
    else _hidePanel(top.id);
  }
};

function _hidePanel(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('show');
  el.style.display = (id === 'startScreen') ? '' : el.style.display;
}

function _gpIsPanelOpen(el) {
  if (!el) return false;
  if (el.id === 'startScreen') {
    // Start screen is "open" if visible
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  }
  return el.classList && el.classList.contains('show');
}

// When panels open/close, keep focus valid.
const _uiNavObserver = new MutationObserver(() => {
  try {
    if (typeof _gpGetFocusableEls !== 'function') return;
    if (gpFocusedEl && !_gpIsVisible(gpFocusedEl)) gpFocusedEl = null;
    const els = _gpGetFocusableEls();
    if (!gpFocusedEl && els && els.length) _gpSetFocused(els[0]);
  } catch (e) { }
});
try { _uiNavObserver.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'style'] }); } catch (e) { }

function _gpEnhanceClickable(el) {
  if (!el) return;
  // Make non-button clickable divs focusable for controller UI nav
  const cls = el.classList;
  const isCard =
    (cls && (cls.contains('difficulty-card') || cls.contains('job-card') || cls.contains('license-item') || cls.contains('boat-item') || cls.contains('region-item')));
  const isClickable = isCard || el.hasAttribute('onclick') || el.getAttribute('role') === 'button';
  if (isClickable) {
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
  }
}


function _gpSetFocused(el) {
  if (gpFocusedEl && gpFocusedEl.classList) gpFocusedEl.classList.remove('gp-focus');
  gpFocusedEl = el;
  if (gpFocusedEl && gpFocusedEl.classList) gpFocusedEl.classList.add('gp-focus');
  if (gpFocusedEl && gpFocusedEl.focus) {
    try { gpFocusedEl.focus({ preventScroll: true }); } catch (_) { gpFocusedEl.focus(); }
  }
}

function _gpMoveFocus(dir) {
  const els = _gpGetFocusableEls();
  if (!els.length) return;
  gpFocusIndex = ((gpFocusIndex + dir) % els.length + els.length) % els.length;
  _gpSetFocused(els[gpFocusIndex]);
  try { playSound('uiMove'); } catch (e) { }
}

function _gpClickFocused() {
  try { playSound('uiSelect'); } catch (e) { }

  const els = _gpGetFocusableEls();
  if (!els.length) return;
  if (!gpFocusedEl || !_gpIsVisible(gpFocusedEl)) {
    gpFocusIndex = Math.min(gpFocusIndex, els.length - 1);
    _gpSetFocused(els[gpFocusIndex]);
    try { playSound('uiMove'); } catch (e) { }
  }
  if (!gpFocusedEl) return;

  // If focus is on a container card, try clicking its primary enabled button first.
  const tag = (gpFocusedEl.tagName || '').toUpperCase();
  if (tag !== 'BUTTON' && tag !== 'A' && !gpFocusedEl.hasAttribute('onclick')) {
    const btn = gpFocusedEl.querySelector('button:not([disabled])');
    if (btn) { btn.click(); return; }
  }

  gpFocusedEl.click();
}

function _applyDeadzone(v, dz) {
  if (Math.abs(v) < dz) return 0;
  // rescale outside deadzone to keep full range
  const sign = Math.sign(v);
  const mag = (Math.abs(v) - dz) / (1 - dz);
  return sign * Math.min(1, Math.max(0, mag));
}

function handleGamepad(delta = 1) {
  gamepadState.justPressed.clear();

  // Wrap in try-catch - getGamepads may be blocked by permissions policy
  let pads = [];
  try {
    pads = navigator.getGamepads ? navigator.getGamepads() : [];
  } catch (e) {
    // Gamepad API blocked - silently ignore
    gamepadState.connected = false;
    return;
  }

  const gp = pads && pads[0] ? pads[0] : null;
  gamepadState.connected = !!gp;
  if (!gp) return;

  // Axes (Xbox layout)
  const lx = gp.axes[0] ?? 0; // left stick X
  const ly = gp.axes[1] ?? 0; // left stick Y
  const rx = gp.axes[2] ?? 0; // right stick X
  const ry = gp.axes[3] ?? 0; // right stick Y

  // Steering on LEFT stick (requested)
  gamepadState.steer = _applyDeadzone(lx, gamepadState.deadzoneStick);

  // Left stick Y not used for throttle (triggers only)
  const stickThrottle = 0;

  // Triggers (standard mapping often on axes 2/5 OR buttons 6/7)
  const b6 = gp.buttons[6]?.value ?? 0; // LT
  const b7 = gp.buttons[7]?.value ?? 0; // RT
  gamepadState.lt = b6 > gamepadState.deadzoneTrigger ? b6 : 0;
  gamepadState.rt = b7 > gamepadState.deadzoneTrigger ? b7 : 0;

  // If triggers used, override stick throttle
  if (gamepadState.rt > 0 || gamepadState.lt > 0) {
    // match keyboard: forward up to 1, reverse up to -0.5
    gamepadState.throttle = Math.min(1, gamepadState.rt) - 0.5 * Math.min(1, gamepadState.lt);
  } else {
    // No trigger input -> no throttle (prevents accidental stick driving)
    gamepadState.throttle = 0;
  }

  // Buttons edge detection
  const btns = gp.buttons || [];
  if (!gamepadState.buttonsPrev.length) gamepadState.buttonsPrev = btns.map(b => !!b.pressed);

  for (let i = 0; i < btns.length; i++) {
    const pressed = !!btns[i].pressed;
    const prev = !!gamepadState.buttonsPrev[i];
    if (pressed && !prev) gamepadState.justPressed.add(i);
    gamepadState.buttonsPrev[i] = pressed;
  }

  // --- UI navigation (works even when game isn't started) ---
  // D-pad: 12 up, 13 down, 14 left, 15 right (Xbox standard)
  const uiPrevT = gamepadState._uiNavT || 0;
  // Analog menu navigation (left stick) with repeat delay
  if (gamepadState._uiNextRepeat == null) gamepadState._uiNextRepeat = 0;

  const now = performance.now();
  const navRepeatDelay = 220;   // ms initial repeat
  const navRepeatRate = 120;   // ms subsequent repeats
  const navThreshold = 0.65;

  const navX = _applyDeadzone(lx, gamepadState.deadzoneStick);
  const navY = _applyDeadzone(ly, gamepadState.deadzoneStick);

  let navDir = 0;
  // Prefer D-pad discrete presses first
  if (gamepadState.justPressed.has(12) || gamepadState.justPressed.has(14)) navDir = -1;
  if (gamepadState.justPressed.has(13) || gamepadState.justPressed.has(15)) navDir = 1;

  // If no d-pad press, allow stick to navigate (up/down)
  if (!navDir) {
    if (navY <= -navThreshold) navDir = -1; // up
    else if (navY >= navThreshold) navDir = 1; // down
  }

  if (navDir) {
    // repeat gating
    if (now >= gamepadState._uiNextRepeat) {
      _gpMoveFocus(navDir);
      // set next repeat time
      const first = (gamepadState._uiHeldDir !== navDir);
      gamepadState._uiHeldDir = navDir;
      gamepadState._uiNextRepeat = now + (first ? navRepeatDelay : navRepeatRate);
    }
  } else {
    gamepadState._uiHeldDir = 0;
    gamepadState._uiNextRepeat = 0;
  }

  // Confirm/Click: support A (0) and also X (2) for controllers that map differently
  if (gamepadState.justPressed.has(0) || gamepadState.justPressed.has(2)) {
    const anyPanelOpen = (typeof UI_NAV !== 'undefined' && UI_NAV.anyOpen()) || !gameStarted;

    // Allow opening the in-game bottom menu tabs even when no modal panel is open
    const hudMenu = document.querySelector('.bottom-menu');
    const hudMenuFocused = !!(gpFocusedEl && gpFocusedEl.closest && gpFocusedEl.closest('.bottom-menu'));
    const hudMenuOpen = !!(gameStarted && hudMenu && _gpIsVisible(hudMenu) && hudMenuFocused);

    if (anyPanelOpen || hudMenuOpen) _gpClickFocused();
  }

  // Back/Escape: unified
  if (gamepadState.justPressed.has(1) || gamepadState.justPressed.has(3)) {
    try { playSound('uiBack'); } catch (e) { }
    if (typeof UI_NAV !== 'undefined' && UI_NAV.anyOpen()) {
      UI_NAV.back();
    } else if (gameStarted) {
      showOptions();
    }
  }

  // Start = pause/options toggle
  if (gamepadState.justPressed.has(9)) {
    if (document.getElementById('optionsPanel')?.classList.contains('show')) hideOptions();
    else if (gameStarted) showOptions();
  }
}

// Competitor AI tugboats
const COMPETITOR_COLORS = [
  { name: 'Red Rival', color1: '#c0392b', color2: '#a93226', color3: '#922b21' },
  { name: 'Blue Baron', color1: '#2980b9', color2: '#2471a3', color3: '#1a5276' },
  { name: 'Green Machine', color1: '#27ae60', color2: '#229954', color3: '#1e8449' },
  { name: 'Purple Pirate', color1: '#8e44ad', color2: '#7d3c98', color3: '#6c3483' }
];

let competitors = [];
let competitorJobs = [];

// Calculate AI difficulty scaling based on player tier
function getAIDifficultyLevel() {
  // Primary factor is player's career tier (0-4 maps to 0-1)
  const tierFactor = playerTier / (JOB_TIERS.length - 1);

  // Secondary factors
  const jobFactor = Math.min(game.jobsDone / 50, 1); // 0-1 based on 50 jobs
  const boatFactor = tugboat.currentBoat / (BOATS.length - 1);

  // Combined difficulty (0 = easiest, 1 = hardest)
  // Tier is the main driver
  return Math.min(1, (tierFactor * 0.5 + jobFactor * 0.3 + boatFactor * 0.2));
}

function createCompetitor(index) {
  const colorScheme = COMPETITOR_COLORS[index % COMPETITOR_COLORS.length];
  const tier = getCurrentTier();

  // Spawn AI in appropriate zone for current tier
  let startX, startY;
  if (tier.spawnZone === 'harbor' || tier.spawnZone === 'harbor_edge') {
    // Early tiers: AI starts in harbor
    startX = 300 + Math.random() * 400;
    startY = 800 + Math.random() * 2400;
  } else if (tier.spawnZone === 'river_mid') {
    // Mid tier: AI starts in river
    const rivers = Object.values(RIVERS);
    const river = rivers[Math.floor(Math.random() * rivers.length)];
    const pathIdx = Math.floor(river.path.length / 3);
    startX = river.path[pathIdx].x;
    startY = river.path[pathIdx].y + (Math.random() - 0.5) * 100;
  } else {
    // High tier: AI starts further out
    startX = OCEAN.x - 800 + Math.random() * 600;
    startY = 600 + Math.random() * (WORLD.height - 1200);
  }

  // Get current difficulty level (0-1)
  const difficulty = getAIDifficultyLevel();

  // Apply game difficulty modifier
  const diffMult = currentDifficulty.aiSpeedMult || 1.0;

  // Scale AI stats based on player tier - start gentle, get challenging
  // Rookie tier AI should be slower than starter tug
  // Harbor Master tier AI should be competitive
  const baseSpeed = (2.5 + difficulty * 2.0) * diffMult;      // 2.5 to 4.5
  const baseAccel = (0.08 + difficulty * 0.07) * diffMult;    // 0.08 to 0.15 (doubled!)
  const baseTurn = (0.015 + difficulty * 0.015) * diffMult;   // 0.015 to 0.03

  // Add some variation so AI aren't identical
  const variation = 0.15;

  return {
    x: startX,
    y: startY,
    angle: Math.random() * Math.PI * 2,
    vx: 0,
    vy: 0,
    angularVel: 0,
    ...colorScheme,
    speed: baseSpeed * (1 + (Math.random() - 0.5) * variation),
    acceleration: baseAccel * (1 + (Math.random() - 0.5) * variation),
    turnSpeed: baseTurn * (1 + (Math.random() - 0.5) * variation),
    skillLevel: difficulty,
    attached: null,
    job: null,
    state: 'seeking',
    waitTimer: 3 + Math.random() * 10, // Start working fast!
    deliveries: 0,
    stuckTimer: 0,
    lastX: startX,
    lastY: startY
  };
}

// Update existing competitors when player tier changes
function updateCompetitorDifficulty() {
  const difficulty = getAIDifficultyLevel();

  for (const comp of competitors) {
    // Gradually improve AI if player has progressed
    if (difficulty > comp.skillLevel + 0.1) {
      const boost = (difficulty - comp.skillLevel) * 0.3;
      comp.speed = Math.min(4.5, comp.speed * (1 + boost * 0.15));
      comp.acceleration = Math.min(0.1, comp.acceleration * (1 + boost * 0.1));
      comp.turnSpeed = Math.min(0.025, comp.turnSpeed * (1 + boost * 0.1));
      comp.skillLevel = difficulty;
    }
  }
}

function initCompetitors() {
  competitors = [];
  competitorJobs = [];
  const numCompetitors = Math.min(3, Math.floor(game.jobsDone / 5) + 1);
  for (let i = 0; i < numCompetitors; i++) {
    competitors.push(createCompetitor(i));
  }
}

function spawnCompetitorJob(competitor) {
  // AI cargo tier scales with their skill level
  const maxTier = Math.min(4, 1 + Math.floor(competitor.skillLevel * 3));
  const available = cargoTypes.filter(c => c.tier <= maxTier && !c.requiresLicense);
  const cargoType = available[Math.floor(Math.random() * available.length)];

  const tier = getCurrentTier();
  let pickupDock, deliveryDock;

  // AI jobs match player's current tier zone
  if (tier.spawnZone === 'harbor' || tier.spawnZone === 'harbor_edge') {
    // Early tiers: AI starts in harbor
    startX = 300 + Math.random() * 400;
    startY = 800 + Math.random() * 2400;
  } else if (tier.spawnZone === 'river_mid') {
    // Mid tier: AI starts in river
    const rivers = Object.values(RIVERS);
    const river = rivers[Math.floor(Math.random() * rivers.length)];
    const pathIdx = Math.floor(river.path.length / 3);
    startX = river.path[pathIdx].x;
    startY = river.path[pathIdx].y + (Math.random() - 0.5) * 100;
  } else {
    // High tier: AI starts further out
    startX = OCEAN.x - 800 + Math.random() * 600;
    startY = 600 + Math.random() * (WORLD.height - 1200);
  }

  // Get current difficulty level (0-1)
  const difficulty = getAIDifficultyLevel();

  // Apply game difficulty modifier
  const diffMult = currentDifficulty.aiSpeedMult || 1.0;

  // Scale AI stats based on player tier - start gentle, get challenging
  // Rookie tier AI should be slower than starter tug
  // Harbor Master tier AI should be competitive
  const baseSpeed = (2.5 + difficulty * 2.0) * diffMult;      // 2.5 to 4.5
  const baseAccel = (0.08 + difficulty * 0.07) * diffMult;    // 0.08 to 0.15 (doubled!)
  const baseTurn = (0.015 + difficulty * 0.015) * diffMult;   // 0.015 to 0.03

  // Add some variation so AI aren't identical
  const variation = 0.15;

  return {
    x: startX,
    y: startY,
    angle: Math.random() * Math.PI * 2,
    vx: 0,
    vy: 0,
    angularVel: 0,
    ...colorScheme,
    speed: baseSpeed * (1 + (Math.random() - 0.5) * variation),
    acceleration: baseAccel * (1 + (Math.random() - 0.5) * variation),
    turnSpeed: baseTurn * (1 + (Math.random() - 0.5) * variation),
    skillLevel: difficulty,
    attached: null,
    job: null,
    state: 'seeking',
    waitTimer: 3 + Math.random() * 10, // Start working fast!
    deliveries: 0,
    stuckTimer: 0,
    lastX: startX,
    lastY: startY
  };
}

// Update existing competitors when player tier changes
function updateCompetitorDifficulty() {
  const difficulty = getAIDifficultyLevel();

  for (const comp of competitors) {
    // Gradually improve AI if player has progressed
    if (difficulty > comp.skillLevel + 0.1) {
      const boost = (difficulty - comp.skillLevel) * 0.3;
      comp.speed = Math.min(4.5, comp.speed * (1 + boost * 0.15));
      comp.acceleration = Math.min(0.1, comp.acceleration * (1 + boost * 0.1));
      comp.turnSpeed = Math.min(0.025, comp.turnSpeed * (1 + boost * 0.1));
      comp.skillLevel = difficulty;
    }
  }
}

function initCompetitors() {
  competitors = [];
  competitorJobs = [];
  const numCompetitors = Math.min(3, Math.floor(game.jobsDone / 5) + 1);
  for (let i = 0; i < numCompetitors; i++) {
    competitors.push(createCompetitor(i));
  }
}

function spawnCompetitorJob(competitor) {
  // AI cargo tier scales with their skill level
  const maxTier = Math.min(4, 1 + Math.floor(competitor.skillLevel * 3));
  const available = cargoTypes.filter(c => c.tier <= maxTier && !c.requiresLicense);
  const cargoType = available[Math.floor(Math.random() * available.length)];

  const tier = getCurrentTier();
  let pickupDock, deliveryDock;

  // AI jobs match player's current tier zone
  if (tier.spawnZone === 'harbor' || tier.spawnZone === 'harbor_edge') {
    // Early tiers: harbor-to-harbor jobs like player
    const harborDocks = docks.filter(d => d.x < HARBOR.width + (tier.spawnZone === 'harbor_edge' ? 800 : 200));
    pickupDock = harborDocks[Math.floor(Math.random() * harborDocks.length)];

    // Find a different delivery dock
    let attempts = 0;
    do {
      deliveryDock = harborDocks[Math.floor(Math.random() * harborDocks.length)];
      attempts++;
    } while (deliveryDock === pickupDock && attempts < 10);

    // If still same dock, just pick any other harbor dock
    if (deliveryDock === pickupDock && harborDocks.length > 1) {
      deliveryDock = harborDocks.find(d => d !== pickupDock) || harborDocks[0];
    }
  } else {
    // Higher tiers: pickup from zone, deliver to harbor
    const harborDocks = docks.filter(d => d.x < HARBOR.width + 200);
    deliveryDock = harborDocks[Math.floor(Math.random() * harborDocks.length)];
    pickupDock = getPickupDock(tier.spawnZone);

    // Make sure they're different
    let attempts = 0;
    while (pickupDock === deliveryDock && attempts < 10) {
      pickupDock = getPickupDock(tier.spawnZone);
      attempts++;
    }
  }

  const cargo = {
    ...cargoType,
    x: pickupDock.x + pickupDock.width / 2 + 50,
    y: pickupDock.y + pickupDock.height / 2,
    angle: 0, vx: 0, vy: 0,
    isCompetitorCargo: true,
    owner: competitor
  };

  competitor.job = {
    cargo,
    pickup: pickupDock,
    delivery: deliveryDock,
    pickedUp: false
  };
  competitor.state = 'picking';
  competitorJobs.push(cargo);
}

// NEW MAP: Docks are primarily in the harbor (left side)
const docks = [
  // === HARBOR DOCKS (Left side - inside harbor basin polygon) ===
  // North Harbor
  { x: 150, y: 500, width: 80, height: 40, name: 'North Pier A', hasFuel: true, hasRepair: true },
  { x: 150, y: 700, width: 80, height: 40, name: 'North Pier B', hasFuel: false, hasRepair: false },

  // Central Harbor (main area) - positioned along the left edge
  { x: 120, y: 1000, width: 90, height: 45, name: 'Central Marina', hasFuel: true, hasRepair: true },
  { x: 120, y: 1250, width: 90, height: 45, name: 'Cargo Terminal A', hasFuel: false, hasRepair: false },
  { x: 120, y: 1500, width: 90, height: 45, name: 'Cargo Terminal B', hasFuel: true, hasRepair: false },
  { x: 120, y: 1750, width: 90, height: 45, name: 'Main Dock', hasFuel: false, hasRepair: false },
  { x: 120, y: 2000, width: 90, height: 45, name: 'Shipyard', hasFuel: true, hasRepair: true },
  { x: 120, y: 2250, width: 90, height: 45, name: 'Fuel Depot', hasFuel: true, hasRepair: false },

  // South Harbor
  { x: 150, y: 2600, width: 80, height: 40, name: 'South Pier A', hasFuel: true, hasRepair: false },
  { x: 150, y: 2850, width: 80, height: 40, name: 'Repair Bay', hasFuel: false, hasRepair: true },
  { x: 150, y: 3100, width: 80, height: 40, name: 'South Depot', hasFuel: true, hasRepair: false },
  { x: 150, y: 3350, width: 80, height: 40, name: 'Fishermans Wharf', hasFuel: false, hasRepair: false },

  // === NORTH CHANNEL RIVER STOPS ===
  { x: 1400, y: 650, width: 60, height: 30, name: 'North Bend Fuel', hasFuel: true, hasRepair: false },
  { x: 2800, y: 620, width: 60, height: 30, name: 'Channel Waypoint', hasFuel: false, hasRepair: false },
  { x: 4200, y: 600, width: 60, height: 30, name: 'North Bridge Stop', hasFuel: true, hasRepair: true },
  { x: 5600, y: 750, width: 60, height: 30, name: 'Channel East', hasFuel: true, hasRepair: false },

  // === MAIN RIVER STOPS ===
  { x: 1200, y: 1750, width: 60, height: 30, name: 'River Landing', hasFuel: true, hasRepair: false },
  { x: 2400, y: 1650, width: 60, height: 30, name: 'Midway Dock', hasFuel: false, hasRepair: true },
  { x: 3600, y: 1800, width: 60, height: 30, name: 'Bridge Station', hasFuel: true, hasRepair: false },
  { x: 5000, y: 1500, width: 60, height: 30, name: 'River East Fuel', hasFuel: true, hasRepair: false },

  // === SOUTH PASSAGE STOPS ===
  { x: 1100, y: 3000, width: 60, height: 30, name: 'South Bend', hasFuel: true, hasRepair: false },
  { x: 2200, y: 3250, width: 60, height: 30, name: 'Passage Waypoint', hasFuel: false, hasRepair: false },
  { x: 3500, y: 2900, width: 60, height: 30, name: 'South Bridge Fuel', hasFuel: true, hasRepair: true },
  { x: 4800, y: 3050, width: 60, height: 30, name: 'Passage East', hasFuel: true, hasRepair: false },

  // === OCEAN PICKUP POINTS (Right side - in ocean zone x > 6000) ===
  { x: 6300, y: 900, width: 70, height: 35, name: 'Ocean Buoy North', hasFuel: false, hasRepair: false },
  { x: 6600, y: 1400, width: 70, height: 35, name: 'Offshore Platform A', hasFuel: true, hasRepair: false },
  { x: 6800, y: 1900, width: 70, height: 35, name: 'Ocean Hub', hasFuel: true, hasRepair: true },
  { x: 6600, y: 2400, width: 70, height: 35, name: 'Offshore Platform B', hasFuel: true, hasRepair: false },
  { x: 6300, y: 2900, width: 70, height: 35, name: 'Ocean Buoy South', hasFuel: false, hasRepair: false },

  // === FAR OCEAN (for higher tier jobs) ===
  { x: 7200, y: 1200, width: 70, height: 35, name: 'Deep Water Alpha', hasFuel: true, hasRepair: false },
  { x: 7500, y: 2000, width: 70, height: 35, name: 'Far Ocean Station', hasFuel: true, hasRepair: true },
  { x: 7200, y: 2800, width: 70, height: 35, name: 'Deep Water Beta', hasFuel: true, hasRepair: false }
];

// No more islands - replaced with riverbanks and coastline
const islands = [];

// Bridge locations for visual rendering
const bridges = [
  { x: RIVERS.north.bridgeAt, river: 'north', name: 'North Bridge' },
  { x: RIVERS.main.bridgeAt, river: 'main', name: 'Main Crossing' },
  { x: RIVERS.south.bridgeAt, river: 'south', name: 'South Bridge' }
];

// Helper to check if a point is near any island (legacy - now always returns false)
function isNearIsland(x, y, margin) {
  return false; // No more islands
}

// NEW: Check if position would cause a collision
function checkCollision(x, y, radius = 25) {
  const zone = getZoneAt(x, y);
  return zone === ZONE.LAND || zone === ZONE.SHALLOWS;
}

// NEW: Handle map boundary collision
function handleMapCollision(entity, radius = 25) {
  const zone = getZoneAt(entity.x, entity.y);

  if (zone === ZONE.LAND) {
    // Hard collision with land - stop and damage
    const speed = Math.hypot(entity.vx, entity.vy);
    if (speed > 1.5) {  // Only trigger collision at meaningful speed
      // Bounce back
      entity.vx *= -0.3;
      entity.vy *= -0.3;

      // Only damage player tugboat
      if (entity === tugboat) {
        handleCollision();
        addCameraShake(8, 0.2);
      }
    }

    // Push out of land - find nearest water
    const pushDir = findNearestWaterDirection(entity.x, entity.y);
    entity.x += pushDir.x * 8;
    entity.y += pushDir.y * 8;

    return true;
  }

  return false;
}

// Find direction to nearest water from a land position
function findNearestWaterDirection(x, y) {
  // Sample 8 directions
  const directions = [];
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
    const testX = x + Math.cos(a) * 50;
    const testY = y + Math.sin(a) * 50;
    if (isInWater(testX, testY)) {
      directions.push({ x: Math.cos(a), y: Math.sin(a) });
    }
  }

  if (directions.length > 0) {
    // Average the valid directions
    const avg = { x: 0, y: 0 };
    for (const d of directions) {
      avg.x += d.x;
      avg.y += d.y;
    }
    const len = Math.hypot(avg.x, avg.y);
    return len > 0 ? { x: avg.x / len, y: avg.y / len } : { x: 0, y: -1 };
  }

  // Default: push toward harbor (left)
  return { x: -1, y: 0 };
}


// =========================
// Dev Tools: Crash Overlay + Debug HUD + Safe Mode
// =========================
let __fatalError = null;
let __debugHudEnabled = false;
let __safeMode = false;
const __safeModePrev = { particles: null, weatherFx: null, waves: null };

function setupDevToolsUI() {
  // Crash overlay buttons
  const overlay = document.getElementById('crashOverlay');
  const textEl = document.getElementById('crashText');
  const copyBtn = document.getElementById('crashCopyBtn');
  const reloadBtn = document.getElementById('crashReloadBtn');
  const closeBtn = document.getElementById('crashCloseBtn');

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        const txt = (textEl && textEl.textContent) ? textEl.textContent : '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(txt);
          copyBtn.textContent = 'Copied!';
          setTimeout(() => (copyBtn.textContent = 'Copy error'), 1200);
        } else {
          // Fallback
          const ta = document.createElement('textarea');
          ta.value = txt;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          copyBtn.textContent = 'Copied!';
          setTimeout(() => (copyBtn.textContent = 'Copy error'), 1200);
        }
      } catch (e) {
        // ignore
      }
    });
  }
  if (reloadBtn) reloadBtn.addEventListener('click', () => location.reload());
  if (closeBtn) closeBtn.addEventListener('click', () => { if (overlay) overlay.style.display = 'none'; });

  // Keybinds: F3 debug HUD, F4 safe mode
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') {
      e.preventDefault();
      __debugHudEnabled = !__debugHudEnabled;
      const hud = document.getElementById('debugHud');
      if (hud) hud.style.display = __debugHudEnabled ? 'block' : 'none';
    }
    if (e.code === 'F4') {
      e.preventDefault();
      toggleSafeMode();
    }
  });

  // Inject Safe Mode toggle into Options panel (if it exists)
  const optionsPanel = document.getElementById('optionsPanel');
  if (optionsPanel && !document.getElementById('safeModeToggleRow')) {
    const row = document.createElement('div');
    row.id = 'safeModeToggleRow';
    row.style.marginTop = '10px';
    row.style.paddingTop = '10px';
    row.style.borderTop = '1px solid rgba(255,255,255,0.08)';
    row.innerHTML = `
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;">
            <input id="safeModeToggle" type="checkbox" />
            <span><strong>Safe Mode</strong> <span style="opacity:.8;">(disables fog/storm/rain particles + waves)</span></span>
          </label>
          <div style="opacity:.75;font-size:12px;margin-top:6px;">Shortcut: <strong>F4</strong></div>
        `;
    optionsPanel.appendChild(row);

    const cb = document.getElementById('safeModeToggle');
    if (cb) {
      cb.checked = __safeMode;
      cb.addEventListener('change', () => {
        setSafeMode(cb.checked);
      });
    }
  }
}

function setSafeMode(enabled) {
  __safeMode = !!enabled;
  // Remember previous values on enable
  if (__safeMode) {
    if (__safeModePrev.particles === null) __safeModePrev.particles = options.particles;
    if (__safeModePrev.weatherFx === null) __safeModePrev.weatherFx = options.weatherFx;
    if (__safeModePrev.waves === null) __safeModePrev.waves = options.waves;

    options.particles = false;
    options.weatherFx = false;
    options.waves = false;
  } else {
    // Restore previous values if we captured them
    if (__safeModePrev.particles !== null) options.particles = __safeModePrev.particles;
    if (__safeModePrev.weatherFx !== null) options.weatherFx = __safeModePrev.weatherFx;
    if (__safeModePrev.waves !== null) options.waves = __safeModePrev.waves;
  }

  const cb = document.getElementById('safeModeToggle');
  if (cb) cb.checked = __safeMode;

  // Lightweight toast if you have one; otherwise console.
  try {
    if (typeof showMessage === 'function') showMessage(__safeMode ? 'Safe Mode ON' : 'Safe Mode OFF');
  } catch (_) { }
}

function toggleSafeMode() { setSafeMode(!__safeMode); }

function formatErrorPayload(kind, msg, source, line, col, stack) {
  const parts = [];
  parts.push(`[${kind}] ${msg}`);
  if (source) parts.push(`Source: ${source}:${line || 0}:${col || 0}`);
  if (stack) parts.push(`\nStack:\n${stack}`);
  // Add small runtime context (best-effort)
  try {
    parts.push(`\nContext: started=${gameStarted} paused=${game.paused} money=${game.money} jobsDone=${game.jobsDone}`);
  } catch (_) { }
  return parts.join('\n');
}

function showCrashOverlay(text) {
  const overlay = document.getElementById('crashOverlay');
  const textEl = document.getElementById('crashText');
  if (textEl) textEl.textContent = text || 'Unknown error';
  if (overlay) overlay.style.display = 'flex';
}

window.addEventListener('error', (event) => {
  const payload = formatErrorPayload(
    'error',
    event && event.message ? event.message : 'Unknown error',
    event && event.filename ? event.filename : '',
    event && event.lineno ? event.lineno : 0,
    event && event.colno ? event.colno : 0,
    event && event.error && event.error.stack ? event.error.stack : ''
  );
  __fatalError = payload;
  showCrashOverlay(payload);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event && event.reason ? event.reason : 'Unknown rejection';
  const stack = (reason && reason.stack) ? reason.stack : '';
  const payload = formatErrorPayload(
    'unhandledrejection',
    (reason && reason.message) ? reason.message : String(reason),
    '',
    0,
    0,
    stack
  );
  __fatalError = payload;
  showCrashOverlay(payload);
});

// Debug HUD: cheap stats collector (best-effort; never throws)
const __hud = { fps: 0, fpsSmoothed: 0, dt: 0, lastUpdate: 0 };
function updateDebugHud(deltaMs, deltaNorm) {
  if (!__debugHudEnabled) return;
  const hudEl = document.getElementById('debugHud');
  if (!hudEl) return;

  __hud.dt = deltaMs;
  const fpsNow = deltaMs > 0 ? (1000 / deltaMs) : 0;
  __hud.fpsSmoothed = __hud.fpsSmoothed ? (__hud.fpsSmoothed * 0.9 + fpsNow * 0.1) : fpsNow;

  // Best-effort counts (these names exist in your code)
  const jobCount = (typeof availableJobs !== 'undefined' && availableJobs && availableJobs.length != null) ? availableJobs.length : 0;
  const hasCurrentJob = (typeof currentJob !== 'undefined' && currentJob) ? 1 : 0;
  const aiCount = (typeof competitors !== 'undefined' && competitors && competitors.length != null) ? competitors.length : 0;
  const particleCount = (typeof waterParticles !== 'undefined' && waterParticles && waterParticles.length != null) ? waterParticles.length : 0;
  const rippleCount = (typeof ripples !== 'undefined' && ripples && ripples.length != null) ? ripples.length : 0;

  const zoomLevel = (typeof zoom !== 'undefined' && zoom && typeof zoom.level === 'number') ? zoom.level : (typeof camera !== 'undefined' && camera && typeof camera.zoom === 'number' ? camera.zoom : 1);
  const weatherName = (typeof weather !== 'undefined' && weather && weather.current && weather.current.name) ? weather.current.name : 'Unknown';

  // Zone diagnostics (helps catch "phantom collisions")
  const bx = (typeof tugboat !== 'undefined' && tugboat) ? tugboat.x : 0;
  const by = (typeof tugboat !== 'undefined' && tugboat) ? tugboat.y : 0;
  let zoneName = 'N/A', riverName = '-', dockName = '-';
  if (typeof getZoneAt === 'function') {
    const z = getZoneAt(bx, by);
    zoneName = (z === ZONE.WATER) ? 'WATER' : (z === ZONE.SHALLOWS) ? 'SHALLOWS' : (z === ZONE.LAND) ? 'LAND' : (z === ZONE.DOCK) ? 'DOCK' : String(z);
  }
  if (typeof isInRiver === 'function') {
    const r = isInRiver(bx, by);
    riverName = r && r.name ? r.name : '-';
  }
  if (typeof docks !== 'undefined' && docks) {
    for (const d of docks) {
      const pad = 10;
      if (bx >= d.x - pad && bx <= d.x + d.width + pad && by >= d.y - pad && by <= d.y + d.height + pad) { dockName = d.name || 'Dock'; break; }
    }
  }

  hudEl.innerHTML = `
        <div><strong>FPS</strong>: ${__hud.fpsSmoothed.toFixed(0)} <span class="muted">(dt ${deltaMs.toFixed(1)}ms / \u0394 ${deltaNorm.toFixed(2)})</span></div>
        <div><strong>Zoom</strong>: ${zoomLevel.toFixed(2)} <span class="muted">Weather: ${weatherName}${__safeMode ? ' <span class="warn">SAFE</span>' : ''}</span></div>
        <div><strong>Zone</strong>: ${zoneName} | <strong>River</strong>: ${riverName} | <strong>Dock</strong>: ${dockName}</div>
        <div><strong>Pos</strong>: ${bx.toFixed(0)}, ${by.toFixed(0)} | <strong>Tier</strong>: ${typeof playerTier !== 'undefined' ? JOB_TIERS[playerTier].name : 'N/A'}</div>
        <div><strong>Entities</strong>: AI ${aiCount} | particles ${particleCount} | ripples ${rippleCount}</div>
        <div><strong>Jobs</strong>: board ${jobCount} | active ${hasCurrentJob} | done ${game && game.jobsDone != null ? game.jobsDone : 0}</div>
      `;
}

function init() {
  setupDevToolsUI();
  // Stage 3: UI click sounds for mouse taps
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t) return;
    if (t.closest && (t.closest('button') || t.closest('[role="button"]'))) {
      try { playSound('uiSelect'); } catch (_) { }
    }
  }, true);

  tugboat.fuel = tugboat.maxFuel;
  document.addEventListener('keydown', e => {
    // Handle key remapping
    if (remapTarget && document.getElementById('remapPanel').classList.contains('show')) {
      e.preventDefault();
      if (e.code !== 'Escape') {
        keybinds[remapTarget] = e.code;
        updateRemapUI();
      }
      remapTarget = null;
      document.querySelectorAll('.remap-btn').forEach(btn => btn.classList.remove('listening'));
      return;
    }

    // Initialize audio on first keypress
    if (!audioCtx && gameStarted) {
      initAudio();
      startEngine();
    }
    keys[e.code] = true;

    // Handle keybinds
    if ((e.code === keybinds.attach || e.code === 'Space') && gameStarted) {
      e.preventDefault();
      toggleAttachment();
    }
    if (e.code === 'Escape') {
      if (document.getElementById('remapPanel').classList.contains('show')) {
        closeRemapPanel();
      } else if (document.getElementById('profilePanel').classList.contains('show')) {
        hideProfiles();
      } else if (document.getElementById('difficultyPanel').classList.contains('show')) {
        closeDifficultySelect();
      } else if (document.getElementById('howToPlayPanel').classList.contains('show')) {
        closeHowToPlay();
      } else if (document.getElementById('jobBoardPanel').classList.contains('show')) {
        closeJobBoard();
      } else if (document.getElementById('optionsPanel').classList.contains('show')) {
        hideOptions();
      } else if (document.getElementById('licensePanel').classList.contains('show')) {
        closeLicenses();
      } else if (document.getElementById('boatShopPanel').classList.contains('show')) {
        closeBoatShop();
      } else if (document.getElementById('careerPanel').classList.contains('show')) {
        closeCareer();
      } else if (gameStarted) {
        showOptions();
      }
    }
    if ((e.code === keybinds.refuel || e.code === 'KeyF') && gameStarted) refuel();
    if ((e.code === keybinds.repair || e.code === 'KeyR') && gameStarted) repair();
    if ((e.code === keybinds.horn || e.code === 'KeyH') && gameStarted) playSound('horn');
    if ((e.code === keybinds.leaderboard || e.code === 'KeyL') && gameStarted) toggleLeaderboard();

    // Zoom controls
    if (e.code === 'Equal' || e.code === 'NumpadAdd') {
      zoom.target = Math.min(zoom.max, zoom.target + 0.1);
    }
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
      zoom.target = Math.max(zoom.min, zoom.target - 0.1);
    }
    if (e.code === 'Digit0' || e.code === 'Numpad0') {
      zoom.target = 0.7; // Reset zoom to default
    }
  });
  document.addEventListener('keyup', e => keys[e.code] = false);

  // Scroll wheel zoom
  canvas.addEventListener('wheel', e => {
    if (!gameStarted) return;
    e.preventDefault();

    const zoomSpeed = 0.1;
    if (e.deltaY < 0) {
      // Scroll up = zoom in
      zoom.target = Math.min(zoom.max, zoom.target + zoomSpeed);
    } else {
      // Scroll down = zoom out
      zoom.target = Math.max(zoom.min, zoom.target - zoomSpeed);
    }
  }, { passive: false });

  // Also init audio on click
  document.addEventListener('click', () => {
    if (!audioCtx && gameStarted) {
      initAudio();
      startEngine();
    }
  }, { once: false });

  // Initialize first region's competitors
  const startRegion = getCurrentRegion();
  for (let i = 0; i < startRegion.aiCount; i++) {
    competitors.push(createCompetitor(i));
  }

  // Initialize weather system
  initCurrents();
  changeWeather();

  spawnNewJob();
  updateUI();
  updateRegionUI();
  initMobileControls();
  requestAnimationFrame(gameLoop);
}

// Mobile Controls
function restartGame() {
  game.money = 100; game.jobsDone = 0; game.time = 0;
  tugboat.x = 500; tugboat.y = 2000; tugboat.angle = 0;
  tugboat.vx = 0; tugboat.vy = 0; tugboat.angularVel = 0;
  tugboat.attached = null; tugboat.fuel = tugboat.maxFuel;
  tugboat.health = tugboat.maxHealth;
  waterParticles = []; ripples = [];
  competitors = []; competitorJobs = [];
  lastPlayerRank = 1; lastLeaderName = 'You'; eventCooldown = 0;
  initCurrents();
  changeWeather();
  spawnNewJob(); updateUI(); updateLeaderboard();
}

function getAvailableCargo() {
  return cargoTypes.filter(c => {
    // Check boat tier
    let maxTier = tugboat.cargoTier;
    // Heavy license allows tier 4-5 regardless of boat
    if (hasLicense('heavy') && c.tier <= 5) maxTier = Math.max(maxTier, 5);
    if (c.tier > maxTier) return false;

    // Check if requires special license
    if (c.requiresLicense && !hasLicense(c.requiresLicense)) return false;

    return true;
  });
}

function pickJobType() {
  const rand = Math.random();
  // VIP and Tandem require licenses
  const canVIP = hasLicense('vip');
  const canTandem = hasLicense('tandem');

  // Base probabilities
  if (rand < 0.30) return JOB_TYPES.STANDARD;
  if (rand < 0.45) return JOB_TYPES.RUSH;
  if (rand < 0.58) return JOB_TYPES.FRAGILE;
  if (rand < 0.70) return JOB_TYPES.RESCUE;
  if (rand < 0.82) return JOB_TYPES.SALVAGE;
  if (rand < 0.92) {
    // Tandem only if licensed
    if (canTandem) return JOB_TYPES.TANDEM;
    return JOB_TYPES.STANDARD;
  }
  // VIP only if licensed, otherwise give standard
  if (canVIP) return JOB_TYPES.VIP;
  return JOB_TYPES.STANDARD;
}

// Job board system - multiple jobs to choose from
let availableJobs = [];
const MAX_AVAILABLE_JOBS = 3;

function generateJob() {
  const available = getAvailableCargo();
  const jobType = pickJobType();
  const tier = getCurrentTier();
  let cargoType;
  let tandemCount = null;

  if (jobType === JOB_TYPES.TANDEM) {
    // Tandem tow uses only tier 1-2 cargo (smaller barges)
    const smallCargo = available.filter(c => c.tier <= 2);
    cargoType = smallCargo.length > 0 ? smallCargo[Math.floor(Math.random() * smallCargo.length)] : available[0];
    tandemCount = jobType.minCargo + Math.floor(Math.random() * (jobType.maxCargo - jobType.minCargo + 1));
  } else {
    cargoType = available[Math.floor(Math.random() * available.length)];
  }

  // Get pickup and delivery based on spawn zone
  let pickupDock = null;
  let deliveryDock = null;
  let salvagePos = null;

  // For harbor/harbor_edge tiers, both pickup and delivery are in harbor area
  const isHarborTier = tier.spawnZone === 'harbor' || tier.spawnZone === 'harbor_edge';

  if (isHarborTier) {
    // Harbor-to-harbor jobs for early tiers
    const harborDocks = docks.filter(d => d.x < HARBOR.width + (tier.spawnZone === 'harbor_edge' ? 800 : 200));
    pickupDock = harborDocks[Math.floor(Math.random() * harborDocks.length)];

    // Find a different delivery dock
    let attempts = 0;
    do {
      deliveryDock = harborDocks[Math.floor(Math.random() * harborDocks.length)];
      attempts++;
    } while (deliveryDock === pickupDock && attempts < 10);

    // If still same dock, just pick any other harbor dock
    if (deliveryDock === pickupDock && harborDocks.length > 1) {
      deliveryDock = harborDocks.find(d => d !== pickupDock) || harborDocks[0];
    }
  } else {
    // Higher tiers: pickup from zone, deliver to harbor
    const harborDocks = docks.filter(d => d.x < HARBOR.width + 200);
    deliveryDock = harborDocks[Math.floor(Math.random() * harborDocks.length)];

    // Pickup location depends on tier's spawn zone
    if (jobType === JOB_TYPES.SALVAGE) {
      salvagePos = getSpawnPosition(tier.spawnZone);
      pickupDock = null;
    } else {
      pickupDock = getPickupDock(tier.spawnZone);

      // Make sure pickup and delivery are different
      let attempts = 0;
      while (pickupDock === deliveryDock && attempts < 10) {
        pickupDock = getPickupDock(tier.spawnZone);
        attempts++;
      }
    }
  }

  // Calculate distance and pay
  const pickupX = salvagePos ? salvagePos.x : (pickupDock ? pickupDock.x : 0);
  const pickupY = salvagePos ? salvagePos.y : (pickupDock ? pickupDock.y : 0);
  const dist = Math.hypot(deliveryDock.x - pickupX, deliveryDock.y - pickupY);
  const distBonus = Math.floor(dist / 100) * 10;
  let basePay = cargoType.basePay + distBonus;

  // Tandem tow multiplies pay by cargo count
  if (jobType === JOB_TYPES.TANDEM && tandemCount) {
    basePay *= tandemCount;
  }

  // Apply tier pay multiplier and difficulty modifier
  const pay = Math.floor(basePay * jobType.payMult * tier.payMultiplier * currentDifficulty.payMult);

  // Calculate time limit for timed jobs
  let timeLimit = null;
  if (jobType.hasTimer) {
    if (jobType.fixedTime) {
      timeLimit = Math.floor(jobType.fixedTime * currentDifficulty.timerMult);
      if (jobType.sinking && hasLicense('rescue')) {
        timeLimit = Math.floor(timeLimit * 1.4);
      }
    } else {
      // More time for longer distances
      timeLimit = Math.max(45, Math.floor(dist * 0.025));
      if (jobType === JOB_TYPES.RUSH && hasLicense('express')) {
        timeLimit += 30;
      }
    }
  }

  return {
    cargoType,
    pickup: pickupDock,
    delivery: deliveryDock,
    pay,
    jobType,
    timeLimit,
    dist,
    salvagePos,
    tandemCount
  };
}

// Get a pickup dock based on spawn zone
function getPickupDock(spawnZone) {
  let candidates = [];

  switch (spawnZone) {
    case 'harbor':
      // Harbor docks only (Rookie tier)
      candidates = docks.filter(d => d.x < HARBOR.width);
      break;
    case 'harbor_edge':
      // Harbor + very close river docks (Deckhand)
      candidates = docks.filter(d => d.x < HARBOR.width + 800);
      break;
    case 'river_mid':
      // River docks in middle section (Skipper)
      candidates = docks.filter(d => d.x > HARBOR.width && d.x < OCEAN.x - 1000);
      break;
    case 'river_mouth':
      // River docks near ocean (Captain)
      candidates = docks.filter(d => d.x > HARBOR.width && d.x < OCEAN.x + 500);
      break;
    case 'ocean':
      // All ocean docks (Harbor Master)
      candidates = docks.filter(d => d.x >= OCEAN.x - 500);
      break;
    default:
      candidates = docks.filter(d => d.x < HARBOR.width);
  }

  // Fallback to harbor docks if no candidates
  if (candidates.length === 0) {
    candidates = docks.filter(d => d.x < HARBOR.width);
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Get a spawn position for salvage jobs
function getSpawnPosition(spawnZone) {
  let x, y;
  let attempts = 0;

  do {
    switch (spawnZone) {
      case 'harbor':
        // Inside harbor basin
        x = 300 + Math.random() * 600;
        y = 800 + Math.random() * 2400;
        break;
      case 'harbor_edge':
        // Harbor or just outside
        x = 400 + Math.random() * 1000;
        y = 600 + Math.random() * 2800;
        break;
      case 'river_mid':
        // Middle of a random river
        const rivers = Object.values(RIVERS);
        const river = rivers[Math.floor(Math.random() * rivers.length)];
        const pathIdx = Math.floor(river.path.length / 2);
        x = river.path[pathIdx].x + (Math.random() - 0.5) * 200;
        y = river.path[pathIdx].y + (Math.random() - 0.5) * (river.width * 0.5);
        break;
      case 'river_mouth':
        // Near where rivers meet ocean
        x = OCEAN.x - 600 + Math.random() * 500;
        y = 800 + Math.random() * (WORLD.height - 1600);
        break;
      case 'ocean':
        // Open ocean
        x = OCEAN.x + 200 + Math.random() * 1200;
        y = 400 + Math.random() * (WORLD.height - 800);
        break;
      default:
        // Default to harbor
        x = 400 + Math.random() * 500;
        y = 1000 + Math.random() * 2000;
    }
    attempts++;
  } while (!isInWater(x, y) && attempts < 20);

  // Final fallback - put in harbor
  if (!isInWater(x, y)) {
    x = 500;
    y = WORLD.height / 2;
  }

  return { x, y };
}

function spawnJobBoard() {
  availableJobs = [];
  for (let i = 0; i < MAX_AVAILABLE_JOBS; i++) {
    availableJobs.push(generateJob());
  }
  updateJobBoardUI();
}

function selectJob(index) {
  try { playSound('jobAccept'); } catch (e) { }
  try { addShake(7, 180); } catch (e) { }
  if (index < 0 || index >= availableJobs.length) return;

  const jobData = availableJobs[index];
  const jt = jobData.jobType;

  // Determine cargo spawn position
  let cargoX, cargoY;
  if (jt === JOB_TYPES.SALVAGE && jobData.salvagePos) {
    // Salvage: cargo floating in open water
    cargoX = jobData.salvagePos.x;
    cargoY = jobData.salvagePos.y;
  } else {
    // Normal: cargo at pickup dock
    cargoX = jobData.pickup.x + jobData.pickup.width / 2 + 50;
    cargoY = jobData.pickup.y + jobData.pickup.height / 2;
  }

  // Create cargo(s) based on job type
  if (jt === JOB_TYPES.TANDEM && jobData.tandemCount) {
    // Tandem tow: multiple connected cargo
    cargos = [];
    for (let i = 0; i < jobData.tandemCount; i++) {
      cargos.push({
        ...jobData.cargoType,
        x: cargoX + i * 60,
        y: cargoY,
        angle: 0, vx: 0, vy: 0,
        tandemIndex: i,
        sinkTimer: null
      });
    }
  } else {
    // Single cargo
    const cargo = {
      ...jobData.cargoType,
      x: cargoX,
      y: cargoY,
      angle: 0, vx: 0, vy: 0,
      sinkTimer: jt.sinking ? jobData.timeLimit : null,
      driftAngle: jt === JOB_TYPES.SALVAGE ? Math.random() * Math.PI * 2 : null
    };
    cargos = [cargo];
  }

  currentJob = {
    cargo: cargos[0],
    allCargo: cargos, // For tandem tow
    pickup: jobData.pickup,
    delivery: jobData.delivery,
    pay: jobData.pay,
    jobType: jt,
    pickedUp: false,
    timeLimit: jobData.timeLimit,
    timeRemaining: jobData.timeLimit,
    collisionCount: 0,
    failed: false,
    salvagePos: jobData.salvagePos,
    tandemCount: jobData.tandemCount,
    vipSpeedWarnings: 0 // For VIP min speed tracking
  };

  availableJobs = [];
  document.getElementById('jobBoardPanel').classList.remove('show');
  // Close hard-modal lock for Job Board
  if (window.Game && Game.ui && Game.ui.unlockModal) Game.ui.unlockModal('jobBoard');
  else game.paused = false;
  updateJobUI();
}

function spawnNewJob() {
  // Hard modal: Job Board (pause + block other panels)
  if (window.Game && Game.ui && Game.ui.lockModal) {
    if (!Game.ui.lockModal('jobBoard')) return;
  } else {
    game.paused = true;
  }
  // Show job board with choices
  spawnJobBoard();
  document.getElementById('jobBoardPanel').classList.add('show');
  // Controller: focus first job option
  try {
    gpFocusIndex = 0;
    setTimeout(() => {
      const els = _gpGetFocusableEls();
      if (els && els.length) _gpSetFocused(els[0]);
    }, 0);
  } catch (_) { }

}

function closeJobBoard() {
  document.getElementById('jobBoardPanel').classList.remove('show');
  if (window.Game && Game.ui && Game.ui.unlockModal) Game.ui.unlockModal('jobBoard');
  else game.paused = false;
}

function updateJobBoardUI() {
  const container = document.getElementById('jobBoardList');
  let html = '';

  availableJobs.forEach((job, i) => {
    const jt = job.jobType;
    const distKm = (job.dist / 100).toFixed(1);

    // Pickup location (salvage has no dock)
    const pickupText = jt === JOB_TYPES.SALVAGE
      ? '🌊 Open Water'
      : `<span class="icon icon-pickup"></span> ${job.pickup.name}`;

    // Extra info for special jobs
    let extraInfo = '';
    if (jt === JOB_TYPES.TANDEM && job.tandemCount) {
      extraInfo = `<span><span class="icon icon-tandem"></span> x${job.tandemCount} barges</span>`;
    } else if (jt === JOB_TYPES.VIP) {
      extraInfo = `<span><span class="icon icon-warning"></span> No stops!</span>`;
    } else if (jt === JOB_TYPES.SALVAGE) {
      extraInfo = `<span><span class="icon icon-search"></span> Find cargo</span>`;
    }

    html += `
          <div class="job-card ${jt.class}" role="button" tabindex="0" onclick="selectJob(${i})">
            <div class="job-card-header">
              <span class="job-card-type" style="color:${jt.color}">${jt.icon} ${jt.name}</span>
              <span class="job-card-pay">$${job.pay}</span>
            </div>
            <div class="job-card-cargo">${job.cargoType.icon} ${job.cargoType.name}</div>
            <div class="job-card-route">
              <span>${pickupText}</span>
              <span>&rarr;</span>
              <span><span class="icon icon-dock"></span> ${job.delivery.name}</span>
            </div>
            <div class="job-card-info">
              <span><span class="icon icon-distance"></span> ${distKm}km</span>
              ${job.timeLimit ? `<span><span class="icon icon-rush"></span> ${job.timeLimit}s</span>` : ''}
              ${extraInfo}
            </div>
          </div>
        `;
  });


  container.innerHTML = html;

  // Stage 1 UI-Nav: make dynamically-created job cards controller-clickable + focusable
  try {
    const cards = Array.from(container.querySelectorAll('.job-card'));
    cards.forEach(el => _gpEnhanceClickable(el));
    // If the job board is open, focus the first card (helps controller users)
    const panel = document.getElementById('jobBoardPanel');
    if (panel && panel.classList.contains('show') && cards.length) {
      _gpSetFocused(cards[0]);
    }
  } catch (e) { }
}

function updateJobUI() {
  const panel = document.getElementById('questPanel');
  const titleEl = document.getElementById('questTitle');
  const descEl = document.getElementById('questDesc');
  const timerBar = document.getElementById('timerBar');
  const job = currentJob;
  const jt = job.jobType;

  panel.className = 'panel quest-panel ' + jt.class;
  titleEl.innerHTML = `${jt.icon} ${jt.name}`;

  // Pickup location text
  const pickupText = jt === JOB_TYPES.SALVAGE
    ? '🌊 Open Water'
    : `<span class="icon icon-pickup"></span> ${job.pickup.name}`;

  let desc = `<strong>${job.cargo.name}</strong><br>${pickupText}<br><span class="icon icon-dock"></span> ${job.delivery.name}<br><span class="icon icon-money"></span> <span style="color:${jt.color}">$${job.pay}</span>`;

  if (jt === JOB_TYPES.FRAGILE) {
    desc += `<br><span style="color:#9b59b6"><span class="icon icon-fragile"></span> No collisions allowed!</span>`;
  }
  if (jt === JOB_TYPES.RESCUE) {
    desc += `<br><span style="color:#3498db"><span class="icon icon-rescue"></span> Boat is sinking!</span>`;
  }
  if (jt === JOB_TYPES.SALVAGE) {
    desc += `<br><span style="color:#1abc9c"><span class="icon icon-search"></span> Find floating cargo!</span>`;
  }
  if (jt === JOB_TYPES.VIP) {
    desc += `<br><span style="color:#f39c12"><span class="icon icon-vip"></span> Keep moving! No collisions!</span>`;
  }
  if (jt === JOB_TYPES.TANDEM && currentJob.tandemCount) {
    desc += `<br><span style="color:#e67e22"><span class="icon icon-tandem"></span> Towing ${currentJob.tandemCount} barges</span>`;
  }

  descEl.innerHTML = desc;

  // Timer bar
  if (job.timeLimit) {
    timerBar.style.display = 'block';
    updateTimerUI();
  } else {
    timerBar.style.display = 'none';
  }
}

function updateTimerUI() {
  if (!currentJob || !currentJob.timeLimit) return;
  const timerLabel = document.getElementById('timerLabel');
  const timerFill = document.getElementById('timerFill');
  const timerValue = document.getElementById('timerValue');
  const pct = (currentJob.timeRemaining / currentJob.timeLimit) * 100;

  timerValue.textContent = Math.ceil(currentJob.timeRemaining);
  timerFill.style.width = pct + '%';

  // Color based on time remaining
  if (pct > 50) {
    timerFill.style.background = '#2ecc71';
  } else if (pct > 25) {
    timerFill.style.background = '#f39c12';
  } else {
    timerFill.style.background = '#e74c3c';
    timerLabel.classList.add('warning');
  }
}

function getNearbyFuelDock() {
  for (const dock of docks) {
    if (dock.hasFuel) {
      const dist = Math.hypot(tugboat.x - (dock.x + dock.width / 2), tugboat.y - (dock.y + dock.height / 2 + 30));
      if (dist < 100) return dock;
    }
  }
  return null;
}

function getNearbyRepairDock() {
  for (const dock of docks) {
    if (dock.hasRepair) {
      const dist = Math.hypot(tugboat.x - (dock.x + dock.width / 2), tugboat.y - (dock.y + dock.height / 2 + 30));
      if (dist < 100) return dock;
    }
  }
  return null;
}

function getRefuelCost() {
  const needed = tugboat.maxFuel - tugboat.fuel;
  return Math.ceil(needed * 0.3);
}

function getRepairCost() {
  const needed = tugboat.maxHealth - tugboat.health;
  return Math.ceil(needed * 0.8);
}

function updateRefuelButton() {
  const dock = getNearbyFuelDock();
  const btn = document.getElementById('refuelBtn');
  const costSpan = document.getElementById('refuelCost');
  if (dock && tugboat.fuel < tugboat.maxFuel) {
    const cost = getRefuelCost();
    costSpan.textContent = cost;
    btn.classList.add('show');
    btn.disabled = game.money < cost;
    btn.style.opacity = game.money < cost ? '0.5' : '1';
  } else {
    btn.classList.remove('show');
  }
}

function updateRepairButton() {
  const dock = getNearbyRepairDock();
  const btn = document.getElementById('repairBtn');
  const costSpan = document.getElementById('repairCost');
  if (dock && tugboat.health < tugboat.maxHealth) {
    const cost = getRepairCost();
    costSpan.textContent = cost;
    btn.classList.add('show');
    btn.disabled = game.money < cost;
    btn.style.opacity = game.money < cost ? '0.5' : '1';
  } else {
    btn.classList.remove('show');
  }
}

// Mobile-friendly wrappers
function tryRefuel() {
  refuel();
}

function tryRepair() {
  repair();
}

function refuel() {
  const dock = getNearbyFuelDock();
  if (dock && tugboat.fuel < tugboat.maxFuel) {
    const cost = getRefuelCost();
    if (game.money >= cost) {
      game.money -= cost;
      tugboat.fuel = tugboat.maxFuel;
      addRipple(tugboat.x, tugboat.y, 30);
      playSound('refuel');
      updateUI();
      updateRefuelButton();
    }
  }
}

function repair() {
  const dock = getNearbyRepairDock();
  if (dock && tugboat.health < tugboat.maxHealth) {
    const cost = getRepairCost();
    if (game.money >= cost) {
      game.money -= cost;
      tugboat.health = tugboat.maxHealth;
      addRipple(tugboat.x, tugboat.y, 30);
      playSound('success');
      updateUI();
      updateRepairButton();
    }
  }
}

function toggleAttachment() {
  if (game.paused) return;
  if (tugboat.attached) {
    tugboat.attached = null;
    // Cargo detached
    addRipple(tugboat.x, tugboat.y, 25);
    playSound('detach');
    playSound('splash');
  } else {
    // For tandem tow, only need to attach to first cargo
    const cargoToCheck = currentJob && currentJob.jobType === JOB_TYPES.TANDEM ? [cargos[0]] : cargos;
    for (const cargo of cargoToCheck) {
      const dist = Math.hypot(cargo.x - tugboat.x, cargo.y - tugboat.y);
      if (dist < 70) {
        tugboat.attached = cargo;
        currentJob.pickedUp = true;
        addRipple(cargo.x, cargo.y, 35);
        playSound('attach');
        addCameraShake(2, 0.1); // Small bump on pickup
        // For chain, clear drift angles
        if (currentJob.jobType === JOB_TYPES.TANDEM) {
          for (const c of cargos) c.driftAngle = null;
        }
        break;
      }
    }
  }
}

function addRipple(x, y, size) { ripples.push({ x, y, radius: 5, maxRadius: size, opacity: 0.7 }); }

function showCollisionFlash() {
  const flash = document.getElementById('collisionFlash');
  flash.classList.add('show');
  playSound('collision');
  setTimeout(() => flash.classList.remove('show'), 150);
  updateUI(); // Update health display
}

function handleCollision() {
  // Take damage on collision, reduced by armor upgrade
  const baseDamage = 5 + Math.random() * 5;
  const damage = baseDamage * tugboat.armorRating;
  tugboat.health = Math.max(0, tugboat.health - damage);
  showCollisionFlash();

  // Camera shake on collision - stronger for more damage
  addCameraShake(4 + damage * 0.5, 0.15);

  // Fragile cargo - license allows 1 bump
  if (currentJob && currentJob.jobType === JOB_TYPES.FRAGILE && currentJob.pickedUp) {
    currentJob.collisionCount++;
    const allowedBumps = hasLicense('fragile') ? 1 : 0;
    if (currentJob.collisionCount > allowedBumps) {
      failJob('Fragile cargo damaged!');
    } else if (hasLicense('fragile')) {
      showEvent('rival', '<span class="icon icon-fragile"></span> Close Call!', 'Fragile specialist saved the cargo!');
    }
  }

  // VIP - no collisions allowed at all
  if (currentJob && currentJob.jobType === JOB_TYPES.VIP && currentJob.pickedUp) {
    failJob('VIP was disturbed by collision!');
  }

  // Boat destroyed
  if (tugboat.health <= 0) {
    failJob('Your boat was destroyed!');
    addCameraShake(12, 0.3); // Big shake for destruction
    tugboat.health = 20; // Give some health back
  }
}

function failJob(reason) {
  if (!currentJob || currentJob.failed) return;
  currentJob.failed = true;

  playSound('fail');

  // Camera shake on failure - jarring!
  addCameraShake(6, 0.2);

  const msg = document.getElementById('message');
  const msgTitle = document.getElementById('messageTitle');
  const msgText = document.getElementById('messageText');

  msg.className = 'message fail';
  msgTitle.textContent = 'Job Failed!';
  msgText.textContent = reason;
  msg.classList.add('show');

  tugboat.attached = null;

  setTimeout(() => { msg.classList.remove('show'); setTimeout(spawnNewJob, 400); }, 1500);
}

// Chain bonus tracking
let lastDeliveryTime = 0;
let chainCount = 0;

function completeJob() {
  let pay = currentJob.pay;
  let bonusText = '';

  // Rush delivery time bonus
  if (currentJob.jobType === JOB_TYPES.RUSH && currentJob.timeRemaining > 0) {
    const timeBonus = Math.floor(currentJob.timeRemaining * 2);
    pay += timeBonus;
    bonusText = ` (+$${timeBonus} speed!)`;
    licenses.rushJobs++;
  }

  // Track fragile and rescue jobs for licenses
  if (currentJob.jobType === JOB_TYPES.FRAGILE) {
    licenses.fragileJobs++;
  }
  if (currentJob.jobType === JOB_TYPES.RESCUE) {
    licenses.rescueJobs++;
  }
  if (currentJob.jobType === JOB_TYPES.SALVAGE) {
    licenses.salvageJobs++;
  }

  // Salvage time bonus - faster recovery = more pay
  if (currentJob.jobType === JOB_TYPES.SALVAGE && currentJob.timeRemaining > 0) {
    const salvageBonus = Math.floor(currentJob.timeRemaining * 1.5);
    pay += salvageBonus;
    bonusText += ` (+$${salvageBonus} quick salvage!)`;
  }

  // VIP perfect delivery bonus
  if (currentJob.jobType === JOB_TYPES.VIP && currentJob.timeRemaining > 0) {
    const vipBonus = Math.floor(currentJob.timeRemaining * 3);
    pay += vipBonus;
    bonusText += ` (+$${vipBonus} VIP satisfied!)`;
  }

  // Tandem tow completion bonus
  if (currentJob.jobType === JOB_TYPES.TANDEM) {
    const tandemBonus = Math.floor(pay * 0.15);
    pay += tandemBonus;
    bonusText += ` (+$${tandemBonus} all delivered!)`;
  }

  // Harbor Legend license bonus - +15% on all jobs
  if (hasLicense('harborLegend')) {
    const legendBonus = Math.floor(pay * 0.15);
    pay += legendBonus;
    bonusText += ` (+$${legendBonus} Legend)`;
  }

  // Ocean Class license bonus - +20% on ocean pickups
  if (hasLicense('oceanClass') && currentJob.pickup && currentJob.pickup.x >= OCEAN.x - 500) {
    const oceanBonus = Math.floor(pay * 0.2);
    pay += oceanBonus;
    bonusText += ` (+$${oceanBonus} Ocean)`;
  }

  // Weather bonus - enhanced with storm license
  if (weather.current.payBonus > 1) {
    let weatherMult = weather.current.payBonus - 1;
    // Storm operations license doubles storm bonus
    if (hasLicense('storm') && weather.current === WEATHER_TYPES.STORM) {
      weatherMult *= 2;
    }
    const weatherBonus = Math.floor(pay * weatherMult);
    pay += weatherBonus;
    bonusText += ` (+$${weatherBonus} Weather)`;
  }

  // Chain bonus - deliver within 45 seconds of last delivery
  const timeSinceLast = (game.time - lastDeliveryTime) / 60;
  if (lastDeliveryTime > 0 && timeSinceLast < 45) {
    chainCount++;
    if (chainCount >= 2) {
      const chainBonus = Math.floor(pay * 0.1 * Math.min(chainCount, 5));
      pay += chainBonus;
      bonusText += ` (+$${chainBonus} x${chainCount} chain!)`;
    }
  } else {
    chainCount = 1;
  }
  lastDeliveryTime = game.time;

  game.money += pay; game.jobsDone++;

  // Track career stats
  career.totalDeliveries++;
  career.totalEarnings += pay;
  career.regionDeliveries[career.currentRegion]++;

  // Check for region unlocks
  checkRegionUnlocks();

  playSound('success');
  setTimeout(() => playSound('money'), 300);

  // Camera shake on delivery - celebratory!
  addCameraShake(3, 0.12);

  for (let i = 0; i < 4; i++) addRipple(tugboat.attached.x + (Math.random() - 0.5) * 30, tugboat.attached.y + (Math.random() - 0.5) * 30, 18);

  const msg = document.getElementById('message');
  const msgTitle = document.getElementById('messageTitle');
  const msgText = document.getElementById('messageText');

  msg.className = 'message success';
  msgTitle.textContent = chainCount >= 2 ? `🔥 ${chainCount}x Chain!` : 'Delivery Complete!';
  msgText.textContent = `+$${pay}${bonusText}`;
  msg.classList.add('show');

  tugboat.attached = null;
  document.getElementById('timerBar').style.display = 'none';
  document.querySelector('.timer-label').classList.remove('warning');
  updateUI();
  updateLeaderboard();
  checkMilestones();

  setTimeout(() => { msg.classList.remove('show'); setTimeout(spawnNewJob, 400); }, 1200);
}

function openLicenses() {
  if (!window.Game || !Game.ui || !Game.ui.lockModal) { game.paused = true; }
  if (window.Game && Game.ui && Game.ui.lockModal && !Game.ui.lockModal('licenses')) return;
  document.getElementById('licensePanel').classList.add('show');
  updateLicenseUI();
}
function closeLicenses() {
  document.getElementById('licensePanel').classList.remove('show');
  if (window.Game && Game.ui && Game.ui.unlockModal) Game.ui.unlockModal('licenses');
  else game.paused = false;
}

function updateLicenseUI() {
  const container = document.getElementById('licenseList');
  let html = '';

  Object.values(LICENSES).forEach(lic => {
    const owned = hasLicense(lic.id);
    const progress = getRequirementProgress(lic.id);
    const canBuy = canBuyLicense(lic.id);
    const canAfford = game.money >= lic.cost;

    let statusClass = owned ? 'owned' : (progress.met ? (canAfford ? 'available' : 'locked') : 'locked');
    let reqText = '';

    switch (lic.requirement.type) {
      case 'deliveries': reqText = `${progress.current}/${progress.required} deliveries`; break;
      case 'rushJobs': reqText = `${progress.current}/${progress.required} rush jobs`; break;
      case 'fragileJobs': reqText = `${progress.current}/${progress.required} fragile jobs`; break;
      case 'rescueJobs': reqText = `${progress.current}/${progress.required} rescues`; break;
      case 'earnings': reqText = `$${progress.current}/$${progress.required} earned`; break;
    }

    html += `
          <div class="license-item ${statusClass}">
            <div class="license-icon">${lic.icon}</div>
            <div class="license-info">
              <h3>${lic.name}</h3>
              <p>${lic.description}</p>
              <div class="license-req ${progress.met ? 'met' : ''}">${reqText}</div>
            </div>
            <div class="license-right">
              ${owned ? '<span class="license-owned"><span class="icon icon-check"></span> OWNED</span>' :
        `<button class="upgrade-buy-btn" onclick="buyLicense('${lic.id}')" ${canBuy ? '' : 'disabled'}>$${lic.cost}</button>`}
            </div>
          </div>
        `;
  });

  container.innerHTML = html;
}

function updateUI() {
  document.getElementById('money').textContent = game.money;
  document.getElementById('jobsDone').textContent = game.jobsDone;
  document.getElementById('boatName').textContent = BOATS[tugboat.currentBoat].name.split(' ')[0];

  const fuelPercent = Math.round((tugboat.fuel / tugboat.maxFuel) * 100);
  const fuelEl = document.getElementById('fuelPercent');
  fuelEl.textContent = fuelPercent;
  fuelEl.className = 'stat-value' + (fuelPercent <= 20 ? ' warning' : fuelPercent >= 80 ? ' good' : '');

  const healthPercent = Math.round((tugboat.health / tugboat.maxHealth) * 100);
  const healthEl = document.getElementById('healthPercent');
  healthEl.textContent = healthPercent;
  healthEl.className = 'stat-value' + (healthPercent <= 30 ? ' warning' : healthPercent >= 80 ? ' good' : '');
}

// Leaderboard system
let lastPlayerRank = 1;
let lastLeaderName = 'You';
let eventCooldown = 0;
let leaderboardVisible = false;

function toggleLeaderboard() {
  leaderboardVisible = !leaderboardVisible;
  const lb = document.getElementById('leaderboard');
  if (leaderboardVisible && competitors.length > 0) {
    lb.classList.add('show');
    updateLeaderboard();
  } else {
    lb.classList.remove('show');
  }
}

const TAUNTS = [
  "Too slow, captain! <span class=\"icon icon-fish\"></span>",
  "Try to keep up! <span class=\"icon icon-speed\"></span>",
  "Is that all you've got?",
  "The sea is mine! <span class=\"icon icon-wave\"></span>",
  "Better luck next time!",
  "You call that towing? <span class=\"icon icon-face-neutral\"></span>",
  "Watch and learn!",
  "I own these waters!"
];

const ENCOURAGEMENTS = [
  "Nice comeback! <span class=\"icon icon-fire\"></span>",
  "You're catching up!",
  "That's more like it!",
  "Back in the race!",
  "Now you're towing! <span class=\"icon icon-strength\"></span>"
];

function getLeaderboardData() {
  const entries = [
    { name: 'You', deliveries: game.jobsDone, isPlayer: true, color: '#ff5722' }
  ];

  for (const comp of competitors) {
    entries.push({
      name: comp.name,
      deliveries: comp.deliveries,
      isPlayer: false,
      color: comp.color1
    });
  }

  // Sort by deliveries descending
  entries.sort((a, b) => b.deliveries - a.deliveries);

  return entries;
}

function updateLeaderboard() {
  const entries = getLeaderboardData();
  const container = document.getElementById('leaderboardEntries');

  // Find player rank
  const playerRank = entries.findIndex(e => e.isPlayer) + 1;
  const leader = entries[0];

  // Check for events
  if (eventCooldown <= 0) {
    // Player lost the lead
    if (lastPlayerRank === 1 && playerRank > 1 && game.jobsDone > 0) {
      showEvent('rival', '\u{1F620} Overtaken!', `${leader.name} has taken the lead!`);
      showTaunt(leader.name);
      eventCooldown = 600; // 10 seconds
    }
    // Player reclaimed the lead
    else if (lastPlayerRank > 1 && playerRank === 1) {
      showEvent('comeback', '\u{1F389} Back on Top!', 'You reclaimed the lead!');
      eventCooldown = 600;
    }
    // Competitor getting close
    else if (playerRank === 1 && entries.length > 1 && entries[1].deliveries === game.jobsDone - 1 && game.jobsDone > 2) {
      showEvent('rival', '\u26A0\uFE0F Close Race!', `${entries[1].name} is right behind you!`);
      eventCooldown = 900; // 15 seconds
    }
    // Player falling behind
    else if (playerRank > 1 && leader.deliveries >= game.jobsDone + 3 && game.jobsDone > 0) {
      showEvent('rival', '\u{1F4C9} Falling Behind!', `${leader.name} leads by ${leader.deliveries - game.jobsDone}!`);
      showTaunt(leader.name);
      eventCooldown = 900;
    }
  }

  lastPlayerRank = playerRank;
  lastLeaderName = leader.name;

  // Update AI tier display
  const difficulty = getAIDifficultyLevel();
  const difficultyTier = Math.floor(difficulty * 5.99); // 0-5
  const tierNames = ['Rookie', 'Novice', 'Skilled', 'Expert', 'Master', 'Elite'];
  const tierEmojis = ['<span class="icon icon-rookie"></span>', '<span class="icon icon-novice"></span>', '<span class="icon icon-skilled"></span>', '<span class="icon icon-expert"></span>', '<span class="icon icon-master"></span>', '<span class="icon icon-elite"></span>'];
  const tierClasses = ['rookie', 'novice', 'skilled', 'expert', 'master', 'elite'];

  const aiTierEl = document.getElementById('aiTier');
  aiTierEl.innerHTML = `${tierEmojis[difficultyTier]} AI: ${tierNames[difficultyTier]}`;
  aiTierEl.className = 'ai-tier ' + tierClasses[difficultyTier];

  // Build HTML
  let html = '';
  entries.forEach((entry, index) => {
    const rank = index + 1;
    const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : 'other';
    const entryClass = entry.isPlayer ? 'player' : (rank === 1 ? 'first' : '');

    html += `
          <div class="leaderboard-entry ${entryClass}">
            <div class="leaderboard-rank ${rankClass}">${rank}</div>
            <span class="leaderboard-name" style="color: ${entry.isPlayer ? '#4dff88' : entry.color}">${entry.name}</span>
            <span class="leaderboard-score"><span class="icon icon-star"></span>${entry.deliveries}</span>
          </div>
        `;
  });

  container.innerHTML = html;

  // Only show if toggled on and has competitors
  const lb = document.getElementById('leaderboard');
  if (leaderboardVisible && competitors.length > 0) {
    lb.classList.add('show');
  } else {
    lb.classList.remove('show');
  }
}

function showEvent(type, title, text) {
  const notif = document.getElementById('eventNotification');
  const titleEl = document.getElementById('eventTitle');
  const textEl = document.getElementById('eventText');

  notif.className = 'event-notification ' + type;
  titleEl.innerHTML = title;
  textEl.innerHTML = text;
  notif.classList.add('show');

  // Play sound
  if (type === 'rival') {
    playSound('warning');
  } else if (type === 'comeback') {
    playSound('success');
  }

  setTimeout(() => notif.classList.remove('show'), 2500);
}

function showTaunt(competitorName) {
  const bubble = document.getElementById('tauntBubble');
  const taunt = TAUNTS[Math.floor(Math.random() * TAUNTS.length)];

  // Find the competitor
  const comp = competitors.find(c => c.name === competitorName);
  if (!comp) return;

  // Position bubble above competitor (convert world to screen coords)
  const screenX = comp.x - camera.x;
  const screenY = comp.y - camera.y - 40;

  // Only show if competitor is on screen
  if (screenX > 0 && screenX < VIEW.width && screenY > 0 && screenY < VIEW.height) {
    bubble.style.left = screenX + 'px';
    bubble.style.top = screenY + 'px';
    bubble.innerHTML = taunt; // Use innerHTML for icons
    bubble.classList.add('show');

    setTimeout(() => bubble.classList.remove('show'), 2000);
  }
}

function checkMilestones() {
  // Delivery milestones
  const deliveryMilestones = {
    1: { title: '<span class="icon icon-rocket"></span> First Delivery!', text: 'The competition begins!' },
    3: { title: '<span class="icon icon-box"></span> Getting Started!', text: '3 deliveries down!' },
    5: { title: '<span class="icon icon-star"></span> Rising Star!', text: '5 successful deliveries!' },
    10: { title: '<span class="icon icon-trophy"></span> Harbor Hero!', text: '10 deliveries completed!' },
    15: { title: '<span class="icon icon-captain"></span> Seasoned Captain!', text: '15 deliveries - impressive!' },
    20: { title: '<span class="icon icon-king"></span> Shipping King!', text: '20 deliveries! You rule the harbor!' },
    25: { title: '<span class="icon icon-legend"></span> Sea Legend!', text: '25 deliveries! Legendary status!' },
    30: { title: '<span class="icon icon-diamond"></span> Diamond Captain!', text: '30 deliveries! Unstoppable!' },
    40: { title: '<span class="icon icon-wave"></span> Ocean Master!', text: '40 deliveries! The sea bows to you!' },
    50: { title: '<span class="icon icon-anchor"></span> Admiral!', text: '50 deliveries! Supreme commander!' },
    75: { title: '<span class="icon icon-pirate"></span> Pirate Lord!', text: '75 deliveries! You own these waters!' },
    100: { title: '<span class="icon icon-god"></span> Tugboat God!', text: '100 deliveries! Immortal!' }
  };

  if (deliveryMilestones[game.jobsDone]) {
    const m = deliveryMilestones[game.jobsDone];
    showEvent('comeback', m.title, m.text);
    eventCooldown = 300;
    return;
  }

  // Money milestones
  const moneyMilestones = {
    500: { title: '<span class="icon icon-money"></span> First Savings!', text: 'You have $500!' },
    1000: { title: '<span class="icon icon-money"></span> Thousandaire!', text: 'You hit $1,000!' },
    2500: { title: '<span class="icon icon-diamond"></span> Big Money!', text: '$2,500 in the bank!' },
    5000: { title: '<span class="icon icon-money"></span> Rich Captain!', text: '$5,000! Rolling in it!' },
    10000: { title: '<span class="icon icon-tycoon"></span> Tycoon!', text: '$10,000! Shipping magnate!' }
  };

  for (const [amount, milestone] of Object.entries(moneyMilestones)) {
    const amt = parseInt(amount);
    // Check if we just crossed this threshold
    if (game.money >= amt && game.money - currentJob.pay < amt) {
      showEvent('comeback', milestone.title, milestone.text);
      eventCooldown = 300;
      return;
    }
  }

  // Special achievements
  // First win against AI
  if (game.jobsDone === 1 && competitors.length > 0) {
    const leadingComp = competitors.find(c => c.deliveries > 0);
    if (!leadingComp) {
      showEvent('comeback', '<span class="icon icon-first"></span> First Blood!', 'First delivery before the AI!');
      eventCooldown = 300;
      return;
    }
  }

  // Comeback - was behind, now leading
  const entries = getLeaderboardData();
  const playerRank = entries.findIndex(e => e.isPlayer) + 1;
  if (playerRank === 1 && lastPlayerRank > 2 && competitors.length > 0) {
    showEvent('comeback', '<span class="icon icon-fire"></span> Epic Comeback!', `From #${lastPlayerRank} to #1!`);
    eventCooldown = 300;
    return;
  }

  // Dominant lead - 5+ ahead of second place
  if (playerRank === 1 && entries.length > 1) {
    const gap = game.jobsDone - entries[1].deliveries;
    if (gap === 5) {
      showEvent('comeback', '<span class="icon icon-strength"></span> Dominant!', '5 deliveries ahead!');
      eventCooldown = 600;
    } else if (gap === 10) {
      showEvent('comeback', '<span class="icon icon-rocket"></span> Unstoppable!', '10 deliveries ahead!');
      eventCooldown = 600;
    }
  }
}

// Win/Lose state tracking
let gameWon = false;
let gameLost = false;

function checkVictory() {
  if (gameWon || gameLost) return;

  // No victory in endless mode
  if (currentDifficulty.noVictory) return;

  // Victory conditions: Own all boats + reach max tier + all licenses + $100,000
  const allBoatsOwned = tugboat.ownedBoats.every(owned => owned);
  const maxTierReached = playerTier >= JOB_TIERS.length - 1; // Harbor Master
  const allLicensesOwned = Object.keys(LICENSES).every(id => hasLicense(id));
  const hasEnoughMoney = game.money >= 100000;

  if (allBoatsOwned && maxTierReached && allLicensesOwned && hasEnoughMoney) {
    triggerVictory();
  }
}

function checkBankruptcy() {
  if (gameWon || gameLost) return;

  // Stranded: No fuel and not at a fuel dock = game over
  // (Even with money, you can't get fuel if you can't reach a dock)
  const noFuel = tugboat.fuel <= 1;
  const notTowing = !tugboat.attached;

  if (noFuel && notTowing) {
    // Check if at a fuel dock
    let atFuelDock = false;
    for (const dock of docks) {
      if (!dock.hasFuel) continue;
      const dx = tugboat.x - (dock.x + dock.width / 2);
      const dy = tugboat.y - (dock.y + dock.height / 2);
      if (Math.hypot(dx, dy) < 100) {
        atFuelDock = true;
        break;
      }
    }

    // If at fuel dock but can't afford fuel - also game over
    if (atFuelDock && game.money < 5) {
      triggerGameOver();
    }
    // If not at fuel dock - stranded, game over
    else if (!atFuelDock) {
      triggerGameOver();
    }
  }
}

function triggerVictory() {
  gameWon = true;
  game.paused = true;

  // Calculate play time
  const playMinutes = Math.floor(game.time / 60 / 60);
  const playSeconds = Math.floor((game.time / 60) % 60);

  // Build stats
  const statsHtml = `
        <div><span><span class="icon icon-money"></span> Total Earnings</span><span>$${career.totalEarnings.toLocaleString()}</span></div>
        <div><span><span class="icon icon-box"></span> Deliveries</span><span>${career.totalDeliveries}</span></div>
        <div><span><span class="icon icon-boat"></span> Boats Owned</span><span>${tugboat.ownedBoats.filter(b => b).length}/7</span></div>
        <div><span><span class="icon icon-trophy"></span> Regions Unlocked</span><span>${career.unlockedRegions.filter(r => r).length}/5</span></div>
        <div><span><span class="icon icon-star"></span> Licenses</span><span>${licenses.owned.length}/${Object.keys(LICENSES).length}</span></div>
        <div><span><span class="icon icon-rush"></span> Play Time</span><span>${playMinutes}m ${playSeconds}s</span></div>
      `;
  document.getElementById('victoryStats').innerHTML = statsHtml;
  document.getElementById('victoryModal').classList.add('show');

  playSound('success');
  setTimeout(() => playSound('money'), 200);
  setTimeout(() => playSound('success'), 400);
}

function triggerGameOver() {
  gameLost = true;
  game.paused = true;

  // Calculate play time
  const playMinutes = Math.floor(game.time / 60 / 60);
  const playSeconds = Math.floor((game.time / 60) % 60);

  // Determine cause
  let cause = 'Stranded at sea!';
  if (game.money < 5) {
    cause = 'Out of fuel & money';
  }

  // Build stats
  const statsHtml = `
        <div><span><span class="icon icon-money"></span> Peak Earnings</span><span>$${career.totalEarnings.toLocaleString()}</span></div>
        <div><span><span class="icon icon-box"></span> Deliveries</span><span>${career.totalDeliveries}</span></div>
        <div><span><span class="icon icon-boat"></span> Boats Owned</span><span>${tugboat.ownedBoats.filter(b => b).length}/7</span></div>
        <div><span><span class="icon icon-trophy"></span> Regions Unlocked</span><span>${career.unlockedRegions.filter(r => r).length}/5</span></div>
        <div><span><span class="icon icon-rush"></span> Play Time</span><span>${playMinutes}m ${playSeconds}s</span></div>
        <div><span><span class="icon icon-repair"></span> Cause</span><span>${cause}</span></div>
      `;
  document.getElementById('gameOverStats').innerHTML = statsHtml;
  document.getElementById('gameOverModal').classList.add('show');

  playSound('fail');
}

function continueAfterVictory() {
  document.getElementById('victoryModal').classList.remove('show');
  game.paused = false;
  // Keep playing with gameWon = true (won't trigger again)
}

function returnToMenuFromEnd() {
  document.getElementById('victoryModal').classList.remove('show');
  document.getElementById('gameOverModal').classList.remove('show');
  gameWon = false;
  gameLost = false;
  quitToMenu();
}

function tryAgain() {
  document.getElementById('gameOverModal').classList.remove('show');
  gameWon = false;
  gameLost = false;

  // Reset everything and restart with same difficulty
  game.money = 100; game.jobsDone = 0; game.time = 0; game.paused = false;
  career.currentRegion = 0;
  career.unlockedRegions = [true, false, false, false, false];
  career.totalDeliveries = 0;
  career.totalEarnings = 0;
  career.regionDeliveries = [0, 0, 0, 0, 0];
  licenses.owned = [];
  licenses.rushJobs = 0; licenses.fragileJobs = 0; licenses.rescueJobs = 0; licenses.salvageJobs = 0;
  tugboat.x = 500; tugboat.y = 2000; tugboat.angle = 0;
  tugboat.vx = 0; tugboat.vy = 0; tugboat.angularVel = 0;
  tugboat.fuel = 100; tugboat.health = 100;
  tugboat.currentBoat = 0;
  tugboat.ownedBoats = [true, false, false, false, false, false, false];
  tugboat.attached = null;
  playerTier = 0;

  // Clear transient state
  currentJob = null;
  availableJobs = [];
  cargos = [];
  competitors = [];
  competitorJobs = [];
  waterParticles = [];
  ripples = [];

  // Spawn AI and jobs
  const region = getCurrentRegion();
  for (let i = 0; i < region.aiCount; i++) {
    competitors.push(createCompetitor(i));
  }
  spawnNewJob();
  updateUI();
  updateRegionUI();
}


function updateCamera(delta = 1) {
  // Smooth zoom transition
  zoom.level += (zoom.target - zoom.level) * zoom.speed * delta;

  // Calculate view size based on zoom
  const viewW = VIEW.width / zoom.level;
  const viewH = VIEW.height / zoom.level;

  const targetX = tugboat.x - viewW / 2;
  const targetY = tugboat.y - viewH / 2;
  const camSmooth = 1 - Math.pow(1 - 0.08, delta);
  camera.x += (targetX - camera.x) * camSmooth;
  camera.y += (targetY - camera.y) * camSmooth;
  camera.x = Math.max(0, Math.min(WORLD.width - viewW, camera.x));
  camera.y = Math.max(0, Math.min(WORLD.height - viewH, camera.y));
}

function updateEnvironment(delta) {
  // Update weather
  updateWeather(delta);

  // Update region features (seagulls, etc.)
  updateRegionFeatures(delta);

  // Decrease event cooldown
  if (eventCooldown > 0) eventCooldown -= delta;

  // Update leaderboard periodically (every ~30 frames / 0.5 sec)
  if (Math.floor(game.time) % 30 === 0 && Math.floor(game.time - delta) % 30 !== 0) {
    updateLeaderboard();
  }


}

function updateJobRules(delta) {
  // Update job timers and special job mechanics
  if (currentJob && !currentJob.failed) {
    const jt = currentJob.jobType;

    // Salvage cargo drifts with currents when not attached
    if (jt === JOB_TYPES.SALVAGE && !currentJob.pickedUp) {
      // Salvage Expert license reduces drift by 50%
      const driftMult = hasLicense('salvageExpert') ? 0.5 : 1.0;
      for (const cargo of cargos) {
        if (cargo.driftAngle !== null) {
          // Drift with wind and currents
          const driftSpeed = (0.3 + weather.current.windStrength * 0.2) * driftMult * delta;
          cargo.x += Math.cos(weather.windAngle) * driftSpeed;
          cargo.y += Math.sin(weather.windAngle) * driftSpeed;
          // Also drift with currents
          for (const current of weather.currents) {
            const dx = cargo.x - current.x;
            const dy = cargo.y - current.y;
            const dist = Math.hypot(dx, dy);
            if (dist < current.radius) {
              const strength = (1 - dist / current.radius) * current.strength * 0.5 * driftMult * delta;
              cargo.x += Math.cos(current.angle) * strength;
              cargo.y += Math.sin(current.angle) * strength;
            }
          }
          // Bob slightly
          cargo.angle = Math.sin(game.time * 0.03 + cargo.x * 0.01) * 0.15;
          // Keep in bounds
          cargo.x = Math.max(100, Math.min(WORLD.width - 100, cargo.x));
          cargo.y = Math.max(100, Math.min(WORLD.height - 100, cargo.y));
        }
      }
    }

    // VIP minimum speed check - fail if stopped too long while carrying
    if (jt === JOB_TYPES.VIP && currentJob.pickedUp) {
      const speed = Math.hypot(tugboat.vx, tugboat.vy);
      if (speed < 0.5) {
        currentJob.vipStoppedFrames = (currentJob.vipStoppedFrames || 0) + delta;
        // Warning at 2 seconds (120 frames), fail at 4 seconds (240 frames)
        if (currentJob.vipStoppedFrames >= 120 && currentJob.vipStoppedFrames < 120 + delta * 2) {
          showEvent('rival', 'ðŸ‘” VIP Warning!', 'Keep moving! VIP is getting impatient!');
        }
        if (currentJob.vipStoppedFrames >= 240) {
          failJob('VIP got impatient - you stopped too long!');
          return;
        }
      } else {
        currentJob.vipStoppedFrames = 0;
      }
    }

    // Timer countdown for timed jobs
    if (currentJob.timeLimit) {
      // Rescue and Salvage timers count down even before pickup
      const countBeforePickup = jt === JOB_TYPES.RESCUE || jt === JOB_TYPES.SALVAGE;
      if (countBeforePickup || currentJob.pickedUp) {
        currentJob.timeRemaining -= delta / 60; // delta/60 since delta=1 means 1/60th second
        if (currentJob.cargo.sinkTimer !== null) {
          currentJob.cargo.sinkTimer = currentJob.timeRemaining;
        }
        updateTimerUI();
        if (currentJob.timeRemaining <= 0) {
          if (jt === JOB_TYPES.RESCUE) {
            failJob('The boat sank!');
          } else if (jt === JOB_TYPES.SALVAGE) {
            failJob('Cargo drifted away!');
          } else {
            failJob('Time ran out!');
          }
          return;
        }
      }
    }
  }

  let thrust = 0, turn = 0;
}

// Mobile Input State
let mobileThrust = 0;
let mobileTurn = 0;
let joystickActive = false;

function initMobileControls() {
  const base = document.getElementById('joystickBase');
  const knob = document.getElementById('joystickKnob');
  if (!base || !knob) return;

  const baseRect = base.getBoundingClientRect();
  const centerX = baseRect.width / 2;
  const centerY = baseRect.height / 2;
  const maxRadius = baseRect.width / 2;

  function handleJoystick(e) {
    if (!joystickActive) return;
    e.preventDefault();

    const touch = e.touches ? e.touches[0] : e;
    const rect = base.getBoundingClientRect();
    const x = touch.clientX - rect.left - centerX;
    const y = touch.clientY - rect.top - centerY;

    const dist = Math.hypot(x, y);
    const angle = Math.atan2(y, x);
    const clampedDist = Math.min(dist, maxRadius);

    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;

    knob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;

    // Convert to thrust/turn
    // y is negative for forward (up)
    mobileThrust = - (y / maxRadius);
    mobileThrust = Math.max(-0.5, Math.min(1, mobileThrust));

    mobileTurn = x / maxRadius;
    mobileTurn = Math.max(-1, Math.min(1, mobileTurn));
  }

  base.addEventListener('touchstart', (e) => {
    joystickActive = true;
    handleJoystick(e);
    if (!audioCtx && gameStarted) { initAudio(); startEngine(); }
  });

  window.addEventListener('touchmove', handleJoystick, { passive: false });

  window.addEventListener('touchend', () => {
    joystickActive = false;
    mobileThrust = 0;
    mobileTurn = 0;
    knob.style.transform = 'translate(-50%, -50%)';
  });

  // Action Buttons
  document.getElementById('mobileAttach')?.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (gameStarted) toggleAttachment();
  });
  document.getElementById('mobileHorn')?.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (gameStarted) playSound('horn');
  });
  document.getElementById('mobileRefuel')?.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (gameStarted) refuel();
  });
  document.getElementById('mobileRepair')?.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (gameStarted) repair();
  });

  // Auto-show mobile controls if touch device detected
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.getElementById('mobileControls')?.classList.add('show');
  }
}

function computeControls(delta) {
  let thrust = 0, turn = 0;

  // Keyboard input
  const pressUp = (keys[keybinds.up] || keys['ArrowUp']);
  const pressDown = (keys[keybinds.down] || keys['ArrowDown']);

  if (pressUp && pressDown) thrust = 0;
  else if (pressUp && tugboat.fuel > 0) thrust = 1;
  else if (pressDown && tugboat.fuel > 0) thrust = -0.5;
  if (keys[keybinds.left] || keys['ArrowLeft']) turn = -1;
  if (keys[keybinds.right] || keys['ArrowRight']) turn = 1;

  // Merge with mobile input
  if (Math.abs(mobileThrust) > Math.abs(thrust)) thrust = mobileThrust;
  if (Math.abs(mobileTurn) > Math.abs(turn)) turn = mobileTurn;

  // Gamepad input (merged with keyboard)
  if (gamepadState.connected && tugboat.fuel > 0) {
    thrust = Math.abs(gamepadState.throttle) > 0.001 ? gamepadState.throttle : thrust;
    turn = Math.abs(gamepadState.steer) > 0.001 ? gamepadState.steer : turn;

    // Gameplay buttons (only when game is running and no modal panels are open)
    const modalOpen =
      document.getElementById('optionsPanel')?.classList.contains('show') ||
      document.getElementById('licensePanel')?.classList.contains('show') ||
      document.getElementById('boatShopPanel')?.classList.contains('show') ||
      document.getElementById('careerPanel')?.classList.contains('show') ||
      document.getElementById('remapPanel')?.classList.contains('show');

    if (!modalOpen && gameStarted) {
      // A = tow attach/detach
      if (gamepadState.justPressed.has(0)) toggleAttachment();
      // X = horn
      if (gamepadState.justPressed.has(2)) playSound('horn');
      // Y = leaderboard toggle
      if (gamepadState.justPressed.has(3)) toggleLeaderboard();
      // LB/RB = refuel/repair
      if (gamepadState.justPressed.has(4)) refuel();
      if (gamepadState.justPressed.has(5)) repair();
    }
  }

  // Input smoothing (ramp throttle & steer so it feels expensive)
  const dtSec = delta / 60;
  if (tugboat.ctrlThrust === undefined) tugboat.ctrlThrust = 0;
  if (tugboat.ctrlTurn === undefined) tugboat.ctrlTurn = 0;

  const thrustUpRate = 2.5;   // units per second
  const thrustDownRate = 4.0; // faster release
  const turnRate = 7.0;       // units per second

  const desiredThrust = Math.max(-0.5, Math.min(1, thrust));
  const desiredTurn = Math.max(-1, Math.min(1, turn));

  const thrustRate = Math.abs(desiredThrust) > Math.abs(tugboat.ctrlThrust) ? thrustUpRate : thrustDownRate;
  const thrustStep = thrustRate * dtSec;
  tugboat.ctrlThrust += Math.max(-thrustStep, Math.min(thrustStep, desiredThrust - tugboat.ctrlThrust));

  const turnStep = turnRate * dtSec;
  tugboat.ctrlTurn += Math.max(-turnStep, Math.min(turnStep, desiredTurn - tugboat.ctrlTurn));

  // Tugboat feel: pivot harder at low speed, allow more drift at speed
  const speed = Math.hypot(tugboat.vx, tugboat.vy);
  const speed01 = Math.max(0, Math.min(1, speed / (tugboat.maxSpeed || 12)));

  // stronger turning when slow, softer at high speed
  const lowSpeedPivotBoost = 1.25 - 0.45 * speed01; // ~1.25 at 0 speed, ~0.8 at max
  thrust = tugboat.ctrlThrust;
  // Throttle curve: finer control near center, still hits full power at max
  const thrustMag = Math.min(1, Math.abs(thrust));
  thrust = Math.sign(thrust) * Math.pow(thrustMag, 1.35);

  turn = tugboat.ctrlTurn * lowSpeedPivotBoost;
  // Steering curve: soften tiny inputs so it doesn't feel twitchy
  const turnMag = Math.min(1, Math.abs(turn));
  turn = Math.sign(turn) * Math.pow(turnMag, 1.15);

  // "Prop wash": more steering authority when pushing water (thrust applied)
  turn *= (0.78 + 0.42 * Math.min(1, Math.abs(thrust)));

  // Pivot assist: tugboats spin hard at low speed, even with low throttle
  if (speed < 0.9 && Math.abs(thrust) < 0.12) {
    turn *= 1.35;
  }

  // Reverse feels heavier/less responsive (optional realism)
  if (thrust < -0.05) {
    turn *= 0.85;
  }



  return { thrust, turn };
}

function updateEngineAndFuel(delta, thrust) {
  // Update engine sound
  const tugSpeedForSound = Math.hypot(tugboat.vx, tugboat.vy);
  updateEngineSound(Math.abs(thrust), tugSpeedForSound);

  // Low fuel warning (every ~60 frames / 1 sec when below 20%)
  const fuelPercent = (tugboat.fuel / tugboat.maxFuel) * 100;
  if (fuelPercent <= 20 && fuelPercent > 0 && Math.floor(game.time) % 60 === 0 && Math.floor(game.time - delta) % 60 !== 0) {
    playSound('warning');
  }

  if (thrust !== 0 && tugboat.fuel > 0) {
    tugboat.fuel -= 0.03 * Math.abs(thrust) * tugboat.fuelEfficiency * currentDifficulty.fuelMult * delta;
    if (tugboat.attached) {
      // Tandem tow uses more fuel
      let totalWeight = tugboat.attached.weight;
      if (currentJob && currentJob.jobType === JOB_TYPES.TANDEM && currentJob.allCargo) {
        totalWeight = currentJob.allCargo.reduce((sum, c) => sum + c.weight, 0);
      }
      tugboat.fuel -= 0.01 * totalWeight * currentDifficulty.fuelMult * delta;
    }
    tugboat.fuel = Math.max(0, tugboat.fuel);
  }


}

function updatePhysicsStep(delta, thrust, turn) {
  // Physics with delta-time
  tugboat.vx += Math.cos(tugboat.angle) * thrust * tugboat.power * delta;
  tugboat.vy += Math.sin(tugboat.angle) * thrust * tugboat.power * delta;
  tugboat.angularVel += turn * tugboat.turnSpeed * delta;

  // Clamp spin so it feels weighty (prevents ridiculous pirouettes)
  const maxAngular = tugboat.turnSpeed * 2.2;
  tugboat.angularVel = Math.max(-maxAngular, Math.min(maxAngular, tugboat.angularVel));

  // Apply drag (framerate-independent using pow)
  const dragFactor = Math.pow(tugboat.drag, delta);
  const angularDragFactor = Math.pow(tugboat.angularDrag, delta);
  tugboat.vx *= dragFactor; tugboat.vy *= dragFactor;
  tugboat.angularVel *= angularDragFactor;

  // Apply weather effects (wind and currents)
  applyWeatherPhysics(tugboat, delta);

  // Lateral slip control (drift at speed): damp sideways velocity more when slow
  const headingX = Math.cos(tugboat.angle);
  const headingY = Math.sin(tugboat.angle);
  const fwd = tugboat.vx * headingX + tugboat.vy * headingY;
  const side = -tugboat.vx * headingY + tugboat.vy * headingX;
  // sideDamp: strong at low speed, looser at high speed
  const sideDamp = 0.35 + 0.55 * (1 - Math.max(0, Math.min(1, Math.hypot(tugboat.vx, tugboat.vy) / (tugboat.maxSpeed || 12))));
  const newSide = side * Math.pow(sideDamp, delta);
  tugboat.vx = fwd * headingX + (-newSide) * headingY;
  tugboat.vy = fwd * headingY + (newSide) * headingX;

  const tugSpeed = Math.hypot(tugboat.vx, tugboat.vy);
  if (tugSpeed > tugboat.maxSpeed) {
    tugboat.vx = (tugboat.vx / tugSpeed) * tugboat.maxSpeed;
    tugboat.vy = (tugboat.vy / tugSpeed) * tugboat.maxSpeed;
  }
  tugboat.angularVel = Math.max(-0.04, Math.min(0.04, tugboat.angularVel));

  if (tugboat.attached) {
    // Calculate total weight for tandem tow
    let totalWeight = tugboat.attached.weight;
    if (currentJob && currentJob.jobType === JOB_TYPES.TANDEM && currentJob.allCargo) {
      totalWeight = currentJob.allCargo.reduce((sum, c) => sum + c.weight, 0);
    }
    const towDragBase = 1 - (0.04 * totalWeight / tugboat.towStrength);
    const towDragFactor = Math.pow(Math.max(0.88, towDragBase), delta);
    tugboat.vx *= towDragFactor;
    tugboat.vy *= towDragFactor;
  }

  // Position update with delta
  tugboat.x += tugboat.vx * delta; tugboat.y += tugboat.vy * delta; tugboat.angle += tugboat.angularVel * delta;
  tugboat.x = Math.max(30, Math.min(WORLD.width - 30, tugboat.x));
  tugboat.y = Math.max(30, Math.min(WORLD.height - 30, tugboat.y));

  // NEW: Apply river current (reduced effect when towing)
  const current = getRiverCurrentAt(tugboat.x, tugboat.y);
  if (current.x !== 0 || current.y !== 0) {
    // Current has more effect at low speeds (can't fight it when stopped)
    const speedFactor = 1.0 - Math.min(0.5, tugSpeed / 6);
    // Towing reduces current effect
    const towingReduction = tugboat.attached ? 0.6 : 1.0;
    // River Pilot license reduces current push by 50%
    const pilotBonus = hasLicense('riverPilot') ? 0.5 : 1.0;
    // Apply current force - gentle but noticeable
    const currentForce = 1.2 * speedFactor * towingReduction * pilotBonus;
    tugboat.vx += current.x * delta * currentForce;
    tugboat.vy += current.y * delta * currentForce;
  }



  // Soft Collision with AI Competitors (to prevent clipping/hard bumps)
  for (const comp of competitors) {
    // Skip collision if AI is trying to recover (needs to move freely)
    if (comp.state === 'RECOVER') continue;

    const dx = tugboat.x - comp.x;
    const dy = tugboat.y - comp.y;
    const dist = Math.hypot(dx, dy);
    const minSpace = 65; // Increased buffer slightly

    if (dist < minSpace && dist > 0) {
      // Gentle push away
      const overlap = minSpace - dist;
      const push = overlap * 0.015 * delta; // Much softer spring
      const nx = dx / dist;
      const ny = dy / dist;

      tugboat.vx += nx * push;
      tugboat.vy += ny * push;

      // Apply reciprocal force to AI
      comp.vx -= nx * push * 0.5;
      comp.vy -= ny * push * 0.5;
    }
  }

  return tugSpeed;
}

function updatePostPhysics(delta, tugSpeed) {
  // NEW: Map collision (land, shallows)
  handleMapCollision(tugboat);

  // Update tide
  TIDE.update(delta / 60); // Convert to seconds

  if (tugboat.attached) { updateRope(delta); updateCargo(delta); }

  if (tugSpeed > 0.5 && tugboat.fuel > 0) {
    const wakeAngle = tugboat.angle + Math.PI;
    waterParticles.push({
      x: tugboat.x + Math.cos(wakeAngle) * 25, y: tugboat.y + Math.sin(wakeAngle) * 25,
      vx: Math.cos(wakeAngle) * tugSpeed * 0.25, vy: Math.sin(wakeAngle) * tugSpeed * 0.25,
      life: 1, size: 2 + Math.random() * 2
    });
  }

  waterParticles = waterParticles.filter(p => {
    p.x += p.vx * delta; p.y += p.vy * delta;
    const particleDrag = Math.pow(0.97, delta);
    p.vx *= particleDrag; p.vy *= particleDrag;
    p.life -= 0.025 * delta;
    return p.life > 0;
  });
  ripples = ripples.filter(r => { r.radius += 1.5 * delta; r.opacity -= 0.03 * delta; return r.opacity > 0; });


}

function updateDeliveryAndMeta(delta) {
  if (tugboat.attached && currentJob && currentJob.pickedUp && !currentJob.failed) {
    const dest = currentJob.delivery;
    // For tandem tow, check last cargo in chain
    const cargoToCheck = currentJob.jobType === JOB_TYPES.TANDEM && currentJob.allCargo
      ? currentJob.allCargo[currentJob.allCargo.length - 1]
      : tugboat.attached;
    const dist = Math.hypot(cargoToCheck.x - (dest.x + dest.width / 2), cargoToCheck.y - (dest.y + dest.height / 2));
    if (dist < 70) completeJob();
  }

  updateCamera(delta);
  updateUI();
  updateRefuelButton();
  updateRepairButton();
  updateCompetitors(delta);

  // Update AI difficulty every ~5 seconds (300 frames)
  if (Math.floor(game.time) % 300 === 0 && Math.floor(game.time - delta) % 300 !== 0) {
    updateCompetitorDifficulty();
  }

  // Check win/lose conditions periodically (~1 sec)
  if (Math.floor(game.time) % 60 === 0 && Math.floor(game.time - delta) % 60 !== 0) {
    checkVictory();
    checkBankruptcy();
  }

}

function update(delta = 1) {
  if (game.paused || !gameStarted) return;
  if (document.getElementById('optionsPanel').classList.contains('show')) return;
  game.time += delta; waveOffset += 0.012 * delta;


  updateEnvironment(delta);
  updateJobRules(delta);
  const controls = computeControls(delta);
  updateEngineAndFuel(delta, controls.thrust);
  const tugSpeed = updatePhysicsStep(delta, controls.thrust, controls.turn);
  updatePostPhysics(delta, tugSpeed);
  updateDeliveryAndMeta(delta);
}

function updateRope(delta = 1) {
  const cargo = tugboat.attached;
  const sternX = tugboat.x - Math.cos(tugboat.angle) * 28;
  const sternY = tugboat.y - Math.sin(tugboat.angle) * 28;
  const bowX = cargo.x + Math.cos(cargo.angle) * (cargo.width / 2);
  const bowY = cargo.y + Math.sin(cargo.angle) * (cargo.width / 2);
  const dx = bowX - sternX, dy = bowY - sternY, dist = Math.hypot(dx, dy);
  if (dist > tugboat.ropeLength) {
    const pullAmount = (dist - tugboat.ropeLength) * 0.22 * delta;
    cargo.x -= (dx / dist) * pullAmount;
    cargo.y -= (dy / dist) * pullAmount;
  }

  // Tandem tow - update rope between tandem cargo
  if (currentJob && currentJob.jobType === JOB_TYPES.TANDEM && currentJob.allCargo) {
    const chainCargo = currentJob.allCargo;
    for (let i = 1; i < chainCargo.length; i++) {
      const leader = chainCargo[i - 1];
      const follower = chainCargo[i];
      // Rope from back of leader to front of follower
      const leaderBackX = leader.x - Math.cos(leader.angle) * (leader.width / 2);
      const leaderBackY = leader.y - Math.sin(leader.angle) * (leader.width / 2);
      const followerFrontX = follower.x + Math.cos(follower.angle) * (follower.width / 2);
      const followerFrontY = follower.y + Math.sin(follower.angle) * (follower.width / 2);
      const cdx = followerFrontX - leaderBackX;
      const cdy = followerFrontY - leaderBackY;
      const cdist = Math.hypot(cdx, cdy);
      const chainRopeLen = 40; // Short rope between tandem cargo
      if (cdist > chainRopeLen) {
        const pullAmt = (cdist - chainRopeLen) * 0.25 * delta;
        follower.x -= (cdx / cdist) * pullAmt;
        follower.y -= (cdy / cdist) * pullAmt;
      }
    }
  }
}

function updateCargo(delta = 1) {
  const cargo = tugboat.attached;
  const sternX = tugboat.x - Math.cos(tugboat.angle) * 28;
  const sternY = tugboat.y - Math.sin(tugboat.angle) * 28;
  const targetAngle = Math.atan2(sternY - cargo.y, sternX - cargo.x);
  let angleDiff = targetAngle - cargo.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  cargo.angle += angleDiff * 0.022 * delta;

  // Apply weather to cargo (wind affects bigger cargo more)
  applyWeatherPhysics(cargo, delta);
  // Extra wind effect on cargo based on size
  if (weather.current.windStrength > 0) {
    const sizeBonus = cargo.width * 0.0003;
    cargo.vx += Math.cos(weather.windAngle) * weather.current.windStrength * sizeBonus * 20 * delta;
    cargo.vy += Math.sin(weather.windAngle) * weather.current.windStrength * sizeBonus * 20 * delta;
  }

  // Apply river current to cargo (bigger cargo = more affected)
  const cargoCurrent = getRiverCurrentAt(cargo.x, cargo.y);
  if (cargoCurrent.x !== 0 || cargoCurrent.y !== 0) {
    const cargoCurrentForce = 0.8 * (cargo.weight || 1);
    cargo.vx += cargoCurrent.x * delta * cargoCurrentForce;
    cargo.vy += cargoCurrent.y * delta * cargoCurrentForce;
  }

  const cargoDrag = Math.pow(0.93, delta);
  cargo.vx *= cargoDrag; cargo.vy *= cargoDrag;
  cargo.x += cargo.vx * delta; cargo.y += cargo.vy * delta;
  cargo.x = Math.max(60, Math.min(WORLD.width - 60, cargo.x));
  cargo.y = Math.max(60, Math.min(WORLD.height - 60, cargo.y));

  // Tandem tow - update tandem cargo physics
  if (currentJob && currentJob.jobType === JOB_TYPES.TANDEM && currentJob.allCargo) {
    const chainCargo = currentJob.allCargo;
    for (let i = 1; i < chainCargo.length; i++) {
      const leader = chainCargo[i - 1];
      const follower = chainCargo[i];

      // Follower turns to follow leader
      const leaderBackX = leader.x - Math.cos(leader.angle) * (leader.width / 2);
      const leaderBackY = leader.y - Math.sin(leader.angle) * (leader.width / 2);
      const followAngle = Math.atan2(leaderBackY - follower.y, leaderBackX - follower.x);
      let fAngleDiff = followAngle - follower.angle;
      while (fAngleDiff > Math.PI) fAngleDiff -= Math.PI * 2;
      while (fAngleDiff < -Math.PI) fAngleDiff += Math.PI * 2;
      follower.angle += fAngleDiff * 0.018 * delta; // Slower turn = more swing

      // Apply weather
      applyWeatherPhysics(follower, delta);
      if (weather.current.windStrength > 0) {
        const sizeBonus = follower.width * 0.0004;
        follower.vx += Math.cos(weather.windAngle) * weather.current.windStrength * sizeBonus * 20 * delta;
        follower.vy += Math.sin(weather.windAngle) * weather.current.windStrength * sizeBonus * 20 * delta;
      }

      // Apply river current to tandem cargo
      const tandemCurrent = getRiverCurrentAt(follower.x, follower.y);
      if (tandemCurrent.x !== 0 || tandemCurrent.y !== 0) {
        const tandemCurrentForce = 0.6 * (follower.weight || 1);
        follower.vx += tandemCurrent.x * delta * tandemCurrentForce;
        follower.vy += tandemCurrent.y * delta * tandemCurrentForce;
      }

      const followerDrag = Math.pow(0.91, delta);
      follower.vx *= followerDrag; follower.vy *= followerDrag;
      follower.x += follower.vx * delta; follower.y += follower.vy * delta;
      follower.x = Math.max(60, Math.min(WORLD.width - 60, follower.x));
      follower.y = Math.max(60, Math.min(WORLD.height - 60, follower.y));
    }
  }
}

